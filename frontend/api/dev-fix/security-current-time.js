import { ethers } from "ethers";
import { getQuery, json, readJson } from "../../server/http.js";
import * as legacySecurity from "./security.js";

export * from "./security.js";

const CAMPAIGN_PROTECTION_ABI = [
  "function creator() view returns (address)",
  "function creatorBuyLockUntil() view returns (uint256)",
  "function creatorBuyCapWei() view returns (uint256)",
  "function creatorBoughtWei() view returns (uint256)",
  "function riskRegistry() view returns (address)",
];

const RISK_REGISTRY_ABI = [
  "function getWalletRisk(address wallet) view returns (uint8 riskLevel,bool restricted,bytes32 clusterId)",
];

const ZERO_CLUSTER = `0x${"0".repeat(64)}`;

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
}

function getRpcUrl(chainId) {
  const perChain = process.env[`BSC_RPC_HTTP_${chainId}`] || process.env[`VITE_PUBLIC_RPC_${chainId}`];
  const direct = firstCsvValue(perChain);
  if (direct) return direct;
  if (Number(chainId) === 56) return firstCsvValue(process.env.BSC_RPC_HTTP_56 || process.env.VITE_BSC_MAINNET_RPC);
  if (Number(chainId) === 97) return firstCsvValue(process.env.BSC_RPC_HTTP_97 || process.env.VITE_BSC_TESTNET_RPC);
  return "";
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function normalizeClusterId(value) {
  const raw = String(value || "").trim().toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(raw) && raw !== ZERO_CLUSTER ? raw : null;
}

function formatTierLabel(tier) {
  if (String(tier || "").toLowerCase() === "trusted") return { tier: "Trusted", tierNumber: 2 };
  if (String(tier || "").toLowerCase() === "proven") return { tier: "Proven", tierNumber: 3 };
  return { tier: "New", tierNumber: 1 };
}

async function readOnchainCreatorProtection({ chainId, campaignAddress, walletAddress }) {
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) throw new Error("RPC URL is not configured for creator-cluster protection.");

  const provider = new ethers.JsonRpcProvider(rpcUrl, Number(chainId), { staticNetwork: true });
  const campaign = new ethers.Contract(campaignAddress, CAMPAIGN_PROTECTION_ABI, provider);
  const [creatorRaw, lockUntilRaw, capWeiRaw, boughtWeiRaw, riskRegistryRaw] = await Promise.all([
    campaign.creator(),
    campaign.creatorBuyLockUntil(),
    campaign.creatorBuyCapWei(),
    campaign.creatorBoughtWei(),
    campaign.riskRegistry(),
  ]);

  const creator = normalizeAddress(creatorRaw);
  const riskRegistry = normalizeAddress(riskRegistryRaw);
  let buyerClusterId = null;
  let creatorClusterId = null;

  if (riskRegistry) {
    const registry = new ethers.Contract(riskRegistry, RISK_REGISTRY_ABI, provider);
    const [buyerRisk, creatorRisk] = await Promise.all([
      registry.getWalletRisk(walletAddress),
      registry.getWalletRisk(creator),
    ]);
    buyerClusterId = normalizeClusterId(buyerRisk.clusterId ?? buyerRisk[2]);
    creatorClusterId = normalizeClusterId(creatorRisk.clusterId ?? creatorRisk[2]);
  }

  return {
    creator,
    creatorBuyLockUntil: Number(lockUntilRaw),
    creatorBuyCapWei: BigInt(capWeiRaw).toString(),
    creatorBoughtWei: BigInt(boughtWeiRaw).toString(),
    riskRegistry: riskRegistry || null,
    buyerClusterId,
    creatorClusterId,
  };
}

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
    offChainReservationCount: null,
    offChainReservationLimit: null,
  };
}

export async function evaluateCreatePreflight({ walletAddress }) {
  const preflight = await legacySecurity.evaluateCreatePreflight({ walletAddress });
  return normalizeCurrentTimeCopy(preflight);
}

export async function evaluateTradePreflight({ walletAddress, campaignAddress, chainId = 97 }) {
  const base = await legacySecurity.evaluateTradePreflight({ walletAddress, campaignAddress, chainId });
  const wallet = normalizeAddress(walletAddress);
  const campaign = normalizeAddress(campaignAddress);

  if (!wallet || !campaign || ![56, 97].includes(Number(chainId))) return base;

  try {
    const onChain = await readOnchainCreatorProtection({ chainId, campaignAddress: campaign, walletAddress: wallet });
    const creatorProfile = await legacySecurity.evaluateCreatePreflight({ walletAddress: onChain.creator });
    const { tier, tierNumber } = formatTierLabel(creatorProfile?.tier || creatorProfile?.creator?.tier);
    const dbBuyerClusterId = String(base?.walletRisk?.clusterId || base?.cluster?.id || "").trim() || null;
    const dbCreatorClusterId = String(creatorProfile?.creator?.clusterId || creatorProfile?.cluster?.id || "").trim() || null;
    const directCreator = wallet.toLowerCase() === onChain.creator.toLowerCase();
    const onChainClusterMatch = Boolean(
      onChain.buyerClusterId &&
      onChain.creatorClusterId &&
      onChain.buyerClusterId === onChain.creatorClusterId,
    );
    const databaseClusterMatch = Boolean(
      dbBuyerClusterId &&
      dbCreatorClusterId &&
      dbBuyerClusterId === dbCreatorClusterId,
    );
    const creatorLinked = directCreator || onChainClusterMatch || databaseClusterMatch;
    const lockActive = onChain.creatorBuyLockUntil > Math.floor(Date.now() / 1000);
    const unlockAt = onChain.creatorBuyLockUntil > 0
      ? new Date(onChain.creatorBuyLockUntil * 1000).toISOString()
      : null;
    const relationship = directCreator ? "creator" : creatorLinked ? "confirmed_cluster" : null;

    const protection = {
      code: creatorLinked && lockActive ? (directCreator ? "CREATOR_BUY_LOCKED" : "CREATOR_CLUSTER_BUY_LOCKED") : null,
      creatorWallet: onChain.creator,
      creatorLinked,
      relationship,
      tier,
      tierNumber,
      unlockAt,
      creatorBuyLockUntil: onChain.creatorBuyLockUntil,
      creatorBuyCapWei: onChain.creatorBuyCapWei,
      creatorBoughtWei: onChain.creatorBoughtWei,
      buyerClusterId: onChain.buyerClusterId || dbBuyerClusterId,
      creatorClusterId: onChain.creatorClusterId || dbCreatorClusterId,
      source: onChainClusterMatch ? "onchain" : databaseClusterMatch ? "database" : directCreator ? "creator_address" : "none",
    };

    if (!creatorLinked || !lockActive) {
      return { ...base, creatorProtection: protection };
    }

    const reason = directCreator
      ? `Tier ${tierNumber} creators cannot buy their own campaign until ${unlockAt}.`
      : `This wallet is linked to the Tier ${tierNumber} campaign creator and cannot buy this campaign until ${unlockAt}.`;

    return {
      ...base,
      allowed: false,
      code: protection.code,
      reasons: [reason, ...(Array.isArray(base?.reasons) ? base.reasons : [])],
      creatorProtection: protection,
    };
  } catch (error) {
    console.error("[security-current-time] creator cluster protection check failed", error);
    return {
      ...base,
      allowed: false,
      code: "CREATOR_CLUSTER_CHECK_UNAVAILABLE",
      reasons: ["Creator-cluster protection could not be verified. Trading authorization was not issued."],
      creatorProtection: {
        code: "CREATOR_CLUSTER_CHECK_UNAVAILABLE",
        error: String(error?.shortMessage || error?.message || error),
      },
    };
  }
}

export async function launchpadPreflightCreate(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const body = await readJson(req);
  const walletAddress = body.walletAddress || body.creatorWallet || body.creator;
  const preflight = await evaluateCreatePreflight({ walletAddress });
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}

export async function launchpadPreflightBuy(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const body = await readJson(req);
  const preflight = await evaluateTradePreflight({
    walletAddress: body.walletAddress,
    campaignAddress: body.campaignAddress,
    chainId: body.chainId || 97,
  });
  if (preflight.campaign?.buyPaused) {
    preflight.allowed = false;
    preflight.reasons = [...(preflight.reasons || []), "Campaign buys are paused."];
  }
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}

export async function securityCreatorLaunchEligibility(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const query = getQuery(req);
  const walletAddress = req.params?.wallet || query.walletAddress;
  const preflight = await evaluateCreatePreflight({ walletAddress });
  return json(res, preflight.allowed ? 200 : 403, { preflight });
}
