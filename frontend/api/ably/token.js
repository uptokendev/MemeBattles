import Ably from "ably";
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

    // Browser only needs to SUBSCRIBE.
    // Publishing is done by your Railway indexer (server-side).
    const capability = {
      [channel]: ["subscribe"],
    };

    const rest = new Ably.Rest({ key: ABLY_API_KEY });

    const tokenRequest = await new Promise((resolve, reject) => {
      rest.auth.createTokenRequest(
        {
          capability: JSON.stringify(capability),
          // optional: reduce abuse window
          ttl: 60 * 60 * 1000, // 1 hour
        },
        (err, tr) => {
          if (err) return reject(err);
          resolve(tr);
        }
      );
    });

    return json(res, 200, tokenRequest);
  } catch (e) {
    console.error("[api/ably/token]", e);
    return json(res, 500, { error: "Server error" });
  }
}
