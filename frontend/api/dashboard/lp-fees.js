import { ethers } from "ethers";
import { pool } from "../../server/db.js";
import { badMethod, getQuery, json } from "../../server/http.js";
import { getServerReadProvider } from "../lib/getServerReadProvider.js";
import { requireDashboardAdmin } from "./_auth.js";

const LOCKER_ABI = [
  "function poolInfo(address) view returns (address campaign,address creator,address creatorFeeRecipient,address pool,address token0,address token1,uint256 lockedLpAmount,uint16 creatorFeeBps,uint16 protocolFeeBps,bool registered)",
  "function cumulativeCreatorPaid(address pool,address token) view returns (uint256)",
  "function cumulativeProtocolRouted(address pool,address token) view returns (uint256)",
  "function pendingToken(address recipient,address token) view returns (uint256)",
  "function pendingNative(address recipient) view returns (uint256)",
  "function pendingProtocolToken(address token) view returns (uint256)",
  "function pendingProtocolNative() view returns (uint256)",
  "function creatorPayoutRecipient(address creator) view returns (address)",
  "function topazFactory() view returns (address)",
  "function treasuryRouter() view returns (address)",
];

const POOL_ABI = [
  "function claimable0(address account) view returns (uint256)",
  "function claimable1(address account) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

function isAddress(value) {
  return ethers.isAddress(String(value || "").trim());
}

function toAddr(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : null;
}

function weiToDecimal(value) {
  try {
    return Number(ethers.formatEther(BigInt(String(value ?? "0"))));
  } catch {
    return 0;
  }
}

async function authorize(req, res) {
  // Prefer dashboard admin session; allow shared ops key for testnet tools.
  const opsKey = String(process.env.DASHBOARD_OPS_KEY || process.env.OPS_READ_KEY || "").trim();
  const provided = String(req.headers["x-ops-key"] || getQuery(req).opsKey || "").trim();
  if (opsKey && provided && opsKey === provided) return { mode: "ops-key" };

  // Testnet convenience: chain 97 is open-read for fee monitoring (no secrets returned).
  const chainId = Number(getQuery(req).chainId ?? 97);
  if (chainId === 97) {
    return { mode: "testnet-open" };
  }

  const admin = await requireDashboardAdmin(req, res);
  if (!admin) return null;
  return { mode: "admin", admin };
}

async function loadGraduatedRows(chainId, limit) {
  // Prefer market-state pair when present; still list every graduated campaign
  // so admins can see DDY-style rows before Topaz registration is complete.
  try {
    const { rows } = await pool.query(
      `select c.chain_id,
              c.campaign_address,
              c.token_address,
              c.creator_address,
              c.name,
              c.symbol,
              c.graduated_at_chain,
              c.factory_address,
              cms.dex_pair_address,
              cms.market_stage,
              cms.dex_router_address
         from public.campaigns c
         left join public.campaign_market_state cms
           on cms.chain_id = c.chain_id
          and lower(cms.campaign_address) = lower(c.campaign_address)
        where c.chain_id = $1
          and (
            c.graduated_at_chain is not null
            or c.graduated_block is not null
            or cms.market_stage ilike '%TOPAZ%'
            or cms.dex_pair_address is not null
          )
        order by c.graduated_at_chain desc nulls last, c.created_at_chain desc nulls last
        limit $2`,
      [chainId, limit],
    );
    return rows;
  } catch (error) {
    // Fallback without market state / optional columns.
    if (error?.code === "42P01" || error?.code === "42703") {
      try {
        const { rows } = await pool.query(
          `select chain_id, campaign_address, token_address, creator_address, name, symbol,
                  graduated_at_chain, factory_address,
                  null::text as dex_pair_address, null::text as market_stage, null::text as dex_router_address
             from public.campaigns
            where chain_id = $1
              and (graduated_at_chain is not null or graduated_block is not null)
            order by graduated_at_chain desc nulls last
            limit $2`,
          [chainId, limit],
        );
        return rows;
      } catch (inner) {
        if (inner?.code === "42P01" || inner?.code === "42703") {
          const { rows } = await pool.query(
            `select chain_id, campaign_address, token_address, creator_address, name, symbol,
                    graduated_at_chain, factory_address,
                    null::text as dex_pair_address, null::text as market_stage, null::text as dex_router_address
               from public.campaigns
              where chain_id = $1 and graduated_at_chain is not null
              order by graduated_at_chain desc nulls last
              limit $2`,
            [chainId, limit],
          );
          return rows;
        }
        throw inner;
      }
    }
    throw error;
  }
}

function resolveLockerAddress(chainId) {
  const per = String(process.env[`LP_LOCKER_ADDRESS_${chainId}`] || process.env[`VITE_LP_LOCKER_ADDRESS_${chainId}`] || "").trim();
  if (isAddress(per)) return ethers.getAddress(per);
  const generic = String(process.env.LP_LOCKER_ADDRESS || process.env.VITE_LP_LOCKER_ADDRESS || "").trim();
  if (isAddress(generic)) return ethers.getAddress(generic);
  // Clean-slate testnet locker (known deploy).
  if (Number(chainId) === 97) return "0xb083929D2bbabdE7fc580090D5B18bbD918Fda9a";
  return null;
}

async function readPoolFees({ provider, lockerAddress, pairAddress, creatorAddress }) {
  const locker = new ethers.Contract(lockerAddress, LOCKER_ABI, provider);
  const pool = new ethers.Contract(pairAddress, POOL_ABI, provider);

  const info = await locker.poolInfo(pairAddress);
  const registered = Boolean(info?.registered ?? info?.[9]);
  if (!registered) {
    return {
      registered: false,
      note: "Pool not registered on PermanentLpLocker yet (graduation handoff may be incomplete).",
    };
  }

  const token0 = String(info.token0 || info[4] || "").toLowerCase();
  const token1 = String(info.token1 || info[5] || "").toLowerCase();
  const creator = toAddr(creatorAddress) || toAddr(info.creator || info[1]);
  const creatorRecipient =
    toAddr(await locker.creatorPayoutRecipient(creator).catch(() => null)) ||
    toAddr(info.creatorFeeRecipient || info[2]) ||
    creator;

  const [
    claimable0,
    claimable1,
    creatorPaid0,
    creatorPaid1,
    protocolRouted0,
    protocolRouted1,
    pendingCreator0,
    pendingCreator1,
    pendingCreatorNative,
    pendingProtocol0,
    pendingProtocol1,
    pendingProtocolNative,
  ] = await Promise.all([
    pool.claimable0(lockerAddress).catch(() => 0n),
    pool.claimable1(lockerAddress).catch(() => 0n),
    locker.cumulativeCreatorPaid(pairAddress, token0).catch(() => 0n),
    locker.cumulativeCreatorPaid(pairAddress, token1).catch(() => 0n),
    locker.cumulativeProtocolRouted(pairAddress, token0).catch(() => 0n),
    locker.cumulativeProtocolRouted(pairAddress, token1).catch(() => 0n),
    locker.pendingToken(creatorRecipient, token0).catch(() => 0n),
    locker.pendingToken(creatorRecipient, token1).catch(() => 0n),
    locker.pendingNative(creatorRecipient).catch(() => 0n),
    locker.pendingProtocolToken(token0).catch(() => 0n),
    locker.pendingProtocolToken(token1).catch(() => 0n),
    locker.pendingProtocolNative().catch(() => 0n),
  ]);

  const creatorFeeBps = Number(info.creatorFeeBps ?? info[7] ?? 8000);
  const protocolFeeBps = Number(info.protocolFeeBps ?? info[8] ?? 2000);

  return {
    registered: true,
    lockerAddress: lockerAddress.toLowerCase(),
    pairAddress: pairAddress.toLowerCase(),
    token0,
    token1,
    creator,
    creatorRecipient,
    creatorFeeBps,
    protocolFeeBps,
    lockedLpAmount: String(info.lockedLpAmount ?? info[6] ?? "0"),
    // Unharvested fees sitting on the Topaz pool for the locker.
    unharvested: {
      token0Raw: claimable0.toString(),
      token1Raw: claimable1.toString(),
      token0: weiToDecimal(claimable0),
      token1: weiToDecimal(claimable1),
      creatorShareToken0: weiToDecimal((BigInt(claimable0) * BigInt(creatorFeeBps)) / 10000n),
      creatorShareToken1: weiToDecimal((BigInt(claimable1) * BigInt(creatorFeeBps)) / 10000n),
      protocolShareToken0: weiToDecimal((BigInt(claimable0) * BigInt(protocolFeeBps)) / 10000n),
      protocolShareToken1: weiToDecimal((BigInt(claimable1) * BigInt(protocolFeeBps)) / 10000n),
    },
    // Already harvested and paid/routed.
    harvestedLifetime: {
      creatorToken0: weiToDecimal(creatorPaid0),
      creatorToken1: weiToDecimal(creatorPaid1),
      protocolToken0: weiToDecimal(protocolRouted0),
      protocolToken1: weiToDecimal(protocolRouted1),
      creatorToken0Raw: creatorPaid0.toString(),
      creatorToken1Raw: creatorPaid1.toString(),
      protocolToken0Raw: protocolRouted0.toString(),
      protocolToken1Raw: protocolRouted1.toString(),
    },
    // Failed transfer leftovers (still claimable).
    pending: {
      creatorToken0: weiToDecimal(pendingCreator0),
      creatorToken1: weiToDecimal(pendingCreator1),
      creatorNative: weiToDecimal(pendingCreatorNative),
      protocolToken0: weiToDecimal(pendingProtocol0),
      protocolToken1: weiToDecimal(pendingProtocol1),
      protocolNative: weiToDecimal(pendingProtocolNative),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const auth = await authorize(req, res);
    if (!auth) return;

    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    const limit = Math.max(1, Math.min(50, Number(q.limit ?? 20)));
    const pairFilter = toAddr(q.pair || q.pool);
    const campaignFilter = toAddr(q.campaign);

    const lockerAddress = resolveLockerAddress(chainId);
    if (!lockerAddress) {
      return json(res, 400, { error: "LP locker address not configured for this chain." });
    }

    const provider = await getServerReadProvider(chainId);
    const locker = new ethers.Contract(lockerAddress, LOCKER_ABI, provider);
    const [topazFactory, treasuryRouter] = await Promise.all([
      locker.topazFactory().catch(() => null),
      locker.treasuryRouter().catch(() => null),
    ]);

    let rows = await loadGraduatedRows(chainId, limit);
    if (campaignFilter) {
      rows = rows.filter((r) => String(r.campaign_address || "").toLowerCase() === campaignFilter);
    }
    if (pairFilter) {
      rows = rows.filter((r) => String(r.dex_pair_address || "").toLowerCase() === pairFilter);
    }

    const items = [];
    for (const row of rows) {
      const pair = toAddr(row.dex_pair_address);
      const base = {
        chainId,
        campaignAddress: String(row.campaign_address || "").toLowerCase(),
        tokenAddress: row.token_address ? String(row.token_address).toLowerCase() : null,
        creatorAddress: row.creator_address ? String(row.creator_address).toLowerCase() : null,
        name: row.name || null,
        symbol: row.symbol || null,
        graduatedAt: row.graduated_at_chain || null,
        marketStage: row.market_stage || null,
        pairAddress: pair,
      };

      if (!pair) {
        items.push({
          ...base,
          fees: {
            registered: false,
            note: "No dex_pair_address in campaign_market_state — run graduation reconciler / Topaz pool indexer.",
          },
        });
        continue;
      }

      try {
        const fees = await readPoolFees({
          provider,
          lockerAddress,
          pairAddress: pair,
          creatorAddress: base.creatorAddress,
        });
        items.push({ ...base, fees });
      } catch (error) {
        items.push({
          ...base,
          fees: {
            registered: false,
            error: String(error?.message || error),
          },
        });
      }
    }

    return json(res, 200, {
      ok: true,
      chainId,
      lockerAddress: lockerAddress.toLowerCase(),
      topazFactory: topazFactory ? String(topazFactory).toLowerCase() : null,
      treasuryRouter: treasuryRouter ? String(treasuryRouter).toLowerCase() : null,
      split: { creatorBps: 8000, protocolBps: 2000 },
      notes: [
        "DEX LP fees accrue on the Topaz pool as claimable0/1 for the locker.",
        "harvest(pool) on PermanentLpLocker splits 80% creator / 20% protocol.",
        "Unharvested = still on pool. Harvested lifetime = already paid/routed. Pending = failed transfer leftovers.",
        "Topaz testnet uses Minimal Topaz (fixed 100 bps volatile). Locker verifies pool.factory() == topazFactory; no separate LaunchFactory whitelist on Minimal Topaz.",
      ],
      items,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/dashboard/lp-fees]", error);
    return json(res, 500, { error: String(error?.message || "Server error") });
  }
}
