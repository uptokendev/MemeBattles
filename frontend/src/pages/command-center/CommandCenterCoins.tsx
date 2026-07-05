import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleSlash, Coins, FileText, Rocket, ShieldAlert, Swords } from "lucide-react";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

import { BattlefieldMatrixScanner } from "@/components/command-center/BattlefieldMatrixScanner";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { PostGradCoinCard } from "@/components/postgrad/PostGradCoinCard";
import { CommandCenterCoinRow } from "@/components/postgrad/CommandCenterCoinRow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  if (unavailableReason === "campaign_not_found") {
    return "This coin could not be resolved in the campaign feed yet.";
  }
  if (unavailableReason === "campaign_not_live") {
    return "This coin has not reached the live campaign state yet, so it cannot open a battle.";
  }
  if (unavailableReason === "campaign_inactive") {
    return "This coin is no longer active in the campaign feed, so it cannot enter the Arena right now.";
  }
  if (unavailableReason === "graduated_to_dex") {
    return "This coin already graduated to DEX, so it is not eligible for this Arena queue.";
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
  const [battleBusyToken, setBattleBusyToken] = useState<string | null>(null);
  const [battleNotice, setBattleNotice] = useState<string | null>(null);

  // Battle pot funding dialog state
  const [potDialogOpen, setPotDialogOpen] = useState(false);
  const [potDialogToken, setPotDialogToken] = useState<{ id: string; name: string } | null>(null);
  const [potAmountBnb, setPotAmountBnb] = useState("0.1");
  const [potSubmitting, setPotSubmitting] = useState(false);
  const {
    getBattleForToken,
    getCreatorCoinStatus,
    openCreatorCoinForBattle,
    openForBattleQueue,
    source: battleSource,
  } = useArenaBattleFeed(walletAddress || undefined, chainId);

  const navigate = useNavigate();
  const { fetchCampaignLogoURI } = useLaunchpad();

  // Logo hydration state must come before anything that uses it
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});

  // createdCoins must be declared early because unifiedItems, filteredItems,
  // and the logo hydration effect all reference it (TDZ fix)
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
          image: resolveImageUri(logoCache[campaignAddress?.toLowerCase?.()] || getCreatedCoinImage(coin)) || '/placeholder.svg',
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
  }, [created, logoCache]);  // include logoCache since it's used inside

  // Logo hydration effect — placed after createdCoins declaration to avoid TDZ
  useEffect(() => {
    let cancelled = false;
    const missing = (createdCoins || [])
      .map((c) => c.campaignAddress?.toLowerCase())
      .filter((addr): addr is string => !!addr && !logoCache[addr]);

    if (!missing.length) return;

    (async () => {
      try {
        const pairs = await Promise.all(
          missing.map(async (addr) => [addr, await fetchCampaignLogoURI(addr).catch(() => null)] as const)
        );
        if (cancelled) return;
        setLogoCache((prev) => {
          const next = { ...prev };
          for (const [addr, uri] of pairs) {
            if (uri) next[addr] = uri;
          }
          return next;
        });
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [createdCoins, logoCache, fetchCampaignLogoURI]);

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

  // New unified filter state for the combined Launched Coins + Drafts section
  const [activeFilter, setActiveFilter] = useState<'all' | 'drafts' | 'coins' | 'open_for_battle' | 'in_battle'>('all');

  // Build a unified list of items (drafts + launched coins with battle status)
  const unifiedItems = useMemo(() => {
    const items: any[] = [];

    // Add drafts
    drafts.forEach((draft) => {
      items.push({
        id: draft.id,
        type: 'draft',
        name: draft.name,
        ticker: draft.ticker,
        image: resolveImageUri(draft.logoUrl) || '/placeholder.svg',
        status: draft.status.replace(/_/g, ' '),
        visibility: draft.visibility,
        updatedAt: formatDate(draft.updatedAt),
        category: draft.category || '—',
        href: draftHref(draft),
      });
    });

    // Add launched coins with battle context (reusing existing createdCoins logic)
    createdCoins.forEach((coin) => {
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
      const isOpening = battleBusyToken === coin.campaignAddress;

      let battleInfo = '';
      if (creatorState === 'open_for_battle') battleInfo = 'Open for Battle';
      else if (['pending', 'accepted', 'live'].includes(creatorState)) battleInfo = 'In Battle';

      const tokenRoute = getPostGradTokenDetailRoute(coin.campaignAddress);

      // Pre-build actions for the coin card
      let actions: React.ReactNode = null;
      if (tokenRoute) {
        actions = (
          <>
            <Button asChild size="sm" variant="outline">
              <Link to={tokenRoute}>Details</Link>
            </Button>
            {creatorState === "eligible" ? (
              <Button size="sm" disabled={isOpening} onClick={() => void handleOpenForBattle(coin.campaignAddress, coin.name)}>
                {isOpening ? "Opening..." : "Open for battle"}
              </Button>
            ) : battleRouteId ? (
              <Button asChild size="sm">
                <Link to={`/battle/${battleRouteId}`}>
                  {creatorState === "open_for_battle" || creatorState === "pending" || creatorState === "accepted" ? "View" : "Battle"}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Unavailable
              </Button>
            )}
          </>
        );
      }

      items.push({
        id: coin.campaignAddress,
        type: 'coin',
        name: coin.name,
        ticker: coin.ticker,
        image: resolveImageUri(logoCache[coin.campaignAddress?.toLowerCase?.()] || coin.image) || '/placeholder.svg',
        marketCap: coin.marketCap,
        statusLabel,
        statusTone,
        battleInfo,
        battleRouteId,
        tokenRoute,
        creatorState,
        isOpening,
        actions,
      });
    });

    return items;
  }, [drafts, createdCoins, getBattleForToken, getCreatorCoinStatus, battleBusyToken]);

  // Filtered list based on active filter
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return unifiedItems;

    return unifiedItems.filter((item) => {
      if (activeFilter === 'drafts') return item.type === 'draft';
      if (activeFilter === 'coins') return item.type === 'coin' && !item.battleInfo;
      if (activeFilter === 'open_for_battle') return item.type === 'coin' && item.creatorState === 'open_for_battle';
      if (activeFilter === 'in_battle') return item.type === 'coin' && ['pending', 'accepted', 'live'].includes(item.creatorState);
      return true;
    });
  }, [unifiedItems, activeFilter]);

  const handleOpenForBattle = async (campaignAddress: string, name: string) => {
    // Open the pot funding dialog instead of immediate action
    setPotDialogToken({ id: campaignAddress, name });
    setPotAmountBnb("0.1");
    setPotDialogOpen(true);
    setBattleNotice(null);
  };

  const confirmOpenForBattleWithPot = async () => {
    if (!potDialogToken) return;

    const amount = parseFloat(potAmountBnb);
    if (!amount || amount < 0.1) {
      setBattleNotice("Minimum battle pot is 0.1 BNB.");
      return;
    }

    setPotSubmitting(true);
    setBattleBusyToken(potDialogToken.id);

    try {
      const opened = await openCreatorCoinForBattle(potDialogToken.id, amount);
      if (opened) {
        setBattleNotice(`${potDialogToken.name} is now open for battle with a ${amount} BNB pot.`);
        setPotDialogOpen(false);
        setPotDialogToken(null);
      } else {
        setBattleNotice(`Could not open ${potDialogToken.name} for battle.`);
      }
    } catch (error: any) {
      setBattleNotice(error?.message || `Could not open ${potDialogToken.name} for battle.`);
    } finally {
      setPotSubmitting(false);
      setBattleBusyToken(null);
    }
  };

  const handleChallengeRival = (battleId: string, rivalName: string, rivalSymbol: string) => {
    setBattleNotice(`Challenging ${rivalName} (${rivalSymbol}) — opening battle intel...`);
    // Navigate to the public battle viewer (user can join as challenger from there)
    navigate(`/battle/${battleId}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="mwz-hud-frame p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Launched coins</span>
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
        title="Launched Coins & Drafts" 
        description="All your launched coins and prepare drafts. Filter by status to quickly find drafts, battle-eligible coins, or ones involved in challenges."
      >
        {battleNotice ? <div className="mb-3 mwz-hud-frame p-3 text-sm text-muted-foreground">{battleNotice}</div> : null}

        {/* Filter controls */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(['all', 'drafts', 'coins', 'open_for_battle', 'in_battle'] as const).map((filter) => {
            const label = filter === 'all' ? 'All' 
              : filter === 'drafts' ? 'Drafts' 
              : filter === 'coins' ? 'Launched Coins' 
              : filter === 'open_for_battle' ? 'Open for Battle' 
              : 'In Battles / Challenged';
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded border px-3 py-1 font-retro text-xs uppercase tracking-wider transition ${
                  isActive 
                    ? 'border-accent bg-accent/10 text-accent shadow-[0_0_14px_rgba(255,122,26,0.20)]' 
                    : 'border-success/25 text-success/70 hover:border-accent/60 hover:text-accent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Metric header row - matching War Room style */}
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
                onOpenForBattle={handleOpenForBattle}
                battleBusyToken={battleBusyToken}
              />
            ))}
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">
            Nothing matches the current filter.
          </div>
        )}
      </CommandCenterCard>

      {/* Find a Rival — challenger discovery hub per PostGrad direction.
          Curated similar open-for-battle coins + the full "AUTODETECT BATTLEFIELD TARGET"
          matrix scanner (pre-fetched data, real + flair metrics, instant client-side scoring). */}
      <CommandCenterCard
        title="Find a Rival"
        description="Open-for-battle memecoins ranked by battlefield similarity (Market Cap / Holders / Volume). Autoselect runs an instant matrix analysis on cached queue data."
      >
        <BattlefieldMatrixScanner
          openForBattleQueue={openForBattleQueue}
          userCoins={createdCoins.map((c) => ({
            campaignAddress: c.campaignAddress,
            name: c.name,
            ticker: c.ticker,
            marketCap: c.marketCap,
          }))}
          onChallenge={handleChallengeRival}
        />
      </CommandCenterCard>

      {/* Old separate "Launched coins" and "Prepare drafts" sections have been merged 
          into the unified "Launched Coins & Drafts" card above with filtering. */}

      {/* Battle Pot Funding Dialog */}
      <Dialog open={potDialogOpen} onOpenChange={setPotDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-retro">Open for Battle — Fund the Pot</DialogTitle>
            <DialogDescription>
              Creators put BNB into the battle pot. The winner of the battle claims the pot.
              You set the amount. Minimum 0.1 BNB.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
                Battle Pot (BNB)
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={potAmountBnb}
                  onChange={(e) => setPotAmountBnb(e.target.value)}
                  className="font-retro text-lg"
                  disabled={potSubmitting}
                />
                <div className="flex items-center px-3 text-sm font-retro text-muted-foreground border border-border rounded">
                  BNB
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5">
                Minimum: 0.1 BNB. You decide the exact amount.
              </div>
            </div>

            <div className="flex gap-2">
              {[0.1, 0.25, 0.5, 1].map((val) => (
                <Button
                  key={val}
                  variant="outline"
                  size="sm"
                  className="font-retro text-xs"
                  onClick={() => setPotAmountBnb(val.toString())}
                  disabled={potSubmitting}
                >
                  {val} BNB
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPotDialogOpen(false);
                setPotDialogToken(null);
              }}
              disabled={potSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmOpenForBattleWithPot}
              disabled={potSubmitting || parseFloat(potAmountBnb) < 0.1}
              className="mwz-button mwz-button-orange font-retro"
            >
              {potSubmitting ? "Processing..." : "Confirm & Open for Battle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
