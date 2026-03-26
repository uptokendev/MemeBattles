import Ably from "ably";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";

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
    const ABLY_API_KEY = resolveAblyApiKey();
    if (!ABLY_API_KEY) {
      return json(res, 500, { error: "Server misconfigured: ABLY_API_KEY missing" });
    }

    const colon = ABLY_API_KEY.indexOf(":");
    if (colon <= 0) {
      return json(res, 500, {
        error: "Server misconfigured: ABLY_API_KEY format invalid",
        hint: "Expected keyName:keySecret, or set ABLY_API_KEY_NAME + ABLY_API_KEY_SECRET.",
      });
    }

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

    const capability = { [channel]: ["subscribe"] };
    const ably = new Ably.Rest({ key: ABLY_API_KEY });
    const tokenRequest = await ably.auth.createTokenRequest({
      ttl: 60 * 60 * 1000,
      capability,
    });

    return json(res, 200, tokenRequest);
  } catch (e) {
    console.error("[api/ably/token]", e);
    return json(res, 500, { error: "Server error" });
  }
}
