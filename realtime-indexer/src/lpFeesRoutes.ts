import type express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ethers } from "ethers";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { createStaticJsonRpcProvider, parseRpcList } from "./rpcProvider.js";

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
];

function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isAddress(value: unknown): boolean {
  return ethers.isAddress(String(value ?? "").trim());
}

function toAddr(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  return isAddress(raw) ? raw : null;
}

function weiToDecimal(value: bigint | string | number): number {
  try {
    return Number(ethers.formatEther(BigInt(String(value ?? "0"))));
  } catch {
    return 0;
  }
}

function resolveLockerAddress(chainId: number): string | null {
  const per = String(
    process.env[`LP_LOCKER_ADDRESS_${chainId}`] ||
      process.env[`VITE_LP_LOCKER_ADDRESS_${chainId}`] ||
      "",
  ).trim();
  if (isAddress(per)) return ethers.getAddress(per);
  const generic = String(process.env.LP_LOCKER_ADDRESS || process.env.VITE_LP_LOCKER_ADDRESS || "").trim();
  if (isAddress(generic)) return ethers.getAddress(generic);
  // Clean-slate BSC testnet locker
  if (chainId === 97) return "0xb083929D2bbabdE7fc580090D5B18bbD918Fda9a";
  return null;
}

function resolveRpcUrl(chainId: number): string {
  if (chainId === 56) {
    return parseRpcList(ENV.BSC_RPC_HTTP_56)[0] || parseRpcList(process.env.BSC_RPC_HTTP || "")[0] || "";
  }
  return parseRpcList(ENV.BSC_RPC_HTTP_97)[0] || parseRpcList(process.env.BSC_RPC_HTTP || "")[0] || "";
}

async function loadGraduatedRows(chainId: number, limit: number) {
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
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") {
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
    throw error;
  }
}

async function readPoolFees(input: {
  provider: ethers.Provider;
  lockerAddress: string;
  pairAddress: string;
  creatorAddress: string | null;
}) {
  const locker = new ethers.Contract(input.lockerAddress, LOCKER_ABI, input.provider);
  const poolContract = new ethers.Contract(input.pairAddress, POOL_ABI, input.provider);

  const info = await locker.poolInfo(input.pairAddress);
  const registered = Boolean(info?.registered ?? info?.[9]);
  if (!registered) {
    return {
      registered: false,
      note: "Pool not registered on PermanentLpLocker yet (graduation handoff / pool registration incomplete).",
    };
  }

  const token0 = String(info.token0 || info[4] || "").toLowerCase();
  const token1 = String(info.token1 || info[5] || "").toLowerCase();
  const creator = toAddr(input.creatorAddress) || toAddr(info.creator || info[1]);
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
    poolContract.claimable0(input.lockerAddress).catch(() => 0n),
    poolContract.claimable1(input.lockerAddress).catch(() => 0n),
    locker.cumulativeCreatorPaid(input.pairAddress, token0).catch(() => 0n),
    locker.cumulativeCreatorPaid(input.pairAddress, token1).catch(() => 0n),
    locker.cumulativeProtocolRouted(input.pairAddress, token0).catch(() => 0n),
    locker.cumulativeProtocolRouted(input.pairAddress, token1).catch(() => 0n),
    locker.pendingToken(creatorRecipient, token0).catch(() => 0n),
    locker.pendingToken(creatorRecipient, token1).catch(() => 0n),
    locker.pendingNative(creatorRecipient).catch(() => 0n),
    locker.pendingProtocolToken(token0).catch(() => 0n),
    locker.pendingProtocolToken(token1).catch(() => 0n),
    locker.pendingProtocolNative().catch(() => 0n),
  ]);

  const creatorFeeBps = Number(info.creatorFeeBps ?? info[7] ?? 8000);
  const protocolFeeBps = Number(info.protocolFeeBps ?? info[8] ?? 2000);
  const c0 = BigInt(claimable0);
  const c1 = BigInt(claimable1);

  return {
    registered: true,
    lockerAddress: input.lockerAddress.toLowerCase(),
    pairAddress: input.pairAddress.toLowerCase(),
    token0,
    token1,
    creator,
    creatorRecipient,
    creatorFeeBps,
    protocolFeeBps,
    lockedLpAmount: String(info.lockedLpAmount ?? info[6] ?? "0"),
    unharvested: {
      token0Raw: c0.toString(),
      token1Raw: c1.toString(),
      token0: weiToDecimal(c0),
      token1: weiToDecimal(c1),
      creatorShareToken0: weiToDecimal((c0 * BigInt(creatorFeeBps)) / 10000n),
      creatorShareToken1: weiToDecimal((c1 * BigInt(creatorFeeBps)) / 10000n),
      protocolShareToken0: weiToDecimal((c0 * BigInt(protocolFeeBps)) / 10000n),
      protocolShareToken1: weiToDecimal((c1 * BigInt(protocolFeeBps)) / 10000n),
    },
    harvestedLifetime: {
      creatorToken0: weiToDecimal(creatorPaid0),
      creatorToken1: weiToDecimal(creatorPaid1),
      protocolToken0: weiToDecimal(protocolRouted0),
      protocolToken1: weiToDecimal(protocolRouted1),
      creatorToken0Raw: BigInt(creatorPaid0).toString(),
      creatorToken1Raw: BigInt(creatorPaid1).toString(),
      protocolToken0Raw: BigInt(protocolRouted0).toString(),
      protocolToken1Raw: BigInt(protocolRouted1).toString(),
    },
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

export function registerLpFeesRoutes(app: express.Application) {
  // Dashboard / security API base points at the indexer for token/market ops.
  app.get(
    "/api/dashboard/lp-fees",
    wrap(async (req, res) => {
      const chainId = Number(req.query.chainId ?? 97);
      const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 20)));
      const pairFilter = toAddr(req.query.pair || req.query.pool);
      const campaignFilter = toAddr(req.query.campaign);

      if (!Number.isFinite(chainId) || chainId <= 0) {
        res.status(400).json({ ok: false, error: "Invalid chainId" });
        return;
      }

      // Read-only testnet open; mainnet later can require ops key.
      const opsKey = String(process.env.DASHBOARD_OPS_KEY || process.env.OPS_READ_KEY || "").trim();
      const provided = String(req.headers["x-ops-key"] || req.query.opsKey || "").trim();
      if (chainId !== 97) {
        if (!opsKey || provided !== opsKey) {
          res.status(401).json({ ok: false, error: "Ops key required for non-testnet fee reads." });
          return;
        }
      }

      const lockerAddress = resolveLockerAddress(chainId);
      if (!lockerAddress) {
        res.status(400).json({ ok: false, error: "LP locker address not configured for this chain." });
        return;
      }

      const rpcUrl = resolveRpcUrl(chainId);
      if (!rpcUrl) {
        res.status(503).json({ ok: false, error: `Missing RPC for chain ${chainId}` });
        return;
      }

      const provider = createStaticJsonRpcProvider(rpcUrl, chainId, { timeoutMs: 20_000 });
      try {
        const locker = new ethers.Contract(lockerAddress, LOCKER_ABI, provider);
        const [topazFactory, treasuryRouter] = await Promise.all([
          locker.topazFactory().catch(() => null),
          locker.treasuryRouter().catch(() => null),
        ]);

        let rows = await loadGraduatedRows(chainId, limit);
        if (campaignFilter) {
          rows = rows.filter((r: any) => String(r.campaign_address || "").toLowerCase() === campaignFilter);
        }
        if (pairFilter) {
          rows = rows.filter((r: any) => String(r.dex_pair_address || "").toLowerCase() === pairFilter);
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
                note: "No dex_pair_address in campaign_market_state — enable graduation reconciler / Topaz pool indexer.",
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
          } catch (error: any) {
            items.push({
              ...base,
              fees: {
                registered: false,
                error: String(error?.message || error),
              },
            });
          }
        }

        res.json({
          ok: true,
          chainId,
          service: "realtime-indexer",
          lockerAddress: lockerAddress.toLowerCase(),
          topazFactory: topazFactory ? String(topazFactory).toLowerCase() : null,
          treasuryRouter: treasuryRouter ? String(treasuryRouter).toLowerCase() : null,
          split: { creatorBps: 8000, protocolBps: 2000 },
          notes: [
            "Served by Railway indexer (token/market authority), not the frontend API.",
            "DEX LP fees accrue on the Topaz pool as claimable0/1 for the locker.",
            "harvest(pool) on PermanentLpLocker splits 80% creator / 20% protocol.",
            "Unharvested = still on pool. Harvested lifetime = already paid/routed.",
            "Minimal Topaz testnet: locker checks pool.factory() == topazFactory; no LaunchFactory whitelist required.",
          ],
          items,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        try {
          provider.destroy();
        } catch {
          // ignore
        }
      }
    }),
  );
}
