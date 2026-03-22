 import { badMethod, getQuery, isAddress, json } from "../../server/http.js";
 
 function p(v) {
   return String(v ?? "").trim();
 }
 
 export default async function handler(req, res) {
   if (req.method !== "GET") return badMethod(res);
 
   // Never cache token requests
   res.setHeader("cache-control", "no-store");
 
   try {
     const ABLY_API_KEY = p(process.env.ABLY_API_KEY);
     if (!ABLY_API_KEY) return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY missing" });
 
    const colon = ABLY_API_KEY.indexOf(":");
    if (colon <= 0) {
      return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY format invalid" });
    }

    const keyName = ABLY_API_KEY.slice(0, colon);
    const basicAuth = Buffer.from(ABLY_API_KEY, "utf8").toString("base64");

     const q = getQuery(req);
     const chainId = Number(q.chainId ?? 97);
     const campaign = p(q.campaign).toLowerCase();
     const scope = p(q.scope).toLowerCase();
 
     if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
     let channel = "";
 
     if (scope === "league") {
       channel = `league:${chainId}`;
     } else {
       if (!isAddress(campaign)) {
         return json(res, 400, { error: "Invalid campaign address" });
       }
       channel = `token:${chainId}:${campaign}`;
     }
 
     const capability = {
       [channel]: ["subscribe"],
     };
 
    const ablyUrl =
      `https://main.realtime.ably.net/keys/${encodeURIComponent(keyName)}/requestToken`;

    const resp = await fetch(ablyUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${basicAuth}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        keyName,
        timestamp: Date.now(),
        ttl: 60 * 60 * 1000,
        capability: JSON.stringify(capability),
      }),
      cache: "no-store",
    });

    const text = await resp.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!resp.ok) {
      console.error("[api/ably/token] requestToken failed", {
        status: resp.status,
       body: payload,
      });
      return json(res, resp.status, {
        error: "Ably requestToken failed",
        ably: payload,
      });
    }

    // authUrl is allowed to return TokenDetails JSON
    return json(res, 200, payload);
   } catch (e) {
     console.error("[api/ably/token]", e);
     return json(res, 500, { error: "Server error" });
   }
 }