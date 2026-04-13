import Ably from "ably";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";
import { getBearerToken, lookupChatSession, normalizeAddress, roomChannelName } from "./_lib.js";

function p(v) {
  return String(v ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function resolveAblyApiKey() {
  const raw = p(process.env.ABLY_API_KEY);
  const keyName = p(process.env.ABLY_API_KEY_NAME || process.env.ABLY_KEY_NAME);
  const keySecret = p(process.env.ABLY_API_KEY_SECRET || process.env.ABLY_KEY_SECRET);

  if (raw.includes(":")) return raw;
  if (raw && keySecret) return `${raw}:${keySecret}`;
  if (keyName && keySecret) return `${keyName}:${keySecret}`;
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);
  res.setHeader("cache-control", "no-store");

  try {
    const ablyKey = resolveAblyApiKey();
    if (!ablyKey) return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY missing" });

    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const campaignAddress = normalizeAddress(q.campaignAddress);

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(campaignAddress)) return json(res, 400, { error: "Invalid campaignAddress" });

    const sessionToken = getBearerToken(req);
    const session = sessionToken ? await lookupChatSession(sessionToken) : null;
    const channel = roomChannelName(chainId, campaignAddress);
    const capability = {
      [channel]: session ? ["subscribe", "presence"] : ["subscribe"],
    };

    const ably = new Ably.Rest({ key: ablyKey });
    const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      capability,
      clientId: session?.walletAddress ? normalizeAddress(session.walletAddress) : undefined,
    });

    return json(res, 200, tokenRequest);
  } catch (e) {
    console.error("[api/chat/realtime-token]", e);
    return json(res, 500, { error: "Server error" });
  }
}
