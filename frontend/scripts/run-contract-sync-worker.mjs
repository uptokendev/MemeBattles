import { ethers } from "ethers";
import { pool } from "../server/db.js";

const FACTORY_ABI = [
  "function setGlobalPaused(bool paused)",
  "function setCreatePaused(bool paused)",
  "function setCampaignPauses(address campaign, bool paused, bool buysPaused, bool sellsPaused, bool graduationPaused)",
];

const CREATOR_REGISTRY_ABI = [
  "function setCreatorTier(address creator, uint8 tier)",
  "function setCreatorRestricted(address creator, bool restricted)",
  "function setManualReviewRequired(address creator, bool required)",
];

const RISK_REGISTRY_ABI = [
  "function setWalletRisk(address wallet, uint8 riskLevel, bool restricted)",
  "function setWalletCluster(address wallet, bytes32 clusterId)",
  "function setClusterRisk(bytes32 clusterId, uint256 size, uint8 riskLevel, bool restricted)",
];

const TIER_IDS = new Map([
  ["new", 1],
  ["newcreator", 1],
  ["trusted", 2],
  ["trustedcreator", 2],
  ["proven", 3],
  ["provencreator", 3],
]);

const RISK_IDS = new Map([
  ["low", 0],
  ["medium", 1],
  ["watch", 1],
  ["high", 2],
  ["critical", 3],
]);

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
}

function getChainId() {
  const raw = Number(process.env.CONTRACT_SYNC_CHAIN_ID || process.env.VITE_DEFAULT_CHAIN_ID || process.env.VITE_TARGET_CHAIN_ID || 97);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 97;
}

function getRpcUrl(chainId) {
  return firstCsvValue(
    process.env.CONTRACT_SYNC_RPC_URL ||
      process.env[`BSC_RPC_HTTP_${chainId}`] ||
      process.env[`VITE_PUBLIC_RPC_${chainId}`] ||
      (chainId === 56 ? process.env.VITE_BSC_MAINNET_RPC : "") ||
      (chainId === 97 ? process.env.VITE_BSC_TESTNET_RPC : ""),
  );
}

function getPrivateKey() {
  const raw = String(
    process.env.CONTRACT_SYNC_PRIVATE_KEY ||
      process.env.BNB_CONTRACT_SYNC_PRIVATE_KEY ||
      process.env.DEPLOYER_PK ||
      "",
  ).trim();
  if (!raw) throw new Error("Missing CONTRACT_SYNC_PRIVATE_KEY, BNB_CONTRACT_SYNC_PRIVATE_KEY, or DEPLOYER_PK");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function normalizeAddress(value, label) {
  const raw = String(value || "").trim();
  if (!raw || !ethers.isAddress(raw)) throw new Error(`Invalid ${label || "address"}: ${raw || "(empty)"}`);
  return ethers.getAddress(raw);
}

function optionalAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function requiredEnvAddress(keys, label) {
  for (const key of keys) {
    const value = optionalAddress(process.env[key]);
    if (value) return value;
  }
  throw new Error(`Missing ${label}: set one of ${keys.join(", ")}`);
}

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on", "paused", "restricted", "required"].includes(raw)) return true;
  if (["0", "false", "no", "off", "unpaused", "unrestricted", "cleared"].includes(raw)) return false;
  return fallback;
}

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function tierId(value) {
  const id = TIER_IDS.get(String(value || "").replace(/\s+/g, "").toLowerCase());
  if (!id) throw new Error(`Unsupported creator tier: ${value || "(empty)"}`);
  return id;
}

function riskId(value, restricted = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return restricted ? 2 : 0;
  return RISK_IDS.get(normalized) ?? (restricted ? 2 : 0);
}

function clusterBytes32(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Missing cluster id");
  if (/^0x[0-9a-fA-F]{64}$/.test(raw)) return raw;
  return ethers.keccak256(ethers.toUtf8Bytes(raw));
}

function actionName(job) {
  return String(job.job_type || job.action || "").trim().toLowerCase().replace(/^bnb[_:-]/, "");
}

async function loadAuditPayload(job) {
  const candidates = [`bnb_${job.job_type}`, job.job_type, `bnb-${job.job_type}`].filter(Boolean);
  const { rows } = await pool.query(
    `select new_value
       from public.security_actions
      where target = $1
        and action = any($2::text[])
      order by created_at desc
      limit 1`,
    [String(job.target || ""), candidates],
  );
  return parsePayload(rows[0]?.new_value);
}

async function loadCampaignPausePayload(campaignAddress) {
  if (!campaignAddress) return {};
  const { rows } = await pool.query(
    `select paused, buy_paused, sell_paused, graduation_paused
       from public.campaign_security_states
      where campaign_address = $1
      limit 1`,
    [campaignAddress.toLowerCase()],
  );
  const row = rows[0];
  return row
    ? {
        paused: Boolean(row.paused),
        buyPaused: Boolean(row.buy_paused),
        sellPaused: Boolean(row.sell_paused),
        graduationPaused: Boolean(row.graduation_paused),
      }
    : {};
}

async function loadClusterPayload(clusterId) {
  if (!clusterId) return {};
  const { rows } = await pool.query(
    `select wallet_count, risk_level, restricted
       from public.wallet_clusters
      where cluster_id = $1
      limit 1`,
    [String(clusterId)],
  );
  const row = rows[0];
  return row
    ? { size: Number(row.wallet_count || 0), riskLevel: row.risk_level || "low", restricted: Boolean(row.restricted) }
    : {};
}

async function loadWalletRiskPayload(walletAddress) {
  if (!walletAddress) return {};
  const { rows } = await pool.query(
    `select risk_level, restricted, cluster_id
       from public.wallet_risk_profiles
      where wallet_address = $1
      limit 1`,
    [walletAddress.toLowerCase()],
  );
  const row = rows[0];
  return row
    ? { riskLevel: row.risk_level || "low", restricted: Boolean(row.restricted), clusterId: row.cluster_id || null }
    : {};
}

async function payloadFor(job) {
  return {
    ...(await loadAuditPayload(job)),
    ...parsePayload(job.payload),
  };
}

async function claimJobs(limit) {
  const { rows } = await pool.query(
    `update public.contract_sync_jobs
        set status = 'running',
            attempts = attempts + 1,
            locked_at = now(),
            updated_at = now(),
            error = null
      where id in (
        select id
          from public.contract_sync_jobs
         where chain = 'bnb'
           and status in ('queued', 'failed')
           and (locked_at is null or locked_at < now() - interval '10 minutes')
         order by created_at asc
         limit $1
         for update skip locked
      )
      returning *`,
    [limit],
  );
  return rows;
}

async function markJob(id, status, { txHash = null, error = null } = {}) {
  await pool.query(
    `update public.contract_sync_jobs
        set status = $2,
            tx_hash = coalesce($3, tx_hash),
            error = $4,
            locked_at = null,
            updated_at = now()
      where id = $1`,
    [id, status, txHash, error],
  );
}

async function executeJob({ job, contracts }) {
  const action = actionName(job);
  const payload = await payloadFor(job);

  if (["pause-factory", "pause-global", "global-pause", "set-global-paused"].includes(action)) {
    return contracts.factory.setGlobalPaused(parseBool(payload.paused ?? payload.globalPaused, true));
  }

  if (["pause-create", "create-pause", "set-create-paused"].includes(action)) {
    return contracts.factory.setCreatePaused(parseBool(payload.paused ?? payload.createPaused, true));
  }

  if (["pause-campaign", "set-campaign-pauses"].includes(action)) {
    const campaign = normalizeAddress(payload.campaign || payload.campaignAddress || job.target, "campaign");
    const state = { ...(await loadCampaignPausePayload(campaign)), ...payload };
    return contracts.factory.setCampaignPauses(
      campaign,
      parseBool(state.paused, false),
      parseBool(state.buyPaused ?? state.buysPaused, false),
      parseBool(state.sellPaused ?? state.sellsPaused, false),
      parseBool(state.graduationPaused, false),
    );
  }

  if (["set-creator-tier", "creator-tier"].includes(action)) {
    const creator = normalizeAddress(payload.walletAddress || payload.creator || job.target, "creator");
    return contracts.creatorRegistry.setCreatorTier(creator, tierId(payload.tier || payload.newTier));
  }

  if (["set-creator-restricted", "restrict-creator", "creator-restrict"].includes(action)) {
    const creator = normalizeAddress(payload.walletAddress || payload.creator || job.target, "creator");
    return contracts.creatorRegistry.setCreatorRestricted(creator, parseBool(payload.restricted, true));
  }

  if (["set-creator-manual-review", "creator-manual-review", "manual-review-creator"].includes(action)) {
    const creator = normalizeAddress(payload.walletAddress || payload.creator || job.target, "creator");
    return contracts.creatorRegistry.setManualReviewRequired(creator, parseBool(payload.required ?? payload.manualReviewRequired, true));
  }

  if (["set-wallet-risk", "set-wallet-restricted", "restrict-wallet", "wallet-restrict"].includes(action)) {
    const wallet = normalizeAddress(payload.walletAddress || payload.wallet || job.target, "wallet");
    const state = { ...(await loadWalletRiskPayload(wallet)), ...payload };
    return contracts.riskRegistry.setWalletRisk(wallet, riskId(state.riskLevel, parseBool(state.restricted, true)), parseBool(state.restricted, true));
  }

  if (["set-wallet-cluster", "wallet-cluster"].includes(action)) {
    const wallet = normalizeAddress(payload.walletAddress || payload.wallet || job.target, "wallet");
    return contracts.riskRegistry.setWalletCluster(wallet, clusterBytes32(payload.clusterId));
  }

  if (["set-cluster-risk", "set-cluster-restricted", "restrict-cluster", "cluster-restrict"].includes(action)) {
    const clusterId = String(payload.clusterId || job.target || "").trim();
    const state = { ...(await loadClusterPayload(clusterId)), ...payload };
    return contracts.riskRegistry.setClusterRisk(
      clusterBytes32(clusterId),
      BigInt(Math.max(0, Number(state.size ?? state.walletCount ?? state.wallets ?? 0))),
      riskId(state.riskLevel, parseBool(state.restricted, true)),
      parseBool(state.restricted, true),
    );
  }

  throw new Error(`Unsupported BNB contract sync job type: ${job.job_type}`);
}

async function main() {
  const chainId = getChainId();
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) throw new Error(`Missing RPC URL for chain ${chainId}`);

  const network = ethers.Network.from(Number(chainId));
  const provider = new ethers.JsonRpcProvider(rpcUrl, network, {
    staticNetwork: network,
    batchMaxCount: 1,
    batchStallTime: 0,
  });
  const signer = new ethers.Wallet(getPrivateKey(), provider);
  const contracts = {
    factory: new ethers.Contract(
      requiredEnvAddress([`FACTORY_ADDRESS_${chainId}`, `VITE_FACTORY_ADDRESS_${chainId}`, "FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"], "LaunchFactory address"),
      FACTORY_ABI,
      signer,
    ),
    creatorRegistry: new ethers.Contract(
      requiredEnvAddress([`CREATOR_REGISTRY_ADDRESS_${chainId}`, "CREATOR_REGISTRY_ADDRESS"], "CreatorRegistry address"),
      CREATOR_REGISTRY_ABI,
      signer,
    ),
    riskRegistry: new ethers.Contract(
      requiredEnvAddress([`RISK_REGISTRY_ADDRESS_${chainId}`, "RISK_REGISTRY_ADDRESS"], "RiskRegistry address"),
      RISK_REGISTRY_ABI,
      signer,
    ),
  };

  const limit = Math.max(1, Math.min(25, Number(process.env.CONTRACT_SYNC_BATCH_SIZE || 5)));
  const confirmations = Math.max(1, Number(process.env.CONTRACT_SYNC_CONFIRMATIONS || 1));
  const jobs = await claimJobs(limit);
  console.log(`[contract-sync] claimed ${jobs.length} BNB job(s)`);

  for (const job of jobs) {
    try {
      const tx = await executeJob({ job, contracts });
      console.log(`[contract-sync] ${job.id} ${job.job_type} submitted ${tx.hash}`);
      const receipt = await tx.wait(confirmations);
      await markJob(job.id, "succeeded", { txHash: receipt?.hash || tx.hash });
      console.log(`[contract-sync] ${job.id} succeeded ${receipt?.hash || tx.hash}`);
    } catch (error) {
      const message = String(error?.shortMessage || error?.message || error);
      await markJob(job.id, "failed", { error: message.slice(0, 1000) });
      console.error(`[contract-sync] ${job.id} failed: ${message}`);
      if (String(process.env.CONTRACT_SYNC_FAIL_FAST || "") === "1") throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error("[contract-sync] worker failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
