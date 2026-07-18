/**
 * Contact / lead form API for tickerplay.com
 * Accepts JSON or application/x-www-form-urlencoded (legacy jQuery forms).
 */
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const ses = new SESClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_NAME = process.env.LEADS_TABLE;
const FROM_EMAIL = process.env.FROM_EMAIL || "";
const TO_EMAIL = process.env.TO_EMAIL || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  const contentType = (
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    ""
  ).toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  // form-urlencoded / multipart-ish query string from jQuery.serialize()
  const params = new URLSearchParams(raw);
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

function normalizeLead(data) {
  return {
    name: String(data.name || data.Name || data.first_name || "").trim(),
    email: String(data.email || data.Email || data.email_address || "").trim(),
    mobile: String(data.mobile || data.phone || data.Phone || "").trim(),
    country: String(data.country || data.Country || "").trim(),
    company: String(data.company || data.company_name || data.Company || "").trim(),
    message: String(
      data.message || data.Message || data.about_project || data.comments || ""
    ).trim(),
    source: String(data.source || "website").trim(),
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function text(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain", ...CORS },
    body,
  };
}

exports.handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  try {
    const lead = normalizeLead(parseBody(event));

    if (!lead.email && !lead.mobile && !lead.name) {
      return json(400, { ok: false, error: "Missing required fields" });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();

    if (TABLE_NAME) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { id, createdAt, status: "new", ...lead },
        })
      );
    }

    if (FROM_EMAIL && TO_EMAIL) {
      const subject = `Tickerplay lead: ${lead.name || lead.email || "New inquiry"}`;
      const bodyText = [
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        `Mobile: ${lead.mobile}`,
        `Country: ${lead.country}`,
        `Company: ${lead.company}`,
        `Message: ${lead.message}`,
        `Received: ${createdAt}`,
      ].join("\n");

      await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: { ToAddresses: [TO_EMAIL] },
          Message: {
            Subject: { Data: subject },
            Body: { Text: { Data: bodyText } },
          },
        })
      );
    }

    const wantsJson = (
      event.headers?.["content-type"] ||
      event.headers?.["Content-Type"] ||
      ""
    )
      .toLowerCase()
      .includes("application/json");

    // Legacy jQuery forms expect plain "success"
    if (!wantsJson) {
      return text(200, "success");
    }

    return json(200, { ok: true, id });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: "Internal error" });
  }
};
