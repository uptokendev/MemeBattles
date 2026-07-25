import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, FileText, Rocket } from "lucide-react";
import { resolveImageUri } from "@/lib/media";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { CommandCenterCoinRow } from "@/components/postgrad/CommandCenterCoinRow";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { fetchOwnerCampaignDrafts, type CampaignDraft } from "@/lib/draftApi";

const BATTLE_FEATURES_ENABLED = false;

type CoinFilter = "all" | "drafts" | "coins" | "open_for_battle" | "in_battle";

const baseFilters: Array<{ key: CoinFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "coins", label: "Coins" },
];

const battleFilters: Array<{ key: CoinFilter; label: string }> = [
  { key: "open_for_battle", label: "Open for Battle" },
  { key: "in_battle", label: "In Battles / Challenged" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function draftHref(draft: CampaignDraft) {
  return draft.slug ? `/prepare/${draft.slug}` : `/drafts/${draft.id}`;
}

function normalizeIdentity(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function getCreatorStateTone(state: string) {
  if (state === "eligible") return "success" as const;
  if (state === "unavailable") return "default" as const;
  if (state === "open_for_battle" || state === "pending" || state === "accepted") return "sponsored" as const;
  return "hot" as const;
}

function getCreatorStateLabel(state: string) {
  if (state === "eligible") return "Live";
  if (state === "unavailable") return "Unavailable";
  return state.replaceAll("_", " ");
}

function getCreatedCoinIdentity(coin: any) {
  return normalizeIdentity(coin?.campaignAddress || coin?.campaign?.campaign || coin?.campaign || coin?.tokenAddress || coin?.token);
}

function getCreatedCoinTokenIdentity(coin: any) {
  return normalizeIdentity(coin?.tokenAddress || coin?.campaign?.token || coin?.token || coin?.campaignAddress || coin?.campaign?.campaign || coin?.campaign);
}

function getCreatedCoinName(coin: any) {
  return String(coin?.name || coin?.campaign?.name || "Unnamed coin");
}

function getCreatedCoinTicker(coin: any) {
  return String(coin?.ticker || coin?.symbol || coin?.campaign?.symbol || "???");
}

function getCreatedCoinImage(coin: any) {
  return String(coin?.image || coin?.logoURI || coin?.logoUrl || coin?.campaign?.logoURI || "/placeholder.svg");
}

function getCreatedCoinMarketCap(coin: any) {
  return String(coin?.marketCap || coin?.stats?.marketCap || coin?.campaign?.marketCap || "—");
}

export default function CommandCenterCoins() {
  const { walletAddress, chainId, created } = useCommandCenterData();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CoinFilter>("all");

  const visibleFilters = useMemo(
    () => (BATTLE_FEATURES_ENABLED ? [...baseFilters, ...battleFilters] : baseFilters),
    [],
  );

  const createdCoins = useMemo(() => {
    return created
      .map((coin: any) => {
        const campaignAddress = getCreatedCoinIdentity(coin);
        const tokenAddress = getCreatedCoinTokenIdentity(coin);
        if (!campaignAddress) return null;
        return {
          raw: coin,
          campaignAddress,
          tokenAddress,
          name: getCreatedCoinName(coin),
          ticker: getCreatedCoinTicker(coin),
          image: resolveImageUri(getCreatedCoinImage(coin)) || "/placeholder.svg",
          marketCap: getCreatedCoinMarketCap(coin),
          status: String(coin?.status || coin?.campaign?.status || "live").toLowerCase(),
        };
      })
      .filter(Boolean) as Array<{
        raw: any;
        campaignAddress: string;
        tokenAddress: string;
        name: string;
        ticker: string;
        image: string;
        marketCap: string;
        status: string;
      }>;
  }, [created]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDrafts(true);
    setDraftsError(null);

    void fetchOwnerCampaignDrafts(walletAddress, { chainId, limit: 100 })
      .then((items) => {
        if (!cancelled) setDrafts(Array.isArray(items) ? items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setDrafts([]);
          setDraftsError(String(err?.message || "Failed to load owned drafts."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDrafts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, chainId]);

  const unifiedItems = useMemo(() => {
    const items: any[] = [];

    drafts.forEach((draft) => {
      items.push({
        id: draft.id,
        type: "draft",
        name: draft.name,
        ticker: draft.ticker,
        image: resolveImageUri(draft.logoUrl) || "/placeholder.svg",
        status: draft.status.replace(/_/g, " "),
        visibility: draft.visibility,
        updatedAt: formatDate(draft.updatedAt),
        category: draft.category || "—",
        href: draftHref(draft),
      });
    });

    createdCoins.forEach((coin) => {
      const creatorState = coin.status === "draft" ? "unavailable" : "eligible";
      const tokenRoute = getPostGradTokenDetailRoute(coin.tokenAddress || coin.campaignAddress);

      items.push({
        id: coin.campaignAddress,
        type: "coin",
        name: coin.name,
        ticker: coin.ticker,
        image: resolveImageUri(coin.image) || "/placeholder.svg",
        marketCap: coin.marketCap,
        statusLabel: getCreatorStateLabel(creatorState),
        statusTone: getCreatorStateTone(creatorState),
        battleInfo: "",
        battleRouteId: null,
        tokenRoute,
        creatorState,
        isOpening: false,
      });
    });

    return items;
  }, [drafts, createdCoins]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return unifiedItems;

    return unifiedItems.filter((item) => {
      if (activeFilter === "drafts") return item.type === "draft";
      if (activeFilter === "coins") return item.type === "coin";
      if (!BATTLE_FEATURES_ENABLED) return true;
      if (activeFilter === "open_for_battle") return item.type === "coin" && item.creatorState === "open_for_battle";
      if (activeFilter === "in_battle") return item.type === "coin" && ["pending", "accepted", "live"].includes(item.creatorState);
      return true;
    });
  }, [unifiedItems, activeFilter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="mwz-hud-frame p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Live coins</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{created.length.toLocaleString()}</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Prepare drafts</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{loadingDrafts ? "..." : drafts.length.toLocaleString()}</div>
        </div>
        <Link to="/create" className="mwz-hud-frame p-4 transition hover:border-accent/50 hover:bg-card/45">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Create</span>
          </div>
          <div className="font-retro text-2xl text-foreground">New coin</div>
        </Link>
      </div>

      <CommandCenterCard
        title="My Coins"
        description="All your coins in one place: prepare drafts, bonding coins, and graduated coins."
      >
        {draftsError ? <div className="mb-3 mwz-hud-frame p-3 text-sm text-muted-foreground">{draftsError}</div> : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {visibleFilters.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded border px-3 py-1 font-retro text-xs uppercase tracking-wider transition ${
                  isActive
                    ? "border-accent bg-accent/10 text-accent shadow-[0_0_14px_rgba(255,122,26,0.20)]"
                    : "border-success/25 text-success/70 hover:border-accent/60 hover:text-accent"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="hidden lg:grid grid-cols-[minmax(280px,1.4fr)_100px_100px_100px_28px] gap-3 border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/50">
          <div>Coin info</div>
          <div>Market Cap</div>
          <div>Liquidity</div>
          <div>Volume / Holders</div>
          <div />
        </div>

        {filteredItems.length > 0 ? (
          <div className="border-t border-white/8">
            {filteredItems.map((item) => (
              <CommandCenterCoinRow
                key={item.id}
                item={item}
                battleFeaturesEnabled={BATTLE_FEATURES_ENABLED}
              />
            ))}
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">
            Nothing matches the current filter.
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
