import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/contexts/WalletContext";
import { useCallback, useMemo, useRef } from "react";
import { getActiveChainId, getFactoryAddress, type SupportedChainId } from "@/lib/chainConfig";
import { fetchCampaignCreateAuthorization, fetchCampaignTradeAuthorization } from "@/lib/recruiterApi";
import { getReadProvider } from "@/lib/readProvider";
import { apiFetch } from "@/lib/apiBase";
import { resolveImageUri } from "@/lib/media";

// Public endpoints can be very sensitive to getLogs volume.
// Keep scans small + chunked.
const LOG_CHUNK_SIZE = 700;

// For UI-only rollups (holders/volume), recent history is sufficient.
// 50k blocks is roughly 1–2 days on BSC (approx).
const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 50_000;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function envEnabled(value: unknown): boolean {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

/**
 * Migration default:
 * - campaign lists come from Railway/Supabase DB
 * - old on-chain factory campaign paging is opt-in only
 * - on-chain logo hydration is opt-in only
 */
const ENABLE_ONCHAIN_CAMPAIGN_FALLBACK = envEnabled(
  import.meta.env.VITE_ENABLE_ONCHAIN_CAMPAIGN_FALLBACK,
);

const ENABLE_ONCHAIN_LOGO_HYDRATION = envEnabled(
  import.meta.env.VITE_ENABLE_ONCHAIN_LOGO_HYDRATION,
);

const ENABLE_TOKEN_ONCHAIN_ACTIVITY = envEnabled(
  import.meta.env.VITE_ENABLE_TOKEN_ONCHAIN_ACTIVITY,
);

let loggedOnChainCampaignFailure = false;

// ---------------- ABI helpers ----------------
const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;
const FACTORY_ABI = toAbi(LaunchFactoryArtifact);

// Legacy factory ABI used by currently deployed BSC testnet factory.
// This version of CampaignInfo does NOT include metadataURI.
// Keep this until the new Phase 1 factory is deployed and chainConfig points to it.
const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset, uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

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
  metadataURI?: string;
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

function buildMetadataURI(chainId: number, tokenOrCampaignAddress?: string): string {
  const address = String(tokenOrCampaignAddress || "").trim().toLowerCase();
  if (address && ethers.isAddress(address)) return `/api/token-metadata/${chainId}/${address}`;
  return "";
}
function normalizeAddress(value: unknown): string {
  const raw = String(value ?? "").trim();
  return ethers.isAddress(raw) ? raw.toLowerCase() : "";
}

function toUnixSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function hasLogo(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/placeholder.svg") return false;
  return Boolean(resolveImageUri(raw));
}

function normalizeLogoUri(value: unknown): string {
  const raw = String(value ?? "").trim();
  const resolved = resolveImageUri(raw);
  return resolved || "/placeholder.svg";
}

function mapDbCampaign(item: any, idx: number, chainId: number): CampaignInfo | null {
  const campaign = normalizeAddress(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign);
  if (!campaign) return null;

  const token = normalizeAddress(item?.tokenAddress ?? item?.token_address ?? item?.token);
  const creator = normalizeAddress(item?.creatorAddress ?? item?.creator_address ?? item?.creator);

  return {
    id: 100000 + idx,
    campaign,
    token,
    creator,
    name: String(item?.name ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    logoURI: normalizeLogoUri(item?.logoUri ?? item?.logoURI ?? item?.logo_uri),
    metadataURI: buildMetadataURI(chainId, token || campaign),
    xAccount: String(item?.xAccount ?? item?.xUrl ?? item?.x_url ?? ""),
    website: String(item?.website ?? item?.websiteUrl ?? item?.website_url ?? ""),
    extraLink: String(item?.extraLink ?? item?.extraUrl ?? item?.otherUrl ?? item?.other_url ?? ""),
    createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain ?? item?.createdAt ?? item?.created_at),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
  };
}

async function fetchDbCampaigns(chainId: number, limit = 500): Promise<CampaignInfo[]> {
  try {
    const res = await apiFetch(
      `/api/campaigns?chainId=${encodeURIComponent(String(chainId))}&limit=${encodeURIComponent(
        String(limit),
      )}&tab=trending&sort=default&status=all`,
      { cache: "no-store" as RequestCache },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));

    const items = Array.isArray(json?.items) ? json.items : [];
    return items
      .map((item: any, idx: number) => mapDbCampaign(item, idx, chainId))
      .filter(Boolean) as CampaignInfo[];
  } catch (error) {
    console.warn("[launchpadClient] DB campaign fetch failed", error);
    return [];
  }
}

function mergeCampaigns(onChain: CampaignInfo[], db: CampaignInfo[]): CampaignInfo[] {
  const seen = new Set<string>();
  const merged: CampaignInfo[] = [];

  for (const item of [...db, ...onChain]) {
    const key = normalizeAddress(item?.campaign);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

async function hydrateMissingLogosFromContract(
  campaigns: CampaignInfo[],
  fetchCampaignLogoURI: (campaignAddress: string) => Promise<string | null>,
): Promise<CampaignInfo[]> {
  const targets = campaigns.filter((campaign) => !hasLogo(campaign.logoURI)).slice(0, 25);
  if (!targets.length) return campaigns;

  const hydrated = new Map<string, string>();

  await Promise.all(
    targets.map(async (campaign) => {
      try {
        const logo = normalizeLogoUri(await fetchCampaignLogoURI(campaign.campaign));
        if (hasLogo(logo)) hydrated.set(campaign.campaign.toLowerCase(), logo);
      } catch {
        // Best-effort only.
      }
    }),
  );

  if (!hydrated.size) return campaigns;

  return campaigns.map((campaign) => {
    const logoURI = hydrated.get(campaign.campaign.toLowerCase());
    return logoURI ? { ...campaign, logoURI } : campaign;
  });
}
// ---------------- Hook ----------------
export function useLaunchpad() {
  const wallet = useWallet() as any;
  const { provider: walletProvider, signer, chainId: walletChainId } = wallet;

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
  const factoryPageAbiModeRef = useRef<"current" | "legacy">("current");

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
function isDecodeResultError(error: unknown): boolean {
  const anyError = error as any;
  return (
    anyError?.code === "BAD_DATA" ||
    String(anyError?.message ?? "").toLowerCase().includes("could not decode result data")
  );
}

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

     let page: any[] = [];
 
    const loadLegacyPage = async () => {
      const legacyFactory = new Contract(
        factoryAddress,
        LEGACY_FACTORY_ABI,
        readProvider,
      ) as any;

      return await legacyFactory.getCampaignPage(safeOffset, safeLimit);
    };

    try {

      if (factoryPageAbiModeRef.current === "legacy") {
        page = await loadLegacyPage();
      } else {
        page = await factory.getCampaignPage(safeOffset, safeLimit);
      }
     } catch (error) {
       if (!isDecodeResultError(error)) {
         throw error;
       }
      factoryPageAbiModeRef.current = "legacy";
      console.info(
        "[fetchCampaignPage] Current LaunchFactory ABI could not decode getCampaignPage. Using legacy deployed factory ABI for future calls.",
      );

      page = await loadLegacyPage();
     }

    const mapped = (page ?? []).map((c: any, idx: number) => ({
      id: safeOffset + idx,
      campaign: c.campaign,
      token: c.token,
      creator: c.creator,
      name: c.name,
      symbol: c.symbol,
      logoURI: c.logoURI,

      // New factory has metadataURI. Old deployed factory does not.
      metadataURI: c.metadataURI ?? buildMetadataURI(activeChainId, c.token || c.campaign),

      xAccount: c.xAccount,
      website: c.website,
      extraLink: c.extraLink,
      createdAt: c.createdAt ? Number(c.createdAt) : undefined,
    })) as CampaignInfo[];

    const newestFirst = opts?.newestFirst ?? true;
    return newestFirst ? mapped.slice().reverse() : mapped;
  },
  [getFactoryRead, fetchCampaignsCount, factoryAddress, readProvider, activeChainId]
);

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

const fetchOnChainCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
  const totalNumber = await fetchCampaignsCount();
  if (totalNumber <= 0) return [];

  // Old behavior: return the latest 25 on-chain campaigns.
  const limit = Math.min(totalNumber, 25);
  const offset = Math.max(0, totalNumber - limit);
  return await fetchCampaignPage(offset, limit, { newestFirst: true });
}, [fetchCampaignsCount, fetchCampaignPage]);

const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
  const chainId = Number(activeChainId || 97);
  const db = await fetchDbCampaigns(chainId);

  // Migration default: Railway/Supabase DB is the source of truth for campaign
  // lists. On-chain factory paging is noisy and expensive in the browser, so keep
  // it opt-in only.
  if (!ENABLE_ONCHAIN_CAMPAIGN_FALLBACK) {
    return db;
  }

  const onChain = await fetchOnChainCampaigns().catch((error: unknown) => {
    if (!loggedOnChainCampaignFailure) {
      loggedOnChainCampaignFailure = true;
      console.warn("[launchpadClient] on-chain campaign page failed; using DB campaigns", error);
    }
    return [] as CampaignInfo[];
  });

  const merged = mergeCampaigns(onChain, db);

  if (!ENABLE_ONCHAIN_LOGO_HYDRATION) {
    return merged;
  }

  return hydrateMissingLogosFromContract(merged, fetchCampaignLogoURI);
}, [activeChainId, fetchOnChainCampaigns, fetchCampaignLogoURI]);

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

  // Activity rollups are expensive on public RPCs. During the Railway/Supabase
// migration, keep this disabled by default and rely on realtime-indexer data
// for TokenDetails trade/volume UI.
if (ENABLE_TOKEN_ONCHAIN_ACTIVITY) {
  try {
    const activity = await fetchCampaignActivity(campaign.campaign);
    if (activity) {
      holders = formatCount(activity.buyers);
      volume = formatBnbFromWei(activity.buyVolumeWei + activity.sellVolumeWei);
    }
  } catch (e) {
    console.warn("[fetchCampaignSummary] activity fetch failed", e);
  }
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

  function emitTxConfirmed(detail: any) {
    try {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("memebattles:txConfirmed", { detail }));
    } catch {
      // non-fatal
    }
  }

  async function legacyGasOverrides(extra: any = {}) {
    // BSC (56/97) is legacy gas. Some RPCs log noisy errors for `eth_maxPriorityFeePerGas`.
    // Force a legacy tx by providing gasPrice and type=0 when available.
    try {
      const p: any = signer?.provider ?? walletProvider ?? readProvider;
      if (!p || typeof p.send !== "function") return extra;
      const gpHex = await p.send("eth_gasPrice", []);
      const gasPrice = gpHex ? BigInt(gpHex) : 0n;
      if (gasPrice > 0n) return { ...extra, gasPrice, type: 0 };
      return extra;
    } catch {
      return extra;
    }
  }

  const createCampaign = useCallback(
    async (params: {
      name: string;
      symbol: string;
      logoURI: string;
      metadataURI?: string;
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
      if (!wallet.account) throw new Error("Wallet not connected");
      const authResponse = await fetchCampaignCreateAuthorization(wallet.account, wallet.chainId);
      const auth = authResponse.authorization;

      const metadataURI = params.metadataURI || buildMetadataURI(activeChainId);
      const tx = await writer.createCampaignAuthorized(
        {
        name: params.name,
        symbol: params.symbol,
        logoURI: params.logoURI,
        metadataURI,
        xAccount: params.xAccount,
        website: params.website,
        extraLink: params.extraLink,
        basePrice: basePriceWei,
        priceSlope: priceSlopeWei,
        graduationTarget: params.graduationTargetWei ?? 0n,
        lpReceiver: params.lpReceiver || ethers.ZeroAddress,
        initialBuyBnbWei: initialBuyBnbWei,
        },
        {
          tradeRouteProfile: auth.tradeRouteProfileId,
          finalizeRouteProfile: auth.finalizeRouteProfileId,
          deadline: Math.floor(new Date(auth.validUntil).getTime() / 1000),
          signature: auth.signature,
        },
        await legacyGasOverrides({ value: valueToSend })
      );

      const receipt = await tx.wait();
      emitTxConfirmed({ kind: "create", chainId: activeChainId, txHash: receipt?.hash ?? tx?.hash });
      return receipt;
    },
    [getFactoryWrite, activeChainId, wallet.account, wallet.chainId]
  );

  const buyTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      if (!wallet.account) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;
      const authResponse = await fetchCampaignTradeAuthorization(wallet.account, campaignAddress, wallet.chainId);
      const auth = authResponse.authorization;

      const tx = await campaign.buyExactTokensAuthorized(
        amountWei,
        maxCostWei,
        auth.routeProfileId,
        Math.floor(new Date(auth.validUntil).getTime() / 1000),
        auth.signature,
        await legacyGasOverrides({ value: maxCostWei })
      );
      const receipt = await tx.wait();
      emitTxConfirmed({ kind: "buy", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
      return receipt;
    },
    [signer, activeChainId, wallet.account, wallet.chainId]
  );

  const sellTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      if (!wallet.account) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;
      const authResponse = await fetchCampaignTradeAuthorization(wallet.account, campaignAddress, wallet.chainId);
      const auth = authResponse.authorization;

      const tx = await campaign.sellExactTokensAuthorized(
        amountWei,
        minAmountWei,
        auth.routeProfileId,
        Math.floor(new Date(auth.validUntil).getTime() / 1000),
        auth.signature,
        await legacyGasOverrides()
      );
      const receipt = await tx.wait();
      emitTxConfirmed({ kind: "sell", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
      return receipt;
    },
    [signer, activeChainId, wallet.account, wallet.chainId]
  );

  const finalizeCampaign = useCallback(
    async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {

      if (!signer) throw new Error("Wallet not connected");
      const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, signer) as any;

      const tx = await campaign.finalize(minTokens, minBnb, await legacyGasOverrides());
      const receipt = await tx.wait();
      emitTxConfirmed({ kind: "finalize", chainId: activeChainId, campaignAddress: campaignAddress.toLowerCase(), txHash: receipt?.hash ?? tx?.hash });
      return receipt;
    },
    [signer, activeChainId]
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
