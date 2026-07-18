/**
 * First-party analytics ingest for tickerplay.com
 * Accepts single events or { events: [...] } batches.
 * Types: page_view | session_ping | heartbeat | search | cta_click
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ANALYTICS_TABLE;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const LIVE_TTL_SEC = 120;
const EVENT_TTL_DAYS = 90;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json", ...CORS },
    body: JSON.stringify(body),
  };
}

function methodOf(event) {
  return event.requestContext?.http?.method || event.httpMethod || "GET";
}

function pathOf(event) {
  return event.requestContext?.http?.path || event.rawPath || event.path || "";
}

function headerMap(event) {
  const out = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (v != null) out[String(k).toLowerCase()] = String(v);
  }
  return out;
}

function decodeGeo(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  } catch {
    return String(value).trim();
  }
}

function parseViewerGeo(headers) {
  const country = decodeGeo(
    headers["cloudfront-viewer-country"] ||
      headers["cf-ipcountry"] ||
      headers["x-country-code"] ||
      ""
  ).toUpperCase();
  const city = decodeGeo(headers["cloudfront-viewer-city"] || "");
  const region = decodeGeo(headers["cloudfront-viewer-country-region"] || "").toUpperCase();
  const regionName = decodeGeo(headers["cloudfront-viewer-country-region-name"] || "");
  const geo = {};
  if (country && /^[A-Z]{2}$/.test(country)) geo.country = country;
  if (city) geo.city = city;
  if (region) geo.region = region;
  if (regionName) geo.regionName = regionName;
  return geo;
}

function parseClientDevice(ua) {
  const u = String(ua || "");
  let deviceType = "Unknown";
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(u)) deviceType = "Tablet";
  else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(u)) deviceType = "Mobile";
  else if (/windows|macintosh|linux|cros/i.test(u)) deviceType = "Desktop";

  let browser = "Other";
  if (/edg\//i.test(u)) browser = "Edge";
  else if (/opr\//i.test(u) || /opera/i.test(u)) browser = "Opera";
  else if (/chrome\//i.test(u) && !/edg\//i.test(u)) browser = "Chrome";
  else if (/safari\//i.test(u) && !/chrome\//i.test(u)) browser = "Safari";
  else if (/firefox\//i.test(u)) browser = "Firefox";
  else if (/msie|trident/i.test(u)) browser = "IE";

  let os = "Other";
  if (/windows nt/i.test(u)) os = "Windows";
  else if (/mac os x/i.test(u) && !/iphone|ipad/i.test(u)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(u)) os = "iOS";
  else if (/android/i.test(u)) os = "Android";
  else if (/cros/i.test(u)) os = "ChromeOS";
  else if (/linux/i.test(u)) os = "Linux";

  return { deviceType, browser, os, userAgent: u.slice(0, 300) };
}

function normalizeEvent(raw, headers) {
  const edgeGeo = parseViewerGeo(headers);
  const metaIn = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
  const ua = String(
    metaIn.userAgent || headers["user-agent"] || headers["User-Agent"] || ""
  );
  const device = parseClientDevice(ua);

  const country = String(metaIn.country || edgeGeo.country || "").toUpperCase().slice(0, 2);
  const city = String(metaIn.city || edgeGeo.city || "").slice(0, 80);
  const region = String(metaIn.region || edgeGeo.region || "").slice(0, 40);
  const regionName = String(metaIn.regionName || edgeGeo.regionName || "").slice(0, 80);
  const timezone = String(metaIn.timezone || "").slice(0, 60);
  const locale = String(metaIn.locale || "").slice(0, 30);

  const type = String(raw.type || "page_view").slice(0, 40);
  const path = String(raw.path || raw.page || "/").slice(0, 500);
  const referrer = String(raw.referrer || "").slice(0, 500);
  const sessionId = String(raw.sessionId || "anon").slice(0, 80);
  const query = String(raw.query || metaIn.query || "").trim().slice(0, 200).toLowerCase();
  const resultCount =
    raw.resultCount != null ? Number(raw.resultCount) : metaIn.resultCount != null ? Number(metaIn.resultCount) : null;

  const utm = {
    utmSource: String(metaIn.utmSource || raw.utmSource || "").slice(0, 80),
    utmMedium: String(metaIn.utmMedium || raw.utmMedium || "").slice(0, 80),
    utmCampaign: String(metaIn.utmCampaign || raw.utmCampaign || "").slice(0, 120),
    utmTerm: String(metaIn.utmTerm || raw.utmTerm || "").slice(0, 120),
  };

  return {
    type,
    path,
    referrer,
    sessionId,
    query,
    resultCount: Number.isFinite(resultCount) ? resultCount : null,
    deviceType: String(metaIn.deviceType || device.deviceType).slice(0, 20),
    browser: String(metaIn.browser || device.browser).slice(0, 40),
    os: String(metaIn.os || device.os).slice(0, 40),
    userAgent: device.userAgent,
    country,
    city,
    region,
    regionName,
    timezone,
    locale,
    screen: String(metaIn.screen || "").slice(0, 20),
    durationMs: Math.max(0, Number(metaIn.durationMs || raw.durationMs || 0) || 0),
    label: String(metaIn.label || raw.label || "").slice(0, 120),
    ...utm,
  };
}

function locationLabel(ev) {
  const parts = [];
  if (ev.city) parts.push(ev.city);
  if (ev.regionName && ev.regionName !== ev.city) parts.push(ev.regionName);
  if (ev.country) parts.push(ev.country);
  if (parts.length) return parts.join(", ");
  if (ev.timezone) return ev.timezone;
  return "";
}

async function upsertLive(ev, ts) {
  if (!TABLE) return;
  const expiresAt = Math.floor(Date.now() / 1000) + LIVE_TTL_SEC;
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        id: `LIVE#${ev.sessionId}`,
        entityType: "live",
        sessionId: ev.sessionId,
        path: ev.path,
        lastSeen: ts,
        deviceType: ev.deviceType,
        browser: ev.browser,
        os: ev.os,
        country: ev.country,
        city: ev.city,
        region: ev.region,
        regionName: ev.regionName,
        timezone: ev.timezone,
        location: locationLabel(ev),
        referrer: ev.referrer,
        expiresAt,
      },
    })
  );
}

async function bumpDayTotal(day, field, amount = 1) {
  if (!TABLE) return;
  await ddb.send(
    updateSafe({
      TableName: TABLE,
      Key: { id: `DAY#${day}` },
      UpdateExpression: `ADD ${field} :n SET #d = :day, entityType = :t`,
      ExpressionAttributeNames: { "#d": "day" },
      ExpressionAttributeValues: { ":n": amount, ":day": day, ":t": "day_total" },
    })
  );
}

async function bumpRollup(day, kind, label, fields) {
  if (!TABLE || !label) return;
  const safeLabel = String(label).slice(0, 120);
  const id = `ROLLUP#${day}#${kind}#${safeLabel}`;
  const adds = Object.entries(fields)
    .map(([k], i) => `${k} :v${i}`)
    .join(", ");
  const values = { ":day": day, ":kind": kind, ":label": safeLabel, ":t": "rollup" };
  Object.entries(fields).forEach(([, v], i) => {
    values[`:v${i}`] = v;
  });
  await ddb.send(
    updateSafe({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: `ADD ${adds} SET #d = :day, kind = :kind, label = :label, entityType = :t`,
      ExpressionAttributeNames: { "#d": "day" },
      ExpressionAttributeValues: values,
    })
  );
}

function updateSafe(params) {
  return new UpdateCommand(params);
}

async function recordEvent(raw, headers) {
  const ev = normalizeEvent(raw, headers);
  const ts = String(raw.at || raw.createdAt || new Date().toISOString());
  const day = ts.slice(0, 10);
  const id = `${day}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + EVENT_TTL_DAYS * 86400;

  if (!TABLE) return;

  const item = {
    id,
    day,
    createdAt: ts,
    type: ev.type,
    path: ev.path,
    referrer: ev.referrer,
    sessionId: ev.sessionId,
    query: ev.query || undefined,
    resultCount: ev.resultCount,
    deviceType: ev.deviceType,
    browser: ev.browser,
    os: ev.os,
    userAgent: ev.userAgent,
    country: ev.country || undefined,
    city: ev.city || undefined,
    region: ev.region || undefined,
    regionName: ev.regionName || undefined,
    timezone: ev.timezone || undefined,
    locale: ev.locale || undefined,
    screen: ev.screen || undefined,
    durationMs: ev.durationMs || undefined,
    label: ev.label || undefined,
    utmSource: ev.utmSource || undefined,
    utmMedium: ev.utmMedium || undefined,
    utmCampaign: ev.utmCampaign || undefined,
    utmTerm: ev.utmTerm || undefined,
    location: locationLabel(ev) || undefined,
    expiresAt,
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  // Live presence for any interactive signal
  if (["page_view", "heartbeat", "session_ping", "search", "cta_click"].includes(ev.type)) {
    await upsertLive(ev, ts);
  }

  if (ev.type === "page_view") {
    await bumpDayTotal(day, "pageViews", 1);
    await bumpRollup(day, "path", ev.path || "/", { count: 1 });
    await bumpRollup(day, "device", ev.deviceType || "Unknown", { count: 1 });
    await bumpRollup(day, "browser", ev.browser || "Other", { count: 1 });
    await bumpRollup(day, "os", ev.os || "Other", { count: 1 });
    if (ev.country) await bumpRollup(day, "country", ev.country, { count: 1 });
    const source = referrerSource(ev.referrer, ev.utmSource);
    if (source) await bumpRollup(day, "source", source, { count: 1 });
    if (ev.utmTerm) await bumpRollup(day, "search", ev.utmTerm.toLowerCase(), { count: 1 });
  }

  if (ev.type === "search" && ev.query) {
    await bumpDayTotal(day, "searches", 1);
    const fields = { count: 1 };
    if (ev.resultCount === 0) fields.zero = 1;
    await bumpRollup(day, "search", ev.query, fields);
  }

  if (ev.type === "cta_click") {
    await bumpDayTotal(day, "ctaClicks", 1);
    await bumpRollup(day, "cta", ev.label || ev.path || "cta", { count: 1 });
  }
}

function referrerSource(referrer, utmSource) {
  if (utmSource) return String(utmSource).slice(0, 80);
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    if (!host) return "direct";
    if (host.includes("google.")) return "google";
    if (host.includes("bing.")) return "bing";
    if (host.includes("yahoo.")) return "yahoo";
    if (host.includes("facebook.") || host.includes("fb.")) return "facebook";
    if (host.includes("instagram.")) return "instagram";
    if (host.includes("linkedin.")) return "linkedin";
    if (host.includes("twitter.") || host.includes("t.co") || host.includes("x.com")) return "twitter";
    return host.slice(0, 80);
  } catch {
    return "referral";
  }
}

exports.handler = async (event) => {
  const method = methodOf(event);
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const path = pathOf(event);
  const headers = headerMap(event);

  // Lightweight geo bridge for the beacon (CDN headers when present)
  if (method === "GET" && (path.endsWith("/api/geo") || path.endsWith("/geo"))) {
    const geo = parseViewerGeo(headers);
    return json(200, {
      ok: true,
      ...geo,
      timezoneHint: headers["cloudfront-viewer-time-zone"] || undefined,
    });
  }

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "{}";
    const data = JSON.parse(raw || "{}");
    const list = Array.isArray(data.events)
      ? data.events.slice(0, 50)
      : [data];

    for (const item of list) {
      try {
        await recordEvent(item, headers);
      } catch (e) {
        console.error("event failed", e);
      }
    }
    return json(204, {});
  } catch (e) {
    console.error(e);
    return json(200, { ok: true }); // never block UX
  }
};
