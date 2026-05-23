import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleSlash, Coins, FileText, Rocket, ShieldAlert, Swords } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { fetchOwnerCampaignDrafts, type CampaignDraft } from "@/lib/draftApi";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";

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
  if (state === "eligible") return "Ready to open";
  if (state === "unavailable") return "Unavailable";
  return state.replaceAll("_", " ");
}

function getCreatorReason(unavailableReason: string | null | undefined, fallback: string) {
  if (unavailableReason === "campaign_not_live") {
    return "This coin has not reached the live campaign state yet, so it cannot open a battle.";
  }
  if (unavailableReason === "campaign_inactive") {
    return "This coin is no longer active in the campaign feed, so it cannot enter the Arena right now.";
  }
  if (unavailableReason === "already_open_for_battle") {
    return "This coin is already listed in the open queue and is waiting for a rival.";
  }
  if (unavailableReason === "battle_match_pending") {
    return "This coin already has a queued match in progress and cannot open another one.";
  }
  if (unavailableReason === "already_in_battle") {
    return "This coin is already attached to a live or recently completed battle and cannot open another one yet.";
  }
  return fallback;
}

function getCreatedCoinIdentity(coin: any) {
  return normalizeIdentity(coin?.campaignAddress || coin?.campaign?.campaign || coin?.campaign || coin?.tokenAddress || coin?.token);
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
  const {
    getBattleForToken,
    getCreatorCoinStatus,
    openCreatorCoinForBattle,
    source: battleSource,
  } = useArenaBattleFeed(walletAddress || undefined);

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

  const createdCoins = useMemo(() => {
    return created
      .map((coin: any) => {
        const campaignAddress = getCreatedCoinIdentity(coin);
        if (!campaignAddress) return null;
        return {
          raw: coin,
          campaignAddress,
          name: getCreatedCoinName(coin),
          ticker: getCreatedCoinTicker(coin),
          image: getCreatedCoinImage(coin),
          marketCap: getCreatedCoinMarketCap(coin),
          status: String(coin?.status || coin?.campaign?.status || "live").toLowerCase(),
        };
      })
      .filter(Boolean) as Array<{
        raw: any;
        campaignAddress: string;
        name: string;
        ticker: string;
        image: string;
        marketCap: string;
        status: string;
      }>;
  }, [created]);

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Coins & Drafts"
        description="Coins you launched, battle controls, and Prepare Mode drafts owned by this wallet."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card/25 p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Launched coins</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{created.length.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/25 p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Prepare drafts</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{loadingDrafts ? "..." : drafts.length.toLocaleString()}</div>
        </div>
        <Link to="/create" className="rounded-2xl border border-border/50 bg-card/25 p-4 transition hover:border-accent/50 hover:bg-card/45">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Create</span>
          </div>
          <div className="font-retro text-2xl text-foreground">New coin</div>
        </Link>
      </div>

      <CommandCenterCard title="Battle controls" description="Private battle opt-in and live battle state for coins owned by this wallet.">
        {createdCoins.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {createdCoins.map((coin) => {
              const tokenRoute = getPostGradTokenDetailRoute(coin.campaignAddress);
              const battle = getBattleForToken(coin.campaignAddress);
              const creatorStatus = getCreatorCoinStatus(coin.campaignAddress);
              const fallbackState = battle
                ? battle.state
                : coin.status === "draft"
                  ? "unavailable"
                  : "eligible";
              const creatorState = creatorStatus?.currentState ?? fallbackState;
              const statusLabel = getCreatorStateLabel(creatorState);
              const statusTone = getCreatorStateTone(creatorState);
              const battleRouteId = creatorStatus?.battleId ?? battle?.id ?? null;
              const fallbackReason = creatorState === "eligible"
                ? "This coin is free to open a new challenge from Command Center."
                : creatorState === "unavailable"
                  ? battleSource === "empty"
                    ? "Battle status is not available on this branch yet, so readiness cannot be verified here."
                    : "This coin is not available to open a battle right now."
                  : creatorState === "open_for_battle" || creatorState === "pending" || creatorState === "accepted"
                    ? "This coin already has an active challenge in the queue and is waiting for a rival or acceptance."
                    : "This coin is already assigned to a live or recently settled battle and cannot open another one yet.";
              const reason = getCreatorReason(creatorStatus?.unavailableReason, fallbackReason);

              return (
                <div key={coin.campaignAddress} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                  <div className="flex items-start gap-3">
                    <img src={coin.image} alt={coin.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-retro text-base text-foreground">{coin.name}</div>
                        <div className="text-xs text-muted-foreground">${coin.ticker}</div>
                        <TacticalTag label={statusLabel} tone={statusTone} />
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">Market cap {coin.marketCap}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-border/50 bg-card/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {creatorState === "eligible" ? <Rocket className="h-4 w-4 text-emerald-300" /> : creatorState === "unavailable" ? <ShieldAlert className="h-4 w-4 text-muted-foreground" /> : <CircleSlash className="h-4 w-4 text-orange-200" />}
                        Availability
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{reason}</p>
                      {battle ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <TacticalTag label={battle.state.replaceAll("_", " ")} tone={creatorState === "live" ? "hot" : creatorState === "open_for_battle" || creatorState === "pending" || creatorState === "accepted" ? "sponsored" : "default"} />
                          <span>{battle.participants[0].symbol} vs {battle.participants[1].symbol}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-border/50 bg-card/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Swords className="h-4 w-4 text-accent" />
                        Actions
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tokenRoute ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={tokenRoute}>Token details</Link>
                          </Button>
                        ) : null}

                        {creatorState === "eligible" ? (
                          <Button size="sm" onClick={() => openCreatorCoinForBattle(coin.campaignAddress)}>
                            Open for battle
                          </Button>
                        ) : battleRouteId ? (
                          <Button asChild size="sm">
                            <Link to={`/battle/${battleRouteId}`}>{creatorState === "open_for_battle" || creatorState === "pending" || creatorState === "accepted" ? "View queue" : "Open battle"}</Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            Unavailable
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
            No launched coins yet.
          </div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Launched coins" description="Campaigns created by this wallet.">
        {created.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {created.map((coin: any) => {
              const campaignAddress = String(coin?.campaignAddress || coin?.campaign?.campaign || coin?.campaign || "");
              const name = String(coin?.name || coin?.campaign?.name || "Unnamed coin");
              const ticker = String(coin?.ticker || coin?.symbol || coin?.campaign?.symbol || "???");
              const image = String(coin?.image || coin?.logoURI || coin?.campaign?.logoURI || "/placeholder.svg");
              const marketCap = String(coin?.marketCap || coin?.stats?.marketCap || "—");
              const href = campaignAddress ? `/token/${campaignAddress}` : "/command/coins";

              return (
                <Link key={`${campaignAddress}-${name}`} to={href} className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35">
                  <div className="flex items-center gap-3">
                    <img src={image} alt={name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{name}</div>
                      <div className="text-xs text-muted-foreground">${ticker}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Market cap</div>
                      <div className="text-foreground">{marketCap}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div className="capitalize text-foreground">{String(coin?.status || "live")}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
            No launched coins yet.
          </div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Prepare drafts" description="Drafts owned by this wallet.">
        {loadingDrafts ? (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">Loading drafts...</div>
        ) : draftsError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{draftsError}</div>
        ) : drafts.length > 0 ? (
          <div className="grid gap-0 overflow-hidden rounded-2xl border border-border/50 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                to={draftHref(draft)}
                className="rounded-none border-0 border-b border-r border-border/50 bg-background/25 p-4 transition hover:bg-card/35"
              >
                <div className="flex items-center gap-3">
                  <img src={draft.logoUrl || "/placeholder.svg"} alt={draft.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0">
                    <div className="truncate font-retro text-sm text-foreground">{draft.name}</div>
                    <div className="text-xs text-muted-foreground">${draft.ticker}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="capitalize text-foreground">{draft.status.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Visibility</div>
                    <div className="capitalize text-foreground">{draft.visibility}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Updated</div>
                    <div className="text-foreground">{formatDate(draft.updatedAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Category</div>
                    <div className="capitalize text-foreground">{draft.category || "—"}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
            No Prepare drafts yet.
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
