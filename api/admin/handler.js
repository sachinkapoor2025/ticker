/**
 * Admin API — Cognito ID token required; user must be in group "admin".
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const LEADS_TABLE = process.env.LEADS_TABLE;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE;
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

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

async function scanAll(table, filter) {
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

exports.handler = async (event) => {
  const method = methodOf(event);
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const path = pathOf(event);
  try {
    const auth = await requireAdmin(event);

    if (method === "GET" && path.endsWith("/api/admin/me")) {
      return json(200, { ok: true, email: auth.email, groups: auth.groups });
    }

    if (method === "GET" && path.endsWith("/api/admin/overview")) {
      const leads = (await scanAll(LEADS_TABLE)).filter((i) => i.email || i.name || i.mobile);
      const analytics = ANALYTICS_TABLE
        ? (await scanAll(ANALYTICS_TABLE)).filter(
            (i) => i.type === "page_view" || i.entityType === "day_total"
          )
        : [];
      const now = Date.now();
      const days = 30;
      const cutoff = new Date(now - days * 86400000).toISOString();
      const recentLeads = leads.filter((l) => (l.createdAt || "") >= cutoff);
      const views = analytics.filter((a) => a.type === "page_view" && (a.createdAt || "") >= cutoff);
      const byStatus = {};
      for (const l of leads) {
        const s = l.status || "new";
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      const byDay = {};
      for (const v of views) {
        const d = (v.createdAt || "").slice(0, 10);
        if (!d) continue;
        byDay[d] = (byDay[d] || 0) + 1;
      }
      const topPages = {};
      for (const v of views) {
        const p = v.path || "/";
        topPages[p] = (topPages[p] || 0) + 1;
      }
      const topPagesArr = Object.entries(topPages)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      const converted = leads.filter((l) => (l.status || "") === "converted").length;
      return json(200, {
        ok: true,
        user: { email: auth.email },
        totals: {
          leads: leads.length,
          leadsLast30d: recentLeads.length,
          pageViewsLast30d: views.length,
          converted,
          conversionRate: leads.length ? Math.round((converted / leads.length) * 1000) / 10 : 0,
        },
        byStatus,
        trafficByDay: Object.keys(byDay)
          .sort()
          .map((day) => ({ day, pageViews: byDay[day] })),
        topPages: topPagesArr,
        recentLeads: recentLeads
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
          .slice(0, 8),
      });
    }

    if (method === "GET" && path.endsWith("/api/admin/leads")) {
      const leads = (await scanAll(LEADS_TABLE))
        .filter((i) => i.id && !String(i.id).startsWith("DAY#"))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return json(200, { ok: true, leads });
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
      if (!parts.length) return json(400, { ok: false, error: "No updates" });
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
      const views = ANALYTICS_TABLE
        ? (await scanAll(ANALYTICS_TABLE)).filter((i) => i.type === "page_view")
        : [];
      views.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return json(200, { ok: true, visitors: views.slice(0, 500) });
    }

    return json(404, { ok: false, error: "Not found" });
  } catch (e) {
    const code = e.statusCode || 500;
    if (code >= 500) console.error(e);
    return json(code, {
      ok: false,
      error: code === 500 ? "Internal error" : e.message || "Error",
    });
  }
};
