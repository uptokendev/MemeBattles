import { ExternalLink } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

function formatCount(value: number) {
  return Number(value || 0).toLocaleString();
}

export default function CommandCenterOverview() {
  const {
    walletAddress,
    displayName,
    avatarUrl,
    followersCount,
    followingCount,
    createdCount,
    loadingFollows,
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

  return (
    <div>
      <CommandCenterPageHeader
        title="Overview"
        description="Your home base for profile identity, ranking, league cabinet, and balances. Reward-specific actions stay inside their dedicated Command Center pages."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <CommandCenterCard title="Profile" description="Owner identity and public profile stats.">
          <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-background/25 p-4">
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-2xl border border-border/60 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-retro text-lg text-foreground">{displayName}</div>
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{walletAddress}</div>
              <a
                href={`/profile/${encodeURIComponent(walletAddress)}`}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/35 px-3 py-1 font-retro text-xs text-muted-foreground transition hover:border-accent/50 hover:text-foreground"
              >
                Public profile
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-border/50 bg-background/20 p-3">
              <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : formatCount(followersCount)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Followers</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/20 p-3">
              <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : formatCount(followingCount)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Following</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/20 p-3">
              <div className="font-retro text-lg text-foreground">{formatCount(createdCount)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Coins</div>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Ranking" description="Current rank with safe fallback for missing progress data.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Rank</div>
            <div className="mt-2 font-retro text-3xl text-foreground">{liveRank}</div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Progress-to-next-rank appears here once the API returns score, threshold, and remaining-score data.
            </p>
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

        <CommandCenterCard title="Balances" description="Wallet balance and detected launchpad token balances.">
          <div className="space-y-3 rounded-2xl border border-border/50 bg-background/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-retro text-sm text-foreground">Native BNB</div>
                <div className="mt-1 text-xs text-muted-foreground">Connected wallet balance</div>
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
                <div className="mt-3 space-y-2">
                  {tokenBalances.slice(0, 3).map((token) => (
                    <div key={`${token.tokenAddress}-${token.campaignAddress}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/25 p-3">
                      <div className="min-w-0">
                        <div className="truncate font-retro text-xs text-foreground">{token.name}</div>
                        <div className="text-xs text-muted-foreground">{token.ticker}</div>
                      </div>
                      <div className="shrink-0 text-right font-retro text-xs text-foreground">
                        {Number(token.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </div>
                    </div>
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
