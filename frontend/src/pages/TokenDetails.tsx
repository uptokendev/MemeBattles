/**
 * Token Details Page
 * Displays comprehensive information about a specific token including
 * chart, trading interface, transactions, and holder distribution
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Copy, ExternalLink, Globe, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import twitterIcon from "@/assets/social/twitter.png";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics, CampaignSummary, CampaignActivity } from "@/lib/launchpadClient";
import { getActiveChainId, getEvmChainIdForAddress, type SupportedChainId } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";
import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useTokenStatsRealtime } from "@/hooks/useTokenStatsRealtime";
import { UnifiedMarketChart } from "@/components/token/UnifiedMarketChart";
import { GraduationExplosion } from "@/components/token/GraduationExplosion";
import { useUnifiedMarket, type MarketResolution } from "@/hooks/useUnifiedMarket";
import { useTopazMarket } from "@/hooks/useTopazMarket";
import {
  ensureTopazSellAllowance,
  executeTopazBuy,
  executeTopazSell,
  quoteTopazBuy,
  quoteTopazSell,
  resolveVerifiedTopazRoute,
  solveNativeForExactTokens,
  solveTokensForExactNative,
} from "@/lib/topazV2Trade";
import { TokenComments } from "@/components/token/TokenComments";
import { TokenWarRoom } from "@/components/token/TokenWarRoom";
import { AthBar } from "@/components/token/AthBar";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { useWallet } from "@/contexts/WalletContext";
import { followCampaign, unfollowCampaign, isFollowingCampaign } from "@/lib/followApi";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";
import { resolveImageUri } from "@/lib/media";
import { apiFetch } from "@/lib/apiBase";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";
import { fetchPublicCampaignLifecycleDrafts } from "@/lib/scheduledLaunchApi";
import {
  appendLocalTopazTrade,
  loadLocalTopazTrades,
  saveLocalTopazTrades,
} from "@/lib/localTopazTrades";
import { fetchTopazTradeReports, reportTopazTrade } from "@/lib/topazTradeReports";
import { mergeTradePoints, SYNTHETIC_LOG_INDEX_MIN, tradeDedupeKey } from "@/lib/tradeDedupe";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const TOKEN_DECIMALS = 18;
const SLIPPAGE_PCT = 5;
const MAX_UINT256 = (1n << 256n) - 1n;

function findEthersErrorData(error: any): string | null {
  const candidates = [
    error?.data,
    error?.error?.data,
    error?.info?.error?.data,
    error?.cause?.data,
    error?.revert?.data,
  ];
  return candidates.find((value) => typeof value === "string" && value.startsWith("0x")) ?? null;
}

function describeTradeError(error: any): string {
  const data = findEthersErrorData(error);
  if (data) {
    try {
      const parsed = new ethers.Interface(CAMPAIGN_ABI).parseError(data);
      if (parsed?.name === "CreatorBuyLocked") {
        return "Creator-wallet buys are temporarily locked after launch. Use a different wallet for this test or wait until the creator lock expires.";
      }
      if (parsed?.name === "CreatorBuyCapExceeded") {
        return "This buy exceeds the creator wallet's launch-period buy cap. Use a smaller amount or a different wallet.";
      }
    } catch {
      // Fall through to the provider's message for unknown errors.
    }
  }
  return error?.shortMessage || error?.reason || error?.message || "Transaction failed.";
}

function hasUsefulImage(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  return Boolean(raw && raw !== "/placeholder.svg" && raw !== "-");
}

function isLikelyMetadataUri(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw.includes("/api/token-metadata/") || raw.includes("token-metadata") || raw.endsWith(".json");
}

function extractMetadataImage(metadata: any): string | undefined {
  return resolveImageUri(
    metadata?.image ||
      metadata?.image_url ||
      metadata?.imageUrl ||
      metadata?.logo_uri ||
      metadata?.logoUri ||
      metadata?.logoURI ||
      metadata?.metadata?.image ||
      metadata?.metadata?.image_url ||
      metadata?.tokenMetadata?.image ||
      metadata?.tokenMetadata?.image_url,
  );
}

async function fetchImageFromMetadataUri(uri: string): Promise<string | undefined> {
  const raw = String(uri ?? "").trim();
  if (!raw) return undefined;

  try {
    const res = raw.startsWith("/api/") ? await apiFetch(raw, { cache: "no-store" }) : await fetch(raw, { cache: "no-store" });
    const metadata = await res.json().catch(() => null);
    if (!res.ok) return undefined;
    return extractMetadataImage(metadata);
  } catch {
    return undefined;
  }
}

async function fetchRegisteredImage(chainId: number, address?: string | null): Promise<string | undefined> {
  const metadata = await fetchRegisteredMetadata(chainId, address);
  return metadata ? extractMetadataImage(metadata) : undefined;
}

async function fetchRegisteredMetadata(chainId: number, address?: string | null): Promise<any | null> {
  const raw = String(address ?? "").trim();
  if (!ethers.isAddress(raw)) return null;

  try {
    const metadataRes = await apiFetch(`/api/token-metadata/${chainId}/${raw}`, { cache: "no-store" });
    const metadata = await metadataRes.json().catch(() => null);
    if (!metadataRes.ok) return null;
    return metadata;
  } catch {
    return null;
  }
}

function normalizeMetadataSocials(metadata: any): Partial<CampaignInfo> {
  const props = metadata?.properties || {};
  return {
    website: String(props.website || metadata?.website || "").trim(),
    xAccount: String(props.x || metadata?.xAccount || metadata?.xUrl || "").trim(),
    telegram: String(props.telegram || metadata?.telegram || "").trim(),
    discord: String(props.discord || metadata?.discord || "").trim(),
    extraLink: String(props.extraLink || props.extra_link || metadata?.extraLink || metadata?.extra_link || "").trim(),
  };
}

async function hydrateCampaignMetadata(campaign: CampaignInfo, chainId: number): Promise<CampaignInfo> {
  for (const address of [campaign.campaign, campaign.token]) {
    const metadata = await fetchRegisteredMetadata(chainId, address);
    if (!metadata) continue;
    const socials = normalizeMetadataSocials(metadata);
    const image = extractMetadataImage(metadata);
    return {
      ...campaign,
      logoURI: hasUsefulImage(campaign.logoURI) ? campaign.logoURI : image || campaign.logoURI,
      website: campaign.website || socials.website || "",
      xAccount: campaign.xAccount || socials.xAccount || "",
      telegram: campaign.telegram || socials.telegram || "",
      discord: campaign.discord || socials.discord || "",
      extraLink: campaign.extraLink || socials.extraLink || "",
    };
  }
  return campaign;
}

async function hydrateCampaignCreatedAtFromFactory(campaign: CampaignInfo, chainId: SupportedChainId): Promise<CampaignInfo> {
  if (campaign.createdAt && campaign.createdAt > 1_577_836_800) return campaign;
  const target = String(campaign.campaign || "").toLowerCase();
  if (!target) return campaign;

  let cursor = 0;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await fetchOnChainCampaignPage(chainId, { limit: 100, cursor });
    const found = page.campaigns.find((item) => String(item.campaign || "").toLowerCase() === target);
    if (found?.createdAt && found.createdAt > 1_577_836_800) {
      return {
        ...campaign,
        createdAt: found.createdAt,
        timeAgo: campaign.timeAgo || found.timeAgo,
      };
    }
    if (page.nextCursor == null) break;
    cursor = page.nextCursor;
  }

  return campaign;
}

async function resolveCampaignDisplayImage(campaign: CampaignInfo, chainId: number, fetchCampaignLogoURI: (campaignAddress: string) => Promise<string | null>): Promise<string | undefined> {
  const candidates = [campaign.logoURI, campaign.metadataURI].map((value) => String(value ?? "").trim()).filter(Boolean);

  for (const candidate of candidates) {
    if (isLikelyMetadataUri(candidate)) {
      const metadataImage = await fetchImageFromMetadataUri(candidate);
      if (hasUsefulImage(metadataImage)) return metadataImage;
      continue;
    }

    const resolved = resolveImageUri(candidate);
    if (hasUsefulImage(resolved)) return resolved;
  }

  for (const address of [campaign.campaign, campaign.token]) {
    const registeredImage = await fetchRegisteredImage(chainId, address);
    if (hasUsefulImage(registeredImage)) return registeredImage;
  }

  try {
    const contractLogo = String((await fetchCampaignLogoURI(campaign.campaign)) ?? "").trim();
    if (isLikelyMetadataUri(contractLogo)) {
      const metadataImage = await fetchImageFromMetadataUri(contractLogo);
      if (hasUsefulImage(metadataImage)) return metadataImage;
    }
    const resolved = resolveImageUri(contractLogo);
    if (hasUsefulImage(resolved)) return resolved;
  } catch {
    // Best-effort only.
  }

  return undefined;
}

async function safeContractRead<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const value = await read();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function buildCampaignFromAddress(
  campaignAddress: string,
  provider: ethers.AbstractProvider,
  chainId: number,
): Promise<CampaignInfo | null> {
  const campaignAddr = String(campaignAddress ?? "").trim().toLowerCase();
  if (!ethers.isAddress(campaignAddr)) return null;

  const campaign = new Contract(campaignAddr, CAMPAIGN_ABI, provider) as any;
  const tokenAddress = String(await safeContractRead(() => campaign.token(), "") || "").toLowerCase();
  if (!ethers.isAddress(tokenAddress)) return null;

  const token = new Contract(tokenAddress, TOKEN_ABI, provider) as any;
  const [name, symbol, creator, logo] = await Promise.all([
    safeContractRead(() => token.name(), "Unknown"),
    safeContractRead(() => token.symbol(), ""),
    safeContractRead(() => campaign.creator(), ""),
    safeContractRead(() => campaign.logoURI(), ""),
  ]);

  return {
    id: 0,
    campaign: campaignAddr,
    token: tokenAddress,
    creator: ethers.isAddress(String(creator)) ? String(creator).toLowerCase() : "",
    name: String(name || "Unknown"),
    symbol: String(symbol || ""),
    logoURI: resolveImageUri(String(logo || "")) || "/placeholder.svg",
    metadataURI: `/api/token-metadata/${chainId}/${tokenAddress}`,
    xAccount: "",
    website: "",
    extraLink: "",
  };
}

async function hydrateCampaignCreatorFromContract(
  campaign: CampaignInfo,
  provider: ethers.AbstractProvider,
): Promise<CampaignInfo> {
  const campaignAddress = String(campaign.campaign ?? "").trim();
  if (!ethers.isAddress(campaignAddress)) return campaign;

  try {
    const contract = new Contract(campaignAddress, CAMPAIGN_ABI, provider) as any;
    const creator = String(await safeContractRead(() => contract.creator(), "") || "").toLowerCase();
    if (ethers.isAddress(creator) && creator !== String(campaign.creator ?? "").toLowerCase()) {
      return { ...campaign, creator };
    }
  } catch {
    // Best-effort only. Keep API/indexer creator if contract read is unavailable.
  }

  return campaign;
}

// This is the UI table row shape (NOT the on-chain CurveTrade shape)
type TxRow = {
  id: string;
  time: string;
  type: "buy" | "sell";
  amount: string;
  bnb: string;
  price: string;
  mcap: string;
  maker: string;
  makerAddress: string;
  txHash: string;
};

function parseRawOrDecimalWei(value: unknown, kind: "ether" | "token"): bigint {
  if (typeof value === "bigint") return value;
  const raw = String(value ?? "0").trim();
  if (/^\d+$/.test(raw) && raw.length > (kind === "ether" ? 12 : 18)) {
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  try {
    return kind === "ether" ? ethers.parseEther(raw || "0") : ethers.parseUnits(raw || "0", TOKEN_DECIMALS);
  } catch {
    return 0n;
  }
}

function mergeCurveTradePoints(prev: CurveTradePoint[], next: CurveTradePoint[]) {
  return mergeTradePoints(prev, next);
}

function confirmedRowsToCurvePoints(rows: any[], campaignAddress: string): CurveTradePoint[] {
  const campaign = String(campaignAddress || "").toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const type = String(row?.side || row?.type || "").toLowerCase() === "sell" ? "sell" : "buy";
      const tokensWei = parseRawOrDecimalWei(row?.token_amount ?? row?.tokensWei ?? row?.tokens, "token");
      const nativeWei = parseRawOrDecimalWei(row?.bnb_amount ?? row?.nativeWei ?? row?.native, "ether");
      const tokens = Number(ethers.formatUnits(tokensWei, TOKEN_DECIMALS));
      const bnb = Number(ethers.formatEther(nativeWei));
      return {
        type,
        from: String(row?.wallet || row?.trader || row?.from || "").toLowerCase(),
        to: campaign,
        tokensWei,
        nativeWei,
        pricePerToken: tokens > 0 ? bnb / tokens : 0,
        timestamp: Number(row?.timestamp ?? row?.block_time ?? Math.floor(Date.now() / 1000)),
        txHash: String(row?.tx_hash || row?.txHash || "").toLowerCase(),
        blockNumber: Number(row?.block_number ?? row?.blockNumber ?? 0),
        logIndex: Number(row?.log_index ?? row?.logIndex ?? 0),
      } satisfies CurveTradePoint;
    })
    .filter((point) => /^0x[a-f0-9]{64}$/i.test(point.txHash) && point.tokensWei > 0n && point.nativeWei >= 0n);
}

function getExplorerBase(chainId?: number): string {
  const id = Number(chainId ?? 0);
  if (id === 56) return "https://bscscan.com";
  if (id === 97) return "https://testnet.bscscan.com";
  // Sensible default
  return "https://bscscan.com";
}

function shortenAddress(addr?: string | null): string {
  const a = String(addr ?? "").trim();
  if (!a) return "";
  if (a.length <= 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatTimeAgo(ts?: number | null): string {
  if (ts == null) return "—";
  const raw = Number(ts);
  if (!Number.isFinite(raw) || raw <= 0) return "—";

  // tolerate ms timestamps
  const seconds = raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw);
  if (seconds <= 1_577_836_800) return "—";
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSec - seconds);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function formatDeployedDate(ts?: number | null, fallback?: string | null): string {
  const raw = Number(ts ?? 0);
  const seconds = raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw);

  // Guard against bad indexer defaults like unix epoch / tiny placeholder timestamps.
  if (Number.isFinite(seconds) && seconds > 1_577_836_800) {
    const absolute = new Date(seconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const relative = formatTimeAgo(seconds);
    return relative && relative !== "—" ? `${absolute} · ${relative}` : absolute;
  }

  const timeAgo = String(fallback ?? "").trim();
  if (!timeAgo || /^295\d+w\s+ago$/i.test(timeAgo)) return "—";
  return timeAgo.includes("ago") ? timeAgo : `${timeAgo} ago`;
}

function normalizeSocialUrl(raw: string | null | undefined, kind: "x" | "telegram" | "discord" | "website" | "other"): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const cleaned = value.replace(/^@+/, "").replace(/^\/+/, "");
  if (kind === "x") return `https://x.com/${cleaned.replace(/^(twitter\.com|x\.com)\//i, "").split("/")[0]}`;
  if (kind === "telegram") return `https://t.me/${cleaned.replace(/^(t\.me|telegram\.me|telegram\.dog)\//i, "").split("/")[0]}`;
  if (kind === "discord") return cleaned.toLowerCase().includes("discord") ? `https://${cleaned}` : value;
  return `https://${cleaned}`;
}

function readStoredString<T extends string>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return (value as T) || fallback;
  } catch {
    return fallback;
  }
}

function readStoredStringArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : fallback;
  } catch {
    return fallback;
  }
}

const TokenDetails = () => {
  // URL param: /token/:campaignAddress is legacy-named, but accepts either:
  // - the ERC-20 token address (canonical public URL), or
  // - the LaunchCampaign address (legacy/backward-compatible URL).
  const { campaignAddress } = useParams<{ campaignAddress: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { toast } = useToast();
  const [tradeAmount, setTradeAmount] = useState("0");

  const [tradeInputDenom, setTradeInputDenom] = useState<"TOKEN" | "BNB">("TOKEN");
  const toggleTradeInputDenom = () => {
    setTradeAmount("0");
    setQuoteWei(null);
    setQuoteError(null);
    setTradeInputDenom((d) => (d === "TOKEN" ? "BNB" : "TOKEN"));
  };
  const [effectiveTokenWei, setEffectiveTokenWei] = useState<bigint>(0n);
  const [effectiveBnbWei, setEffectiveBnbWei] = useState<bigint>(0n);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const handleTradeTabChange = (value: string) => {
    setTradeTab(value as "buy" | "sell");
  };
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "5m" | "1h" | "4h" | "24h"
  >("24h");

  const [displayDenom, setDisplayDenom] = useState<"USD" | "BNB">(() => {
    try {
      const saved = localStorage.getItem("launchit:displayDenom");
      if (saved === "USD" || saved === "BNB") return saved;

      // Backward-compat: older builds stored this under a market-cap specific key.
      const legacy = localStorage.getItem("launchit:mcDenom");
      if (legacy === "USD" || legacy === "BNB") return legacy;

      return "USD";
    } catch {
      return "USD";
    }
  });
  const isMobile = window.innerWidth < 768;

  // Keep CTA styling consistent with TopBar (Create Coin / Connect Wallet)
  const topbarButtonClass =
    "bg-accent hover:bg-accent/90 text-accent-foreground font-retro text-xs md:text-sm px-3 md:px-4 py-2 rounded-xl shadow-lg";

  // Tabs that should visually read like the TopBar CTA buttons.
  const ctaTabsListClass = "grid w-full grid-cols-2 mb-3 bg-transparent p-0 h-auto gap-2";
  const ctaTabsTriggerClass =
    "rounded-xl border px-3 py-2 font-retro text-xs md:text-sm transition-colors " +
    "bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:bg-card/30 " +
    "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-accent/40 data-[state=active]:shadow-lg";

  useEffect(() => {
    try {
      localStorage.setItem("launchit:displayDenom", displayDenom);
    } catch {
      // ignore
    }
  }, [displayDenom]);

  // Launchpad hooks + state for the on-chain data
  const { fetchCampaigns, fetchCampaignLogoURI, fetchCampaignSummary, fetchCampaignMetrics, fetchCampaignActivity, buyTokens, sellTokens } = useLaunchpad();
  const wallet = useWallet();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  // Must be declared BEFORE chainIdForStorage — using campaignAddr in a prior const
  // caused TDZ: "Cannot access 'Q' before initialization" and crashed TokenDetails.
  const campaignAddr = useMemo(
    () => String(campaign?.campaign ?? campaignAddress ?? "").trim().toLowerCase(),
    [campaign?.campaign, campaignAddress],
  );
  // 0x token URLs must stay on BNB (56/97). Never inherit Solana 101 from feed switch.
  const chainIdForStorage = useMemo(
    () => getEvmChainIdForAddress(campaignAddress || campaignAddr, wallet.chainId),
    [campaignAddress, campaignAddr, wallet.chainId],
  );
  const readProvider = useMemo(() => getReadProvider(chainIdForStorage), [chainIdForStorage]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!wallet.account || !campaignAddr) {
          if (alive) setIsFollowing(false);
          return;
        }
        const v = await isFollowingCampaign(wallet.account, campaignAddr, chainIdForStorage);
        if (alive) setIsFollowing(!!v);
      } catch {
        if (alive) setIsFollowing(false);
      }
    })();
    return () => { alive = false; };
  }, [wallet.account, campaignAddr, chainIdForStorage]);

  const toggleFollow = async () => {
    if (!campaignAddr) return;
    if (!wallet.account) {
      toast({ title: "Connect wallet", description: "Connect your wallet to follow campaigns." });
      try { window.dispatchEvent(new CustomEvent("memebattles:openWalletModal")); } catch {}
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    try {
      if (next) await followCampaign(wallet.account, campaignAddr, chainIdForStorage);
      else await unfollowCampaign(wallet.account, campaignAddr, chainIdForStorage);
    } catch (e: any) {
      setIsFollowing(!next);
      toast({ title: "Follow failed", description: String(e?.message ?? e ?? "Unknown error") });
    } finally {
      setFollowBusy(false);
    }
  };
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [activity, setActivity] = useState<CampaignActivity | null>(null);
  const [confirmedCurvePoints, setConfirmedCurvePoints] = useState<CurveTradePoint[]>([]);
  const [activityTab, setActivityTab] = useState<"overview" | "comments" | "trades">(() => readStoredString("mwz:token:workspace-tab", "overview"));
  const [communityTab, setCommunityTab] = useState<"comments" | "updates">(() => {
    const stored = readStoredString("mwz:token:community-tab", "comments" as "comments" | "updates" | "chat");
    return stored === "updates" ? "updates" : "comments";
  });
  const [intelSections, setIntelSections] = useState<string[]>(() => readStoredStringArray("mwz:token:intel-sections", ["campaign", "flywheel", "holders"]));
  const [curveReserveWei, setCurveReserveWei] = useState<bigint | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("mwz:token:workspace-tab", activityTab);
    } catch {
      // ignore
    }
  }, [activityTab]);

  useEffect(() => {
    try {
      localStorage.setItem("mwz:token:community-tab", communityTab);
    } catch {
      // ignore
    }
  }, [communityTab]);

  useEffect(() => {
    try {
      localStorage.setItem("mwz:token:intel-sections", JSON.stringify(intelSections));
    } catch {
      // ignore
    }
  }, [intelSections]);

  // UI rows for the transactions table
  const [txs, setTxs] = useState<TxRow[]>([]);

  // Maker profiles for the Trades tab (best-effort; cached per address)
  const [makerProfiles, setMakerProfiles] = useState<Record<string, UserProfile | null>>({});

  // Creator profile (best-effort; used in the header)
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trading (quote + balances)
  const [quoteWei, setQuoteWei] = useState<bigint | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tradePending, setTradePending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [bnbBalanceWei, setBnbBalanceWei] = useState<bigint | null>(null);
  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint | null>(null);
  const [marketResolution, setMarketResolution] = useState<MarketResolution>("1m");
  const [topazSlippageBps, setTopazSlippageBps] = useState(100);
  /** Local Topaz fills so chart/trades update immediately after wallet confirmation. */
  const [localTopazTrades, setLocalTopazTrades] = useState<CurveTradePoint[]>([]);

  // Fetch maker profiles for displayed trades (best-effort; do not block UI).
  // Use a ref so re-renders/tx list churn cannot re-request the same addresses forever
  // (Topaz Swap "sender" is often the router, which previously stormed /api/profile).
  const makerProfileKnownRef = useRef(new Set<string>());

  // Fetch creator profile (best-effort; do not block UI)
  useEffect(() => {
    const creator = String(campaign?.creator ?? "").trim();
    if (!creator) {
      setCreatorProfile(null);
      return;
    }

    const chainIdNum = Number(wallet.chainId ?? 97);
    let cancelled = false;

    (async () => {
      try {
        const p = await fetchUserProfile(chainIdNum, creator);
        if (cancelled) return;
        setCreatorProfile(p);
      } catch {
        if (cancelled) return;
        setCreatorProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaign?.creator, wallet.chainId]);

  // Load campaign + metrics based on :campaignAddress (preferred).
  // Backward-compatible fallback: if param is not a 0x address, treat it as symbol.
  useEffect(() => {
    const load = async () => {
      if (!campaignAddress) return;

      try {
        setLoading(true);
        setError(null);

        const campaigns = await fetchCampaigns().catch((campaignError) => {
          console.warn("[TokenDetails] campaign feed failed; trying direct campaign load", campaignError);
          return [] as CampaignInfo[];
        });

        const param = campaignAddress.trim();
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(param);
        const lifecycleDrafts = isAddress
          ? await fetchPublicCampaignLifecycleDrafts({ chainId: chainIdForStorage, limit: 500 }).catch(() => [])
          : [];
        const lifecycleDraft = isAddress
          ? lifecycleDrafts.find((item) => {
              const needle = param.toLowerCase();
              return String(item.campaignAddress || "").toLowerCase() === needle
                || String(item.tokenAddress || "").toLowerCase() === needle;
            })
          : null;

        let match = isAddress
          ? campaigns.find((c) => {
              const needle = param.toLowerCase();
              return (
                (c.campaign ?? "").toLowerCase() === needle ||
                (c.token ?? "").toLowerCase() === needle
              );
            })
          : campaigns.find((c) => (c.symbol ?? "").toLowerCase() === param.toLowerCase());

        if (!match && isAddress) {
          // param may be the public ERC-20 token address. Prefer lifecycle campaign,
          // then reverse-resolve token→campaign via indexer, then treat param as campaign.
          let directCampaignAddress = String(lifecycleDraft?.campaignAddress || "").trim();
          if (!ethers.isAddress(directCampaignAddress)) {
            try {
              const { resolveMarketIdentity } = await import("@/lib/marketIdentity");
              const identity = await resolveMarketIdentity({
                address: param,
                chainId: chainIdForStorage,
              });
              if (identity?.campaignAddress) {
                directCampaignAddress = identity.campaignAddress;
              }
            } catch {
              // fall through
            }
          }
          if (!ethers.isAddress(directCampaignAddress)) {
            directCampaignAddress = param;
          }
          match = await buildCampaignFromAddress(directCampaignAddress, readProvider, chainIdForStorage);
        }

        if (!match) {
          setError(campaigns.length === 0 && !isAddress ? "No token data" : "Token not found");
          setCampaign(null);
          setMetrics(null);
          setSummary(null);
          return;
        }

const lifecycleCampaignAddress = String(
  lifecycleDraft?.campaignAddress || (lifecycleDraft as any)?.campaign_address || "",
).trim().toLowerCase();
const lifecycleTokenAddress = String(
  lifecycleDraft?.tokenAddress || (lifecycleDraft as any)?.token_address || "",
).trim().toLowerCase();

if (ethers.isAddress(lifecycleCampaignAddress)) {
  match = {
    ...match,
    campaign: lifecycleCampaignAddress,
    token: ethers.isAddress(lifecycleTokenAddress) ? lifecycleTokenAddress : match.token,
  };
}

let displayMatch = match;
displayMatch = await hydrateCampaignCreatorFromContract(displayMatch, readProvider);
displayMatch = await hydrateCampaignMetadata(displayMatch, chainIdForStorage);
displayMatch = await hydrateCampaignCreatedAtFromFactory(displayMatch, chainIdForStorage);
try {
  const displayImage = await resolveCampaignDisplayImage(displayMatch, chainIdForStorage, fetchCampaignLogoURI);
  if (hasUsefulImage(displayImage)) {
    displayMatch = { ...displayMatch, logoURI: displayImage };
  }
} catch {
  // Best-effort image hydration; keep rendering the token page.
}

setCampaign(displayMatch);

const canonicalTokenAddress = String(displayMatch.token ?? "").trim().toLowerCase();
if (isAddress && ethers.isAddress(canonicalTokenAddress) && param.toLowerCase() !== canonicalTokenAddress) {
  navigate(`/token/${canonicalTokenAddress}${location.search || ""}`, { replace: true });
}

// Unified token stats + metrics are best-effort. The page should still render
// from Railway/realtime data when public RPC reads fail.
try {
  const s = await fetchCampaignSummary(displayMatch);
  setSummary(s);
  setMetrics(s.metrics ?? null);
} catch (summaryErr) {
  console.warn(
    "[TokenDetails] summary fetch failed; rendering with campaign + realtime data",
    summaryErr,
  );

  setSummary({
    campaign: displayMatch,
    metrics: null,
    stats: {
      holders: "—",
      volume: "—",
      marketCap: "—",
    },
  });
  setMetrics(null);
}
      } catch (err) {
        console.error(err);
        setError("Failed to load token data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [campaignAddress, chainIdForStorage, fetchCampaignLogoURI, fetchCampaigns, fetchCampaignSummary, location.search, navigate, readProvider]);

  const formatPriceFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatUnits(wei, 18);
      const n = Number(raw);
      if (!Number.isFinite(n)) return `${raw} BNB`;
      const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
      return `${pretty} BNB`;
    } catch {
      return "—";
    }
  };

  const formatBnbFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      if (wei === 0n) return "0 BNB";
      const raw = ethers.formatEther(wei);
      const n = Number(raw);
      if (!Number.isFinite(n)) return `${raw} BNB`;
      if (n > 0 && n < 1e-12) return "<0.000000000001 BNB";
      if (n >= 1) return `${n.toFixed(2)} BNB`;
      if (n >= 0.01) return `${n.toFixed(4)} BNB`;

      const fraction = raw.split(".")[1] || "";
      const firstNonZero = fraction.search(/[1-9]/);
      const decimals = Math.min(12, Math.max(6, (firstNonZero >= 0 ? firstNonZero : 5) + 4));
      const pretty = n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
      return `${pretty} BNB`;
    } catch {
      return "—";
    }
  };

  const formatTokenFromWei = (wei?: bigint | null): string => {
    if (wei == null) return "—";
    try {
      const raw = ethers.formatUnits(wei, TOKEN_DECIMALS);
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      const pretty = n >= 1 ? n.toFixed(4) : n >= 0.01 ? n.toFixed(6) : n.toFixed(8);
      return pretty;
    } catch {
      return "—";
    }
  };
  const parseBnbLabel = (input?: string | null): number | null => {
    if (!input) return null;
    const s = String(input).trim();
    if (!s || s === "—") return null;

    // Accept forms like:
    //  - "0.1234 BNB"
    //  - "1.23k BNB"
    //  - "1.23k"
    //  - "0.000123"
    
    // IMPORTANT: avoid treating the leading "B" in "BNB" as a suffix.

    const token = s.split(/\s+/)[0] ?? "";

    const m = token.match(/^(-?\d+(?:\.\d+)?)([kKmMbBtT])?$/);
    if (!m) return null;
    const num = Number(m[1]);
    if (!Number.isFinite(num)) return null;

    const suf = (m[2] ?? "").toLowerCase();
    const mult = suf === "k" ? 1e3 : suf === "m" ? 1e6 : suf === "b" ? 1e9 : suf === "t" ? 1e12 : 1;
    return num * mult;
  };

  const formatCompactUsd = (usd: number): string => {
    if (!Number.isFinite(usd)) return "—";
    const abs = Math.abs(usd);

    const fmt = (v: number, suffix: string) => {
      const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return `$${v.toFixed(decimals)}${suffix}`;
    };

    if (abs >= 1e12) return fmt(usd / 1e12, "T");
    if (abs >= 1e9) return fmt(usd / 1e9, "B");
    if (abs >= 1e6) return fmt(usd / 1e6, "M");
    if (abs >= 1e3) return fmt(usd / 1e3, "K");

    // Small values: show up to 2 decimals
    const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    return `$${usd.toFixed(decimals)}`;
  };



  const parseTokenAmountWei = (value: string): bigint => {
    const v = (value ?? "").trim();
    if (!v || v === "." || v === "-") return 0n;
    // Only allow digits + a single decimal separator
    const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
    try {
      return ethers.parseUnits(normalized || "0", TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  };


  const parseBnbAmountWei = (value: string): bigint => {
    const v = (value ?? "").trim();
    if (!v || v === "." || v === "-") return 0n;
    const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
    try {
      return ethers.parseEther(normalized || "0");
    } catch {
      return 0n;
    }
  };

  const formatPriceBnb = (p?: number | null): string => {
    if (p == null || !Number.isFinite(p)) return "—";
    const pretty =
      p >= 1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(6) : p.toFixed(8);
    return `${pretty} BNB`;
  };

  // Format a BNB amount (number) consistently across the UI.
  const formatBnb = (n?: number | null): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
    return `${pretty} BNB`;
  };

  const shorten = (addr?: string): string => {
    if (!addr) return "—";
    return addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;
  };

  const formatCompact = (n: number): string => {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}t`;
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}m`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
    if (abs >= 1) return n.toFixed(2);
    if (abs >= 0.01) return n.toFixed(4);
    if (abs >= 0.0001) return n.toFixed(6);
    return n.toFixed(8);
  };

  const formatAgo = (timestampSecs?: number): string => {
    if (!timestampSecs) return "";
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestampSecs);
    if (diff < 60) return "now";
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  };

  // Read curve trades for transactions + analytics (live mode)
  // Hook returns CurveTrade[] (your "@/types/token" Transaction type)
const resolvedCampaignAddress = useMemo(() => {
  const value = String(campaign?.campaign || campaignAddr || "").trim().toLowerCase();
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value : "";
}, [campaign?.campaign, campaignAddr]);

const hasValidCampaignAddress = Boolean(resolvedCampaignAddress);

const { points: liveCurvePoints, loading: liveCurveLoading, error: liveCurveError } = useCurveTrades(
  hasValidCampaignAddress ? resolvedCampaignAddress : undefined,
  {
    chainId: chainIdForStorage,
    enabled: hasValidCampaignAddress,
  },
);
  const liveCurvePointsSafe = useMemo<CurveTradePoint[]>(
    () => (Array.isArray(liveCurvePoints) ? liveCurvePoints : []),
    [liveCurvePoints],
  );
  const combinedCurvePointsSafe = useMemo<CurveTradePoint[]>(
    () => mergeCurveTradePoints(liveCurvePointsSafe, confirmedCurvePoints),
    [confirmedCurvePoints, liveCurvePointsSafe],
  );

  useEffect(() => {
    setConfirmedCurvePoints([]);
  }, [resolvedCampaignAddress]);

  useEffect(() => {
    if (!hasValidCampaignAddress) return;
    const onConfirmed = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const kind = String(detail?.kind || "").toLowerCase();
      const confirmedCampaign = String(detail?.campaignAddress || "").toLowerCase();
      if ((kind !== "buy" && kind !== "sell") || confirmedCampaign !== resolvedCampaignAddress) return;

      const points = confirmedRowsToCurvePoints(detail?.trades || [], resolvedCampaignAddress);
      if (!points.length) return;

      setConfirmedCurvePoints((prev) => mergeCurveTradePoints(prev, points));
      setActivity((prev) => {
        let buyers = prev?.buyers ?? 0;
        let sellers = prev?.sellers ?? 0;
        let buyVolumeWei = prev?.buyVolumeWei ?? 0n;
        let sellVolumeWei = prev?.sellVolumeWei ?? 0n;
        const buyerSet = new Set<string>();
        const sellerSet = new Set<string>();

        for (const point of points) {
          if (point.type === "sell") {
            if (point.from) sellerSet.add(point.from);
            sellVolumeWei += point.nativeWei;
          } else {
            if (point.from) buyerSet.add(point.from);
            buyVolumeWei += point.nativeWei;
          }
        }

        buyers += buyerSet.size;
        sellers += sellerSet.size;
        return {
          buyers,
          sellers,
          buyVolumeWei,
          sellVolumeWei,
          fromBlock: prev?.fromBlock ?? points[0]?.blockNumber ?? 0,
          toBlock: Math.max(prev?.toBlock ?? 0, ...points.map((point) => point.blockNumber || 0)),
        };
      });
    };

    window.addEventListener("memebattles:txConfirmed", onConfirmed as EventListener);
    return () => window.removeEventListener("memebattles:txConfirmed", onConfirmed as EventListener);
  }, [hasValidCampaignAddress, resolvedCampaignAddress]);

  // Prevent chart flicker: keep last non-empty curve points while the live hook briefly refreshes/resets.
  const lastCurvePointsRef = useRef<CurveTradePoint[]>([]);
  useEffect(() => {
    if (combinedCurvePointsSafe.length) lastCurvePointsRef.current = combinedCurvePointsSafe;
  }, [combinedCurvePointsSafe]);

  const curvePointsForUi: CurveTradePoint[] = useMemo(() => {
    return combinedCurvePointsSafe.length ? combinedCurvePointsSafe : lastCurvePointsRef.current;
  }, [combinedCurvePointsSafe]);

  // Restore/persist local Topaz fills + server-reported Topaz trades (wallet receipts).
  useEffect(() => {
    if (!resolvedCampaignAddress) {
      setLocalTopazTrades([]);
      return;
    }
    const cached = loadLocalTopazTrades(chainIdForStorage, resolvedCampaignAddress);
    setLocalTopazTrades(cached);

    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchTopazTradeReports({
          chainId: chainIdForStorage,
          campaignAddress: resolvedCampaignAddress,
          limit: 100,
        });
        if (cancelled || !remote.length) return;
        setLocalTopazTrades((prev) => {
          const merged = mergeTradePoints(prev, remote);
          saveLocalTopazTrades(chainIdForStorage, resolvedCampaignAddress, merged);
          return merged;
        });
      } catch {
        // Server reports are optional until Railway frontend has the route + DB.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedCampaignAddress, chainIdForStorage]);

  useEffect(() => {
    if (!resolvedCampaignAddress) return;
    saveLocalTopazTrades(chainIdForStorage, resolvedCampaignAddress, localTopazTrades);
  }, [localTopazTrades, resolvedCampaignAddress, chainIdForStorage]);

  const unifiedMarket = useUnifiedMarket({
    campaignAddress: hasValidCampaignAddress ? resolvedCampaignAddress : undefined,
    chainId: chainIdForStorage,
    resolution: marketResolution,
    enabled: hasValidCampaignAddress,
  });

  // Early graduation flag so Topaz market data can load before the full stage UI block.
  const contractGraduatedEarly = useMemo(() => {
    const hasLaunchFlag = (metrics as any)?.launched !== undefined || (metrics as any)?.finalizedAt !== undefined;
    return hasLaunchFlag
      ? Boolean((metrics as any)?.launched) ||
          (typeof (metrics as any)?.finalizedAt === "bigint"
            ? (metrics as any).finalizedAt > 0n
            : Number((metrics as any)?.finalizedAt ?? 0) > 0)
      : Boolean(metrics && metrics.curveSupply > 0n && metrics.sold >= metrics.curveSupply);
  }, [metrics]);

  // Topaz pair scan only after graduation. Running it on pure bonding campaigns
  // can resolve a wrong/empty route and poison price/mcap/chart streams.
  const topazMarket = useTopazMarket({
    campaignAddress: hasValidCampaignAddress ? resolvedCampaignAddress : undefined,
    tokenAddress: campaign?.token,
    chainId: chainIdForStorage,
    enabled: hasValidCampaignAddress && contractGraduatedEarly,
    pollMs: 45_000,
  });

  // Maker profiles after topazMarket exists so we can skip protocol/router senders.
  useEffect(() => {
    const chainIdNum = Number(wallet.chainId ?? chainIdForStorage ?? 97);
    if (!txs.length) return;

    const protocolSkip = new Set(
      [
        campaign?.campaign,
        campaign?.token,
        topazMarket.routerAddress,
        topazMarket.pairAddress,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000001",
        // Known Topaz production router / adapter / route authority on testnet.
        "0xe559d93643631e9e8cc7d10adfa581be4b5399c8",
        "0xc49895ee36ad19aa5cb1405761f6272ad7be6357",
        "0xb989a99823ea96552c3e3198a40cdbf682edf1aa",
      ]
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean),
    );

    const uniq = Array.from(
      new Set(
        txs
          .map((t) => (t.makerAddress ? String(t.makerAddress).toLowerCase() : ""))
          .filter((addr) => addr && !protocolSkip.has(addr) && !makerProfileKnownRef.current.has(addr)),
      ),
    ).slice(0, 6);

    if (!uniq.length) return;

    let cancelled = false;
    (async () => {
      for (const addr of uniq) {
        if (cancelled) return;
        makerProfileKnownRef.current.add(addr);
        try {
          const p = await fetchUserProfile(chainIdNum, addr);
          if (cancelled) return;
          setMakerProfiles((prev) => ({ ...prev, [addr]: p }));
        } catch {
          if (cancelled) return;
          setMakerProfiles((prev) => ({ ...prev, [addr]: null }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    txs,
    wallet.chainId,
    chainIdForStorage,
    campaign?.campaign,
    campaign?.token,
    topazMarket.routerAddress,
    topazMarket.pairAddress,
  ]);

  // Continuous market trade stream.
  // Bonding: curve trades (+ confirmed fills) only — do not mix Topaz/unified DEX rows
  // or circulating mcap / price change tiles go wildly wrong.
  // Graduated: bonding history + Topaz scan + wallet reports + unified market API.
  const marketTradePoints: CurveTradePoint[] = useMemo(() => {
    if (!contractGraduatedEarly) {
      return mergeTradePoints(curvePointsForUi);
    }
    const unifiedAsPoints: CurveTradePoint[] = (unifiedMarket.trades || []).map((trade) => {
      let tokensWei = 0n;
      let nativeWei = 0n;
      try {
        tokensWei = BigInt(trade.tokenAmountRaw || "0");
      } catch {
        tokensWei = 0n;
      }
      try {
        nativeWei = BigInt(trade.nativeAmountRaw || "0");
      } catch {
        nativeWei = 0n;
      }
      return {
        type: trade.side,
        from: trade.wallet,
        to: trade.recipient || trade.wallet,
        tokensWei,
        nativeWei,
        pricePerToken: Number(trade.priceBnb || 0),
        timestamp: Math.floor(new Date(trade.blockTime).getTime() / 1000),
        txHash: trade.txHash,
        blockNumber: trade.blockNumber,
        logIndex: trade.logIndex,
      };
    });
    return mergeTradePoints(curvePointsForUi, topazMarket.trades, localTopazTrades, unifiedAsPoints);
  }, [contractGraduatedEarly, curvePointsForUi, topazMarket.trades, localTopazTrades, unifiedMarket.trades]);

  // Realtime stats from Railway (price/marketcap/24h vol), patched via Ably.
const { stats: rtStats } = useTokenStatsRealtime(
  hasValidCampaignAddress ? resolvedCampaignAddress : undefined,
  chainIdForStorage,
  hasValidCampaignAddress,
);
const toSeconds = (ts: number): number => {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  // If it looks like milliseconds, convert to seconds.
  return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
};
  type TimeframeKey = "5m" | "1h" | "4h" | "24h";
  const timeframeTiles = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const windows: Record<TimeframeKey, number> = {
      "5m": 5 * 60,
      "1h": 60 * 60,
      "4h": 4 * 60 * 60,
      "24h": 24 * 60 * 60,
    };

    // End price: Topaz spot (post-grad) → realtime → curve price → latest trade.
    const endPrice =
      (contractGraduatedEarly && topazMarket.priceBnb != null ? Number(topazMarket.priceBnb) : undefined) ??
      (rtStats?.lastPriceBnb != null ? Number(rtStats.lastPriceBnb) : undefined) ??
      (metrics?.currentPrice ? Number(ethers.formatUnits(metrics.currentPrice, 18)) : undefined);

    // Continuous stream: bonding + Topaz swap history for change/volume windows.
    const points: Array<{ timestamp: number; pricePerToken: number; nativeWei?: bigint }> =
  marketTradePoints.map((p: any) => ({
    timestamp: Number(p.timestamp ?? 0),
    pricePerToken: typeof p.pricePerToken === "number" ? p.pricePerToken : Number(p.pricePerToken ?? 0),
    nativeWei: p.nativeWei,
  }));

    if (!points.length && endPrice == null) {
      return {
        "5m": { change: null as number | null, volume: "—" },
        "1h": { change: null as number | null, volume: "—" },
        "4h": { change: null as number | null, volume: "—" },
        "24h": { change: null as number | null, volume: "—" },
      };
    }

    const tsOf = (t: number) => (t > 1e11 ? Math.floor(t / 1000) : t); // tolerate ms timestamps
    const sorted = [...points].sort((a, b) => tsOf(a.timestamp) - tsOf(b.timestamp));
    const latestTradePrice = sorted[sorted.length - 1]?.pricePerToken;
    const end = endPrice ?? latestTradePrice ?? 0;

    const out: Record<TimeframeKey, { change: number | null; volume: string }> = {
      "5m": { change: null, volume: "—" },
      "1h": { change: null, volume: "—" },
      "4h": { change: null, volume: "—" },
      "24h": { change: null, volume: "—" },
    };

    for (const k of Object.keys(windows) as TimeframeKey[]) {
      const startTs = now - windows[k];

      // Start price: last trade at/before the window start, else first trade in the window.
      const before = [...sorted].reverse().find((p) => tsOf(p.timestamp) <= startTs);
      const within = sorted.find((p) => tsOf(p.timestamp) >= startTs);
      const startPrice = (before ?? within)?.pricePerToken;

      const volumeWei = sorted
        .filter((p) => tsOf(p.timestamp) >= startTs)
        .reduce((acc, p) => acc + (p.nativeWei ?? 0n), 0n);

      const start = startPrice ?? end;
      if (start > 0 && end > 0) {
        const pct = ((end - start) / start) * 100;
        out[k].change = Number.isFinite(pct) ? Number(pct.toFixed(2)) : null;
      } else {
        out[k].change = null;
      }

      out[k].volume = points.length ? formatBnbFromWei(volumeWei) : "—";
    }

    return out;
  }, [combinedCurvePointsSafe, contractGraduatedEarly, marketTradePoints, metrics, rtStats?.lastPriceBnb, topazMarket.priceBnb]);

  // Token view-model used throughout the page
  const tokenData = useMemo(() => {
    const ticker = campaign?.symbol ?? "";
    const name = campaign?.name ?? "Token";
    const stats = summary?.stats;

    const rtMarketCap = rtStats?.marketcapBnb;
    const rtPrice = rtStats?.lastPriceBnb;
    const topazPrice = contractGraduatedEarly ? topazMarket.priceBnb : null;
    const topazMarketCap = contractGraduatedEarly ? topazMarket.marketCapBnb : null;
    const topazLiquidity = contractGraduatedEarly ? topazMarket.liquidityBnb : null;
    const window24h = timeframeTiles?.["24h"]?.volume;

    // Bonding source of truth = on-chain curve (sold * currentPrice), not Ably/rt
    // market_stats which can drift after Topaz-oriented indexer changes.
    let bondingMcapLabel: string | null = null;
    if (!contractGraduatedEarly && metrics?.currentPrice != null && metrics?.sold != null) {
      try {
        const mcWei = (metrics.currentPrice * metrics.sold) / 10n ** 18n;
        bondingMcapLabel = formatBnbFromWei(mcWei);
      } catch {
        bondingMcapLabel = null;
      }
    }
    const statsMcap =
      stats?.marketCap && stats.marketCap !== "—" && stats.marketCap !== "-"
        ? stats.marketCap
        : null;

    return {
      image: resolveImageUri(campaign?.logoURI) || "/placeholder.svg",
      ticker,
      name,
      hasWebsite: Boolean(campaign?.website && campaign.website.length > 0),
      hasTwitter: Boolean(campaign?.xAccount && campaign.xAccount.length > 0),
      hasTelegram: Boolean(campaign?.telegram && campaign.telegram.length > 0),
      hasDiscord: Boolean(campaign?.discord && campaign.discord.length > 0),
      hasOtherLink: Boolean(campaign?.extraLink && campaign.extraLink.length > 0),

      // Graduated: Topaz spot. Bonding: on-chain mcap first, then summary, then realtime.
      marketCap:
        topazMarketCap != null && Number.isFinite(topazMarketCap) && topazMarketCap > 0
          ? `${formatCompact(topazMarketCap)} BNB`
          : !contractGraduatedEarly && bondingMcapLabel
            ? bondingMcapLabel
            : statsMcap
              ? statsMcap
              : rtMarketCap != null && Number.isFinite(rtMarketCap)
                ? `${formatCompact(rtMarketCap)} BNB`
                : "—",
      volume: window24h && window24h !== "—" ? window24h : stats?.volume ?? "—",
      holders: stats?.holders ?? "—",
      price:
        topazPrice != null && Number.isFinite(topazPrice) && topazPrice > 0
          ? formatPriceBnb(topazPrice)
          : !contractGraduatedEarly && metrics?.currentPrice != null
            ? formatPriceFromWei(metrics.currentPrice)
            : rtPrice != null && Number.isFinite(rtPrice)
              ? formatPriceBnb(rtPrice)
              : formatPriceFromWei(metrics?.currentPrice ?? null),
      liquidity:
        topazLiquidity != null && Number.isFinite(topazLiquidity) && topazLiquidity > 0
          ? `${formatCompact(topazLiquidity)} BNB`
          : formatBnbFromWei(curveReserveWei),

      // Timeframe analytics (BNB volume + price change)
      metrics: timeframeTiles,
    };
  }, [campaign, contractGraduatedEarly, curveReserveWei, metrics, summary, timeframeTiles, rtStats, topazMarket.liquidityBnb, topazMarket.marketCapBnb, topazMarket.priceBnb]);
  // Keep USD reference price available for UI conversions and ATH tracking.
  // (Cached + throttled inside the hook.)
  const { price: bnbUsdPrice, loading: bnbUsdLoading } = useBnbUsdPrice(true);

// Normalize in case the hook returns a scaled value (e.g., 1e18-based).
const bnbUsd = useMemo(() => {
  if (bnbUsdPrice == null) return null;
  const n = Number(bnbUsdPrice);
  if (!Number.isFinite(n) || n <= 0) return null;

  // BNB price in USD should never be anywhere near 100k+. If it is, it's almost certainly scaled.
  if (n > 100_000) return n / 1e18;

  return n;
}, [bnbUsdPrice]);

  const marketCapDisplay = useMemo(() => {
    const bnbLabel = tokenData.marketCap;

    if (displayDenom === "BNB") return bnbLabel;

    // Prefer the same BNB figure already chosen for tokenData (on-chain for bonding).
    const mcBnb =
      parseBnbLabel(bnbLabel) ??
      (rtStats?.marketcapBnb != null && Number.isFinite(rtStats.marketcapBnb)
        ? Number(rtStats.marketcapBnb)
        : null);
    if (mcBnb == null) return "—";

    if (!bnbUsd) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(mcBnb * bnbUsd);
  }, [displayDenom, tokenData.marketCap, rtStats?.marketcapBnb, bnbUsd, bnbUsdLoading]);

  // Always-USD market cap label for ATH tracking (independent of the denomination toggle).
  const marketCapUsdLabel = useMemo(() => {
    const mcBnb =
      parseBnbLabel(tokenData.marketCap) ??
      (rtStats?.marketcapBnb != null && Number.isFinite(rtStats.marketcapBnb)
        ? Number(rtStats.marketcapBnb)
        : null);
    if (mcBnb == null) return null;
    if (!bnbUsd) return null;
    const usd = mcBnb * bnbUsd;
    return Number.isFinite(usd) && usd > 0 ? formatCompactUsd(usd) : null;
  }, [tokenData.marketCap, rtStats?.marketcapBnb, bnbUsd]);

  const priceDisplay = useMemo(() => {
    const bnbLabel = tokenData.price;

    if (displayDenom === "BNB") return bnbLabel;

    const priceBnb = parseBnbLabel(bnbLabel);
    if (priceBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(priceBnb * bnbUsdPrice);
  }, [displayDenom, tokenData.price, bnbUsdPrice, bnbUsdLoading]);

  const volumeDisplay = useMemo(() => {
    const bnbLabel = tokenData.metrics[selectedTimeframe]?.volume ?? "—";

    if (displayDenom === "BNB") return bnbLabel;

    const volBnb = parseBnbLabel(bnbLabel);
    if (volBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(volBnb * bnbUsdPrice);
  }, [displayDenom, tokenData.metrics, selectedTimeframe, bnbUsdPrice, bnbUsdLoading]);

  const formatBnbOrUsd = useMemo(() => {
    return (bnb: number | null | undefined): string => {
      if (bnb == null || !Number.isFinite(bnb)) return "—";
      if (displayDenom === "BNB") return `${formatCompact(bnb)} BNB`;
      if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";
      return formatCompactUsd(bnb * bnbUsdPrice);
    };
  }, [displayDenom, bnbUsdPrice, bnbUsdLoading]);

  const flywheel = useMemo(() => {
    const buyVolBnb = activity ? Number(ethers.formatEther(activity.buyVolumeWei)) : null;
    const sellVolBnb = activity ? Number(ethers.formatEther(activity.sellVolumeWei)) : null;
    const netFlowBnb = buyVolBnb != null && sellVolBnb != null ? buyVolBnb - sellVolBnb : null;

    const feeBps = metrics ? Number(metrics.protocolFeeBps) : 0;
    const feesBnb = buyVolBnb != null && sellVolBnb != null ? (buyVolBnb + sellVolBnb) * (feeBps / 10000) : null;

    return {
      buyVolume: formatBnbOrUsd(buyVolBnb),
      sellVolume: formatBnbOrUsd(sellVolBnb),
      netFlow: formatBnbOrUsd(netFlowBnb),
      feesEstimated: formatBnbOrUsd(feesBnb),
      buyers: activity ? String(activity.buyers) : "—",
      feeRate: metrics ? `${(Number(metrics.protocolFeeBps) / 100).toFixed(2)}%` : "—",
      lpRate: metrics ? `${(Number(metrics.liquidityBps) / 100).toFixed(2)}%` : "—",
    };
  }, [activity, metrics, formatBnbOrUsd]);

  const holderDistribution = useMemo(() => {
    const shortAddr = (a: string) =>
      a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

    // Estimated balances derived from bonding curve trades only (no transfers).
    // NOTE: This is a best-effort view and does not include transfers.
    const balances = new Map<string, bigint>();

    for (const p of combinedCurvePointsSafe) {
      const addr = (p.from || "").toLowerCase();
      if (!addr) continue;

      const prev = balances.get(addr) ?? 0n;
      const delta = p.tokensWei ?? 0n; // tokensWei
      const isBuy = (p.type ?? "buy") === "buy"; // type
      balances.set(addr, isBuy ? prev + delta : prev - delta);
    }

    const holders = [...balances.entries()]
      .filter(([, bal]) => bal > 0n)
      .map(([address, bal]) => ({ address, bal }))
      .sort((a, b) => (a.bal === b.bal ? 0 : a.bal > b.bal ? -1 : 1));

    const holdersBal = holders.reduce((acc, x) => acc + x.bal, 0n);

    // Reserved token allocation intended for the LP at graduation.
    const lpBal = metrics?.liquiditySupply ?? 0n;

    const totalBal = holdersBal + lpBal;

    const pct = (bal: bigint) => (totalBal > 0n ? Number((bal * 10000n) / totalBal) / 100 : 0);

    const topUsers = holders.slice(0, 6).map((h) => ({
      address: h.address,
      label: shortAddr(h.address),
      pct: pct(h.bal),
      isLp: false as const,
    }));

    const othersBal = holders.slice(6).reduce((acc, x) => acc + x.bal, 0n);

    const top = [
      ...(lpBal > 0n
        ? [
            {
              address: "liquidity-pool",
              label: metrics?.launched || (metrics?.finalizedAt ?? 0n) > 0n ? "Liquidity pool" : "Reserved liquidity",
              pct: pct(lpBal),
              isLp: true as const,
            },
          ]
        : []),
      ...topUsers,
    ];

    return {
      top,
      othersPct: pct(othersBal),
      totalHolders: holders.length,
      hasLp: lpBal > 0n,
    };
  }, [combinedCurvePointsSafe, metrics?.liquiditySupply, metrics?.launched, metrics?.finalizedAt]);


  // Reserve / "liquidity" shown on the page: BNB held by the campaign contract (pre-graduation)
  useEffect(() => {
    let cancelled = false;

    const loadReserve = async () => {
      try {
        if (!campaign?.campaign) {
          setCurveReserveWei(null);
          return;
        }
        const bal = await readProvider.getBalance(campaign.campaign);
        if (!cancelled) setCurveReserveWei(bal);
      } catch (e) {
        console.warn("[TokenDetails] Failed to load campaign reserve", e);
        if (!cancelled) setCurveReserveWei(null);
      }
    };

    loadReserve();
    return () => {
      cancelled = true;
    };
  }, [readProvider, campaign?.campaign]);

  // Campaign activity counters (buy/sell volume, buyers). Used for Flywheel and related panels.
  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      try {
        if (!campaign?.campaign) {
          setActivity(null);
          return;
        }
        const a = await fetchCampaignActivity(campaign.campaign);
        if (!cancelled) setActivity(a);
      } catch (e) {
        console.warn("[TokenDetails] Failed to load campaign activity", e);
        if (!cancelled) setActivity(null);
      }
    };

    loadActivity();
    const t = setInterval(loadActivity, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [campaign?.campaign, fetchCampaignActivity]);

  // Wallet balances (for the trading panel)
  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      try {
        if (!wallet.account) {
          setBnbBalanceWei(null);
          setTokenBalanceWei(null);
          return;
        }

        const [bnbBal, tokenBal] = await Promise.all([
          readProvider.getBalance(wallet.account),
          (async () => {
            try {
              if (!campaign?.token) return 0n;
              const t = new Contract(campaign.token, TOKEN_ABI, readProvider) as any;
              return (await t.balanceOf(wallet.account)) as bigint;
            } catch {
              return 0n;
            }
          })(),
        ]);

        if (!cancelled) {
          setBnbBalanceWei(bnbBal);
          setTokenBalanceWei(tokenBal);
        }
      } catch (e) {
        console.warn("[TokenDetails] Failed to load balances", e);
        if (!cancelled) {
          setBnbBalanceWei(null);
          setTokenBalanceWei(null);
        }
      }
    };

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [readProvider, wallet.account, campaign?.token]);

  // Build transactions table rows from continuous market trade stream.
  useEffect(() => {
    if (!campaign) {
      setTxs([]);
      return;
    }
    const mcap = tokenData.marketCap ?? "—";

    const seenTx = new Set<string>();
    const next: TxRow[] = [...marketTradePoints]
      .slice()
      .reverse()
      .filter((p: any) => {
        const tx = String(p.txHash || "").toLowerCase();
        if (!/^0x[a-f0-9]{64}$/.test(tx)) return false;
        if (seenTx.has(tx)) return false;
        seenTx.add(tx);
        return true;
      })
      .slice(0, 100)
      .map((p: any) => {
        const tokenAmount = Number(ethers.formatUnits(p.tokensWei ?? 0n, TOKEN_DECIMALS));
        const bnb = Number(ethers.formatEther(p.nativeWei ?? 0n));
        const bnbStr = Number.isFinite(bnb) ? `${bnb.toFixed(4)} BNB` : "—";

        const priceNum = typeof p.pricePerToken === "number" ? p.pricePerToken : Number(p.pricePerToken ?? 0);
        const priceStr = formatPriceBnb(priceNum);

        const txHash = String(p.txHash ?? "").toLowerCase();
        const ts = Number(p.timestamp ?? 0);

        return {
          id: txHash,
          time: formatAgo(ts),
          type: (p.type ?? "buy") as "buy" | "sell",
          amount: formatCompact(tokenAmount),
          bnb: bnbStr,
          price: priceStr,
          mcap,
          maker: shorten(p.from),
          makerAddress: String(p.from ?? ""),
          txHash,
        };
      });

    setTxs(next);
  }, [campaign, marketTradePoints, tokenData.marketCap, metrics]);

  // Graduation is a market-stage transition inside MemeWarzone, not a redirect.
  // Prefer verified backend state; retain on-chain graduation while market API is still rolling out.
  const contractGraduated = contractGraduatedEarly;
  const verifiedMarketStage = unifiedMarket.state?.marketStage;
  // Do NOT treat TOPAZ_PENDING alone as DEX UI — that broke bonding metrics when
  // handoff rows existed without a live pair. Require on-chain graduation or ACTIVE.
  const isDexStage =
    contractGraduated ||
    verifiedMarketStage === "TOPAZ_ACTIVE" ||
    (verifiedMarketStage === "TOPAZ_DEGRADED" && contractGraduated);
  // Allow Topaz quotes/trades when backend marks TOPAZ_ACTIVE, or when graduated on-chain.
  const isTopazTradingActive =
    (verifiedMarketStage === "TOPAZ_ACTIVE" && Boolean(unifiedMarket.state?.tradingEnabled)) ||
    (contractGraduated &&
      (!verifiedMarketStage ||
        verifiedMarketStage === "TOPAZ_ACTIVE" ||
        verifiedMarketStage === "TOPAZ_PENDING" ||
        verifiedMarketStage === "TOPAZ_DEGRADED"));

  const dexTokenAddress = isDexStage ? (campaign?.token ?? "") : "";
  const { baseUrl: dexBaseUrl, liquidityBnb: dexLiquidityBnb } =
    useDexScreenerChart(dexTokenAddress);

  const curveProgress = useMemo(() => {
    // IMPORTANT:
    // - metrics.sold is TOKEN wei sold on the bonding curve.
    // - metrics.curveSupply is TOKEN wei available to sell on the curve.
    // - metrics.graduationNativeTarget is the oracle-converted BNB reserve target.
    // The contract graduates when either:
    //   sold >= curveSupply   OR   reserve >= graduationTarget

    const sold = metrics?.sold ?? 0n;
    const curveSupply = metrics?.curveSupply ?? 0n;
    const targetWei = metrics?.graduationNativeTarget ?? 0n;
    const reserveWei = curveReserveWei ?? 0n;

    const soldPct =
      curveSupply > 0n ? Number(((sold * 10000n) / curveSupply)) / 100 : 0;

    const raisedPct =
      targetWei > 0n ? Number(((reserveWei * 10000n) / targetWei)) / 100 : 0;

    const reachedSold = curveSupply > 0n && sold >= curveSupply;
    const reachedRaised = targetWei > 0n && reserveWei >= targetWei;

    // When we are in DEX stage, always show 100%.
    if (isDexStage) {
      return {
        pct: 100,
        matured: true,
        soldWei: sold,
        curveSupplyWei: curveSupply,
        reserveWei,
        targetWei,
        soldPct: 100,
        raisedPct: 100,
      };
    }

    // Show whichever progress is “more complete”, because graduation triggers on either.
    const pct = Math.max(
      0,
      Math.min(100, Math.max(soldPct, raisedPct))
    );

    return {
      pct,
      matured: reachedSold || reachedRaised,
      soldWei: sold,
      curveSupplyWei: curveSupply,
      reserveWei,
      targetWei,
      soldPct: Math.max(0, Math.min(100, soldPct)),
      raisedPct: Math.max(0, Math.min(100, raisedPct)),
    };
  }, [isDexStage, metrics?.sold, metrics?.curveSupply, metrics?.graduationNativeTarget, curveReserveWei]);

    const remainingCurveWei = useMemo(() => {
    // Remaining BNB needed to reach the graduation target (reserve-based trigger).
    // If already in DEX stage, remaining is 0.
    if (isDexStage) return 0n;

    const targetWei = curveProgress.targetWei ?? 0n;
    const reserveWei = curveProgress.reserveWei ?? 0n;
    return targetWei > reserveWei ? targetWei - reserveWei : 0n;
  }, [isDexStage, curveProgress.targetWei, curveProgress.reserveWei]);

  const remainingCurveLabel = useMemo(() => {
    const bnbLabel = formatBnbFromWei(remainingCurveWei);

    let remainingBnbNum: number | null = null;
    try {
      const n = Number(ethers.formatEther(remainingCurveWei));
      remainingBnbNum = Number.isFinite(n) ? n : null;
    } catch {
      remainingBnbNum = null;
    }

    const usdLabel =
      remainingBnbNum != null && bnbUsdPrice
        ? formatCompactUsd(remainingBnbNum * bnbUsdPrice)
        : bnbUsdLoading
        ? "…"
        : "—";

    // Primary follows the denomination toggle; secondary shows the other denomination.
    if (displayDenom === "USD") return { primary: usdLabel, secondary: bnbLabel };
    return { primary: bnbLabel, secondary: usdLabel };
  }, [remainingCurveWei, displayDenom, bnbUsdPrice, bnbUsdLoading]);

  const liquidityLabel = isDexStage ? "Liquidity" : "Reserve";
  const liquidityValue = (() => {
    if (!isDexStage) return tokenData.liquidity;
    // Prefer on-chain Topaz pool liquidity (2 × WBNB reserve).
    if (topazMarket.liquidityBnb != null && Number.isFinite(topazMarket.liquidityBnb) && topazMarket.liquidityBnb > 0) {
      return `${formatCompact(topazMarket.liquidityBnb)} BNB`;
    }
    if (tokenData.liquidity && tokenData.liquidity !== "—") return tokenData.liquidity;
    // Optional external fallback only.
    return formatBnb(dexLiquidityBnb ?? null);
  })()

  const liquidityDisplay = useMemo(() => {
    const bnbLabel = liquidityValue;

    if (displayDenom === "BNB") return bnbLabel;

    const liqBnb = parseBnbLabel(bnbLabel);
    if (liqBnb == null) return "—";

    if (!bnbUsdPrice) return bnbUsdLoading ? "…" : "—";

    return formatCompactUsd(liqBnb * bnbUsdPrice);
  }, [displayDenom, liquidityValue, bnbUsdPrice, bnbUsdLoading]);
;

  const chartTitle = isDexStage ? "Topaz market" : "";
  const stagePill = isTopazTradingActive ? "Graduated · Topaz" : isDexStage ? "Graduating" : "Bonding";

  // Quote (buy: BNB cost; sell: BNB payout) for the entered token amount
  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      try {
        setQuoteError(null);

        if (isDexStage) {
          if (!isTopazTradingActive || !campaign?.campaign || !campaign?.token) {
            setQuoteWei(null);
            setQuoteError(unifiedMarket.state?.lastError || "Topaz market verification is still in progress.");
            return;
          }
          // Avoid route RPC work until the user enters an amount.
          const hasAmount =
            tradeInputDenom === "BNB"
              ? parseBnbAmountWei(tradeAmount) > 0n
              : parseTokenAmountWei(tradeAmount) > 0n;
          if (!hasAmount) {
            setEffectiveTokenWei(0n);
            setEffectiveBnbWei(0n);
            setQuoteWei(null);
            setQuoteError(null);
            return;
          }
          setQuoteLoading(true);
          const resolved = await resolveVerifiedTopazRoute({
            provider: readProvider,
            campaignAddress: campaign.campaign,
            expectedTokenAddress: campaign.token,
            chainId: chainIdForStorage,
          });
          if (tradeInputDenom === "BNB") {
            const targetNativeWei = parseBnbAmountWei(tradeAmount);
            setEffectiveBnbWei(targetNativeWei);
            if (targetNativeWei <= 0n) {
              setEffectiveTokenWei(0n);
              setQuoteWei(null);
              return;
            }
            if (tradeTab === "buy") {
              const quote = await quoteTopazBuy({
                provider: readProvider,
                resolved,
                nativeAmountInRaw: targetNativeWei,
                slippageBps: topazSlippageBps,
              });
              if (!cancelled) {
                setEffectiveTokenWei(quote.amountOutRaw);
                setQuoteWei(targetNativeWei);
              }
              return;
            }
            const tokenInputWei = await solveTokensForExactNative({
              provider: readProvider,
              resolved,
              targetNativeOutRaw: targetNativeWei,
              initialTokenHighRaw: tokenBalanceWei && tokenBalanceWei > 0n ? tokenBalanceWei : 10n ** 24n,
            });
            const quote = await quoteTopazSell({
              provider: readProvider,
              resolved,
              tokenAmountInRaw: tokenInputWei,
              slippageBps: topazSlippageBps,
            });
            if (!cancelled) {
              setEffectiveTokenWei(tokenInputWei);
              setEffectiveBnbWei(quote.amountOutRaw);
              setQuoteWei(quote.amountOutRaw);
            }
            return;
          }
          const tokenInputWei = parseTokenAmountWei(tradeAmount);
          setEffectiveTokenWei(tokenInputWei);
          if (tokenInputWei <= 0n) {
            setEffectiveBnbWei(0n);
            setQuoteWei(null);
            return;
          }
          if (tradeTab === "buy") {
            let initialNativeHighRaw = 10n ** 15n;
            try {
              const lastPriceWei = ethers.parseUnits(String(unifiedMarket.summary?.last_price_bnb || "0"), 18);
              const estimate = (tokenInputWei * lastPriceWei) / 10n ** 18n;
              if (estimate > 0n) initialNativeHighRaw = estimate * 2n;
            } catch {
              // Binary-search expansion handles an unavailable spot price.
            }
            const nativeInputWei = await solveNativeForExactTokens({
              provider: readProvider,
              resolved,
              targetTokenOutRaw: tokenInputWei,
              initialNativeHighRaw,
            });
            const quote = await quoteTopazBuy({
              provider: readProvider,
              resolved,
              nativeAmountInRaw: nativeInputWei,
              slippageBps: topazSlippageBps,
            });
            if (!cancelled) {
              setEffectiveBnbWei(nativeInputWei);
              setEffectiveTokenWei(quote.amountOutRaw);
              setQuoteWei(nativeInputWei);
            }
            return;
          }
          const quote = await quoteTopazSell({
            provider: readProvider,
            resolved,
            tokenAmountInRaw: tokenInputWei,
            slippageBps: topazSlippageBps,
          });
          if (!cancelled) {
            setEffectiveBnbWei(quote.amountOutRaw);
            setQuoteWei(quote.amountOutRaw);
          }
          return;
        }
        if (!campaign?.campaign) {
          setQuoteWei(null);
          return;
        }

        let amountWei = 0n;
        let inputBnbWei = 0n;
        if (tradeInputDenom === "BNB") {
          inputBnbWei = parseBnbAmountWei(tradeAmount);
          setEffectiveBnbWei(inputBnbWei);
          if (inputBnbWei <= 0n) {
            setEffectiveTokenWei(0n);
            setQuoteWei(null);
            return;
          }
        } else {
          amountWei = parseTokenAmountWei(tradeAmount);
          setEffectiveTokenWei(amountWei);
          if (amountWei <= 0n) {
            setQuoteWei(null);
            return;
          }
        }

        setQuoteLoading(true);

        const c = new Contract(campaign.campaign, CAMPAIGN_ABI, readProvider) as any;
        if (tradeInputDenom === "BNB") {
          const targetWei = inputBnbWei;
          if (tradeTab === "buy") {
            const [tokensOut, totalCostWei] = await c.quoteBuyExactBnb(targetWei);
            if (!cancelled) {
              setEffectiveTokenWei(tokensOut);
              setQuoteWei(totalCostWei);
            }
            return;
          }

          // A BNB-denominated sell still needs inversion because the contract
          // accepts an exact token input.
          const priceWei = metrics?.currentPrice ?? 0n;
          let hi: bigint;
          if (tokenBalanceWei != null && tokenBalanceWei > 0n) {
            hi = tokenBalanceWei;
          } else if (priceWei > 0n) {
            const est = (targetWei * 10n ** 18n) / priceWei;
            hi = est > 0n ? est * 2n : 10n ** 18n;
          } else {
            hi = 10n ** 24n;
          }
          let lo = 0n;
          // 28 iterations ~= good precision without too many RPC calls.
          for (let i = 0; i < 28; i++) {
            const mid = (lo + hi) / 2n;
            if (mid <= 0n) {
              lo = 0n;
              continue;
            }
            const q: bigint = await c.quoteSellExactTokens(mid);
            if (q >= targetWei) hi = mid; else lo = mid;
          }
          const solved = hi;
          if (!cancelled) {
            setEffectiveTokenWei(solved);
            setQuoteWei(targetWei);
          }
        } else {
          const q: bigint = tradeTab === "buy"
            ? await c.quoteBuyExactTokens(amountWei)
            : await c.quoteSellExactTokens(amountWei);
          if (!cancelled) setQuoteWei(q);
        }
      } catch (e: any) {
        console.warn("[TokenDetails] Quote failed", e);
        if (!cancelled) {
          setQuoteWei(null);
          setQuoteError(e?.message ?? "Failed to fetch quote");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    const t = setTimeout(loadQuote, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb]);

  const handlePlaceTrade = async () => {
    if (!campaign?.campaign) return;

    if (isDexStage) {
      if (!isTopazTradingActive || !campaign?.token) {
        toast({
          title: "Topaz market is not ready",
          description: unifiedMarket.state?.lastError || "The verified Topaz route is still being reconciled.",
          variant: "destructive",
        });
        return;
      }
      if (!wallet.signer || !wallet.account) {
        toast({ title: "Connect wallet", description: "Please connect your wallet to trade." });
        window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
        return;
      }
      try {
        setTradePending(true);
        const resolved = await resolveVerifiedTopazRoute({
          provider: readProvider,
          campaignAddress: campaign.campaign,
          expectedTokenAddress: campaign.token,
          chainId: chainIdForStorage,
        });
        let optimistic: CurveTradePoint | null = null;
        if (tradeTab === "buy") {
          const nativeAmountInRaw = tradeInputDenom === "BNB" ? parseBnbAmountWei(tradeAmount) : effectiveBnbWei;
          if (nativeAmountInRaw <= 0n) throw new Error("Enter a valid BNB or token amount.");
          if (bnbBalanceWei != null && nativeAmountInRaw > bnbBalanceWei) throw new Error("Insufficient BNB balance.");
          const quote = await quoteTopazBuy({
            provider: readProvider,
            resolved,
            nativeAmountInRaw,
            slippageBps: topazSlippageBps,
          });
          toast({
            title: "Submitting Topaz buy",
            description: `Minimum received: ${formatTokenFromWei(quote.minimumOutRaw)} ${tokenData.ticker}.`,
          });
          const tx = await executeTopazBuy({ signer: wallet.signer, recipient: wallet.account, quote });
          const receipt = await tx.wait();
          toast({
            title: "Buy confirmed",
            description: receipt?.hash ? `Tx: ${receipt.hash.slice(0, 10)}...` : "Transaction confirmed.",
          });
          const tokensOut = quote.amountOutRaw > 0n ? quote.amountOutRaw : quote.minimumOutRaw;
          const pricePerToken =
            tokensOut > 0n
              ? Number(ethers.formatEther(nativeAmountInRaw)) / Number(ethers.formatUnits(tokensOut, TOKEN_DECIMALS))
              : 0;
          optimistic = {
            type: "buy",
            from: String(wallet.account).toLowerCase(),
            to: String(campaign.token || "").toLowerCase(),
            tokensWei: tokensOut,
            nativeWei: nativeAmountInRaw,
            pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : 0,
            timestamp: Math.floor(Date.now() / 1000),
            txHash: String(receipt?.hash || tx?.hash || "").toLowerCase(),
            blockNumber: Number(receipt?.blockNumber || 0),
            logIndex: SYNTHETIC_LOG_INDEX_MIN,
          };
        } else {
          const tokenAmountInRaw = tradeInputDenom === "BNB" ? effectiveTokenWei : parseTokenAmountWei(tradeAmount);
          if (tokenAmountInRaw <= 0n) throw new Error("Enter a valid token or BNB amount.");
          if (tokenBalanceWei != null && tokenAmountInRaw > tokenBalanceWei) {
            throw new Error(`Insufficient ${tokenData.ticker} balance.`);
          }
          const quote = await quoteTopazSell({
            provider: readProvider,
            resolved,
            tokenAmountInRaw,
            slippageBps: topazSlippageBps,
          });
          const approval = await ensureTopazSellAllowance({
            signer: wallet.signer,
            owner: wallet.account,
            resolved,
            tokenAmountRaw: tokenAmountInRaw,
          });
          if (approval) {
            setApprovePending(true);
            toast({
              title: "Approval required",
              description: `Approving the verified Topaz router for ${tokenData.ticker}...`,
            });
            await approval.wait();
            setApprovePending(false);
          }
          toast({
            title: "Submitting Topaz sell",
            description: `Minimum received: ${formatBnbFromWei(quote.minimumOutRaw)}.`,
          });
          const tx = await executeTopazSell({ signer: wallet.signer, recipient: wallet.account, quote });
          const receipt = await tx.wait();
          toast({
            title: "Sell confirmed",
            description: receipt?.hash ? `Tx: ${receipt.hash.slice(0, 10)}...` : "Transaction confirmed.",
          });
          const nativeOut = quote.amountOutRaw > 0n ? quote.amountOutRaw : quote.minimumOutRaw;
          const pricePerToken =
            tokenAmountInRaw > 0n
              ? Number(ethers.formatEther(nativeOut)) / Number(ethers.formatUnits(tokenAmountInRaw, TOKEN_DECIMALS))
              : 0;
          optimistic = {
            type: "sell",
            from: String(wallet.account).toLowerCase(),
            to: String(wallet.account).toLowerCase(),
            tokensWei: tokenAmountInRaw,
            nativeWei: nativeOut,
            pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : 0,
            timestamp: Math.floor(Date.now() / 1000),
            txHash: String(receipt?.hash || tx?.hash || "").toLowerCase(),
            blockNumber: Number(receipt?.blockNumber || 0),
            // Synthetic logIndex: real pool log is preferred when available (see mergeTradePoints).
            logIndex: SYNTHETIC_LOG_INDEX_MIN,
          };
        }
        if (optimistic?.txHash && resolvedCampaignAddress) {
          const next = appendLocalTopazTrade(chainIdForStorage, resolvedCampaignAddress, optimistic);
          setLocalTopazTrades(next);
          // Persist to frontend API so Topaz fills survive reloads without eth_getLogs.
          void reportTopazTrade({
            chainId: chainIdForStorage,
            campaignAddress: resolvedCampaignAddress,
            side: optimistic.type,
            txHash: optimistic.txHash,
            tokenAmountRaw: optimistic.tokensWei.toString(),
            nativeAmountRaw: optimistic.nativeWei.toString(),
            wallet: wallet.account || undefined,
            pairAddress: topazMarket.pairAddress,
            blockNumber: optimistic.blockNumber || null,
            logIndex: SYNTHETIC_LOG_INDEX_MIN,
            blockTime: new Date((optimistic.timestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          });
        }
        try {
          await unifiedMarket.refresh();
        } catch {
          // Market API may still be disabled during rollout.
        }
        try {
          await topazMarket.refresh();
        } catch {
          // Pool metrics refresh is best-effort (reserves/price).
        }
        const [bnbBal, tokenBal] = await Promise.all([
          readProvider.getBalance(wallet.account),
          (new Contract(campaign.token, TOKEN_ABI, readProvider) as any).balanceOf(wallet.account),
        ]);
        setBnbBalanceWei(bnbBal);
        setTokenBalanceWei(tokenBal);
        setTradeAmount("0");
      } catch (e: any) {
        console.error("[TokenDetails] Topaz trade failed", e);
        toast({
          title: "Trade failed",
          description: e?.shortMessage || e?.message || "Topaz trade failed.",
          variant: "destructive",
        });
      } finally {
        setApprovePending(false);
        setTradePending(false);
      }
      return;
    }

    const amountWei = tradeInputDenom === "BNB" ? effectiveTokenWei : parseTokenAmountWei(tradeAmount);
  const inputBnbWei = tradeInputDenom === "BNB" ? effectiveBnbWei : 0n;
    if (amountWei <= 0n) {
      toast({
        title: "Invalid amount",
        description: tradeInputDenom === "BNB" ? "Enter a BNB amount greater than 0." : `Enter a ${tokenData.ticker} amount greater than 0.`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Balance sanity checks (best-effort)
      if (!isDexStage && tradeTab === "sell" && tokenBalanceWei != null && amountWei > tokenBalanceWei) {
        toast({
          title: "Insufficient token balance",
          description: `You do not have enough ${tokenData.ticker} to sell that amount.`,
          variant: "destructive",
        });
        return;
      }

      if (!isDexStage && tradeTab === "buy" && bnbBalanceWei != null) {
        const baseCostWei = tradeInputDenom === "BNB" ? inputBnbWei : (quoteWei ?? 0n);
        if (baseCostWei > 0n) {
          const maxCostWei = tradeInputDenom === "BNB"
            ? baseCostWei
            : (baseCostWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;
          if (maxCostWei > bnbBalanceWei) {
          toast({
            title: "Insufficient BNB",
            description: `You need ~${formatBnbFromWei(maxCostWei)} to place this buy.`,
            variant: "destructive",
          });
          return;
        }
          }
      }

      // Ensure wallet is connected for writes
if (!wallet.signer || !wallet.account) {
  toast({
    title: "Connect wallet",
    description: "Please connect your wallet to trade.",
  });
  window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
  return;
}
if (!wallet.signer || !wallet.account) throw new Error("Wallet not connected");

      setTradePending(true);

      if (tradeTab === "buy") {
  let costWei = tradeInputDenom === "BNB" ? inputBnbWei : quoteWei;

  if (amountWei > 0n && (costWei == null || costWei === 0n)) {
    const c = new Contract(
      campaign.campaign,
      CAMPAIGN_ABI,
      readProvider
    ) as any;

    costWei = await c.quoteBuyExactTokens(amountWei);
  }
        const maxCostWei = tradeInputDenom === "BNB"
          ? costWei
          : (costWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;

        toast({
          title: "Submitting buy",
          description: `Buying ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${tokenData.ticker} (max ${formatBnbFromWei(maxCostWei)}).`,
        });

        const receipt: any = await buyTokens(campaign.campaign, amountWei, maxCostWei);

        toast({
          title: "Buy confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      } else {
        let payoutWei = tradeInputDenom === "BNB" ? inputBnbWei : quoteWei;
        if (amountWei > 0n && (payoutWei == null || payoutWei === 0n)) {
  const c = new Contract(
    campaign.campaign,
    CAMPAIGN_ABI,
    readProvider
  ) as any;

  payoutWei = await c.quoteSellExactTokens(amountWei);
}

        const minPayoutWei = (payoutWei * BigInt(100 - SLIPPAGE_PCT)) / 100n;

        if (campaign?.token) {
  const token = new Contract(campaign.token, TOKEN_ABI, wallet.signer) as any;
  const allowance: bigint = await token.allowance(wallet.account, campaign.campaign);

  if (allowance < amountWei) {
    setApprovePending(true);
    toast({
      title: "Approval required",
      description: `Approving ${tokenData.ticker} for selling...`,
    });

    const tx = await token.approve(campaign.campaign, MAX_UINT256);
    await tx.wait();

    setApprovePending(false);
  }
}

        toast({
          title: "Submitting sell",
          description: `Selling ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${tokenData.ticker} (min ${formatBnbFromWei(minPayoutWei)}).`,
        });

        const receipt: any = await sellTokens(campaign.campaign, amountWei, minPayoutWei);

        toast({
          title: "Sell confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      }

      // Refresh headline stats + balances
      try {
        const s = await fetchCampaignSummary(campaign);
        setSummary(s);
        setMetrics(s.metrics ?? null);
      } catch {
        // ignore
      }

      try {
        if (campaign?.campaign) {
          const bal = await readProvider.getBalance(campaign.campaign);
          setCurveReserveWei(bal);
        }
      } catch {
        // ignore
      }

      try {
        if (wallet.account && campaign?.token) {
          const [bnbBal, tokenBal] = await Promise.all([
            readProvider.getBalance(wallet.account),
            (async () => {
              try {
                const t = new Contract(campaign.token, TOKEN_ABI, readProvider) as any;
                return (await t.balanceOf(wallet.account)) as bigint;
              } catch {
                return 0n;
              }
            })(),
          ]);
          setBnbBalanceWei(bnbBal);
          setTokenBalanceWei(tokenBal);
        }
      } catch {
        // ignore
      }

      setTradeAmount("0");
    } catch (e: any) {
      console.error("[TokenDetails] Trade failed", e);
      toast({
        title: "Trade failed",
        description: describeTradeError(e),
        variant: "destructive",
      });
    } finally {
      setApprovePending(false);
      setTradePending(false);
    }
  };

  const copyAddress = (address?: string, label = "Address") => {
    if (!address) return;

    navigator.clipboard.writeText(address);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <h2 className="text-sm md:text-base font-semibold mb-2">{error}</h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            {error === "No token data"
              ? "There are no campaigns available yet."
              : "Please go back to the main page and select another token."}
          </p>
        </Card>
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div className="h-full w-full flex items-center justify-center px-4">
        <Card className="p-4 md:p-6 bg-card/40 border border-border/40 max-w-md w-full text-center">
          <p className="text-xs md:text-sm text-muted-foreground">
            Loading token data...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto flex flex-col px-3 md:px-6 pt-16 md:pt-16 gap-3 md:gap-4">
      <GraduationExplosion
        campaignAddress={campaign?.campaign}
        active={isTopazTradingActive}
        transitionAt={
          unifiedMarket.stageTransition?.to === "TOPAZ_ACTIVE" ? unifiedMarket.stageTransition.at : null
        }
      />
      <Card className="overflow-hidden bg-card/30 backdrop-blur-md rounded-2xl border border-border p-0 xl:min-h-[220px]">
        <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] items-stretch xl:min-h-[220px]">
          <div className="relative min-h-[180px] bg-muted/20 xl:min-h-[220px] overflow-hidden">
            <img
              src={tokenData.image}
              alt={tokenData.ticker}
              onError={(event) => {
                event.currentTarget.src = "/placeholder.svg";
              }}
              className="h-full w-full object-contain object-center"
            />
          </div>

          <div className="min-w-0 flex flex-col justify-between gap-3 p-3 md:p-4 xl:p-5">
            <div className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 md:px-4 md:py-3 min-h-[60px]">
              <div className="flex flex-wrap items-center gap-2 md:gap-3 xl:flex-nowrap xl:justify-start xl:gap-2.5 xl:overflow-x-auto">
                <h1 className="text-lg md:text-2xl font-retro text-foreground whitespace-nowrap">
                  {tokenData.name}
                </h1>

                <span className="text-xs md:text-sm text-muted-foreground font-mono whitespace-nowrap">
                  {tokenData.ticker}
                </span>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${
                    isDexStage
                      ? "bg-emerald-500/25 text-emerald-200 border-emerald-500/40"
                      : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                  }`}
                >
                  {stagePill}
                </span>

                {(() => {
                  const creator = String(campaign?.creator ?? "").trim();
                  if (!creator) return null;

                  const display =
                    (creatorProfile?.displayName
                      ? String(creatorProfile.displayName).trim()
                      : "") || shortenAddress(creator);

                  const createdLabel = campaign?.createdAt
                    ? formatTimeAgo(campaign.createdAt)
                    : campaign?.timeAgo
                    ? `${campaign.timeAgo}${String(campaign.timeAgo).includes("ago") ? "" : " ago"}`
                    : "—";

                  const initial = display ? display.slice(0, 1).toUpperCase() : "C";

                  return (
                    <>
                      <Link
                        to={`/profile?address=${creator}`}
                        className="inline-flex items-center gap-2 hover:opacity-90 transition-opacity max-w-[220px] flex-shrink-0"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage
                            src={creatorProfile?.avatarUrl || undefined}
                            alt={display}
                          />
                          <AvatarFallback className="text-[10px]">
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] md:text-xs text-foreground/90 truncate">{display}</span>
                      </Link>

                      {tokenData.hasWebsite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 hover:bg-muted/50 flex-shrink-0"
                          onClick={() => {
                            const url = normalizeSocialUrl(campaign?.website, "website");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                          title="Website"
                          aria-label="Open website"
                        >
                          <Globe className="h-4 w-4" />
                        </Button>
                      )}

                      {tokenData.hasTwitter && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 hover:bg-muted/50 flex-shrink-0"
                          onClick={() => {
                            const url = normalizeSocialUrl(campaign?.xAccount, "x");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                          title="X"
                          aria-label="Open X profile"
                        >
                          <img
                            src={twitterIcon}
                            alt="X"
                            className="h-4 w-4"
                          />
                        </Button>
                      )}

                      {tokenData.hasTelegram && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-retro text-[10px] hover:bg-muted/50 flex-shrink-0"
                          onClick={() => {
                            const url = normalizeSocialUrl(campaign?.telegram, "telegram");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          TG
                        </Button>
                      )}

                      {tokenData.hasDiscord && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-retro text-[10px] hover:bg-muted/50 flex-shrink-0"
                          onClick={() => {
                            const url = normalizeSocialUrl(campaign?.discord, "discord");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          DC
                        </Button>
                      )}

                      {tokenData.hasOtherLink && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 hover:bg-muted/50 flex-shrink-0"
                          onClick={() => {
                            const url = normalizeSocialUrl(campaign?.extraLink, "other");
                            if (url) window.open(url, "_blank", "noopener,noreferrer");
                          }}
                          title="External link"
                          aria-label="Open external link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}

                      <span className="text-[11px] md:text-xs text-muted-foreground whitespace-nowrap">
                        {createdLabel}
                      </span>
                    </>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => copyAddress(campaign?.token, "Token contract address")}
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/20 px-2 py-1 hover:bg-muted/35 transition-colors flex-shrink-0"
                  title="Copy ERC-20 token contract address"
                >
                  <span className="font-mono text-[11px] md:text-xs whitespace-nowrap">
                    {shortenAddress(campaign?.token ?? "") || "—"}
                  </span>
                  <Copy className="h-3 w-3" />
                </button>

                {campaignAddr ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8 rounded-xl flex-shrink-0"
                      onClick={toggleFollow}
                      disabled={followBusy}
                      aria-label={isFollowing ? "Unfollow campaign" : "Follow campaign"}
                      title={isFollowing ? "Unfollow" : "Follow"}
                    >
                      <Star
                        className={
                          isFollowing
                            ? "text-accent fill-accent scale-110 drop-shadow-[0_0_10px_rgba(240,106,26,0.38)]"
                            : "text-muted-foreground/70"
                        }
                      />
                    </Button>

                    <UpvoteDialog
                      campaignAddress={campaignAddr}
                      buttonVariant="secondary"
                      buttonSize="sm"
                      className="h-8 px-3 text-xs flex-shrink-0"
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 md:px-4 md:py-4 min-h-[90px]">
              <div className="flex flex-col gap-2.2">
                <div className="flex items-center justify-start">
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:w-full xl:max-w-[920px] xl:grid-cols-5">
                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Market cap</p>
                    <p className="mt-0.5 text-sm md:text-[15px] font-retro text-foreground break-words">{marketCapDisplay}</p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Price</p>
                    <p className="mt-0.5 text-sm md:text-[15px] font-retro text-foreground break-words">{priceDisplay}</p>
                    <p className="mt-0.5 text-[10px] md:text-[11px] text-muted-foreground">Spot</p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Volume</p>
                    <p className="mt-0.5 text-sm md:text-[15px] font-retro text-foreground break-words">{volumeDisplay}</p>
                    <p className="mt-0.5 text-[10px] md:text-[11px] text-muted-foreground">Window {selectedTimeframe}</p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{liquidityLabel}</p>
                    <p className="mt-0.5 text-sm md:text-[15px] font-retro text-foreground break-words">{liquidityDisplay}</p>
                    {!isDexStage ? (
                      <p className="mt-0.5 text-[10px] md:text-[11px] text-muted-foreground">Remaining {remainingCurveLabel.primary}</p>
                    ) : (
                      <p className="mt-0.5 text-[10px] md:text-[11px] text-muted-foreground">Stage {stagePill}</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 col-span-2 md:col-span-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Holders</p>
                    <p className="mt-0.5 text-sm md:text-[15px] font-retro text-foreground">{tokenData.holders}</p>
                    <p className="mt-0.5 text-[10px] md:text-[11px] text-muted-foreground">Buyers {flywheel.buyers}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-3 md:gap-4 items-start">
        <div className="min-w-0 flex flex-col gap-3 md:gap-4">
          <Card
            className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-0 overflow-hidden flex flex-col min-h-[360px] h-[360px] md:min-h-[420px] md:h-[420px] xl:min-h-[520px] xl:h-[520px]"
          >
            <div className="flex flex-col gap-2 px-4 py-2 border-b border-border/40 bg-card/20 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground">{chartTitle || "Price chart"}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                    isDexStage
                      ? "bg-emerald-500/25 text-emerald-200 border-emerald-500/40"
                      : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                  }`}
                >
                  {stagePill}
                </span>
              </div>
              <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:items-center md:justify-end">
                <div className="flex flex-wrap items-center gap-1.5 md:flex-nowrap md:justify-end">
                  {/* Bonding-only % change chips; graduated stage uses resolution inside UnifiedMarketChart. */}
                  {!isDexStage &&
                    Object.entries(tokenData.metrics).map(([key, data]) => {
                      const ch = (data as any).change as number | null;
                      return (
                        <Button
                          key={key}
                          type="button"
                          variant={selectedTimeframe === key ? "secondary" : "ghost"}
                          size="sm"
                          className="h-7 rounded-lg px-2.5 text-[10px] md:text-[11px]"
                          onClick={() => setSelectedTimeframe(key as "5m" | "1h" | "4h" | "24h")}
                        >
                          <span className="text-muted-foreground mr-1.5">{key}</span>
                          <span
                            className={
                              ch == null
                                ? "text-muted-foreground"
                                : ch > 0
                                ? "text-emerald-400"
                                : ch < 0
                                ? "text-red-400"
                                : "text-muted-foreground"
                            }
                          >
                            {ch == null
                              ? "—"
                              : `${ch > 0 ? "▲" : ch < 0 ? "▼" : "•"} ${Math.abs(ch).toFixed(2)}%`}
                          </span>
                        </Button>
                      );
                    })}

                  {/* Always available — memecoin traders price mcap in USD by default. */}
                  <div className="inline-flex items-center gap-0 rounded-lg border border-border/40 bg-muted/25 p-1 shrink-0">
                    <Button
                      size="sm"
                      variant={displayDenom === "USD" ? "secondary" : "ghost"}
                      className="h-6 px-2.5 text-[10px] md:text-[11px]"
                      onClick={() => setDisplayDenom("USD")}
                    >
                      USD
                    </Button>
                    <Button
                      size="sm"
                      variant={displayDenom === "BNB" ? "secondary" : "ghost"}
                      className="h-6 px-2.5 text-[10px] md:text-[11px]"
                      onClick={() => setDisplayDenom("BNB")}
                    >
                      BNB
                    </Button>
                  </div>
                </div>

                <AthBar
                  currentLabel={marketCapUsdLabel ?? undefined}
                  storageKey={`ath:${String(chainIdForStorage)}:${String((campaignAddress ?? campaign?.campaign ?? "")).toLowerCase()}`}
                  className="w-full md:w-auto md:max-w-[320px]"
                />

                {isDexStage && dexBaseUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => window.open(dexBaseUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    External
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <div className="w-full h-full min-h-[260px]">
                {/* Continuous chart: bonding curve history always; Topaz candles when market API is enabled. */}
                <UnifiedMarketChart
                  curvePoints={marketTradePoints}
                  marketCandles={unifiedMarket.candles}
                  marketState={unifiedMarket.state}
                  graduationMarker={unifiedMarket.graduationMarker}
                  resolution={marketResolution}
                  onResolutionChange={setMarketResolution}
                  denomination={displayDenom}
                  loading={
                    (marketTradePoints?.length ?? 0) > 0
                      ? false
                      : liveCurveLoading || unifiedMarket.loading || topazMarket.loading
                  }
                  error={
                    (marketTradePoints?.length ?? 0) > 0
                      ? null
                      : liveCurveError || unifiedMarket.error || topazMarket.error
                  }
                />
              </div>
            </div>
          </Card>

          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <Tabs
              value={activityTab}
              onValueChange={(v) => setActivityTab(v as any)}
              className="h-full flex flex-col min-h-0"
            >
              <TabsList className="grid w-full grid-cols-3 mb-3 bg-transparent p-0 h-auto gap-2">
                <TabsTrigger value="overview" className={ctaTabsTriggerClass}>Overview</TabsTrigger>
                <TabsTrigger value="trades" className={ctaTabsTriggerClass}>Trades</TabsTrigger>
                <TabsTrigger value="comments" className={ctaTabsTriggerClass}>Community</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0">
                <Accordion
                  type="multiple"
                  value={intelSections}
                  onValueChange={setIntelSections}
                  className="space-y-3"
                >
                  <AccordionItem value="campaign" className="rounded-2xl border border-border bg-muted/10 px-4">
                    <AccordionTrigger className="py-4 text-sm font-retro text-foreground hover:no-underline">
                      Campaign Intel
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Creator</p>
                          <p className="mt-1 text-sm font-retro text-foreground break-words">
                            {creatorProfile?.displayName?.trim() || shortenAddress(campaign?.creator) || "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Deployed</p>
                          <p className="mt-1 text-sm font-retro text-foreground">
                            {formatDeployedDate(campaign?.createdAt, campaign?.timeAgo)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Stage</p>
                          <p className="mt-1 text-sm font-retro text-foreground">{stagePill}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Token contract</p>
                          <div className="mt-1 flex items-center gap-2 min-w-0">
                            <span className="text-sm font-mono text-foreground truncate">{shortenAddress(campaign?.token ?? "") || "—"}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyAddress(campaign?.token, "Token contract address")}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Curve progress</p>
                          <p className="mt-1 text-sm font-retro text-foreground">{curveProgress.pct.toFixed(2)}%</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Remaining to graduate</p>
                          <p className="mt-1 text-sm font-retro text-foreground break-words">{remainingCurveLabel.primary}</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="flywheel" className="rounded-2xl border border-border bg-muted/10 px-4">
                    <AccordionTrigger className="py-4 text-sm font-retro text-foreground hover:no-underline">
                      Flywheel
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Buy volume</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.buyVolume}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Sell volume</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.sellVolume}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Net flow</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.netFlow}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Protocol fees (est.)</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.feesEstimated}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Buyers</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.buyers}</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">Protocol fee rate</p>
                          <p className="text-lg font-retro text-foreground">{flywheel.feeRate}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        Volumes and buyer count come from on-chain counters when available. Fees are estimated from protocol fee basis points.
                      </p>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="holders" className="rounded-2xl border border-border bg-muted/10 px-4">
                    <AccordionTrigger className="py-4 text-sm font-retro text-foreground hover:no-underline">
                      Holder Distribution
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-muted-foreground">{holderDistribution.totalHolders} holders</span>
                        <span className="text-xs text-muted-foreground">Estimated from bonding-curve trades</span>
                      </div>

                      {holderDistribution.top.length ? (
                        <div className="space-y-3 overflow-auto min-h-0 pr-1">
                          {holderDistribution.top.map((h, idx) => {
                            const rank = h.isLp ? null : holderDistribution.hasLp ? idx : idx + 1;

                            return (
                              <div key={h.address} className="space-y-1">
                                <div className="flex items-center justify-between text-xs gap-2">
                                  <span className="font-mono min-w-0 truncate">
                                    {rank != null ? `${rank}. ` : ""}

                                    {h.isLp ? (
                                      <span className="text-foreground">{h.label}</span>
                                    ) : (
                                      <Link
                                        to={`/profile?address=${h.address}`}
                                        className="text-foreground hover:underline underline-offset-4"
                                      >
                                        {h.label}
                                      </Link>
                                    )}
                                  </span>
                                  <span className="font-mono text-muted-foreground flex-shrink-0">{h.pct.toFixed(2)}%</span>
                                </div>
                                <Progress value={h.pct} className="h-1.5" />
                              </div>
                            );
                          })}
                          {holderDistribution.othersPct > 0 ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-mono">Others</span>
                                <span className="font-mono text-muted-foreground">{holderDistribution.othersPct.toFixed(2)}%</span>
                              </div>
                              <Progress value={holderDistribution.othersPct} className="h-1.5" />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No holder data yet.</div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              <TabsContent value="comments" className="mt-0">
                <Tabs value={communityTab} onValueChange={(v) => setCommunityTab(v as any)} className="h-full flex flex-col min-h-0 gap-3">
                  <TabsList className="grid w-full grid-cols-2 bg-transparent p-0 h-auto gap-2">
                    <TabsTrigger value="comments" className={ctaTabsTriggerClass}>Comments</TabsTrigger>
                    <TabsTrigger value="updates" className={ctaTabsTriggerClass}>Creator Updates</TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="mt-0 min-h-0">
                    {campaign?.campaign ? (
                      <TokenComments
                        chainId={getActiveChainId(wallet.chainId)}
                        campaignAddress={campaign.campaign}
                        tokenAddress={campaign.token}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">Loading comments…</div>
                    )}
                  </TabsContent>

                  <TabsContent value="updates" className="mt-0 min-h-0">
                    {campaign?.campaign ? (
                      <TokenComments
                        chainId={getActiveChainId(wallet.chainId)}
                        campaignAddress={campaign.campaign}
                        tokenAddress={campaign.token}
                        mode="updates"
                        authorFilterAddress={campaign.creator}
                        hideComposer
                        pollIntervalMs={15000}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">Loading creator updates…</div>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="trades" className="mt-0">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card/60 backdrop-blur border-b border-border">
                      <tr>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Account</th>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">BNB</th>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Token</th>
                        <th className="text-left py-3 px-3 font-medium text-muted-foreground">Time</th>
                        <th className="text-right py-3 px-3 font-medium text-muted-foreground">Txn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((tx) => {
                        const addr = (tx.makerAddress || "").toLowerCase();
                        const prof = addr ? makerProfiles[addr] : null;
                        const avatar = prof?.avatarUrl || "/placeholder.svg";
                        const label = (prof?.displayName && prof.displayName.trim().length)
                          ? prof.displayName.trim()
                          : tx.maker;

                        const explorer = getExplorerBase(wallet.chainId);
                        const txLabel = tx.txHash ? `${tx.txHash.slice(0, 6)}…${tx.txHash.slice(-4)}` : "—";
                        const txUrl = tx.txHash ? `${explorer}/tx/${tx.txHash}` : "";

                        return (
                          <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="py-3 px-3">
                              {tx.makerAddress ? (
                                <Link
                                  to={`/profile?address=${tx.makerAddress}`}
                                  className="flex items-center gap-2 min-w-0"
                                >
                                  <img
                                    src={avatar}
                                    alt={label}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                                    }}
                                    className="h-7 w-7 rounded-full ring-1 ring-border/30 flex-shrink-0"
                                  />
                                  <span className="font-mono text-foreground truncate max-w-[140px]">
                                    {label}
                                  </span>
                                </Link>
                              ) : (
                                <span className="font-mono text-muted-foreground">—</span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`font-medium ${tx.type === "buy" ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {tx.type === "buy" ? "Buy" : "Sell"}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-mono text-foreground">{tx.bnb}</td>

                            <td className="py-3 px-3 font-mono">
                              <span className={tx.type === "buy" ? "text-emerald-300" : "text-red-300"}>
                                {tx.amount}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{tx.time}</td>

                            <td className="py-3 px-3 text-right">
                              {txUrl ? (
                                <a
                                  href={txUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                                >
                                  {txLabel}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {txs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                            No trades yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="xl:sticky xl:top-[80px] xl:-mt-px self-start">
          <Card className="bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Bonding Curve Progress</h3>
                  <span className="text-xs text-muted-foreground">
                    {curveProgress.matured ? "Matured" : `${curveProgress.pct.toFixed(2)}%`}
                  </span>
                </div>

                <div className="mt-3 h-2 w-full rounded-full bg-muted/30 border border-border/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.65),rgba(255,255,255,0.25),rgba(255,255,255,0.65))] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.08),rgba(255,255,255,0.25))]"
                    style={{ width: `${Math.max(0, Math.min(100, curveProgress.pct))}%`, minWidth: curveProgress.pct > 0 ? "1px" : undefined }}
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">In curve</p>
                    <p className="mt-1 font-mono text-foreground">{formatBnbFromWei(curveProgress.reserveWei ?? undefined)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Remaining</p>
                    <p className="mt-1 font-mono text-foreground">{remainingCurveLabel.primary}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Your Position</h3>
                  <span className="text-[11px] text-muted-foreground">Wallet view</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">BNB balance</p>
                    <p className="mt-1 font-mono text-foreground break-words">{formatBnbFromWei(bnbBalanceWei)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Token balance</p>
                    <p className="mt-1 font-mono text-foreground break-words">{formatTokenFromWei(tokenBalanceWei)} {tokenData.ticker}</p>
                  </div>
                </div>
              </div>

              <Tabs value={tradeTab} onValueChange={handleTradeTabChange}>
                <TabsList className={ctaTabsListClass}>
                  <TabsTrigger value="buy" className={ctaTabsTriggerClass}>Buy</TabsTrigger>
                  <TabsTrigger value="sell" className={ctaTabsTriggerClass}>Sell</TabsTrigger>
                </TabsList>

                <TabsContent value="buy" className="space-y-3 mt-0">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                          onClick={toggleTradeInputDenom}
                        >
                          {tradeInputDenom === "BNB" ? `Switch to ${tokenData.ticker}` : "Switch to BNB"}
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">Slippage: {SLIPPAGE_PCT}%</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-20 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="text-xs font-mono text-muted-foreground">{tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        Balance:{" "}
                        {tradeInputDenom === "BNB"
                          ? formatBnbFromWei(bnbBalanceWei)
                          : `${formatTokenFromWei(tokenBalanceWei)} ${tokenData.ticker}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Cost: {quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—"}
                      </span>
                    </div>
                    {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Est. receive: {formatTokenFromWei(effectiveTokenWei)} {tokenData.ticker}</p>
                    ) : null}
                    {quoteError ? (
                      <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p>
                    ) : null}
                  </div>

                  <div className="text-center text-xs text-muted-foreground">
                    {isDexStage ? (
                      isTopazTradingActive && quoteWei != null ? (
                        <p>
                          Topaz execution · min received protected by {(topazSlippageBps / 100).toFixed(2)}% slippage.
                          {tradeTab === "buy" && effectiveTokenWei > 0n
                            ? ` Est. ${formatTokenFromWei(effectiveTokenWei)} ${tokenData.ticker}.`
                            : ""}
                        </p>
                      ) : (
                        <p>Topaz market verification is in progress. Bonding history remains available.</p>
                      )
                    ) : quoteWei != null ? (
                      <p>
                        You will pay ~{formatBnbFromWei(quoteWei)} (max{" "}
                        {formatBnbFromWei(
                          tradeInputDenom === "BNB"
                            ? effectiveBnbWei
                            : (quoteWei * BigInt(100 + SLIPPAGE_PCT)) / 100n,
                        )})
                      </p>
                    ) : (
                      <p>Enter an amount to see the buy quote.</p>
                    )}
                  </div>

                  <Button
                    onClick={handlePlaceTrade}
                    disabled={
                      tradePending ||
                      approvePending ||
                      quoteLoading ||
                      (isDexStage && !isTopazTradingActive) ||
                      (tradeInputDenom === "BNB"
                        ? effectiveBnbWei <= 0n || effectiveTokenWei <= 0n
                        : parseTokenAmountWei(tradeAmount) <= 0n)
                    }
                    className={`w-full ${topbarButtonClass} py-5`}
                  >
                    {tradePending ? "Processing..." : isDexStage ? "Buy on Topaz" : "Buy"}
                  </Button>
                </TabsContent>

                <TabsContent value="sell" className="space-y-3 mt-0">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Amount ({tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker})</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={toggleTradeInputDenom}
                        >
                          {tradeInputDenom === "BNB" ? `Switch to ${tokenData.ticker}` : "Switch to BNB"}
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">Slippage: {SLIPPAGE_PCT}%</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-20 font-mono text-base focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="0"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="text-xs font-mono text-muted-foreground">{tradeInputDenom === "BNB" ? "BNB" : tokenData.ticker}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => {
                          if (tokenBalanceWei == null) return;
                          const amt = (tokenBalanceWei * 25n) / 100n;
                          setTradeAmount(ethers.formatUnits(amt, TOKEN_DECIMALS));
                        }}
                      >
                        25%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => {
                          if (tokenBalanceWei == null) return;
                          const amt = (tokenBalanceWei * 50n) / 100n;
                          setTradeAmount(ethers.formatUnits(amt, TOKEN_DECIMALS));
                        }}
                      >
                        50%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => {
                          if (tokenBalanceWei == null) return;
                          setTradeAmount(ethers.formatUnits(tokenBalanceWei, TOKEN_DECIMALS));
                        }}
                      >
                        100%
                      </Button>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        Balance:{" "}
                        {tradeInputDenom === "BNB"
                          ? formatBnbFromWei(bnbBalanceWei)
                          : `${formatTokenFromWei(tokenBalanceWei)} ${tokenData.ticker}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Payout: {tradeInputDenom === "BNB" ? formatBnbFromWei(effectiveBnbWei) : (quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—")}
                      </span>
                    </div>
                    {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Est. sell: {formatTokenFromWei(effectiveTokenWei)} {tokenData.ticker}</p>
                    ) : null}

                    {approvePending ? (
                      <p className="mt-2 text-center text-xs text-muted-foreground">Approval in progress...</p>
                    ) : null}
                    {quoteError ? (
                      <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p>
                    ) : null}
                  </div>

                  <div className="text-center text-xs text-muted-foreground">
                    {isDexStage ? (
                      isTopazTradingActive && quoteWei != null ? (
                        <p>
                          Topaz execution · min received protected by {(topazSlippageBps / 100).toFixed(2)}% slippage.
                          {` Est. ${formatBnbFromWei(quoteWei)}.`}
                        </p>
                      ) : (
                        <p>Topaz market verification is in progress. Bonding history remains available.</p>
                      )
                    ) : quoteWei != null ? (
                      <p>
                        You will receive ~{formatBnbFromWei(quoteWei)} (min {formatBnbFromWei((quoteWei * BigInt(100 - SLIPPAGE_PCT)) / 100n)})
                      </p>
                    ) : (
                      <p>Enter an amount to see the sell quote.</p>
                    )}
                  </div>

                  <Button
                    onClick={handlePlaceTrade}
                    disabled={
                      tradePending ||
                      approvePending ||
                      quoteLoading ||
                      (isDexStage && !isTopazTradingActive) ||
                      (tradeInputDenom === "BNB"
                        ? effectiveBnbWei <= 0n || effectiveTokenWei <= 0n
                        : parseTokenAmountWei(tradeAmount) <= 0n)
                    }
                    className={`w-full ${topbarButtonClass} py-5`}
                  >
                    {tradePending ? "Processing..." : isDexStage ? "Sell on Topaz" : "Sell"}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          </Card>

          <Card className="mt-3 bg-card/30 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-semibold">War Room</h3>
                <p className="text-[11px] text-muted-foreground">Live campaign chat</p>
              </div>
            </div>

            {campaign?.campaign ? (
              <TokenWarRoom
                chainId={getActiveChainId(wallet.chainId)}
                campaignAddress={campaign.campaign}
                creatorAddress={campaign.creator}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Loading chat…</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TokenDetails;
