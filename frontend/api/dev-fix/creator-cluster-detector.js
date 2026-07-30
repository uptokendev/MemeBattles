import { ethers } from "ethers";
import { pool } from "../../server/db.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MIN_FUNDING_WEI = 100_000_000_000_000n; // 0.0001 BNB
const DEFAULT_MAX_INDEXER_AGE_SECONDS = 30;
const DEFAULT_MAX_INDEXER_LAG_BLOCKS = 20;

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
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

function maximumIndexerAgeSeconds() {
  return positiveInt(
    process.env.CREATOR_CLUSTER_MAX_INDEXER_AGE_SECONDS,
    DEFAULT_MAX_INDEXER_AGE_SECONDS,
    10 * 60,
  );
}

function maximumIndexerLagBlocks() {
  return positiveInt(
    process.env.CREATOR_CLUSTER_MAX_INDEXER_LAG_BLOCKS,
    DEFAULT_MAX_INDEXER_LAG_BLOCKS,
    10_000,
  );
}

export function creatorClusterFundingDetectorConfigured() {
  const disabled = String(process.env.CREATOR_CLUSTER_INDEXER_DISABLED || "").trim().toLowerCase();
  return !["1", "true", "yes", "on"].includes(disabled);
}

async function readIndexerHealth(chainId) {
  const { rows } = await pool.query(
    `select chain_id,
            status,
            last_processed_block,
            latest_finalized_block,
            last_processed_at,
            updated_at,
            error
       from public.creator_funding_indexer_state
      where chain_id = $1
      limit 1`,
    [Number(chainId)],
  );

  const row = rows[0];
  if (!row) {
    return {
      available: false,
      error: `Creator-funding indexer has not initialized for chain ${Number(chainId)}.`,
      status: "missing",
      lagBlocks: null,
      ageSeconds: null,
    };
  }

  const processedBlock = Number(row.last_processed_block || 0);
  const latestBlock = Number(row.latest_finalized_block || processedBlock);
  const lagBlocks = Math.max(0, latestBlock - processedBlock);
  const lastProcessedAt = row.last_processed_at || row.updated_at;
  const ageSeconds = lastProcessedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastProcessedAt).getTime()) / 1000))
    : Number.POSITIVE_INFINITY;
  const healthyStatus = ["healthy", "running"].includes(String(row.status || "").toLowerCase());
  const available =
    healthyStatus &&
    ageSeconds <= maximumIndexerAgeSeconds() &&
    lagBlocks <= maximumIndexerLagBlocks();

  return {
    available,
    status: String(row.status || "unknown"),
    processedBlock,
    latestBlock,
    lagBlocks,
    ageSeconds,
    error: available
      ? null
      : String(
          row.error ||
            `Creator-funding indexer is not current (status=${row.status || "unknown"}, lag=${lagBlocks}, age=${ageSeconds}s).`,
        ),
  };
}

async function findIndexedFunding({ chainId, creator, wallet, launchAt }) {
  const now = Math.floor(Date.now() / 1000);
  const baseline = Number(launchAt || now);
  const earliest = Math.max(0, baseline - fundingLookbackSeconds());
  const { rows } = await pool.query(
    `select tx_hash,
            block_number,
            extract(epoch from block_timestamp)::bigint as timestamp,
            value_wei::text as value_wei
       from public.creator_funding_edges
      where chain_id = $1
        and lower(creator_wallet) = lower($2)
        and lower(funded_wallet) = lower($3)
        and block_timestamp >= to_timestamp($4)
        and value_wei >= $5::numeric
      order by block_number desc
      limit 1`,
    [Number(chainId), creator, wallet, earliest, minimumFundingWei().toString()],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    txHash: String(row.tx_hash || "").toLowerCase() || null,
    blockNumber: Number(row.block_number || 0) || null,
    timestamp: Number(row.timestamp || 0),
    valueWei: String(row.value_wei || "0"),
  };
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

export async function persistDirectFundingCluster({ chainId, creator, wallet, funding }) {
  const normalizedCreator = normalizeAddress(creator);
  const normalizedWallet = normalizeAddress(wallet);
  if (!normalizedCreator || !normalizedWallet || normalizedCreator.toLowerCase() === normalizedWallet.toLowerCase()) {
    throw new Error("Invalid creator-funding relationship.");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select pg_advisory_xact_lock(hashtext($1)::bigint)",
      [`creator-funding:${Number(chainId)}:${normalizedCreator.toLowerCase()}`],
    );

    const priorCluster = await existingCreatorCluster(client, normalizedCreator);
    const clusterId = priorCluster || `creator-funding:${Number(chainId)}:${normalizedCreator.toLowerCase()}`;

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
      { wallet: normalizedCreator, relationship: "creator" },
      { wallet: normalizedWallet, relationship: "direct_creator_funding" },
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
      [normalizedCreator.toLowerCase(), clusterId],
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
          creator: normalizedCreator.toLowerCase(),
          wallet: normalizedWallet.toLowerCase(),
          ...funding,
        }),
        funding?.txHash || "",
      ],
    );

    await queueClusterSyncJob(client, {
      jobType: "set-wallet-cluster",
      target: normalizedCreator,
      payload: { walletAddress: normalizedCreator, clusterId },
    });
    await queueClusterSyncJob(client, {
      jobType: "set-wallet-cluster",
      target: normalizedWallet,
      payload: { walletAddress: normalizedWallet, clusterId },
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
    return { linked: false, available: true, funding: null, clusterId: null, provider: "rpc_indexer" };
  }

  if (!creatorClusterFundingDetectorConfigured()) {
    return {
      linked: false,
      available: false,
      funding: null,
      clusterId: null,
      error: "Creator-funding indexer is disabled.",
      provider: "rpc_indexer",
    };
  }

  try {
    const funding = await findIndexedFunding({
      chainId: Number(chainId),
      creator,
      wallet,
      launchAt,
    });

    if (funding) {
      try {
        const persisted = await persistDirectFundingCluster({ chainId, creator, wallet, funding });
        return {
          linked: true,
          available: true,
          funding,
          clusterId: persisted.clusterId,
          walletCount: persisted.walletCount,
          provider: "rpc_indexer",
        };
      } catch (error) {
        return {
          linked: true,
          available: false,
          funding,
          clusterId: null,
          error: String(error?.message || error),
          provider: "rpc_indexer",
        };
      }
    }

    const health = await readIndexerHealth(Number(chainId));
    return {
      linked: false,
      available: Boolean(health.available),
      funding: null,
      clusterId: null,
      error: health.error,
      provider: "rpc_indexer",
      indexer: health,
    };
  } catch (error) {
    return {
      linked: false,
      available: false,
      funding: null,
      clusterId: null,
      error: String(error?.message || error),
      provider: "rpc_indexer",
    };
  }
}
