import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/hooks/useWallet";
import { useCallback, useMemo, useRef } from "react";
import { getActiveChainId, getFactoryAddress, type SupportedChainId } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";

// Public endpoints can be very sensitive to getLogs volume.
// Keep scans small + chunked.
const LOG_CHUNK_SIZE = 700;

// For UI-only rollups (holders/volume), recent history is sufficient.
// 50k blocks is roughly 1–2 days on BSC (approx).
const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 50_000;

// ---------------- ABI helpers ----------------
const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;
const FACTORY_ABI = toAbi(LaunchFactoryArtifact);
const CAMPAIGN_ABI = toAbi(LaunchCampaignArtifact);
const TOKEN_ABI = toAbi(LaunchTokenArtifact);

// ---------------- Types ----------------
export type CampaignInfo = {
  id: number;
  campaign: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;

  createdAt?: number;

  // Optional UI-only metadata 
  holders?: string;
  volume?: string;
  marketCap?: string;
  timeAgo?: string;
  telegram?: string;
  discord?: string;

  // Optional DEX metadata for charts
  dexPairAddress?: string;
  dexScreenerUrl?: string;
};

export type CampaignMetrics = {
  sold: bigint;
  curveSupply: bigint;
  liquiditySupply: bigint;
  creatorReserve: bigint;
  currentPrice: bigint;
  basePrice: bigint;
  priceSlope: bigint;
  graduationTarget: bigint;
  liquidityBps: bigint;
  protocolFeeBps: bigint;

  launched?: boolean;
  finalizedAt?: bigint;
};

export type CampaignActivity = {
  buyers: number;
  sellers: number;
  buyVolumeWei: bigint;
  sellVolumeWei: bigint;
  fromBlock: number;
  toBlock: number;
};

export type CampaignCardStats = {
  holders: string;
  volume: string;
  marketCap: string;
  /** Unrounded market cap in BNB (for precise USD conversion / ATH tracking). */
  marketCapBnb?: number;
};

export type CampaignSummary = {
  campaign: CampaignInfo;
  metrics: CampaignMetrics | null;
  stats: CampaignCardStats;
};

// ---------------- Formatting helpers ----------------
const formatBnbFromWei = (wei: bigint): string => {
  try {
    const raw = ethers.formatEther(wei);
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${raw} BNB`;
    const abs = Math.abs(n);
    const pretty = abs >= 1 ? n.toFixed(2) : abs >= 0.01 ? n.toFixed(4) : abs >= 0.0001 ? n.toFixed(6) : n.toFixed(8);
    return `${pretty} BNB`;
  } catch {
    return `${wei.toString()} wei`;
  }
};

const formatCount = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  return String(n);
};

// ---------------- Rate-limit utilities ----------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimitish(e: any): boolean {
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code;
  const msg = String(e?.message ?? e?.info?.error?.message ?? "").toLowerCase();
  return (
    code === -32005 ||
    msg.includes("rate limit") ||
    msg.includes("limit exceeded") ||
    msg.includes("triggered rate limit")
  );
}

async function withBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRateLimitish(e) || i === retries) break;
      // quadratic-ish backoff
      await sleep(200 * (i + 1) * (i + 1));
    }
  }
  throw lastErr;
}

// Simple semaphore to avoid multiple parallel log scans nuking public RPCs
function createSemaphore(max: number) {
  let inFlight = 0;
  const queue: Array<() => void> = [];

  const acquire = async () => {
    if (inFlight < max) {
      inFlight++;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
    inFlight++;
  };

  const release = () => {
    inFlight--;
    const next = queue.shift();
    if (next) next();
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

const runLogScanLimited = createSemaphore(1);

// ---------------- Log helper (chunked + retry + tiny delay) ----------------
async function getLogsChunked(
  provider: ethers.Provider,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);

    const chunk = await withBackoff(
      () => provider.getLogs({ ...params, fromBlock: start, toBlock: end } as any),
      3
    );

    logs.push(...chunk);

    // tiny pacing helps public endpoints a lot
    await sleep(80);
  }
  return logs;
}

// ---------------- Hook ----------------
export function useLaunchpad() {
  const { provider: walletProvider, signer, chainId: walletChainId } = useWallet() as any;

  const activeChainId = useMemo<SupportedChainId>(() => {
    return getActiveChainId(walletChainId) as SupportedChainId;
  }, [walletChainId]);

  const factoryAddress = useMemo(() => getFactoryAddress(activeChainId), [activeChainId]);

  // Read provider (public RPC, batching disabled in readProvider.ts)
  const readProvider = useMemo(() => {
    return getReadProvider(activeChainId);
  }, [activeChainId]);

  // Cache “fromBlock” per campaign so we don’t recompute it repeatedly
  const fromBlockCacheRef = useRef<Map<string, number>>(new Map());

  const getFactoryRead = useCallback(() => {
    if (!factoryAddress) return null;
    return new Contract(factoryAddress, FACTORY_ABI, readProvider) as any;
  }, [factoryAddress, readProvider]);

  const getFactoryWrite = useCallback(() => {
    if (!factoryAddress || !signer) return null;
    return new Contract(factoryAddress, FACTORY_ABI, signer) as any;
  }, [factoryAddress, signer]);

  const getCampaignRead = useCallback(
    (address: string) => {
      if (!address) return null;
      return new Contract(address, CAMPAIGN_ABI, readProvider) as any;
    },
    [readProvider]
  );

  // --- READS ---

  /** Total number of campaigns in the factory (used for paging / infinite scroll). */
  const fetchCampaignsCount = useCallback(async (): Promise<number> => {
    const factory = getFactoryRead();
    if (!factory) return 0;
    const total: bigint = await factory.campaignsCount();
    return Number(total ?? 0n);
  }, [getFactoryRead]);

  /**
   * Fetch a raw campaign page from the factory.
   * NOTE: Factory pages are ordered oldest->newest; we return newest->oldest by default.
   */
  const fetchCampaignPage = useCallback(
    async (offset: number, limit: number, opts?: { newestFirst?: boolean }): Promise<CampaignInfo[]> => {
      const factory = getFactoryRead();
      if (!factory) return [];
      const total = await fetchCampaignsCount();
      if (total <= 0) return [];

      const safeLimit = Math.max(1, Math.min(50, Number(limit ?? 24)));
      const safeOffset = Math.max(0, Math.min(total, Number(offset ?? 0)));

      const page = await factory.getCampaignPage(safeOffset, safeLimit);
      const mapped = (page ?? []).map((c: any, idx: number) => ({
        id: safeOffset + idx,
        campaign: c.campaign,
        token: c.token,
        creator: c.creator,
        name: c.name,
        symbol: c.symbol,
        logoURI: c.logoURI,
        xAccount: c.xAccount,
        website: c.website,
        extraLink: c.extraLink,
        createdAt: c.createdAt ? Number(c.createdAt) : undefined,
      })) as CampaignInfo[];

      const newestFirst = opts?.newestFirst ?? true;
      return newestFirst ? mapped.slice().reverse() : mapped;
    },
    [getFactoryRead, fetchCampaignsCount]
  );

  const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
    const totalNumber = await fetchCampaignsCount();
    if (totalNumber <= 0) return [];

    // Default behavior (kept for backward compatibility): return the latest 25.
    const limit = Math.min(totalNumber, 25);
    const offset = Math.max(0, totalNumber - limit);
    return await fetchCampaignPage(offset, limit, { newestFirst: true });
  }, [fetchCampaignsCount, fetchCampaignPage]);

  /**
   * Fetch only the on-chain logoURI for a given campaign.
   *
   * This is used as a lightweight hydration step for the campaign grid when the
   * DB-backed feed does not have logo_uri populated yet (but the campaign
   * contract does).
   */
  const fetchCampaignLogoURI = useCallback(
    async (campaignAddress: string): Promise<string | null> => {
      const addr = String(campaignAddress ?? '').trim();
      if (!addr) return null;
      const campaign = getCampaignRead(addr);
      if (!campaign) return null;
      try {
        const uri = await campaign.logoURI();
        const s = uri != null ? String(uri).trim() : '';
        return s ? s : null;
      } catch {
        return null;
      }
    },
    [getCampaignRead]
  );

  const fetchCampaignMetrics = useCallback(
    async (campaignAddress: string): Promise<CampaignMetrics | null> => {
      if (!campaignAddress) return null;

      const campaign = getCampaignRead(campaignAddress);
      if (!campaign) return null;

      const [
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        currentPrice,
      ] = await Promise.all([
        campaign.sold(),
        campaign.curveSupply(),
        campaign.liquiditySupply(),
        campaign.creatorReserve(),
        campaign.basePrice(),
        campaign.priceSlope(),
        campaign.graduationTarget(),
        campaign.liquidityBps(),
        campaign.protocolFeeBps(),
        campaign.currentPrice(),
      ]);

      let launched = false;
      let finalizedAt = 0n;
      try {
        launched = await campaign.launched();
      } catch {
        // ignore
      }
      try {
        finalizedAt = await campaign.finalizedAt();
      } catch {
        // ignore
      }

      return {
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        currentPrice,
        launched,
        finalizedAt,
      };
    },
    [getCampaignRead]
  );

  /**
   * IMPORTANT CHANGE:
   * We no longer try to find the exact creation block via factory logs.
   * That was causing rate limits on public endpoints.
   *
   * Instead we use a bounded lookback window (cached per campaign).
   */
  const getFromBlockForCampaign = useCallback(
    async (campaignAddress: string): Promise<number> => {
      const key = campaignAddress.toLowerCase();
      const cached = fromBlockCacheRef.current.get(key);
      if (typeof cached === "number") return cached;

      const latest = await readProvider.getBlockNumber();
      const fromBlock = Math.max(0, latest - DEFAULT_ACTIVITY_LOOKBACK_BLOCKS);
      fromBlockCacheRef.current.set(key, fromBlock);
      return fromBlock;
    },
    [readProvider]
  );

  const fetchCampaignActivity = useCallback(
    async (campaignAddress: string): Promise<CampaignActivity | null> => {
      if (!campaignAddress) return null;

      const latest = await readProvider.getBlockNumber();
      const fromBlock = await getFromBlockForCampaign(campaignAddress);

      // Phase 2 fast-path: prefer cheap counters over log scanning
      try {
        const c = getCampaignRead(campaignAddress);
        if (c) {
          const [buyersCount, totalBuyVolumeWei, totalSellVolumeWei] = await Promise.all([
            c.buyersCount(),
            c.totalBuyVolumeWei(),
            c.totalSellVolumeWei(),
          ]);

          return {
            buyers: Number(buyersCount),
            sellers: 0,
            buyVolumeWei: totalBuyVolumeWei as bigint,
            sellVolumeWei: totalSellVolumeWei as bigint,
            fromBlock,
            toBlock: latest,
          };
        }
      } catch (e) {
        console.warn("[fetchCampaignActivity] Counters not available; falling back to logs", e);
      }

      // Fallback: log scanning (limited concurrency + chunked + retry)
      return runLogScanLimited(async () => {
        const iface = new ethers.Interface(CAMPAIGN_ABI);
        const buyTopic = iface.getEvent("TokensPurchased").topicHash;
        const sellTopic = iface.getEvent("TokensSold").topicHash;

        let buyVolumeWei = 0n;
        let sellVolumeWei = 0n;
        const buyers = new Set<string>();
        const sellers = new Set<string>();

        try {
          const buyLogs = await getLogsChunked(
            readProvider,
            { address: campaignAddress, topics: [buyTopic] },
            fromBlock,
            latest
          );

          for (const log of buyLogs) {
            const parsed = iface.parseLog(log);
            const buyer = String(parsed.args.buyer).toLowerCase();
            const cost = parsed.args.cost as bigint;
            buyers.add(buyer);
            buyVolumeWei += cost;
          }

          const sellLogs = await getLogsChunked(
            readProvider,
            { address: campaignAddress, topics: [sellTopic] },
            fromBlock,
            latest
          );

          for (const log of sellLogs) {
            const parsed = iface.parseLog(log);
            const seller = String(parsed.args.seller).toLowerCase();
            const payout = parsed.args.payout as bigint;
            sellers.add(seller);
            sellVolumeWei += payout;
          }
        } catch (e) {
          console.warn("[fetchCampaignActivity] log scan failed", e);
        }

        return {
          buyers: buyers.size,
          sellers: sellers.size,
          buyVolumeWei,
          sellVolumeWei,
          fromBlock,
          toBlock: latest,
        };
      });
    },
    [getCampaignRead, getFromBlockForCampaign, readProvider]
  );

  const fetchCampaignSummary = useCallback(
    async (campaign: CampaignInfo): Promise<CampaignSummary> => {
      const metrics = await fetchCampaignMetrics(campaign.campaign);

      let holders = "—";
      let volume = "—";
      let marketCap = "—";
      let marketCapBnb: number | undefined = undefined;

      // Activity rollups (safe + limited)
      try {
        const activity = await fetchCampaignActivity(campaign.campaign);
        if (activity) {
          holders = formatCount(activity.buyers);
          volume = formatBnbFromWei(activity.buyVolumeWei + activity.sellVolumeWei);
        }
      } catch (e) {
        console.warn("[fetchCampaignSummary] activity fetch failed", e);
      }

      // Market cap (derived): currentPrice * totalSupply
      try {
        if (metrics) {
          const token = new Contract(campaign.token, TOKEN_ABI, readProvider) as any;
const totalSupply: bigint = await token.totalSupply();

// During bonding, only *sold* tokens are circulating.
// The remaining supply is still held/reserved by the campaign (e.g., liquidity/creator allocations).
// After graduation (launched), we fall back to totalSupply as circulating if no DEX market cap is available.
const circulating: bigint = metrics.launched ? totalSupply : metrics.sold;

const mcWei = (metrics.currentPrice * circulating) / 10n ** 18n;
marketCap = formatBnbFromWei(mcWei);
// Also return an unrounded numeric value for consistent USD conversion on the carousel.
try {
  const mcBnbRaw = Number(ethers.formatEther(mcWei));
  if (Number.isFinite(mcBnbRaw) && mcBnbRaw > 0) marketCapBnb = mcBnbRaw;
} catch {
  // ignore
}
        }
      } catch (e) {
        console.warn("[fetchCampaignSummary] market cap calc failed", e);
      }

      return { campaign, metrics, stats: { holders, volume, marketCap, marketCapBnb } };
    },
    [fetchCampaignActivity, fetchCampaignMetrics, readProvider]
  );

  const fetchCampaignCardStats = useCallback(
    async (campaign: CampaignInfo): Promise<CampaignCardStats> => {
      const summary = await fetchCampaignSummary(campaign);
      return summary.stats;
    },
    [fetchCampaignSummary]
  );

  // --- WRITES ---

  const createCampaign = useCallback(
    async (params: {
      name: string;
      symbol: string;
      logoURI: string;
      xAccount: string;
      website: string;
      extraLink: string;
      initialBuyBnb?: string;
      basePriceWei?: bigint;
      priceSlopeWei?: bigint;
      graduationTargetWei?: bigint;
      lpReceiver?: string;
    }) => {

      const writer = getFactoryWrite();
      if (!writer) throw new Error("Wallet not connected");

      const basePriceWei = params.basePriceWei ?? 0n;
      const priceSlopeWei = params.priceSlopeWei ?? 0n;
      // Creator initial buy is now specified in BNB (exact value spent in the same tx).
      // This avoids huge "token count" inputs causing UX and quoting issues.
      const initialBuyBnbWei = (() => {
        const s = String(params.initialBuyBnb ?? "").trim();
        if (!s) return 0n;
        try {
          const v = ethers.parseEther(s);
          return v > 0n ? v : 0n;
        } catch {
          throw new Error("Invalid initial buy BNB amount");
        }
      })();

      const valueToSend = initialBuyBnbWei;

      const tx = await writer.createCampaign(
        {
        name: params.name,
        symbol: params.symbol,
        logoURI: params.logoURI,
        xAccount: params.xAccount,
        website: params.website,
        extraLink: params.extraLink,
        basePrice: basePriceWei,
        priceSlope: priceSlopeWei,
        graduationTarget: params.graduationTargetWei ?? 0n,
        lpReceiver: params.lpReceiver || ethers.ZeroAddress,
        initialBuyBnbWei: initialBuyBnbWei,
        },
        { value: valueToSend }
      );

      return tx.wait();
    },
    [getFactoryWrite, getFactoryRead]
  );

  const buyTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;

      const tx = await campaign.buyExactTokens(amountWei, maxCostWei, {
        value: maxCostWei,
      });
      return tx.wait();
    },
    [signer]
  );

  const sellTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;

      const tx = await campaign.sellExactTokens(amountWei, minAmountWei);
      return tx.wait();
    },
    [signer]
  );

  const finalizeCampaign = useCallback(
    async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;

      const tx = await campaign.finalize(minTokens, minBnb);
      return tx.wait();
    },
    [signer]
  );

  return {
    fetchCampaignsCount,
    fetchCampaignPage,
    fetchCampaigns,
    fetchCampaignLogoURI,
    fetchCampaignMetrics,
    fetchCampaignCardStats,
    fetchCampaignActivity,
    fetchCampaignSummary,
    createCampaign,
    buyTokens,
    sellTokens,
    finalizeCampaign,

    // keeping these around in case you need them later
    walletProvider,
    activeChainId,
    factoryAddress,
  };
}
