import prepareShareCard from "../../api/prepare-share-card.js";

export async function handler(event) {
  return new Promise((resolve) => {
    const headers = event.headers || {};
    const queryStringParameters = event.queryStringParameters || {};
    const rawQuery = new URLSearchParams(queryStringParameters).toString();

    const req = {
      method: event.httpMethod || "GET",
      headers,
      query: queryStringParameters,
      url: rawQuery ? `/prepare-share-card?${rawQuery}` : "/prepare-share-card",
    };

    const responseHeaders = {};
    const chunks = [];

    const res = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = String(value);
      },
      end(body) {
        if (body != null) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
        const buffer = Buffer.concat(chunks);
        const contentType = responseHeaders["content-type"] || "application/octet-stream";
        const isBinary = /^image\//i.test(contentType) || contentType === "application/octet-stream";
        resolve({
          statusCode: this.statusCode || 200,
          headers: responseHeaders,
          body: isBinary ? buffer.toString("base64") : buffer.toString("utf8"),
          isBase64Encoded: isBinary,
        });
      },
      json(payload) {
        this.setHeader("content-type", "application/json; charset=utf-8");
        this.end(JSON.stringify(payload));
      },
    };

    void Promise.resolve(prepareShareCard(req, res)).catch((err) => {
      console.error("[netlify/functions/prepare-share-card]", err);
      resolve({
        statusCode: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Failed to render share card" }),
      });
    });
  });
}
