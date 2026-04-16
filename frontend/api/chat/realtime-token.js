import Ably from "ably";
import { badMethod, getQuery, json } from "../../server/http.js";
import { normalizeAddress, resolveAblyApiKey, roomChannelName } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  res.setHeader("cache-control", "no-store");
  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const campaignAddress = normalizeAddress(q.campaignAddress);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });

    const apiKey = resolveAblyApiKey();
    if (!apiKey || !apiKey.includes(":")) {
      return json(res, 503, {
        error: "Realtime is unavailable because ABLY_API_KEY is missing or invalid. Chat posting still works.",
      });
    }

    const ably = new Ably.Rest({ key: apiKey });
    const channel = roomChannelName(chainId, campaignAddress);
    const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      capability: { [channel]: ["subscribe"] },
    });
    return json(res, 200, tokenRequest);
  } catch (e) {
    const msg = String(e?.message ?? "");
    console.error("[api/chat/realtime-token]", e);
    return json(res, 500, { error: "Server error", details: process.env.NODE_ENV !== "production" ? msg : undefined });
  }
}
