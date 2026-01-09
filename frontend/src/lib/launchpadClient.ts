import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/hooks/useWallet";
import { getFactoryAddress } from "@/lib/chainConfig";
import { useCallback } from "react";
import { USE_MOCK_DATA } from "@/config/mockConfig";

// Public RPC endpoints often enforce a max eth_getLogs block-range (commonly 1,000 blocks).
// Keep our scans bounded and chunked so LaunchIt works reliably even on public endpoints.
const LOG_CHUNK_SIZE = 900;
// For UI (holders/volume and timeframe analytics), we only need recent history.
// 50k blocks is ~1–2 days on BSC (approx), which safely covers 24h windows.
const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 50_000;

const toAbi = (x: any) => (x?.abi ?? x) as ethers.InterfaceAbi;

const FACTORY_ABI = toAbi(LaunchFactoryArtifact);
const CAMPAIGN_ABI = toAbi(LaunchCampaignArtifact);
const TOKEN_ABI = toAbi(LaunchTokenArtifact);

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

  // Optional UI-only metadata (primarily populated in mock mode)
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

  // Graduation / DEX launch signals (may be missing in older deployments)
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
};

export type CampaignSummary = {
  campaign: CampaignInfo;
  metrics: CampaignMetrics | null;
  stats: CampaignCardStats;
};

export type CreateCampaignResult = {
  status: number;
  txHash?: string;
  receipt?: any;
  campaignAddress?: string;
  tokenAddress?: string;
};

// ---------------- Formatting helpers ----------------
const formatBnbFromWei = (wei: bigint): string => {
  try {
    const raw = ethers.formatEther(wei);
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${raw} BNB`;
    const pretty =
      n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
    return `${pretty} BNB`;
  } catch {
    return `${wei.toString()} wei`;
  }
};

const formatCount = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  return String(n);
};

// ---------------- Log helpers (chunked) ----------------
async function getLogsChunked(
  readProvider: any,
  params: { address: string; topics?: (string | string[] | null)[] },
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);
    const chunk = await readProvider.getLogs({ ...params, fromBlock: start, toBlock: end });
    logs.push(...chunk);
  }
  return logs;
}

async function queryFilterChunked(
  contract: any,
  filter: any,
  fromBlock: number,
  toBlock: number
) {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(toBlock, start + LOG_CHUNK_SIZE - 1);
    const chunk = await contract.queryFilter(filter, start, end);
    logs.push(...chunk);
  }
  return logs;
}


// ---------------- MOCK DATA (used when USE_MOCK_DATA === true) ----------------

const MOCK_CAMPAIGNS: CampaignInfo[] = [
  {
    id: 1,
    campaign: "0x1111111111111111111111111111111111111111",
    token: "0x2222222222222222222222222222222222222222",
    creator: "0x9999999999999999999999999999999999999999",
    name: "LaunchIT Mock Token",
    symbol: "LIT",
    logoURI: "/placeholder.svg",
    xAccount: "https://x.com/launchit_mock",
    website: "https://launchit.mock",
    extraLink: "The first mock campaign for testing the UI.",
    holders: "1.2k",
    volume: "12.4k BNB",
    marketCap: "420.0k BNB",
    timeAgo: "3d",
    dexPairAddress: "0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
    dexScreenerUrl:
      "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
  },
  {
    id: 2,
    campaign: "0x4444444444444444444444444444444444444444",
    token: "0x5555555555555555555555555555555555555555",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Mock 2 (Curve Test)",
    symbol: "MOCK2",
    logoURI: "/placeholder.svg",
    xAccount: "",
    website: "",
    extraLink: "Mock token for curve chart testing.",
    holders: "0",
    volume: "0 BNB",
    marketCap: "12.3k BNB",
    timeAgo: "now",
    dexPairAddress: "0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
    dexScreenerUrl:
      "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e",
  },

  {
    id: 3,
    campaign: "0x7777777777777777777777777777777777777701",
    token: "0x8888888888888888888888888888888888888801",
    creator: "0x9999999999999999999999999999999999999999",
    name: "PiaiPin",
    symbol: "PIAIPIN",
    logoURI:
      "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    xAccount: "https://x.com/piaipin",
    website: "https://example.com/piaipin",
    extraLink: "Mock campaign for UI design: PiaiPin.",
    holders: "1",
    volume: "34 BNB",
    marketCap: "6.17k BNB",
    timeAgo: "13h",
  },
  {
    id: 4,
    campaign: "0x7777777777777777777777777777777777777702",
    token: "0x8888888888888888888888888888888888888802",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Nova Token",
    symbol: "NOVA",
    logoURI:
      "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop",
    xAccount: "https://x.com/nova",
    website: "https://example.com/nova",
    extraLink: "Mock campaign for UI design: Nova Token.",
    holders: "12",
    volume: "1.2k BNB",
    marketCap: "22.8k BNB",
    timeAgo: "5h",
  },
  {
    id: 5,
    campaign: "0x7777777777777777777777777777777777777703",
    token: "0x8888888888888888888888888888888888888803",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Zenith Protocol",
    symbol: "ZENITH",
    logoURI:
      "https://images.unsplash.com/photo-1640826514546-7d2d2845a5b4?w=100&h=100&fit=crop",
    xAccount: "https://x.com/zenith",
    website: "https://example.com/zenith",
    extraLink: "Mock campaign for UI design: Zenith Protocol.",
    holders: "234",
    volume: "2.1k BNB",
    marketCap: "45.8k BNB",
    timeAgo: "2d",
  },
  {
    id: 6,
    campaign: "0x7777777777777777777777777777777777777704",
    token: "0x8888888888888888888888888888888888888804",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Apex Finance",
    symbol: "APEX",
    logoURI:
      "https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=100&h=100&fit=crop",
    xAccount: "https://x.com/apex",
    website: "",
    extraLink: "Mock campaign for UI design: Apex Finance.",
    holders: "189",
    volume: "1.8k BNB",
    marketCap: "52.3k BNB",
    timeAgo: "1d",
  },
  {
    id: 7,
    campaign: "0x7777777777777777777777777777777777777705",
    token: "0x8888888888888888888888888888888888888805",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Light",
    symbol: "LIGHT",
    logoURI:
      "https://images.unsplash.com/photo-1644361566696-3d442b5b482a?w=100&h=100&fit=crop",
    xAccount: "https://x.com/light",
    website: "https://example.com/light",
    extraLink: "Mock campaign for UI design: Light.",
    holders: "10.70k",
    volume: "67.31k BNB",
    marketCap: "4.08m BNB",
    timeAgo: "12w",
  },
  {
    id: 8,
    campaign: "0x7777777777777777777777777777777777777706",
    token: "0x8888888888888888888888888888888888888806",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Magikarp",
    symbol: "MAGIK",
    logoURI:
      "https://images.unsplash.com/photo-1642543348745-03eb1b69c3c8?w=100&h=100&fit=crop",
    xAccount: "https://x.com/magik",
    website: "https://example.com/magik",
    extraLink: "Mock campaign for UI design: Magikarp.",
    holders: "952",
    volume: "3.43k BNB",
    marketCap: "828.80k BNB",
    timeAgo: "9w",
  },
  {
    id: 9,
    campaign: "0x7777777777777777777777777777777777777707",
    token: "0x8888888888888888888888888888888888888807",
    creator: "0x9999999999999999999999999999999999999999",
    name: "SvmAcc",
    symbol: "SVMACC",
    logoURI:
      "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    xAccount: "https://x.com/svmacc",
    website: "https://example.com/svmacc",
    extraLink: "Mock campaign for UI design: SvmAcc.",
    holders: "1.70k",
    volume: "18.32k BNB",
    marketCap: "314.28k BNB",
    timeAgo: "10w",
  },
  {
    id: 10,
    campaign: "0x7777777777777777777777777777777777777708",
    token: "0x8888888888888888888888888888888888888808",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Midcurve",
    symbol: "MID",
    logoURI:
      "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=100&h=100&fit=crop",
    xAccount: "https://x.com/mid",
    website: "",
    extraLink: "Mock campaign for UI design: Midcurve.",
    holders: "2.07k",
    volume: "0 BNB",
    marketCap: "289.04k BNB",
    timeAgo: "10w",
  },
  {
    id: 11,
    campaign: "0x7777777777777777777777777777777777777709",
    token: "0x8888888888888888888888888888888888888809",
    creator: "0x9999999999999999999999999999999999999999",
    name: "Daniel",
    symbol: "DANIEL",
    logoURI:
      "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&h=100&fit=crop",
    xAccount: "https://x.com/daniel",
    website: "https://example.com/daniel",
    extraLink: "Mock campaign for UI design: Daniel.",
    holders: "2.07k",
    volume: "57.28k BNB",
    marketCap: "1.52m BNB",
    timeAgo: "11w",
  },
];

const MOCK_METRICS_BY_CAMPAIGN: Record<string, CampaignMetrics> = {
  "0x1111111111111111111111111111111111111111": {
    sold: 150_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 500_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x4444444444444444444444444444444444444444": {
    sold: 200_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 700_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777701": {
    sold: 80_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 900_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777702": {
    sold: 120_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_100_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777703": {
    sold: 1_000_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_300_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777704": {
    sold: 1_000_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_500_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777705": {
    sold: 900_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_700_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777706": {
    sold: 850_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 1_900_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777707": {
    sold: 1_000_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 2_100_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777708": {
    sold: 720_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 2_300_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
  "0x7777777777777777777777777777777777777709": {
    sold: 950_000n,
    curveSupply: 1_000_000n,
    liquiditySupply: 500_000n,
    creatorReserve: 500_000n,
    currentPrice: 2_500_000_000_000_000n,
    basePrice: 500_000_000_000_000n,
    priceSlope: 10_000_000_000_000n,
    graduationTarget: 1_000_000n,
    liquidityBps: 5_000n,
    protocolFeeBps: 200n,
  },
};



export function useLaunchpad() {
  const { signer, readProvider, activeChainId } = useWallet();

  const FACTORY_ADDRESS = getFactoryAddress(activeChainId);

  const getFactory = useCallback(() => {
    if (!readProvider || !FACTORY_ADDRESS) return null;
    return new Contract(
      FACTORY_ADDRESS,
      FACTORY_ABI,
      signer ?? readProvider
    ) as any;
  }, [readProvider, signer, FACTORY_ADDRESS]);

  const getCampaign = useCallback(
    (address: string) => {
      if (!readProvider) return null;
      return new Contract(
        address,
        CAMPAIGN_ABI,
        signer ?? readProvider
      ) as any;
    },
    [readProvider, signer]
  );

  // --- READS ---

    const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
    // 🔹 MOCK MODE: just return mock data
    if (USE_MOCK_DATA) {
      return MOCK_CAMPAIGNS;
    }

    const factory = getFactory();
    if (!factory) return [];

    const total: bigint = await factory.campaignsCount();
    if (total === 0n) return [];

    const totalNumber = Number(total);
    const limit = Math.min(totalNumber, 25);
    const offset = Math.max(0, totalNumber - limit);
    const page = await factory.getCampaignPage(offset, limit);

    return page.map((c: any, idx: number) => ({
      id: offset + idx,
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
  }, [getFactory]);


    const fetchCampaignMetrics = useCallback(
    async (campaignAddress: string): Promise<CampaignMetrics | null> => {
      // 🔹 MOCK MODE
      if (USE_MOCK_DATA) {
        const m =
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress.toLowerCase()] ??
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress] ??
          null;

        if (!m) return null;

        // In mock mode, infer "launched" once sold reaches the graduation target
        // unless explicitly set in the mock payload.
        const launched = (m as any).launched ?? (m.graduationTarget > 0n && m.sold >= m.graduationTarget);
        const finalizedAt = (m as any).finalizedAt ?? (launched ? 1n : 0n);

        return { ...m, launched, finalizedAt } as CampaignMetrics;
      }

      const campaign = getCampaign(campaignAddress);
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

      // Graduation / DEX launch flags (not present in all deployments)
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
    [getCampaign]
  );

  const getCampaignCreatedBlock = useCallback(
    async (campaignAddress: string): Promise<number | null> => {
      if (!readProvider) return null;

      const factory = getFactory();
      if (!factory) return null;

      try {
        const filter = factory.filters.CampaignCreated(null, campaignAddress, null);
        const latest = await readProvider.getBlockNumber();
        const fromBlock = Math.max(0, latest - DEFAULT_ACTIVITY_LOOKBACK_BLOCKS);
        const events = await queryFilterChunked(factory, filter, fromBlock, latest);
        const ev = events && events.length ? events[0] : null;
        return ev?.blockNumber ?? null;
      } catch (e) {
        console.warn("[getCampaignCreatedBlock] failed", e);
        return null;
      }
    },
    [getFactory, readProvider]
  );

  const fetchCampaignActivity = useCallback(
    async (campaignAddress: string): Promise<CampaignActivity | null> => {
      if (USE_MOCK_DATA) return null;
      if (!readProvider) return null;

      const latest = await readProvider.getBlockNumber();
      // Prefer the actual creation block when we can find it, otherwise
      // fall back to a bounded lookback window. This prevents huge log scans
      // and avoids readProvider max-range errors.
      const createdBlock =
        (await getCampaignCreatedBlock(campaignAddress)) ??
        Math.max(0, latest - DEFAULT_ACTIVITY_LOOKBACK_BLOCKS);

      // Phase 2 fast-path: prefer on-chain counters over log scanning.
      try {
        const c = getCampaign(campaignAddress);
        if (c) {
          const [buyersCount, totalBuyVolumeWei, totalSellVolumeWei] =
            await Promise.all([
              c.buyersCount(),
              c.totalBuyVolumeWei(),
              c.totalSellVolumeWei(),
            ]);

          return {
            buyers: Number(buyersCount),
            // sellersCount is not available yet; keep 0 to avoid breaking UI.
            sellers: 0,
            buyVolumeWei: totalBuyVolumeWei as bigint,
            sellVolumeWei: totalSellVolumeWei as bigint,
            fromBlock: createdBlock,
            toBlock: latest,
          };
        }
      } catch (e) {
        // Pre-phase2 deployments (or older ABIs): fall back to log scanning.
        console.warn(
          "[fetchCampaignActivity] Phase2 counters not available; falling back to logs",
          e
        );
      }

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
          createdBlock,
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
          createdBlock,
          latest
        );

        for (const log of sellLogs) {
          const parsed = iface.parseLog(log);
          const seller = String(parsed.args.seller).toLowerCase();
          const payout = parsed.args.payout as bigint;
          sellers.add(seller);
          sellVolumeWei += payout;
        }

        return {
          buyers: buyers.size,
          sellers: sellers.size,
          buyVolumeWei,
          sellVolumeWei,
          fromBlock: createdBlock,
          toBlock: latest,
        };
      } catch (e) {
        console.warn("[fetchCampaignActivity] failed", e);
        return {
          buyers: buyers.size,
          sellers: sellers.size,
          buyVolumeWei,
          sellVolumeWei,
          fromBlock: createdBlock,
          toBlock: latest,
        };
      }
    },
    [readProvider, getCampaignCreatedBlock]
  );

  const fetchCampaignSummary = useCallback(
    async (campaign: CampaignInfo): Promise<CampaignSummary> => {
      // Always fetch metrics once so callers can reuse them.
      const metrics = await fetchCampaignMetrics(campaign.campaign);

      // Defaults
      let holders = "—";
      let volume = "—";
      let marketCap = "—";

      // Mock mode: campaigns already carry the formatted UI values
      if (USE_MOCK_DATA) {
        const anyC = campaign as any;
        holders = anyC.holders ?? "0";
        volume = anyC.volume ?? "0 BNB";
        marketCap = anyC.marketCap ?? "0 BNB";

        return { campaign, metrics, stats: { holders, volume, marketCap } };
      }

      // Live mode: prefer cheap counters (phase2) and fall back to log scanning.
      try {
        const activity = await fetchCampaignActivity(campaign.campaign);
        if (activity) {
          // NOTE: we treat "holders" as the unique buyer count (buyersCount)
          // for consistency with the carousel.
          holders = formatCount(activity.buyers);
          volume = formatBnbFromWei(activity.buyVolumeWei + activity.sellVolumeWei);
        }
      } catch (e) {
        console.warn("[fetchCampaignSummary] activity fetch failed", e);
      }

      // Market cap (derived): currentPrice * totalSupply
      try {
        if (readProvider && metrics) {
          const token = new Contract(campaign.token, TOKEN_ABI, readProvider) as any;
          const totalSupply: bigint = await token.totalSupply();

          const mcWei = (metrics.currentPrice * totalSupply) / 10n ** 18n;
          marketCap = formatBnbFromWei(mcWei);
        }
      } catch (e) {
        console.warn("[fetchCampaignSummary] market cap calc failed", e);
      }

      return { campaign, metrics, stats: { holders, volume, marketCap } };
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
    basePriceWei?: bigint;
    priceSlopeWei?: bigint;
    graduationTargetWei?: bigint;
    lpReceiver?: string;
    confirmations?: number; // NEW (optional)
  }): Promise<CreateCampaignResult> => {
    // --- MOCK MODE ---
    if (USE_MOCK_DATA) {
      console.log("[MOCK] createCampaign", params);
      await new Promise((res) => setTimeout(res, 500));
      return {
        status: 1,
        txHash: "0xmock",
        // optionally provide a deterministic mock campaign address
        campaignAddress: "0x1111111111111111111111111111111111111111",
        tokenAddress: "0x2222222222222222222222222222222222222222",
      };
    }

    const factory = getFactory();
    if (!factory || !signer) throw new Error("Wallet not connected");

    const confirmations = Math.max(1, Number(params.confirmations ?? 2));

    const writer = factory.connect(signer) as any;

    // NOTE: you are calling createCampaign with a struct-like object.
    // Keep as-is, since this matches your current contract call shape.
    const tx = await writer.createCampaign({
      name: params.name,
      symbol: params.symbol,
      logoURI: params.logoURI,
      xAccount: params.xAccount,
      website: params.website,
      extraLink: params.extraLink,
      basePrice: params.basePriceWei ?? 0n,
      priceSlope: params.priceSlopeWei ?? 0n,
      graduationTarget: params.graduationTargetWei ?? 0n,
      lpReceiver: params.lpReceiver || ethers.ZeroAddress,
    });

    // Wait for confirmations (finality buffer)
    const receipt = await tx.wait(confirmations);

    // Try to resolve created addresses from factory event logs
    let campaignAddress: string | undefined;
    let tokenAddress: string | undefined;

    try {
      const iface = factory.interface;

      // Your file already references factory.filters.CampaignCreated(...)
      // so this event should exist in the ABI.
      const createdEvent = iface.getEvent("CampaignCreated");
      const createdTopic = createdEvent?.topicHash;

      const logs = (receipt?.logs ?? []) as any[];

      // Prefer matching by topic (fast + deterministic)
      const createdLogs = createdTopic
        ? logs.filter(
            (l) =>
              (l?.address ?? "").toLowerCase() === FACTORY_ADDRESS.toLowerCase() &&
              Array.isArray(l?.topics) &&
              l.topics.length > 0 &&
              l.topics[0].toLowerCase() === createdTopic.toLowerCase()
          )
        : [];

      // If no logs matched by topic, fall back to parsing all factory logs
      const candidateLogs = createdLogs.length
        ? createdLogs
        : logs.filter(
            (l) => (l?.address ?? "").toLowerCase() === FACTORY_ADDRESS.toLowerCase()
          );

      for (const log of candidateLogs) {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;

          // If we used the fallback path, enforce the event name
          if (parsed.name !== "CampaignCreated") continue;

          const args: any = parsed.args;

          // Common patterns:
          // - args.campaign / args.token
          // - or positional: [creator, campaign, token] / [id, campaign, token], etc.
          if (args?.campaign && ethers.isAddress(args.campaign)) {
            campaignAddress = args.campaign;
          } else {
            // Find the first address-like arg that is NOT the creator (best effort)
            const addrArgs = Array.from(args ?? []).filter((v) => ethers.isAddress(v));
            // Heuristic: creator is often first; campaign often second; token often third
            campaignAddress = addrArgs[1] ?? addrArgs[0];
          }

          if (args?.token && ethers.isAddress(args.token)) {
            tokenAddress = args.token;
          } else {
            const addrArgs = Array.from(args ?? []).filter((v) => ethers.isAddress(v));
            tokenAddress = addrArgs[2];
          }

          if (campaignAddress) break;
        } catch {
          // ignore non-matching log
        }
      }
    } catch (e) {
      console.warn("[createCampaign] Failed to parse CampaignCreated log", e);
    }

    return {
      status: Number(receipt?.status ?? 0),
      txHash: tx?.hash,
      receipt,
      campaignAddress,
      tokenAddress,
    };
  },
  [getFactory, signer]
);


  const buyTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, maxCostWei: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] buyTokens", { campaignAddress, amountWei, maxCostWei });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.buyExactTokens(amountWei, maxCostWei, {
        value: maxCostWei,
      });
      return tx.wait();
    },
    [getCampaign, signer]
  );

  const sellTokens = useCallback(
    async (campaignAddress: string, amountWei: bigint, minAmountWei: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] sellTokens", { campaignAddress, amountWei, minAmountWei });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.sellExactTokens(amountWei, minAmountWei);
      return tx.wait();
    },
    [getCampaign, signer]
  );

  const finalizeCampaign = useCallback(
    async (campaignAddress: string, minTokens: bigint, minBnb: bigint) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] finalizeCampaign", { campaignAddress, minTokens, minBnb });
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 };
      }

      const campaign = getCampaign(campaignAddress);
      if (!campaign || !signer) throw new Error("Wallet not connected");

      const writer = campaign.connect(signer) as any;
      const tx = await writer.finalize(minTokens, minBnb);
      return tx.wait();
    },
    [getCampaign, signer]
  );


  return {
    fetchCampaigns,
    fetchCampaignMetrics,
    fetchCampaignCardStats,
    fetchCampaignActivity,
    fetchCampaignSummary,
    createCampaign,
    buyTokens,
    sellTokens,
    finalizeCampaign,
  };
}
