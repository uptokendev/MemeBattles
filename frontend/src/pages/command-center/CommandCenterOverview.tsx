import { Link } from "react-router-dom";
import { useMemo } from "react";
import { Flame } from "lucide-react";

import { getRankBadgeSrc, getRankIndex, RANK_SEQUENCE } from "@/lib/ranks";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { PortfolioMetricsGrid } from "@/components/profile/PortfolioMetricsGrid";
import type { PortfolioMetrics } from "@/lib/profile/portfolioCalculations";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRankProgress(rank: string) {
  const index = clamp(getRankIndex(rank), 0, RANK_SEQUENCE.length - 1);
  const maxIndex = Math.max(RANK_SEQUENCE.length - 1, 1);
  const currentRank = RANK_SEQUENCE[index] ?? RANK_SEQUENCE[0];
  const nextRank = RANK_SEQUENCE[index + 1] ?? null;
  const percent = Math.round((index / maxIndex) * 100);

  return {
    currentRank,
    nextRank,
    percent,
    isMaxRank: index >= RANK_SEQUENCE.length - 1,
  };
}

export default function CommandCenterOverview() {
  const {
    walletAddress,
    chainId,
    liveRank,
    leagueCabinet,
    loadingLeagueCabinet,
    nativeBalance,
    tokenBalances,
    loadingBalances,
    portfolioMetrics,
    loadingPortfolioMetrics,
    created,
  } = useCommandCenterData();

  // Incoming challenge detection — uses the same battle feed the Coins page relies on.
  // Shows a prominent tactical banner when any of the owner's coins have pending/accepted/open challenges waiting on them.
  const { creatorStatuses, openForBattleQueue, liveBattles } = useArenaBattleFeed(walletAddress || undefined, chainId);

  const incomingChallenges = useMemo(() => {
    if (!created?.length) return [] as any[];
    const myIdentities = new Set(
      created
        .map((c: any) => String(c?.campaignAddress || c?.campaign?.campaign || c?.campaign || c?.tokenAddress || "").toLowerCase())
        .filter(Boolean),
    );

    const pending: any[] = [];

    // From creator statuses (authoritative for owner's coins)
    (creatorStatuses || []).forEach((st) => {
      if (["pending", "accepted", "open_for_battle"].includes(st.currentState) && myIdentities.has(st.campaignAddress)) {
        pending.push({ id: st.battleId || st.campaignAddress, symbol: st.symbol || st.tokenName, state: st.currentState });
      }
    });

    // Cross-check live + open queues for battles where one side matches us and state implies action needed
    [...(openForBattleQueue || []), ...(liveBattles || [])].forEach((b: any) => {
      (b.participants || []).forEach((p: any) => {
        const pid = String(p?.campaignAddress || p?.tokenId || p?.tokenAddress || "").toLowerCase();
        if (myIdentities.has(pid) && ["pending", "accepted", "open_for_battle"].includes(b.state)) {
          if (!pending.some((x) => x.id === b.id)) {
            pending.push({ id: b.id, symbol: p?.symbol || p?.tokenName, state: b.state });
          }
        }
      });
    });

    return pending;
  }, [created, creatorStatuses, openForBattleQueue, liveBattles]);

  const trophyCount = Array.isArray((leagueCabinet as any)?.trophies)
    ? (leagueCabinet as any).trophies.length
    : Array.isArray((leagueCabinet as any)?.badges)
      ? (leagueCabinet as any).badges.length
      : 0;

  const rankProgress = getRankProgress(liveRank);

  return (
    <div>
      <CommandCenterPageHeader
        title="Overview"
        description="Your home base for ranking, reputation, League Cabinet, and balances. Reward-specific actions stay inside their dedicated Command Center pages."
      />

      {/* Strengthened incoming challenge banner - bigger, more urgent, tactical */}
      {incomingChallenges.length > 0 && (
        <div className="mb-4 mwz-hud-frame border-2 border-accent/80 bg-accent/15 p-5 shadow-[0_0_0_1px_rgba(255,122,26,0.15)]">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/60 bg-accent/20">
                <Flame className="h-5 w-5 text-accent animate-pulse" />
              </div>
              <div>
                <div className="font-retro text-lg tracking-[0.06em] text-accent">
                  INCOMING CHALLENGE{incomingChallenges.length > 1 ? "S" : ""} DETECTED
                </div>
                <div className="text-sm text-foreground mt-0.5">
                  {incomingChallenges.length} of your coins {incomingChallenges.length === 1 ? "has" : "have"} active rival requests waiting.
                </div>
              </div>
            </div>

            <Link
              to="/command/coins"
              className="ml-auto inline-flex items-center rounded border-2 border-accent px-4 py-2 text-sm font-retro text-accent transition hover:bg-accent hover:text-background active:scale-[0.985]"
            >
              RESPOND NOW IN COINS
            </Link>
          </div>

          <div className="mt-3 text-xs text-muted-foreground pl-12">
            {incomingChallenges.slice(0, 3).map((ch, i) => (
              <span key={i} className="mr-4">• ${ch.symbol} — {ch.state.replaceAll("_", " ")}</span>
            ))}
            {incomingChallenges.length > 3 ? `+${incomingChallenges.length - 3} more` : null}
          </div>
        </div>
      )}

      {/* Portfolio Metrics — Phase 4 integration.
          Fresh data from improved useProfileBalances hook + context.
          Replaces/de-emphasizes the previous dominant Ranking + Reputation cards. */}
      <div className="mb-4">
        <PortfolioMetricsGrid
          metrics={portfolioMetrics}
          loading={loadingPortfolioMetrics}
          variant="command-center"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Old Overview cards (Ranking + Reputation) removed per requirements.
            Only League Cabinet and Balances remain below the new Portfolio Metrics grid. */}

        <CommandCenterCard title="League Cabinet" description="Badges, trophies, and league status.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            {loadingLeagueCabinet ? (
              <div className="font-retro text-sm text-muted-foreground">Loading league cabinet...</div>
            ) : trophyCount > 0 ? (
              <>
                <div className="font-retro text-3xl text-foreground">{trophyCount}</div>
                <p className="mt-2 text-sm text-muted-foreground">Cabinet items detected for this wallet.</p>
              </>
            ) : (
              <>
                <div className="font-retro text-lg text-foreground">No trophies yet</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  League wins, badges, and status items will appear here once earned.
                </p>
              </>
            )}
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Balances" description="Wallet balance and detected launchpad token balances.">
          <div className="space-y-3 rounded-2xl border border-border/50 bg-background/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/50 bg-card/35">
                  <img src="/assets/ticker.png" alt="BNB" className="h-7 w-7 object-contain" />
                </div>
                <div>
                  <div className="font-retro text-sm text-foreground">Native BNB</div>
                  <div className="mt-1 text-xs text-muted-foreground">Connected wallet balance</div>
                </div>
              </div>
              <div className="shrink-0 font-retro text-sm text-foreground">
                {loadingBalances ? "Loading..." : nativeBalance || "-"}
              </div>
            </div>
            <div className="border-t border-border/50 pt-3">
              <div className="font-retro text-sm text-foreground">Token balances</div>
              {loadingBalances ? (
                <div className="mt-2 text-sm text-muted-foreground">Loading token balances...</div>
              ) : tokenBalances.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {tokenBalances.slice(0, 6).map((token) => (
                    <Link
                      key={`${token.tokenAddress}-${token.campaignAddress}`}
                      to={`/token/${token.campaignAddress}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/25 p-3 transition hover:border-accent/50 hover:bg-card/45"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={(token as any).image || "/placeholder.svg"}
                          alt={token.ticker || token.name}
                          className="h-10 w-10 shrink-0 rounded-xl border border-border/50 object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-retro text-xs text-foreground">{token.name}</div>
                          <div className="text-xs text-muted-foreground">{token.ticker}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-retro text-xs text-foreground">
                        {Number(token.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">No launchpad token balances detected yet.</div>
              )}
            </div>
          </div>
        </CommandCenterCard>
      </div>
    </div>
  );
}
