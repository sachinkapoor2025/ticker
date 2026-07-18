/**
 * Admin API — Cognito ID token required; user must be in group "admin".
 * Endpoints under /api/admin/*
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const { analyzeJourney, visitorIdFromSession } = require("./interest");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const LEADS_TABLE = process.env.LEADS_TABLE;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const LIVE_WINDOW_MS = 90 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};

let verifier;
function getVerifier() {
  if (!verifier) {
    if (!USER_POOL_ID || !USER_POOL_CLIENT_ID) {
      throw new Error("Cognito not configured");
    }
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: "id",
      clientId: USER_POOL_CLIENT_ID,
    });
  }
  return verifier;
}

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json", ...CORS },
    body: JSON.stringify(body),
  };
}

function pathOf(event) {
  return event.requestContext?.http?.path || event.rawPath || event.path || "";
}

function methodOf(event) {
  return event.requestContext?.http?.method || event.httpMethod || "GET";
}

function getBearer(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function isAdminGroup(groups) {
  const g = Array.isArray(groups) ? groups : [];
  return g.includes("admin") || g.includes("super-admin");
}

async function requireAdmin(event) {
  const token = getBearer(event);
  if (!token) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  try {
    const payload = await getVerifier().verify(token);
    const groups = payload["cognito:groups"] || [];
    if (!isAdminGroup(groups)) {
      const err = new Error("Forbidden: admin group required");
      err.statusCode = 403;
      throw err;
    }
    return {
      email: payload.email || payload["cognito:username"] || "",
      groups,
      sub: payload.sub,
    };
  } catch (e) {
    if (e.statusCode) throw e;
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function qs(event) {
  return event.queryStringParameters || {};
}

function daysParam(event, fallback = 30) {
  const n = Number(qs(event).days || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(90, Math.max(1, Math.floor(n)));
}

function parseRange(event, fallbackDays = 30) {
  const q = qs(event);
  const now = Date.now();
  let to = q.to
    ? q.to.includes("T")
      ? q.to
      : `${q.to}T23:59:59.999Z`
    : new Date(now).toISOString();
  let from;
  const preset = String(q.preset || "").toLowerCase();

  if (q.from) {
    from = q.from.includes("T") ? q.from : `${q.from}T00:00:00.000Z`;
  } else if (preset === "today") {
    from = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  } else if (preset === "3d" || preset === "3") {
    from = new Date(now - 3 * 86400000).toISOString();
  } else if (preset === "7d" || preset === "week" || preset === "1w") {
    from = new Date(now - 7 * 86400000).toISOString();
  } else if (preset === "30d" || preset === "month" || preset === "1m") {
    from = new Date(now - 30 * 86400000).toISOString();
  } else {
    from = new Date(now - daysParam(event, fallbackDays) * 86400000).toISOString();
  }

  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    from = new Date(now - fallbackDays * 86400000).toISOString();
    to = new Date(now).toISOString();
  }
  const days = Math.min(90, Math.max(1, Math.ceil((Date.parse(to) - Date.parse(from)) / 86400000) || 1));
  return { from, to, days, preset: preset || (q.from ? "custom" : `${days}d`) };
}

function dayListBetween(fromIso, toIso) {
  const out = [];
  const start = new Date(fromIso.slice(0, 10) + "T12:00:00.000Z");
  const end = new Date(toIso.slice(0, 10) + "T12:00:00.000Z");
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > 90) break;
  }
  return out.length ? out : [new Date().toISOString().slice(0, 10)];
}

function dayList(days) {
  return dayListBetween(
    new Date(Date.now() - (days - 1) * 86400000).toISOString(),
    new Date().toISOString()
  );
}

function cutoffIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function inRange(iso, from, to) {
  if (!iso) return false;
  return iso >= from && iso <= to;
}

async function scanAll(table, filter = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey,
        ...filter,
      })
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scanPrefix(prefix, limit = 5000) {
  if (!ANALYTICS_TABLE) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: ANALYTICS_TABLE,
        ExclusiveStartKey,
        FilterExpression: "begins_with(id, :p)",
        ExpressionAttributeValues: { ":p": prefix },
        Limit: 250,
      })
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
    if (items.length >= limit) break;
  } while (ExclusiveStartKey);
  return items.slice(0, limit);
}

async function loadLeads() {
  if (!LEADS_TABLE) return [];
  return (await scanAll(LEADS_TABLE)).filter(
    (i) => i.id && !String(i.id).startsWith("DAY#") && (i.email || i.name || i.mobile)
  );
}

function isEventItem(i) {
  return (
    i &&
    i.type &&
    !String(i.id || "").startsWith("DAY#") &&
    !String(i.id || "").startsWith("LIVE#") &&
    !String(i.id || "").startsWith("ROLLUP#") &&
    i.entityType !== "day_total" &&
    i.entityType !== "rollup" &&
    i.entityType !== "live"
  );
}

function locationOf(item) {
  if (item.location) return item.location;
  const parts = [];
  if (item.city) parts.push(item.city);
  if (item.regionName && item.regionName !== item.city) parts.push(item.regionName);
  if (item.country) parts.push(item.country);
  if (parts.length) return parts.join(", ");
  return item.timezone || item.country || "—";
}

function buildSessions(events) {
  const map = new Map();
  for (const e of events) {
    const sid = e.sessionId || "anon";
    let s = map.get(sid);
    if (!s) {
      s = {
        sessionId: sid,
        firstSeen: e.createdAt || "",
        lastSeen: e.createdAt || "",
        pageViews: 0,
        searches: 0,
        ctaClicks: 0,
        durationMs: 0,
        paths: [],
        pathSet: new Set(),
        deviceType: e.deviceType || "Unknown",
        browser: e.browser || "",
        os: e.os || "",
        country: e.country || "",
        city: e.city || "",
        location: locationOf(e),
        referrer: e.referrer || "",
        utmSource: e.utmSource || "",
        utmMedium: e.utmMedium || "",
        utmCampaign: e.utmCampaign || "",
        utmTerm: e.utmTerm || "",
        lastPath: e.path || "/",
        timeline: [],
      };
      map.set(sid, s);
    }
    const ts = e.createdAt || "";
    if (ts && (!s.firstSeen || ts < s.firstSeen)) s.firstSeen = ts;
    if (ts && ts > s.lastSeen) {
      s.lastSeen = ts;
      s.lastPath = e.path || s.lastPath;
      if (e.deviceType) s.deviceType = e.deviceType;
      if (e.browser) s.browser = e.browser;
      if (e.os) s.os = e.os;
      if (e.country) s.country = e.country;
      if (e.city) s.city = e.city;
      s.location = locationOf(e) !== "—" ? locationOf(e) : s.location;
    }
    if (e.referrer && !s.referrer) s.referrer = e.referrer;
    if (e.utmSource) s.utmSource = e.utmSource;
    if (e.utmMedium) s.utmMedium = e.utmMedium;
    if (e.utmCampaign) s.utmCampaign = e.utmCampaign;
    if (e.utmTerm) s.utmTerm = e.utmTerm;

    if (e.type === "page_view") {
      s.pageViews += 1;
      const p = e.path || "/";
      if (!s.pathSet.has(p)) {
        s.pathSet.add(p);
        s.paths.push(p);
      }
    }
    if (e.type === "search") s.searches += 1;
    if (e.type === "cta_click") s.ctaClicks += 1;
    if (e.type === "session_ping" && e.durationMs) {
      s.durationMs += Number(e.durationMs) || 0;
    }

    if (s.timeline.length < 80) {
      s.timeline.push({
        at: e.createdAt,
        type: e.type,
        path: e.path,
        query: e.query,
        label: e.label,
        durationMs: e.durationMs,
      });
    }
  }

  return [...map.values()]
    .map((s) => {
      const { pathSet, ...rest } = s;
      rest.uniquePages = pathSet.size;
      rest.durationMs = Math.min(rest.durationMs, 6 * 3600 * 1000);
      rest.timeline = (rest.timeline || []).sort((a, b) =>
        (a.at || "").localeCompare(b.at || "")
      );
      rest.visitorId = visitorIdFromSession(rest.sessionId);
      return rest;
    })
    .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
}

function leadContactBySession(leads) {
  const map = new Map();
  for (const l of leads) {
    if (!l.sessionId) continue;
    const prev = map.get(l.sessionId);
    if (!prev || (l.createdAt || "") > (prev.createdAt || "")) {
      map.set(l.sessionId, {
        hasContact: true,
        name: l.name || "",
        email: l.email || "",
        mobile: l.mobile || "",
        company: l.company || "",
        country: l.country || "",
        leadId: l.id,
        leadStatus: l.status || "new",
        leadCreatedAt: l.createdAt || "",
        message: (l.message || "").slice(0, 240),
      });
    }
  }
  return map;
}

function enrichSession(session, events, contactMap) {
  const interest = analyzeJourney(session, events || session.timeline || []);
  const contact = contactMap?.get(session.sessionId) || null;
  return {
    ...session,
    visitorId: interest.visitorId || visitorIdFromSession(session.sessionId),
    interest,
    // Contact only when the visitor submitted a form (never invent emails)
    contact: contact
      ? {
          hasContact: true,
          name: contact.name,
          email: contact.email,
          mobile: contact.mobile,
          company: contact.company,
          country: contact.country,
          leadId: contact.leadId,
          leadStatus: contact.leadStatus,
        }
      : { hasContact: false },
    topInterest: interest.lookingFor[0]?.label || "",
    suggestedProduct: interest.suggestedProducts[0]?.name || "",
  };
}

function aggregateRollups(items, kind) {
  const map = new Map();
  for (const i of items) {
    if (i.kind !== kind && !String(i.id || "").includes(`#${kind}#`)) continue;
    const label = i.label || String(i.id || "").split("#").slice(3).join("#") || "—";
    const cur = map.get(label) || { label, count: 0, zero: 0 };
    cur.count += Number(i.count || 0);
    cur.zero += Number(i.zero || 0);
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function aggregateFromEvents(events, field, fallback = "Unknown") {
  const map = new Map();
  for (const e of events) {
    if (e.type !== "page_view") continue;
    const key = e[field] || fallback;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function getLiveUsers() {
  if (!ANALYTICS_TABLE) return [];
  const items = await scanPrefix("LIVE#", 500);
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  return items
    .filter((i) => i.entityType === "live" || String(i.id || "").startsWith("LIVE#"))
    .filter((i) => {
      const t = Date.parse(i.lastSeen || 0);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""))
    .map((i) => ({
      sessionId: i.sessionId,
      path: i.path || "/",
      lastSeen: i.lastSeen,
      deviceType: i.deviceType || "Unknown",
      browser: i.browser || "",
      os: i.os || "",
      country: i.country || "",
      city: i.city || "",
      location: i.location || locationOf(i),
      referrer: i.referrer || "",
    }));
}

async function loadAnalyticsWindow(range) {
  if (!ANALYTICS_TABLE) {
    return { events: [], rollups: [], dayTotals: [], live: [], range };
  }
  const { from, to, days } = range;
  const daysArr = dayListBetween(from, to);
  const dayStart = daysArr[0];

  const [scanned, dayTotals, live] = await Promise.all([
    scanAll(ANALYTICS_TABLE, {
      FilterExpression:
        "((entityType = :rollup AND #d >= :dayStart) OR (#t IN (:pv, :sp, :hb, :se, :cta) AND createdAt >= :c AND createdAt <= :to))",
      ExpressionAttributeNames: { "#t": "type", "#d": "day" },
      ExpressionAttributeValues: {
        ":rollup": "rollup",
        ":pv": "page_view",
        ":sp": "session_ping",
        ":hb": "heartbeat",
        ":se": "search",
        ":cta": "cta_click",
        ":c": from,
        ":to": to,
        ":dayStart": dayStart,
      },
    }),
    (async () => {
      const out = [];
      await Promise.all(
        daysArr.map(async (day) => {
          try {
            const res = await ddb.send(
              new GetCommand({ TableName: ANALYTICS_TABLE, Key: { id: `DAY#${day}` } })
            );
            if (res.Item) out.push(res.Item);
          } catch {
            /* ignore */
          }
        })
      );
      return out;
    })(),
    getLiveUsers(),
  ]);

  const events = scanned
    .filter(isEventItem)
    .filter((e) => inRange(e.createdAt || "", from, to));
  const rollups = scanned.filter(
    (i) => i.entityType === "rollup" || String(i.id || "").startsWith("ROLLUP#")
  );

  return { events, rollups, dayTotals, live, range, days };
}

function trafficByDay(dayTotals, events, rangeOrDays) {
  const daysArr =
    typeof rangeOrDays === "number"
      ? dayList(rangeOrDays)
      : dayListBetween(rangeOrDays.from, rangeOrDays.to);
  const map = new Map(daysArr.map((d) => [d, 0]));
  for (const d of dayTotals) {
    if (d.day && map.has(d.day)) map.set(d.day, Number(d.pageViews || 0));
  }
  const rawByDay = new Map();
  for (const e of events) {
    if (e.type !== "page_view") continue;
    const day = (e.createdAt || "").slice(0, 10);
    if (!day) continue;
    rawByDay.set(day, (rawByDay.get(day) || 0) + 1);
  }
  return [...map.entries()].map(([day, pageViews]) => ({
    day,
    pageViews: pageViews || rawByDay.get(day) || 0,
  }));
}

exports.handler = async (event) => {
  const method = methodOf(event);
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const path = pathOf(event).replace(/\/$/, "");
  try {
    const auth = await requireAdmin(event);

    if (method === "GET" && path.endsWith("/api/admin/me")) {
      return json(200, { ok: true, email: auth.email, groups: auth.groups });
    }

    if (method === "GET" && path.endsWith("/api/admin/live")) {
      const live = await getLiveUsers();
      return json(200, { ok: true, live, count: live.length, asOf: new Date().toISOString() });
    }

    if (method === "GET" && path.endsWith("/api/admin/overview")) {
      const range = parseRange(event, 30);
      const [leads, window] = await Promise.all([loadLeads(), loadAnalyticsWindow(range)]);
      const recentLeads = leads.filter((l) => inRange(l.createdAt || "", range.from, range.to));
      const views = window.events.filter((a) => a.type === "page_view");
      const contactMap = leadContactBySession(leads);
      const sessions = buildSessions(window.events).map((s) =>
        enrichSession(s, s.timeline, contactMap)
      );
      const byStatus = {};
      for (const l of leads) {
        const s = l.status || "new";
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      let topPages = aggregateRollups(window.rollups, "path")
        .slice(0, 15)
        .map((x) => ({ path: x.label, count: x.count }));
      if (!topPages.length) {
        const m = new Map();
        for (const v of views) m.set(v.path || "/", (m.get(v.path || "/") || 0) + 1);
        topPages = [...m.entries()]
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
      }
      // Aggregate interest across visitors for dashboard
      const interestAgg = new Map();
      const productAgg = new Map();
      for (const s of sessions) {
        for (const i of s.interest?.lookingFor || []) {
          interestAgg.set(i.label, (interestAgg.get(i.label) || 0) + i.score);
        }
        for (const p of s.interest?.suggestedProducts || []) {
          productAgg.set(p.name, (productAgg.get(p.name) || 0) + p.score);
        }
      }
      const converted = leads.filter((l) => (l.status || "") === "converted").length;
      const uniqueSessions = sessions.length;
      return json(200, {
        ok: true,
        user: { email: auth.email },
        range,
        rangeDays: range.days,
        liveCount: window.live.length,
        live: window.live.slice(0, 12),
        totals: {
          leads: leads.length,
          leadsLast30d: recentLeads.length,
          leadsInRange: recentLeads.length,
          pageViewsLast30d: views.length,
          pageViewsInRange: views.length,
          uniqueSessions,
          withContact: sessions.filter((s) => s.contact?.hasContact).length,
          searches: window.events.filter((e) => e.type === "search").length,
          ctaClicks: window.events.filter((e) => e.type === "cta_click").length,
          converted,
          conversionRate: leads.length
            ? Math.round((converted / leads.length) * 1000) / 10
            : 0,
          leadConversionVsViews: views.length
            ? Math.round((recentLeads.length / views.length) * 1000) / 10
            : 0,
        },
        byStatus,
        trafficByDay: trafficByDay(window.dayTotals, window.events, range),
        topPages,
        interestTrends: [...interestAgg.entries()]
          .map(([label, count]) => ({ label, count: Math.round(count) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        suggestedProductTrends: [...productAgg.entries()]
          .map(([label, count]) => ({ label, count: Math.round(count) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        devices: aggregateRollups(window.rollups, "device").length
          ? aggregateRollups(window.rollups, "device")
          : aggregateFromEvents(window.events, "deviceType"),
        countries: aggregateRollups(window.rollups, "country").length
          ? aggregateRollups(window.rollups, "country")
          : aggregateFromEvents(window.events, "country", "Unknown"),
        sources: aggregateRollups(window.rollups, "source").length
          ? aggregateRollups(window.rollups, "source")
          : [],
        recentLeads: recentLeads
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
          .slice(0, 8),
      });
    }

    if (method === "GET" && path.endsWith("/api/admin/analytics")) {
      const range = parseRange(event, 30);
      const window = await loadAnalyticsWindow(range);
      const views = window.events.filter((e) => e.type === "page_view");
      const sessions = buildSessions(window.events);
      const searches = aggregateRollups(window.rollups, "search");
      if (!searches.length) {
        const m = new Map();
        for (const e of window.events) {
          if (e.type === "search" && e.query) m.set(e.query, (m.get(e.query) || 0) + 1);
          if (e.utmTerm) m.set(e.utmTerm.toLowerCase(), (m.get(e.utmTerm.toLowerCase()) || 0) + 1);
        }
        searches.push(
          ...[...m.entries()].map(([label, count]) => ({ label, count, zero: 0 }))
        );
        searches.sort((a, b) => b.count - a.count);
      }
      return json(200, {
        ok: true,
        range,
        rangeDays: range.days,
        totals: {
          pageViews: views.length,
          uniqueSessions: sessions.length,
          searches: window.events.filter((e) => e.type === "search").length,
          ctaClicks: window.events.filter((e) => e.type === "cta_click").length,
          avgPagesPerSession: sessions.length
            ? Math.round((views.length / sessions.length) * 10) / 10
            : 0,
          avgDurationSec: sessions.length
            ? Math.round(
                sessions.reduce((a, s) => a + (s.durationMs || 0), 0) / sessions.length / 1000
              )
            : 0,
        },
        trafficByDay: trafficByDay(window.dayTotals, window.events, range),
        topPages: (aggregateRollups(window.rollups, "path").length
          ? aggregateRollups(window.rollups, "path")
          : aggregateFromEvents(window.events, "path", "/")
        ).slice(0, 25),
        devices: aggregateRollups(window.rollups, "device").length
          ? aggregateRollups(window.rollups, "device")
          : aggregateFromEvents(window.events, "deviceType"),
        browsers: aggregateRollups(window.rollups, "browser").length
          ? aggregateRollups(window.rollups, "browser")
          : aggregateFromEvents(window.events, "browser", "Other"),
        os: aggregateRollups(window.rollups, "os").length
          ? aggregateRollups(window.rollups, "os")
          : aggregateFromEvents(window.events, "os", "Other"),
        countries: aggregateRollups(window.rollups, "country").length
          ? aggregateRollups(window.rollups, "country")
          : aggregateFromEvents(window.events, "country", "Unknown"),
        sources: aggregateRollups(window.rollups, "source").length
          ? aggregateRollups(window.rollups, "source")
          : [],
        topSearches: searches.slice(0, 40),
        topCtas: aggregateRollups(window.rollups, "cta").slice(0, 20),
      });
    }

    if (method === "GET" && path.endsWith("/api/admin/searches")) {
      const range = parseRange(event, 30);
      const window = await loadAnalyticsWindow(range);
      let searches = aggregateRollups(window.rollups, "search");
      if (!searches.length) {
        const m = new Map();
        for (const e of window.events) {
          const q = (e.type === "search" && e.query) || (e.utmTerm || "").toLowerCase();
          if (!q) continue;
          const cur = m.get(q) || { label: q, count: 0, zero: 0 };
          cur.count += 1;
          if (e.resultCount === 0) cur.zero += 1;
          m.set(q, cur);
        }
        searches = [...m.values()].sort((a, b) => b.count - a.count);
      }
      return json(200, {
        ok: true,
        range,
        rangeDays: range.days,
        totalSearches: searches.reduce((a, s) => a + s.count, 0),
        uniqueKeywords: searches.length,
        searches: searches.slice(0, 100),
        zeroResult: searches.filter((s) => s.zero > 0).slice(0, 40),
      });
    }

    if (method === "GET" && /\/api\/admin\/sessions\/[^/]+$/.test(path)) {
      const sessionId = decodeURIComponent(path.split("/api/admin/sessions/")[1] || "");
      const range = parseRange(event, 30);
      // Always load a wider window for journey detail so paths aren't truncated
      const detailRange = {
        from: new Date(Date.now() - 90 * 86400000).toISOString(),
        to: new Date().toISOString(),
        days: 90,
        preset: "detail90",
      };
      const [window, leads] = await Promise.all([
        loadAnalyticsWindow(detailRange),
        loadLeads(),
      ]);
      const mine = window.events
        .filter((e) => e.sessionId === sessionId)
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      const summary = buildSessions(mine)[0] || null;
      const contactMap = leadContactBySession(leads);
      const enriched = summary ? enrichSession(summary, mine, contactMap) : null;
      return json(200, {
        ok: true,
        range,
        session: enriched,
        events: mine.slice(0, 300),
        interest: enriched?.interest || null,
        contact: enriched?.contact || { hasContact: false },
      });
    }

    if (method === "GET" && path.endsWith("/api/admin/sessions")) {
      const range = parseRange(event, 30);
      const identity = String(qs(event).identity || "all");
      const [window, leads] = await Promise.all([loadAnalyticsWindow(range), loadLeads()]);
      const contactMap = leadContactBySession(leads);
      let sessions = buildSessions(window.events).map((s) =>
        enrichSession(s, s.timeline, contactMap)
      );
      if (identity === "known") {
        sessions = sessions.filter((s) => s.contact?.hasContact);
      }
      return json(200, {
        ok: true,
        range,
        rangeDays: range.days,
        count: sessions.length,
        sessions: sessions.slice(0, 400).map((s) => ({
          visitorId: s.visitorId,
          sessionId: s.sessionId,
          firstSeen: s.firstSeen,
          lastSeen: s.lastSeen,
          lastPath: s.lastPath,
          pageViews: s.pageViews,
          searches: s.searches,
          ctaClicks: s.ctaClicks,
          durationMs: s.durationMs,
          uniquePages: s.uniquePages,
          deviceType: s.deviceType,
          browser: s.browser,
          os: s.os,
          location: s.location,
          country: s.country,
          city: s.city,
          referrer: s.referrer,
          utmSource: s.utmSource,
          utmCampaign: s.utmCampaign,
          paths: (s.paths || []).slice(0, 12),
          topInterest: s.topInterest,
          suggestedProduct: s.suggestedProduct,
          intentLevel: s.interest?.intentLevel,
          contact: s.contact,
          interestPreview: (s.interest?.lookingFor || []).slice(0, 3),
        })),
      });
    }

    if (method === "GET" && path.endsWith("/api/admin/leads")) {
      const range = parseRange(event, 90);
      let leads = (await loadLeads()).sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );
      // Apply range when preset/from provided; default shows all for CRM
      const q = qs(event);
      if (q.preset || q.from || q.days) {
        leads = leads.filter((l) => inRange(l.createdAt || "", range.from, range.to));
      }
      return json(200, { ok: true, range, leads });
    }

    if (method === "PATCH" && path.includes("/api/admin/leads/")) {
      const id = decodeURIComponent(path.split("/api/admin/leads/")[1] || "").replace(/\/$/, "");
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64").toString("utf8")
        : event.body || "{}";
      const body = JSON.parse(raw || "{}");
      const names = {};
      const values = {};
      const parts = [];
      if (body.status) {
        parts.push("#s = :s");
        names["#s"] = "status";
        values[":s"] = String(body.status);
      }
      if (body.adminNotes !== undefined) {
        parts.push("adminNotes = :n");
        values[":n"] = String(body.adminNotes);
      }
      if (body.assignedTo !== undefined) {
        parts.push("assignedTo = :a");
        values[":a"] = String(body.assignedTo);
      }
      if (body.priority !== undefined) {
        parts.push("priority = :p");
        values[":p"] = String(body.priority);
      }
      parts.push("updatedAt = :u");
      values[":u"] = new Date().toISOString();
      parts.push("updatedBy = :ub");
      values[":ub"] = auth.email || "";
      if (!body.status && body.adminNotes === undefined && body.assignedTo === undefined && body.priority === undefined) {
        return json(400, { ok: false, error: "No updates" });
      }
      await ddb.send(
        new UpdateCommand({
          TableName: LEADS_TABLE,
          Key: { id },
          UpdateExpression: "SET " + parts.join(", "),
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
          ExpressionAttributeValues: values,
        })
      );
      return json(200, { ok: true });
    }

    if (method === "GET" && path.endsWith("/api/admin/visitors")) {
      const range = parseRange(event, 30);
      const [window, leads] = await Promise.all([loadAnalyticsWindow(range), loadLeads()]);
      const contactMap = leadContactBySession(leads);
      const sessions = buildSessions(window.events).map((s) =>
        enrichSession(s, s.timeline, contactMap)
      );
      return json(200, {
        ok: true,
        range,
        // Prefer session journeys; keep raw page hits for compatibility
        journeys: sessions.slice(0, 400),
        visitors: window.events
          .filter((i) => i.type === "page_view")
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
          .slice(0, 500)
          .map((v) => ({
            id: v.id,
            createdAt: v.createdAt,
            path: v.path,
            sessionId: v.sessionId,
            visitorId: visitorIdFromSession(v.sessionId),
            referrer: v.referrer,
            deviceType: v.deviceType,
            browser: v.browser,
            os: v.os,
            country: v.country,
            city: v.city,
            location: locationOf(v),
            utmSource: v.utmSource,
            utmCampaign: v.utmCampaign,
          })),
      });
    }

    return json(404, { ok: false, error: "Not found", path });
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error(e);
    return json(code, {
      ok: false,
      error: code === 500 ? "Internal error" : e.message || "Error",
    });
  }
};
