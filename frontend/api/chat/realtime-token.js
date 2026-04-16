import Ably from "ably";
import { badMethod, getQuery, json } from "../../server/http.js";
import { channelName, normalizeCampaignAddress, requireSession, resolveAblyApiKey, validChainId } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  res.setHeader("cache-control", "no-store");

  try {
    const session = await requireSession(req);
    const q = getQuery(req);
    const chainId = validChainId(q.chainId);
    const campaignAddress = normalizeCampaignAddress(q.campaignAddress);
    if (!chainId) return json(res, 400, { error: "Invalid chainId" });
    if (!campaignAddress) return json(res, 400, { error: "Invalid campaignAddress" });

    const key = resolveAblyApiKey();
    if (!key || !key.includes(":")) {
      return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY missing or invalid" });
    }

    const channel = channelName(chainId, campaignAddress);
    const ably = new Ably.Rest({ key });
    const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      clientId: session.walletAddress,
      capability: { [channel]: ["subscribe", "presence"] },
    });

    return json(res, 200, tokenRequest);
  } catch (e) {
    console.error("[api/chat/realtime-token]", e);
    return json(res, e?.statusCode || 500, { error: e?.statusCode ? e.message : "Server error" });
  }
}
