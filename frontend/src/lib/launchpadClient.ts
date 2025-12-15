import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { useWallet } from "@/hooks/useWallet";
import { useCallback } from "react";
import { USE_MOCK_DATA } from "@/config/mockConfig";

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS ?? "";

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
    volume: "$12.4k",
    marketCap: "$420.0k",
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
    volume: "$0",
    marketCap: "$12.3k",
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
    volume: "$34",
    marketCap: "$6.17k",
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
    volume: "$1.2k",
    marketCap: "$22.8k",
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
    volume: "$2.1k",
    marketCap: "$45.8k",
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
    volume: "$1.8k",
    marketCap: "$52.3k",
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
    volume: "$67.31k",
    marketCap: "$4.08m",
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
    volume: "$3.43k",
    marketCap: "$828.80k",
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
    volume: "$18.32k",
    marketCap: "$314.28k",
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
    volume: "$0",
    marketCap: "$289.04k",
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
    volume: "$57.28k",
    marketCap: "$1.52m",
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
    sold: 450_000n,
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
    sold: 600_000n,
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
    sold: 780_000n,
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
  const { provider, signer } = useWallet();

  const getFactory = useCallback(() => {
    if (!provider || !FACTORY_ADDRESS) return null;
    return new Contract(
      FACTORY_ADDRESS,
      FACTORY_ABI,
      signer ?? provider
    ) as any;
  }, [provider, signer]);

  const getCampaign = useCallback(
    (address: string) => {
      if (!provider) return null;
      return new Contract(
        address,
        CAMPAIGN_ABI,
        signer ?? provider
      ) as any;
    },
    [provider, signer]
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
        return (
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress.toLowerCase()] ??
          MOCK_METRICS_BY_CAMPAIGN[campaignAddress] ??
          null
        );
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
      };
    },
    [getCampaign]
  );

  const getCampaignCreatedBlock = useCallback(
    async (campaignAddress: string): Promise<number | null> => {
      if (!provider) return null;

      const factory = getFactory();
      if (!factory) return null;

      try {
        const filter = factory.filters.CampaignCreated(null, campaignAddress, null);
        const events = await factory.queryFilter(filter, 0, "latest");
        const ev = events && events.length ? events[0] : null;
        return ev?.blockNumber ?? null;
      } catch (e) {
        console.warn("[getCampaignCreatedBlock] failed", e);
        return null;
      }
    },
    [getFactory, provider]
  );

  const fetchCampaignActivity = useCallback(
    async (campaignAddress: string): Promise<CampaignActivity | null> => {
      if (USE_MOCK_DATA) return null;
      if (!provider) return null;

      const createdBlock = (await getCampaignCreatedBlock(campaignAddress)) ?? 0;
      const latest = await provider.getBlockNumber();

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
        const buyLogs = await provider.getLogs({
          address: campaignAddress,
          fromBlock: createdBlock,
          toBlock: latest,
          topics: [buyTopic],
        });

        for (const log of buyLogs) {
          const parsed = iface.parseLog(log);
          const buyer = String(parsed.args.buyer).toLowerCase();
          const cost = parsed.args.cost as bigint;
          buyers.add(buyer);
          buyVolumeWei += cost;
        }

        const sellLogs = await provider.getLogs({
          address: campaignAddress,
          fromBlock: createdBlock,
          toBlock: latest,
          topics: [sellTopic],
        });

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
    [provider, getCampaignCreatedBlock]
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
        volume = anyC.volume ?? "$0";
        marketCap = anyC.marketCap ?? "$0";

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
        if (provider && metrics) {
          const token = new Contract(campaign.token, TOKEN_ABI, provider) as any;
          const totalSupply: bigint = await token.totalSupply();

          const mcWei = (metrics.currentPrice * totalSupply) / 10n ** 18n;
          marketCap = formatBnbFromWei(mcWei);
        }
      } catch (e) {
        console.warn("[fetchCampaignSummary] market cap calc failed", e);
      }

      return { campaign, metrics, stats: { holders, volume, marketCap } };
    },
    [fetchCampaignActivity, fetchCampaignMetrics, provider]
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
    }) => {
      if (USE_MOCK_DATA) {
        console.log("[MOCK] createCampaign", params);
        // Option: simulate a short delay
        await new Promise((res) => setTimeout(res, 500));
        return { status: 1 }; // minimal "success" shape
      }

            const factory = getFactory();
      if (!factory || !signer) throw new Error("Wallet not connected");

      const writer = factory.connect(signer) as any;
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

      return tx.wait();
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
