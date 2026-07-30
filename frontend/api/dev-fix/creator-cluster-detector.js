import { ethers } from "ethers";
import { pool } from "../../server/db.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MIN_FUNDING_WEI = 100_000_000_000_000n; // 0.0001 BNB
const DEFAULT_TX_LIMIT = 100;
const EXPLORER_TIMEOUT_MS = 6_000;

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function explorerApiKey() {
  return String(
    process.env.ETHERSCAN_API_KEY ||
      process.env.BSCSCAN_API_KEY ||
      process.env.BSC_SCAN_API_KEY ||
      "",
  ).trim();
}

export function creatorClusterFundingDetectorConfigured() {
  return Boolean(explorerApiKey());
}

function explorerApiUrl() {
  return String(process.env.ETHERSCAN_V2_API_URL || "https://api.etherscan.io/v2/api").trim();
}

function fundingLookbackSeconds() {
  return positiveInt(process.env.CREATOR_CLUSTER_FUNDING_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS, 365) * 24 * 60 * 60;
}

function minimumFundingWei() {
  try {
    const parsed = BigInt(String(process.env.CREATOR_CLUSTER_MIN_FUNDING_WEI || DEFAULT_MIN_FUNDING_WEI));
    return parsed > 0n ? parsed : DEFAULT_MIN_FUNDING_WEI;
  } catch {
    return DEFAULT_MIN_FUNDING_WEI;
  }
}

function transactionLimit() {
  return positiveInt(process.env.CREATOR_CLUSTER_EXPLORER_TX_LIMIT, DEFAULT_TX_LIMIT, 1_000);
}

async function fetchNormalTransactions({ chainId, address }) {
  const apiKey = explorerApiKey();
  if (!apiKey) {
    return { available: false, transactions: [], error: "Explorer API key is not configured." };
  }

  const url = new URL(explorerApiUrl());
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "999999999");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(transactionLimit()));
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXPLORER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Explorer request failed (${response.status}).`);
    }

    const payload = await response.json().catch(() => ({}));
    const result = Array.isArray(payload?.result) ? payload.result : [];
    const noTransactions = String(payload?.message || "").toLowerCase().includes("no transactions");
    if (String(payload?.status) !== "1" && !noTransactions) {
      throw new Error(String(payload?.result || payload?.message || "Explorer transaction lookup failed."));
    }
    return { available: true, transactions: result, error: null };
  } catch (error) {
    return {
      available: false,
      transactions: [],
      error: String(error?.name === "AbortError" ? "Explorer request timed out." : error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function directFundingTransaction({ transactions, creator, wallet, launchAt }) {
  const creatorLower = creator.toLowerCase();
  const walletLower = wallet.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const baseline = Number(launchAt || now);
  const earliest = Math.max(0, baseline - fundingLookbackSeconds());
  const minWei = minimumFundingWei();

  for (const tx of transactions) {
    const from = String(tx?.from || "").toLowerCase();
    const to = String(tx?.to || "").toLowerCase();
    const timestamp = Number(tx?.timeStamp || tx?.timestamp || 0);
    const input = String(tx?.input || "0x").toLowerCase();
    let valueWei = 0n;
    try {
      valueWei = BigInt(String(tx?.value || "0"));
    } catch {
      continue;
    }

    if (String(tx?.isError || "0") !== "0") continue;
    if (from !== creatorLower || to !== walletLower) continue;
    if (timestamp < earliest || timestamp > now) continue;
    if (input !== "0x" && input !== "") continue;
    if (valueWei < minWei) continue;

    return {
      txHash: String(tx?.hash || "").toLowerCase() || null,
      blockNumber: Number(tx?.blockNumber || 0) || null,
      timestamp,
      valueWei: valueWei.toString(),
    };
  }

  return null;
}

async function existingCreatorCluster(client, creator) {
  const { rows } = await client.query(
    `select cluster_id
       from public.creator_profiles
      where creator_wallet = $1
      limit 1`,
    [creator.toLowerCase()],
  );
  if (rows[0]?.cluster_id) return String(rows[0].cluster_id);

  const risk = await client.query(
    `select cluster_id
       from public.wallet_risk_profiles
      where wallet_address = $1
      limit 1`,
    [creator.toLowerCase()],
  );
  return risk.rows[0]?.cluster_id ? String(risk.rows[0].cluster_id) : null;
}

async function queueClusterSyncJob(client, { jobType, target, payload }) {
  await client.query(
    `insert into public.contract_sync_jobs (chain, job_type, target, status, payload)
     select 'bnb', $1, $2, 'queued', $3::jsonb
      where not exists (
        select 1
          from public.contract_sync_jobs
         where chain = 'bnb'
           and job_type = $1
           and lower(target) = lower($2)
           and status in ('queued', 'running')
           and payload = $3::jsonb
      )`,
    [jobType, target, JSON.stringify(payload)],
  );
}

async function persistDirectFundingCluster({ chainId, creator, wallet, funding }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtext($1)::bigint)",
      [`creator-funding:${chainId}:${creator.toLowerCase()}`],
    );

    const priorCluster = await existingCreatorCluster(client, creator);
    const clusterId = priorCluster || `creator-funding:${chainId}:${creator.toLowerCase()}`;

    await client.query(
      `insert into public.wallet_clusters (
         cluster_id, wallet_count, risk_level, restricted, primary_signals, last_seen_at, updated_at
       ) values ($1, 0, 'medium', false, array['direct_creator_funding']::text[], now(), now())
       on conflict (cluster_id) do update
         set risk_level = case when public.wallet_clusters.risk_level = 'high' then 'high' else 'medium' end,
             primary_signals = (
               select array_agg(distinct signal)
                 from unnest(public.wallet_clusters.primary_signals || excluded.primary_signals) as signal
             ),
             last_seen_at = now(),
             updated_at = now()`,
      [clusterId],
    );

    for (const member of [
      { wallet: creator, relationship: "creator" },
      { wallet, relationship: "direct_creator_funding" },
    ]) {
      await client.query(
        `insert into public.cluster_members (
           cluster_id, wallet_address, relationship, first_seen_at, last_seen_at
         ) values ($1, $2, $3, now(), now())
         on conflict (cluster_id, wallet_address) do update
           set relationship = coalesce(public.cluster_members.relationship, excluded.relationship),
               last_seen_at = now()`,
        [clusterId, member.wallet.toLowerCase(), member.relationship],
      );

      await client.query(
        `insert into public.wallet_risk_profiles (
           wallet_address, risk_level, restricted, cluster_id, reason, updated_at
         ) values ($1, 'medium', false, $2, 'Direct native funding relationship with campaign creator.', now())
         on conflict (wallet_address) do update
           set risk_level = case when public.wallet_risk_profiles.risk_level = 'high' then 'high' else 'medium' end,
               cluster_id = case
                 when public.wallet_risk_profiles.cluster_id is null
                   or public.wallet_risk_profiles.cluster_id = excluded.cluster_id
                 then excluded.cluster_id
                 else public.wallet_risk_profiles.cluster_id
               end,
               reason = case
                 when public.wallet_risk_profiles.reason is null or public.wallet_risk_profiles.reason = ''
                 then excluded.reason
                 else public.wallet_risk_profiles.reason
               end,
               updated_at = now()`,
        [member.wallet.toLowerCase(), clusterId],
      );
    }

    await client.query(
      `insert into public.creator_profiles (creator_wallet, cluster_id, updated_at)
       values ($1, $2, now())
       on conflict (creator_wallet) do update
         set cluster_id = case
               when public.creator_profiles.cluster_id is null
                 or public.creator_profiles.cluster_id = excluded.cluster_id
               then excluded.cluster_id
               else public.creator_profiles.cluster_id
             end,
             updated_at = now()`,
      [creator.toLowerCase(), clusterId],
    );

    const clusterResult = await client.query(
      `update public.wallet_clusters
          set wallet_count = (
                select count(*)::int
                  from public.cluster_members
                 where cluster_id = $1
              ),
              last_seen_at = now(),
              updated_at = now()
        where cluster_id = $1
      returning wallet_count`,
      [clusterId],
    );
    const walletCount = Number(clusterResult.rows[0]?.wallet_count || 2);

    await client.query(
      `insert into public.cluster_events (cluster_id, event_type, signal, metadata)
       select $1, 'relationship_detected', 'direct_creator_funding', $2::jsonb
        where not exists (
          select 1
            from public.cluster_events
           where cluster_id = $1
             and signal = 'direct_creator_funding'
             and metadata->>'txHash' = $3
        )`,
      [
        clusterId,
        JSON.stringify({
          chainId: Number(chainId),
          creator: creator.toLowerCase(),
          wallet: wallet.toLowerCase(),
          ...funding,
        }),
        funding.txHash || "",
      ],
    );

    await queueClusterSyncJob(client, {
      jobType: "set-wallet-cluster",
      target: creator,
      payload: { walletAddress: creator, clusterId },
    });
    await queueClusterSyncJob(client, {
      jobType: "set-wallet-cluster",
      target: wallet,
      payload: { walletAddress: wallet, clusterId },
    });
    await queueClusterSyncJob(client, {
      jobType: "set-cluster-risk",
      target: clusterId,
      payload: { clusterId, size: walletCount, riskLevel: "medium", restricted: false },
    });

    await client.query("commit");
    return { clusterId, walletCount };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function detectDirectCreatorFunding({ chainId, creatorAddress, walletAddress, launchAt }) {
  const creator = normalizeAddress(creatorAddress);
  const wallet = normalizeAddress(walletAddress);
  if (!creator || !wallet || creator.toLowerCase() === wallet.toLowerCase()) {
    return { linked: false, available: true, funding: null, clusterId: null };
  }

  const lookup = await fetchNormalTransactions({ chainId, address: wallet });
  if (!lookup.available) {
    return { linked: false, available: false, funding: null, clusterId: null, error: lookup.error };
  }

  const funding = directFundingTransaction({
    transactions: lookup.transactions,
    creator,
    wallet,
    launchAt,
  });
  if (!funding) return { linked: false, available: true, funding: null, clusterId: null };

  try {
    const persisted = await persistDirectFundingCluster({ chainId, creator, wallet, funding });
    return {
      linked: true,
      available: true,
      funding,
      clusterId: persisted.clusterId,
      walletCount: persisted.walletCount,
    };
  } catch (error) {
    return {
      linked: true,
      available: false,
      funding,
      clusterId: null,
      error: String(error?.message || error),
    };
  }
}
