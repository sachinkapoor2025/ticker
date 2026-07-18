const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ANALYTICS_TABLE;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json", ...CORS }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "{}";
    const data = JSON.parse(raw || "{}");
    const path = String(data.path || data.page || "/").slice(0, 500);
    const referrer = String(data.referrer || "").slice(0, 500);
    const sessionId = String(data.sessionId || "anon").slice(0, 80);
    const ts = new Date().toISOString();
    const day = ts.slice(0, 10);
    const id = `${day}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;

    if (TABLE) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            id,
            day,
            path,
            referrer,
            sessionId,
            createdAt: ts,
            type: "page_view",
            userAgent: String(event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "").slice(0, 300),
          },
        })
      );
      // daily counter
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { id: `DAY#${day}` },
          UpdateExpression: "ADD pageViews :one SET #d = :day, entityType = :t",
          ExpressionAttributeNames: { "#d": "day" },
          ExpressionAttributeValues: { ":one": 1, ":day": day, ":t": "day_total" },
        })
      );
    }
    return json(204, {});
  } catch (e) {
    console.error(e);
    return json(200, { ok: true }); // never block UX
  }
};
