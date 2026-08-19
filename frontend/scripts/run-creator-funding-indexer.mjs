import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db.js";
import { persistDirectFundingCluster } from "../api/dev-fix/creator-cluster-detector.js";

const DEFAULT_CHAIN_ID = 56;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_CREATOR_REFRESH_MS = 30_000;
const DEFAULT_RPC_TIMEOUT_MS = 8_000;
const DEFAULT_INITIAL_BACKFILL_BLOCKS = 128;
const DEFAULT_MAX_BLOCKS_PER_TICK = 50;
const DEFAULT_FALLBACK_FINALITY_BLOCKS = 15;
const DEFAULT_MIN_FUNDING_WEI = 100_000_000_000_000n; // 0.0001 BNB

let rpcCursor = 0;
let rpcRequestId = 0;
let stopping = false;

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function chainId() {
  const parsed = positiveInt(
    process.env.CREATOR_CLUSTER_CHAIN_ID ||
      process.env.DEFAULT_EVM_CHAIN_ID ||
      process.env.VITE_DEFAULT_CHAIN_ID ||
      process.env.VITE_TARGET_CHAIN_ID,
    DEFAULT_CHAIN_ID,
    Number.MAX_SAFE_INTEGER,
  );
  if (![56, 97].includes(parsed)) throw new Error(`Creator-funding indexer only supports BNB chain IDs 56 and 97, received ${parsed}.`);
  return parsed;
}

function csvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rpcUrls(targetChainId) {
  const configured = [
    process.env.CREATOR_CLUSTER_RPC_URLS,
    process.env[`BSC_RPC_HTTP_${targetChainId}`],
    process.env[`VITE_PUBLIC_RPC_${targetChainId}`],
    targetChainId === 56 ? process.env.VITE_BSC_MAINNET_RPC : process.env.VITE_BSC_TESTNET_RPC,
  ].flatMap(csvValues);
  return [...new Set(configured)];
}

function minimumFundingWei() {
  try {
    const parsed = BigInt(String(process.env.CREATOR_CLUSTER_MIN_FUNDING_WEI || DEFAULT_MIN_FUNDING_WEI));
    return parsed > 0n ? parsed : DEFAULT_MIN_FUNDING_WEI;
  } catch {
    return DEFAULT_MIN_FUNDING_WEI;
  }
}

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw).toLowerCase() : "";
}

function hexToNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const raw = String(value || "0");
  return Number.parseInt(raw, raw.startsWith("0x") ? 16 : 10) || 0;
}

function hexToBigInt(value) {
  try {
    return BigInt(String(value || "0"));
  } catch {
    return 0n;
  }
}

function blockTag(blockNumber) {
  return `0x${Math.max(0, Number(blockNumber)).toString(16)}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rpcCall(urls, method, params) {
  if (!urls.length) throw new Error("No BNB RPC URL is configured for the creator-funding indexer.");
  const timeoutMs = positiveInt(process.env.CREATOR_CLUSTER_RPC_TIMEOUT_MS, DEFAULT_RPC_TIMEOUT_MS, 60_000);
  const errors = [];

  for (let attempt = 0; attempt < urls.length; attempt += 1) {
    const index = (rpcCursor + attempt) % urls.length;
    const url = urls[index];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcRequestId, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload?.error) throw new Error(String(payload.error.message || JSON.stringify(payload.error)));
      if (payload?.result === undefined) throw new Error("RPC response did not include a result.");
      rpcCursor = index;
      return payload.result;
    } catch (error) {
      errors.push(`${new URL(url).host}: ${error?.name === "AbortError" ? "timeout" : error?.message || error}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`${method} failed on every configured RPC: ${errors.join("; ")}`);
}

export function creatorFundingCandidate(transaction, activeCreators, minFundingWei = minimumFundingWei()) {
  const creator = normalizeAddress(transaction?.from);
  const wallet = normalizeAddress(transaction?.to);
  if (!creator || !wallet || creator === wallet) return null;
  if (!activeCreators.has(creator)) return null;

  const input = String(transaction?.input || "0x").toLowerCase();
  if (input !== "0x" && input !== "") return null;

  const valueWei = hexToBigInt(transaction?.value);
  if (valueWei < minFundingWei) return null;

  const txHash = String(transaction?.hash || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) return null;
  return { creator, wallet, txHash, valueWei };
}

async function activeCreatorWallets(targetChainId) {
  const { rows } = await pool.query(
    `select distinct lower(creator_wallet) as creator_wallet
       from public.campaign_drafts
      where chain_id = $1
        and archived_at is null
        and creator_wallet ~* '^0x[0-9a-f]{40}$'
     union
     select distinct lower(creator_address) as creator_wallet
       from public.campaigns
      where chain_id = $1
        and creator_address ~* '^0x[0-9a-f]{40}$'
        and coalesce(bonding_active, is_active, true)`,
    [targetChainId],
  );
  return new Set(rows.map((row) => normalizeAddress(row.creator_wallet)).filter(Boolean));
}

async function currentState(targetChainId) {
  const { rows } = await pool.query(
    `select chain_id,
            status,
            last_processed_block,
            last_processed_hash,
            latest_finalized_block,
            last_processed_at,
            error
       from public.creator_funding_indexer_state
      where chain_id = $1
      limit 1`,
    [targetChainId],
  );
  return rows[0] || null;
}

async function updateState(targetChainId, patch) {
  await pool.query(
    `insert into public.creator_funding_indexer_state (
       chain_id,
       status,
       last_processed_block,
       last_processed_hash,
       latest_finalized_block,
       last_processed_at,
       error,
       updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (chain_id) do update
       set status = excluded.status,
           last_processed_block = excluded.last_processed_block,
           last_processed_hash = excluded.last_processed_hash,
           latest_finalized_block = excluded.latest_finalized_block,
           last_processed_at = excluded.last_processed_at,
           error = excluded.error,
           updated_at = now()`,
    [
      targetChainId,
      patch.status,
      Number(patch.lastProcessedBlock || 0),
      patch.lastProcessedHash || null,
      Number(patch.latestFinalizedBlock || patch.lastProcessedBlock || 0),
      patch.lastProcessedAt || null,
      patch.error || null,
    ],
  );
}

async function finalizedBlock(urls) {
  try {
    const block = await rpcCall(urls, "eth_getBlockByNumber", ["finalized", false]);
    if (block?.number) return block;
  } catch (error) {
    console.warn(`[creator-funding-indexer] finalized tag unavailable: ${error?.message || error}`);
  }

  const latestHex = await rpcCall(urls, "eth_blockNumber", []);
  const finalityBlocks = positiveInt(
    process.env.CREATOR_CLUSTER_FALLBACK_FINALITY_BLOCKS,
    DEFAULT_FALLBACK_FINALITY_BLOCKS,
    1_000,
  );
  const fallbackNumber = Math.max(0, hexToNumber(latestHex) - finalityBlocks);
  return rpcCall(urls, "eth_getBlockByNumber", [blockTag(fallbackNumber), false]);
}

async function initializeState(targetChainId, finalizedNumber) {
  const existing = await currentState(targetChainId);
  if (existing) return existing;

  const explicitStart = String(process.env.CREATOR_CLUSTER_START_BLOCK || "").trim();
  const backfillBlocks = positiveInt(
    process.env.CREATOR_CLUSTER_INITIAL_BACKFILL_BLOCKS,
    DEFAULT_INITIAL_BACKFILL_BLOCKS,
    100_000,
  );
  const firstBlock = explicitStart
    ? Math.min(finalizedNumber, positiveInt(explicitStart, finalizedNumber, finalizedNumber))
    : Math.max(0, finalizedNumber - backfillBlocks);
  const lastProcessedBlock = Math.max(0, firstBlock - 1);

  await updateState(targetChainId, {
    status: "starting",
    lastProcessedBlock,
    lastProcessedHash: null,
    latestFinalizedBlock: finalizedNumber,
    lastProcessedAt: null,
    error: null,
  });
  return currentState(targetChainId);
}

async function storeFundingEvidence({ targetChainId, block, candidate }) {
  const blockNumber = hexToNumber(block.number);
  const timestamp = hexToNumber(block.timestamp);
  const blockHash = String(block.hash || "").toLowerCase() || null;

  await pool.query(
    `insert into public.creator_funding_edges (
       chain_id,
       tx_hash,
       block_number,
       block_hash,
       block_timestamp,
       creator_wallet,
       funded_wallet,
       value_wei,
       detected_at
     ) values ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8::numeric, now())
     on conflict (chain_id, tx_hash) do update
       set block_number = excluded.block_number,
           block_hash = excluded.block_hash,
           block_timestamp = excluded.block_timestamp,
           creator_wallet = excluded.creator_wallet,
           funded_wallet = excluded.funded_wallet,
           value_wei = excluded.value_wei`,
    [
      targetChainId,
      candidate.txHash,
      blockNumber,
      blockHash,
      timestamp,
      candidate.creator,
      candidate.wallet,
      candidate.valueWei.toString(),
    ],
  );

  await persistDirectFundingCluster({
    chainId: targetChainId,
    creator: candidate.creator,
    wallet: candidate.wallet,
    funding: {
      txHash: candidate.txHash,
      blockNumber,
      timestamp,
      valueWei: candidate.valueWei.toString(),
    },
  });
}

async function processBlock({ targetChainId, urls, number, activeCreators }) {
  const block = await rpcCall(urls, "eth_getBlockByNumber", [blockTag(number), true]);
  if (!block?.number || !Array.isArray(block.transactions)) {
    throw new Error(`RPC returned an incomplete block for ${number}.`);
  }

  let detected = 0;
  for (const transaction of block.transactions) {
    const candidate = creatorFundingCandidate(transaction, activeCreators);
    if (!candidate) continue;

    const receipt = await rpcCall(urls, "eth_getTransactionReceipt", [candidate.txHash]);
    if (!receipt || hexToNumber(receipt.status) !== 1) continue;

    await storeFundingEvidence({ targetChainId, block, candidate });
    detected += 1;
    console.log(
      `[creator-funding-indexer] linked ${candidate.creator} -> ${candidate.wallet} in ${candidate.txHash}`,
    );
  }

  return {
    blockNumber: hexToNumber(block.number),
    blockHash: String(block.hash || "").toLowerCase() || null,
    detected,
  };
}

async function acquireWorkerLock(targetChainId) {
  const client = await pool.connect();
  const { rows } = await client.query(
    "select pg_try_advisory_lock(hashtext($1)::bigint) as acquired",
    [`creator-funding-indexer:${targetChainId}`],
  );
  if (!rows[0]?.acquired) {
    client.release();
    throw new Error(`Another creator-funding indexer already owns chain ${targetChainId}.`);
  }
  return client;
}

async function run() {
  const targetChainId = chainId();
  const urls = rpcUrls(targetChainId);
  if (!urls.length) throw new Error(`Missing BNB RPC URL for chain ${targetChainId}.`);

  const lockClient = await acquireWorkerLock(targetChainId);
  const pollIntervalMs = positiveInt(
    process.env.CREATOR_CLUSTER_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    60_000,
  );
  const creatorRefreshMs = positiveInt(
    process.env.CREATOR_CLUSTER_CREATOR_REFRESH_MS,
    DEFAULT_CREATOR_REFRESH_MS,
    10 * 60_000,
  );
  const maxBlocksPerTick = Math.max(
    1,
    positiveInt(process.env.CREATOR_CLUSTER_MAX_BLOCKS_PER_TICK, DEFAULT_MAX_BLOCKS_PER_TICK, 2_000),
  );

  let activeCreators = new Set();
  let lastCreatorRefreshAt = 0;

  try {
    const finalized = await finalizedBlock(urls);
    let latestFinalizedNumber = hexToNumber(finalized.number);
    let state = await initializeState(targetChainId, latestFinalizedNumber);
    let lastProcessedBlock = Number(state.last_processed_block || 0);
    let lastProcessedHash = state.last_processed_hash || null;

    console.log(
      `[creator-funding-indexer] chain=${targetChainId} cursor=${lastProcessedBlock} finalized=${latestFinalizedNumber} rpc=${urls.length}`,
    );

    while (!stopping) {
      try {
        const now = Date.now();
        if (!lastCreatorRefreshAt || now - lastCreatorRefreshAt >= creatorRefreshMs) {
          activeCreators = await activeCreatorWallets(targetChainId);
          lastCreatorRefreshAt = now;
          console.log(`[creator-funding-indexer] monitoring ${activeCreators.size} creator wallet(s)`);
        }

        const currentFinalized = await finalizedBlock(urls);
        latestFinalizedNumber = hexToNumber(currentFinalized.number);
        const targetBlock = Math.min(latestFinalizedNumber, lastProcessedBlock + maxBlocksPerTick);

        if (targetBlock <= lastProcessedBlock) {
          await updateState(targetChainId, {
            status: "healthy",
            lastProcessedBlock,
            lastProcessedHash,
            latestFinalizedBlock: latestFinalizedNumber,
            lastProcessedAt: new Date(),
            error: null,
          });
          await sleep(pollIntervalMs);
          continue;
        }

        for (let blockNumber = lastProcessedBlock + 1; blockNumber <= targetBlock; blockNumber += 1) {
          const processed = await processBlock({
            targetChainId,
            urls,
            number: blockNumber,
            activeCreators,
          });
          lastProcessedBlock = processed.blockNumber;
          lastProcessedHash = processed.blockHash;
          await updateState(targetChainId, {
            status: "healthy",
            lastProcessedBlock,
            lastProcessedHash,
            latestFinalizedBlock: latestFinalizedNumber,
            lastProcessedAt: new Date(),
            error: null,
          });
        }
      } catch (error) {
        const message = String(error?.message || error);
        console.error(`[creator-funding-indexer] ${message}`);
        await updateState(targetChainId, {
          status: "degraded",
          lastProcessedBlock,
          lastProcessedHash,
          latestFinalizedBlock: latestFinalizedNumber,
          lastProcessedAt: new Date(),
          error: message,
        }).catch(() => {});
        await sleep(Math.max(pollIntervalMs, 5_000));
      }
    }

    await updateState(targetChainId, {
      status: "stopped",
      lastProcessedBlock,
      lastProcessedHash,
      latestFinalizedBlock: latestFinalizedNumber,
      lastProcessedAt: new Date(),
      error: null,
    });
  } finally {
    await lockClient.query(
      "select pg_advisory_unlock(hashtext($1)::bigint)",
      [`creator-funding-indexer:${targetChainId}`],
    ).catch(() => {});
    lockClient.release();
    await pool.end().catch(() => {});
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  run().catch((error) => {
    console.error(`[creator-funding-indexer] fatal: ${error?.stack || error?.message || error}`);
    process.exitCode = 1;
  });
}
