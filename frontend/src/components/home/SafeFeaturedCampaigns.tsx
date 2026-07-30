import { useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";
import { useNavigate } from "react-router-dom";
import { ThumbsUp } from "lucide-react";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { apiFetch } from "@/lib/apiBase";
import { resolveImageUri } from "@/lib/media";
import { getReadProvider } from "@/lib/readProvider";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";
import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi;
const TOKEN_ABI = LaunchTokenArtifact.abi;

type FeaturedItem = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoUri?: string | null;
  votes24h?: number | null;
  votesAllTime?: number | null;
  marketcapBnb?: string | null;
  graduatedAtChain?: string | null;
  isDexTrading?: boolean;
};

type FeaturedCard = FeaturedItem & {
  mcapUsdLabel: string | null;
  athUsdLabel: string;
};

function isAddress(value: unknown) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function usefulImage(value: unknown) {
  const raw = String(value ?? "").trim();
  return Boolean(raw && raw !== "/placeholder.svg" && raw !== "-");
}

function formatCompactUsd(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function getAthLabel(chainId: number, campaignAddress: string, currentUsd: number | null) {
  if (typeof window === "undefined") return currentUsd != null ? formatCompactUsd(currentUsd) : "—";

  try {
    const key = `ath:${chainId}:${campaignAddress.toLowerCase()}:featured-v1`;
    const storedRaw = window.localStorage.getItem(key);
    const stored = storedRaw ? Number(storedRaw) : NaN;
    const storedValue = Number.isFinite(stored) ? stored : 0;
    const next = Math.max(storedValue, currentUsd ?? 0);

    if (currentUsd != null && Number.isFinite(currentUsd) && currentUsd > storedValue) {
      window.localStorage.setItem(key, String(currentUsd));
    }

    return next > 0 ? formatCompactUsd(next) : "—";
  } catch {
    return currentUsd != null ? formatCompactUsd(currentUsd) : "—";
  }
}

function normalizeItem(raw: any, fallbackChainId: number): FeaturedItem | null {
  const campaignAddress = String(raw?.campaignAddress ?? raw?.campaign_address ?? raw?.campaign ?? "").trim().toLowerCase();
  if (!isAddress(campaignAddress)) return null;
  return {
    chainId: Number(raw?.chainId ?? raw?.chain_id ?? fallbackChainId),
    campaignAddress,
    tokenAddress: raw?.tokenAddress ?? raw?.token_address ?? raw?.token ?? null,
    creatorAddress: raw?.creatorAddress ?? raw?.creator_address ?? raw?.creator ?? null,
    name: raw?.name ?? null,
    symbol: raw?.symbol ?? raw?.ticker ?? null,
    logoUri: raw?.logoUri ?? raw?.logo_uri ?? raw?.logoURI ?? null,
    votes24h: Number(raw?.votes24h ?? raw?.votes_24h ?? 0),
    votesAllTime: Number(raw?.votesAllTime ?? raw?.votes_all_time ?? 0),
    marketcapBnb: raw?.marketcapBnb ?? raw?.marketcap_bnb ?? null,
    graduatedAtChain: raw?.graduatedAtChain ?? raw?.graduated_at_chain ?? null,
    isDexTrading: Boolean(raw?.isDexTrading ?? raw?.is_dex_trading ?? raw?.status === "graduated"),
  };
}

async function safeString(read: () => Promise<unknown>, fallback = "") {
  try {
    const value = String((await read()) ?? "").trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

async function loadApiCandidates(chainId: number): Promise<FeaturedItem[]> {
  const query = new URLSearchParams({ chainId: String(chainId), limit: "20", sort: "activity", _r: String(Date.now()) });
  try {
    const response = await apiFetch(`/api/featured?${query.toString()}`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (response.ok && Array.isArray(json?.items)) {
      return json.items.map((item: any) => normalizeItem(item, chainId)).filter(Boolean) as FeaturedItem[];
    }
  } catch {
    // Continue to the live campaign fallback below.
  }

  query.set("status", "live");
  query.set("tab", "trending");
  query.set("sort", "default");
  try {
    const response = await apiFetch(`/api/campaigns?${query.toString()}`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (response.ok && Array.isArray(json?.items)) {
      return json.items.map((item: any) => normalizeItem(item, chainId)).filter(Boolean) as FeaturedItem[];
    }
  } catch {
    // The on-chain fallback below remains available.
  }

  return [];
}

async function loadOnChainCandidates(chainId: number): Promise<FeaturedItem[]> {
  try {
    const page = await fetchOnChainCampaignPage(chainId as any, { limit: 100, cursor: 0 });
    return page.campaigns.map((row) => normalizeItem({
      chainId,
      campaignAddress: row.campaign,
      tokenAddress: row.token,
      creatorAddress: row.creator,
      name: row.name,
      symbol: row.symbol,
      logoUri: row.logoURI,
    }, chainId)).filter(Boolean) as FeaturedItem[];
  } catch {
    return [];
  }
}

async function hydrateMissingSummary(item: FeaturedItem): Promise<FeaturedItem> {
  if (item.marketcapBnb != null && item.marketcapBnb !== "") return item;

  try {
    const response = await apiFetch(`/api/token/${item.campaignAddress}/summary?chainId=${item.chainId}`, {
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json) return item;

    return {
      ...item,
      marketcapBnb: json.marketcapBnb ?? json.marketcap_bnb ?? item.marketcapBnb ?? null,
      votes24h: Number(json.votes24h ?? json.votes_24h ?? item.votes24h ?? 0),
      votesAllTime: Number(json.votesAllTime ?? json.votes_all_time ?? item.votesAllTime ?? 0),
    };
  } catch {
    return item;
  }
}

async function verifyAndHydrateLive(items: FeaturedItem[], chainId: number): Promise<FeaturedItem[]> {
  const provider = getReadProvider(chainId as any);
  const checked = await Promise.all(items.slice(0, 100).map(async (item) => {
    if (item.graduatedAtChain || item.isDexTrading) return null;
    try {
      const campaign = new Contract(item.campaignAddress, CAMPAIGN_ABI, provider) as any;
      if (Boolean(await campaign.launched())) return null;

      const tokenAddress = isAddress(item.tokenAddress) ? String(item.tokenAddress).toLowerCase() : await safeString(() => campaign.token());
      const token = isAddress(tokenAddress) ? new Contract(tokenAddress, TOKEN_ABI, provider) as any : null;
      const [name, symbol, logoUri, creatorAddress] = await Promise.all([
        item.name ? Promise.resolve(String(item.name)) : token ? safeString(() => token.name(), "Unknown") : Promise.resolve("Unknown"),
        item.symbol ? Promise.resolve(String(item.symbol)) : token ? safeString(() => token.symbol(), "") : Promise.resolve(""),
        usefulImage(item.logoUri) ? Promise.resolve(String(item.logoUri)) : safeString(() => campaign.logoURI(), ""),
        item.creatorAddress ? Promise.resolve(String(item.creatorAddress)) : safeString(() => campaign.creator(), ""),
      ]);

      return hydrateMissingSummary({
        ...item,
        tokenAddress: isAddress(tokenAddress) ? tokenAddress.toLowerCase() : item.tokenAddress,
        creatorAddress: isAddress(creatorAddress) ? creatorAddress.toLowerCase() : item.creatorAddress,
        name,
        symbol,
        logoUri,
        isDexTrading: false,
        graduatedAtChain: null,
      } satisfies FeaturedItem);
    } catch (error) {
      console.warn("[SafeFeaturedCampaigns] lifecycle verification failed", item.campaignAddress, error);
      return null;
    }
  }));
  return checked.filter(Boolean) as FeaturedItem[];
}

export function SafeFeaturedCampaigns({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [chainId] = useSelectedFeedChainId();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ chainId?: number }>).detail;
      if (detail?.chainId != null && Number(detail.chainId) !== chainId) return;
      setRefresh((value) => value + 1);
    };
    window.addEventListener("memebattles:upvoteConfirmed", onRefresh as EventListener);
    window.addEventListener("memebattles:txConfirmed", onRefresh as EventListener);
    return () => {
      window.removeEventListener("memebattles:upvoteConfirmed", onRefresh as EventListener);
      window.removeEventListener("memebattles:txConfirmed", onRefresh as EventListener);
    };
  }, [chainId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const apiCandidates = await loadApiCandidates(chainId);
      const candidates = apiCandidates.length ? apiCandidates : await loadOnChainCandidates(chainId);
      const live = await verifyAndHydrateLive(candidates, chainId);
      if (cancelled) return;
      setItems(live);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [chainId, refresh]);

  const cards = useMemo<FeaturedCard[]>(() => {
    return items
      .slice()
      .sort((a, b) => Number(b.votes24h || 0) - Number(a.votes24h || 0))
      .slice(0, 20)
      .map((item) => {
        const mcapBnb = Number(item.marketcapBnb ?? NaN);
        const mcapUsd = Number.isFinite(mcapBnb) && Number.isFinite(Number(bnbUsd)) && Number(bnbUsd) > 0
          ? mcapBnb * Number(bnbUsd)
          : null;

        return {
          ...item,
          mcapUsdLabel: mcapUsd != null ? formatCompactUsd(mcapUsd) : null,
          athUsdLabel: getAthLabel(item.chainId, item.campaignAddress, mcapUsd),
        };
      });
  }, [items, bnbUsd]);

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 mwz-section-title text-sm md:text-base">
          <ThumbsUp className="h-4 w-4" />
          Featured Campaigns
        </div>
        <div className="hidden text-xs uppercase tracking-[0.16em] mwz-muted md:block">Live campaigns ranked by 24h UpVotes</div>
      </div>

      <div className="grid grid-flow-col grid-rows-2 auto-cols-[340px] gap-3 overflow-x-auto pb-1 pr-2 sm:auto-cols-[370px] lg:auto-cols-[392px]" style={{ scrollbarWidth: "none" }}>
        {loading && !cards.length ? Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="mwz-card h-[150px] animate-pulse" />
        )) : cards.length === 0 ? (
          <div className="mwz-muted py-8 text-sm">No live featured campaigns yet.</div>
        ) : cards.map((item, index) => {
          const image = usefulImage(item.logoUri) ? resolveImageUri(item.logoUri) : null;
          const target = item.tokenAddress || item.campaignAddress;
          return (
            <div
              key={item.campaignAddress}
              className="mwz-hud-frame group flex h-[150px] w-full cursor-pointer overflow-hidden rounded-none border border-orange-400/30 bg-black/70 transition hover:border-orange-400/80 hover:shadow-[0_0_18px_rgba(240,106,26,0.22)]"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/token/${target}?chainId=${item.chainId}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") navigate(`/token/${target}?chainId=${item.chainId}`);
              }}
            >
              <div className="relative h-[150px] w-[150px] shrink-0 overflow-hidden border-r border-orange-400/30 bg-black">
                <img src={image || "/placeholder.svg"} alt={item.name || "Campaign"} className="h-full w-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),transparent_40%,rgba(0,0,0,0.78))]" />
                <div className="absolute left-2 top-2 border border-orange-400/70 bg-black/75 px-2 py-1 text-xs font-bold text-orange-300">#{index + 1}</div>
                <div className="absolute inset-x-2 bottom-2" onClick={(event) => event.stopPropagation()}>
                  <UpvoteDialog campaignAddress={item.campaignAddress} chainId={item.chainId} className="mwz-button mwz-button-active h-9 w-full text-[11px]" buttonVariant="ghost" buttonSize="sm" />
                </div>
              </div>

              <div className="flex h-[150px] min-w-0 flex-1 flex-col justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[19px] font-semibold leading-tight text-foreground group-hover:text-orange-200">{item.name || "Unknown"}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-orange-300">{item.symbol ? `$${item.symbol}` : "—"}</span>
                    <span className="shrink-0 text-[12px] font-semibold text-orange-300">{Number(item.votes24h || 0)} votes / 24h</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] leading-tight">
                  <div className="min-w-0 rounded-sm border border-orange-400/20 bg-black/35 px-2 py-2">
                    <div className="uppercase tracking-[0.14em] text-orange-300/65">MCap</div>
                    <div className="mt-1 truncate text-[16px] font-bold text-foreground">{item.mcapUsdLabel ?? "—"}</div>
                  </div>
                  <div className="min-w-0 rounded-sm border border-orange-400/20 bg-black/35 px-2 py-2">
                    <div className="uppercase tracking-[0.14em] text-orange-300/65">ATH</div>
                    <div className="mt-1 truncate text-[16px] font-bold text-foreground">{item.athUsdLabel}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
