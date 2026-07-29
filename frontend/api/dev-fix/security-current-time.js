import { getQuery, json, readJson } from "../../server/http.js";
import * as legacySecurity from "./security.js";

export * from "./security.js";

function normalizeCurrentTimeCopy(preflight) {
  const cooldownEndsAt = preflight?.creator?.cooldownEndsAt || null;
  const reasons = Array.isArray(preflight?.reasons)
    ? preflight.reasons.map((reason) => {
        const text = String(reason || "");
        if (!text.startsWith("Creator launch cooldown remains active")) return text;
        const suffix = cooldownEndsAt ? ` You may deploy or arm another campaign after ${cooldownEndsAt}.` : "";
        return `This creator wallet cannot arm another campaign yet.${suffix} The selected trading-open time does not affect this cooldown.`;
      })
    : [];

  const onChainLiveCampaignCount = Number(preflight?.creator?.liveBondingCount || 0);
  const onChainLiveCampaignLimit = Number(preflight?.rules?.maxLiveBonding || 0);

  return {
    ...preflight,
    reasons,
    evaluationAt: new Date().toISOString(),
    cooldownEndsAt,
    canArmNow: reasons.length === 0 && Boolean(preflight?.allowed),
    onChainLiveCampaignCount,
    onChainLiveCampaignLimit,
    // Draft/reservation quotas are deliberately separate from the on-chain
    // deployed, non-graduated campaign limit. A future Railway policy may fill
    // these values without changing CreatorRegistry accounting.
    offChainReservationCount: null,
    offChainReservationLimit: null,
  };
}

export async function evaluateCreatePreflight({ walletAddress }) {
  const preflight = await legacySecurity.evaluateCreatePreflight({ walletAddress });
  return normalizeCurrentTimeCopy(preflight);
}

export async function launchpadPreflightCreate(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const body = await readJson(req);
  const walletAddress = body.walletAddress || body.creatorWallet || body.creator;
  const preflight = await evaluateCreatePreflight({ walletAddress });
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}

export async function securityCreatorLaunchEligibility(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const query = getQuery(req);
  const walletAddress = req.params?.wallet || query.walletAddress;
  const preflight = await evaluateCreatePreflight({ walletAddress });
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}
