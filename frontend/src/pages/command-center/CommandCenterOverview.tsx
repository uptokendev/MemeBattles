import { Link } from "react-router-dom";

import { getRankBadgeSrc, getRankIndex, RANK_SEQUENCE } from "@/lib/ranks";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

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
    liveRank,
    leagueCabinet,
    loadingLeagueCabinet,
    nativeBalance,
    tokenBalances,
    loadingBalances,
  } = useCommandCenterData();

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
        description="Your home base for ranking, League Cabinet, and balances. Reward-specific actions stay inside their dedicated Command Center pages."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <CommandCenterCard title="Ranking" description="Current rank badge and rank-ladder progress.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 md:p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-3xl border border-accent/35 bg-accent/10 p-2 shadow-xl sm:h-44 sm:w-44 lg:h-48 lg:w-48">
                <img
                  src={getRankBadgeSrc(rankProgress.currentRank)}
                  alt={`${rankProgress.currentRank} badge`}
                  className="h-full w-full scale-110 object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Rank</div>
                <div className="mt-2 font-retro text-3xl text-foreground">{rankProgress.currentRank}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {rankProgress.isMaxRank
                    ? "Max rank reached. General status unlocked."
                    : `Next rank: ${rankProgress.nextRank}`}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{RANK_SEQUENCE[0]}</span>
                <span className="font-retro text-foreground">{rankProgress.percent}%</span>
                <span>{RANK_SEQUENCE[RANK_SEQUENCE.length - 1]}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${rankProgress.percent}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] text-muted-foreground">
                {RANK_SEQUENCE.map((rank) => (
                  <span key={rank} className={rank === rankProgress.currentRank ? "font-retro text-accent" : ""}>
                    {rank}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CommandCenterCard>

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

        <CommandCenterCard title="Balances" description="Wallet balance and detected launchpad token balances." className="md:col-span-2">
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
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
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
