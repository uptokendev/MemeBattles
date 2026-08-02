import { ethers } from "ethers";
import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";
import { getServerReadProvider } from "./lib/getServerReadProvider.js";

const POOL_ABI = [
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const CAMPAIGN_ABI = [
  "function token() view returns (address)",
  "function launched() view returns (bool)",
  "function getGraduationState() view returns (address dexPair,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
];

let tableReady = false;

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Path/query may be public ERC-20 token or LaunchCampaign.
 * Trade reports and pool scans are stored/keyed by campaign.
 */
async function resolveCampaignAddress(chainId, addressOrToken) {
  const input = normalizeAddress(addressOrToken);
  if (!input || !pool) return input;
  try {
    const { rows } = await pool.query(
      `select campaign_address, token_address
         from public.campaigns
        where chain_id = $1
          and (campaign_address = $2 or token_address = $2)
        order by case when campaign_address = $2 then 0 else 1 end
        limit 1`,
      [chainId, input],
    );
    const campaign = normalizeAddress(rows?.[0]?.campaign_address);
    return campaign || input;
  } catch {
    return input;
  }
}

async function ensureTable() {
  if (tableReady || !pool) return Boolean(pool);
  await pool.query(`
    create table if not exists public.topaz_trade_reports (
      chain_id integer not null,
      campaign_address text not null,
      pair_address text,
      tx_hash text not null,
      log_index integer not null default 0,
      block_number bigint,
      block_time timestamptz,
      side text not null check (side in ('buy','sell')),
      wallet text,
      token_amount_raw text not null,
      native_amount_raw text not null,
      price_bnb numeric,
      source text not null default 'wallet_report',
      created_at timestamptz not null default now(),
      primary key (chain_id, tx_hash, log_index)
    );
  `);
  await pool.query(`
    create index if not exists topaz_trade_reports_campaign_idx
      on public.topaz_trade_reports (chain_id, campaign_address, block_number desc);
  `);
  tableReady = true;
  return true;
}

function normalizeSwap(tokenIsToken0, amounts) {
  const tokenIn = tokenIsToken0 ? amounts.amount0In : amounts.amount1In;
  const tokenOut = tokenIsToken0 ? amounts.amount0Out : amounts.amount1Out;
  const nativeIn = tokenIsToken0 ? amounts.amount1In : amounts.amount0In;
  const nativeOut = tokenIsToken0 ? amounts.amount1Out : amounts.amount0Out;
  if (tokenOut > 0n && nativeIn > 0n && tokenIn === 0n && nativeOut === 0n) {
    return { side: "buy", tokenAmountRaw: tokenOut, nativeAmountRaw: nativeIn };
  }
  if (tokenIn > 0n && nativeOut > 0n && tokenOut === 0n && nativeIn === 0n) {
    return { side: "sell", tokenAmountRaw: tokenIn, nativeAmountRaw: nativeOut };
  }
  return null;
}

function priceBnb(tokenRaw, nativeRaw) {
  try {
    if (tokenRaw <= 0n || nativeRaw <= 0n) return null;
    const token = Number(ethers.formatUnits(tokenRaw, 18));
    const native = Number(ethers.formatEther(nativeRaw));
    if (!(token > 0) || !(native > 0)) return null;
    return native / token;
  } catch {
    return null;
  }
}

async function insertReport(row) {
  if (!(await ensureTable())) return false;
  await pool.query(
    `insert into public.topaz_trade_reports (
       chain_id, campaign_address, pair_address, tx_hash, log_index, block_number, block_time,
       side, wallet, token_amount_raw, native_amount_raw, price_bnb, source
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (chain_id, tx_hash, log_index) do update set
       side = excluded.side,
       wallet = coalesce(excluded.wallet, public.topaz_trade_reports.wallet),
       token_amount_raw = excluded.token_amount_raw,
       native_amount_raw = excluded.native_amount_raw,
       price_bnb = excluded.price_bnb,
       pair_address = coalesce(excluded.pair_address, public.topaz_trade_reports.pair_address),
       block_number = coalesce(excluded.block_number, public.topaz_trade_reports.block_number),
       block_time = coalesce(excluded.block_time, public.topaz_trade_reports.block_time)`,
    [
      row.chainId,
      row.campaignAddress,
      row.pairAddress || null,
      row.txHash,
      row.logIndex,
      row.blockNumber ?? null,
      row.blockTime || null,
      row.side,
      row.wallet || null,
      row.tokenAmountRaw,
      row.nativeAmountRaw,
      row.priceBnb,
      row.source || "wallet_report",
    ],
  );
  return true;
}

async function listReports(chainId, campaignAddress, limit) {
  if (!(await ensureTable())) return [];
  // One row per tx_hash — wallet reports + pool scans often insert the same fill twice
  // with different log_index (synthetic 1e6 vs real pool index).
  const { rows } = await pool.query(
    `select *
       from (
         select distinct on (tx_hash)
           tx_hash as "txHash",
           log_index as "logIndex",
           block_number as "blockNumber",
           block_time as "blockTime",
           side,
           wallet,
           token_amount_raw as "tokenAmountRaw",
           native_amount_raw as "nativeAmountRaw",
           price_bnb as "priceBnb",
           pair_address as "pairAddress",
           source
         from public.topaz_trade_reports
         where chain_id = $1 and campaign_address = $2
         order by
           tx_hash,
           case when log_index >= 1000000 then 1 else 0 end asc,
           coalesce(block_number, 0) desc,
           log_index desc
       ) deduped
      order by coalesce("blockNumber", 0) desc, "logIndex" desc
      limit $3`,
    [chainId, campaignAddress, limit],
  );
  return rows || [];
}

async function scanPoolSwaps(chainId, campaignAddress, limit) {
  // Best-effort. Many free BSC RPCs reject eth_getLogs; wallet reports remain source of truth.
  try {
    const provider = getServerReadProvider(chainId);
    const campaign = new ethers.Contract(campaignAddress, CAMPAIGN_ABI, provider);
    const [token, launched, graduation] = await Promise.all([
      campaign.token(),
      campaign.launched().catch(() => false),
      campaign.getGraduationState().catch(() => null),
    ]);
    if (!launched) return [];
    const pair = String(graduation?.[0] || graduation?.dexPair || "");
    if (!isAddress(pair)) return [];

    const poolContract = new ethers.Contract(pair, POOL_ABI, provider);
    const [token0, latest] = await Promise.all([poolContract.token0(), provider.getBlockNumber()]);
    const tokenIsToken0 = String(token0).toLowerCase() === String(token).toLowerCase();
    const iface = new ethers.Interface(POOL_ABI);
    const topic = iface.getEvent("Swap").topicHash;
    const lookback = 800;
    const fromBlock = Math.max(0, latest - lookback);
    const logs = [];
    for (let start = fromBlock; start <= latest; start += 40) {
      const end = Math.min(latest, start + 39);
      try {
        const chunk = await provider.getLogs({
          address: pair,
          topics: [topic],
          fromBlock: start,
          toBlock: end,
        });
        logs.push(...chunk);
      } catch {
        // getLogs unsupported/rate-limited on this RPC — stop quietly.
        break;
      }
    }

    const out = [];
    for (const log of logs.slice(-limit)) {
      try {
        const parsed = iface.parseLog(log);
        const amounts = {
          amount0In: BigInt(parsed.args.amount0In ?? 0),
          amount1In: BigInt(parsed.args.amount1In ?? 0),
          amount0Out: BigInt(parsed.args.amount0Out ?? 0),
          amount1Out: BigInt(parsed.args.amount1Out ?? 0),
        };
        const normalized = normalizeSwap(tokenIsToken0, amounts);
        if (!normalized) continue;
        const recipient = String(parsed.args.to || "").toLowerCase();
        const row = {
          chainId,
          campaignAddress,
          pairAddress: pair.toLowerCase(),
          txHash: String(log.transactionHash || "").toLowerCase(),
          logIndex: Number(log.index ?? 0),
          blockNumber: Number(log.blockNumber || 0),
          blockTime: null,
          side: normalized.side,
          wallet: recipient,
          tokenAmountRaw: normalized.tokenAmountRaw.toString(),
          nativeAmountRaw: normalized.nativeAmountRaw.toString(),
          priceBnb: priceBnb(normalized.tokenAmountRaw, normalized.nativeAmountRaw),
          source: "pool_scan",
        };
        out.push(row);
        await insertReport(row).catch(() => false);
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = getQuery(req);
      const chainId = Number(q.chainId ?? 97);
      const rawAddress = normalizeAddress(
        q.campaignAddress ?? q.campaign ?? q.address ?? q.tokenAddress ?? req.params?.campaign,
      );
      const campaignAddress = await resolveCampaignAddress(chainId, rawAddress);
      const limit = clampInt(q.limit, 1, 200, 100);
      if (!Number.isFinite(chainId) || !campaignAddress) {
        return json(res, 400, { error: "chainId and campaignAddress are required" });
      }

      let items = await listReports(chainId, campaignAddress, limit).catch(() => []);
      // Opportunistic pool scan when DB is empty (may no-op on RPCs without eth_getLogs).
      if (!items.length) {
        const scanned = await scanPoolSwaps(chainId, campaignAddress, limit);
        if (scanned.length) items = scanned;
      }

      return json(res, 200, {
        items: items.map((row) => ({
          tx_hash: row.txHash || row.tx_hash,
          log_index: Number(row.logIndex ?? row.log_index ?? 0),
          block_number: row.blockNumber ?? row.block_number ?? 0,
          block_time: row.blockTime || row.block_time || null,
          side: row.side,
          wallet: row.wallet,
          token_amount_raw: row.tokenAmountRaw || row.token_amount_raw,
          bnb_amount_raw: row.nativeAmountRaw || row.native_amount_raw,
          // Also expose decimal convenience fields for existing chart mappers.
          token_amount: row.tokenAmountRaw
            ? ethers.formatUnits(BigInt(row.tokenAmountRaw || row.token_amount_raw || "0"), 18)
            : "0",
          bnb_amount: row.nativeAmountRaw
            ? ethers.formatEther(BigInt(row.nativeAmountRaw || row.native_amount_raw || "0"))
            : "0",
          price_bnb: row.priceBnb ?? row.price_bnb ?? null,
          source: row.source || "topaz",
        })),
        source: "topaz-trade-reports",
      });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const chainId = Number(body.chainId ?? 97);
      const rawAddress = normalizeAddress(body.campaignAddress ?? body.campaign ?? body.tokenAddress);
      const campaignAddress = await resolveCampaignAddress(chainId, rawAddress);
      const txHash = String(body.txHash || body.tx_hash || "").toLowerCase();
      const side = String(body.side || "").toLowerCase() === "sell" ? "sell" : "buy";
      const tokenAmountRaw = String(body.tokenAmountRaw || body.token_amount_raw || "0");
      const nativeAmountRaw = String(body.nativeAmountRaw || body.native_amount_raw || body.bnbAmountRaw || "0");
      if (!Number.isFinite(chainId) || !campaignAddress || !/^0x[a-f0-9]{64}$/.test(txHash)) {
        return json(res, 400, { error: "Invalid topaz trade report payload" });
      }
      if (!/^\d+$/.test(tokenAmountRaw) || !/^\d+$/.test(nativeAmountRaw)) {
        return json(res, 400, { error: "tokenAmountRaw and nativeAmountRaw must be integer strings" });
      }

      const tokenRaw = BigInt(tokenAmountRaw);
      const nativeRaw = BigInt(nativeAmountRaw);
      // Always store wallet reports under the synthetic log band so UI merge
      // collapses them against real pool logs for the same tx_hash.
      const rawLog = clampInt(body.logIndex ?? body.log_index, 0, 2_000_000, 1_000_000);
      const logIndex = rawLog >= 1_000_000 ? rawLog : 1_000_000;
      const row = {
        chainId,
        campaignAddress,
        pairAddress: normalizeAddress(body.pairAddress) || null,
        txHash,
        logIndex,
        blockNumber: clampInt(body.blockNumber ?? body.block_number, 0, Number.MAX_SAFE_INTEGER, 0) || null,
        blockTime: body.blockTime || body.block_time || new Date().toISOString(),
        side,
        wallet: normalizeAddress(body.wallet || body.walletAddress) || null,
        tokenAmountRaw: tokenRaw.toString(),
        nativeAmountRaw: nativeRaw.toString(),
        priceBnb: priceBnb(tokenRaw, nativeRaw),
        source: "wallet_report",
      };

      const ok = await insertReport(row);
      if (!ok) return json(res, 503, { error: "Database unavailable for topaz trade reports" });
      return json(res, 200, { ok: true, item: row });
    }

    return badMethod(res);
  } catch (error) {
    console.error("[topaz-trades]", error);
    return json(res, 500, { error: error?.message || "Topaz trades endpoint failed" });
  }
}
