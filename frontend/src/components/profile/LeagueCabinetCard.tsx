import { useMemo, useState } from "react";
import { ChevronRight, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LeagueCabinet } from "@/lib/leagueCabinet";
import { formatEpochLabel, formatMetric, formatWinPlacement, getLeagueImage, getLeagueTitle } from "@/lib/leagueCabinet";
import { LeagueWinsDialog } from "@/components/profile/LeagueWinsDialog";

function PreviewWinCard({ item }: { item: LeagueCabinet["items"][number] }) {
  const metric = formatMetric(item);

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3">
      <div className="flex items-start gap-3">
        <img src={getLeagueImage(item.category)} alt={getLeagueTitle(item.category)} className="h-16 w-16 rounded-xl border border-border object-cover" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              {formatWinPlacement(item)}
            </Badge>
          </div>
          <div className="truncate font-retro text-sm text-foreground">{getLeagueTitle(item.category)}</div>
          <div className="mt-1 truncate font-retro text-[11px] text-muted-foreground">{formatEpochLabel(item)}</div>
          <div className="mt-2 font-retro text-[11px] text-muted-foreground">
            {metric.label}: <span className="text-foreground">{metric.value}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LeagueCabinetCard({
  cabinet,
  loading,
  displayName,
}: {
  cabinet: LeagueCabinet | null;
  loading: boolean;
  displayName?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const latestWins = useMemo(() => cabinet?.items.slice(0, 3) ?? [], [cabinet]);
  const topMastery = useMemo(() => cabinet?.mastery.slice(0, 3) ?? [], [cabinet]);

  return (
    <>
      <div className="rounded-2xl border border-border bg-background/40 p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-retro text-lg text-foreground">League Cabinet</div>
            <div className="font-retro text-xs text-muted-foreground">
              Latest wins on the profile, full cabinet in the modal, and share-ready templates for social flex.
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="font-retro"
            onClick={() => setOpen(true)}
            disabled={loading || !(cabinet?.items.length ?? 0)}
          >
            show all wins
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : !cabinet || !cabinet.items.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/30 p-6 text-center">
            <Trophy className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <div className="font-retro text-foreground">No recorded league wins yet.</div>
            <div className="mt-1 font-retro text-xs text-muted-foreground">
              Once a player starts winning leagues, this cabinet becomes a collectible showcase.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
                {cabinet.summary.totalWins} total wins
              </Badge>
              <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                {cabinet.summary.totalTitles} titles
              </Badge>
              <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                {cabinet.summary.uniqueLeagues} leagues conquered
              </Badge>
              {cabinet.summary.bestTier ? (
                <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                  best tier: {cabinet.summary.bestTier}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {latestWins.map((item) => (
                <PreviewWinCard key={item.id} item={item} />
              ))}
            </div>

            {topMastery.length ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {topMastery.map((entry) => (
                  <div key={entry.category} className="rounded-2xl border border-border bg-card/30 p-3">
                    <div className="mb-3 flex items-center gap-3">
                      <img src={getLeagueImage(entry.category)} alt={getLeagueTitle(entry.category)} className="h-12 w-12 rounded-xl border border-border object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-retro text-sm text-foreground">{getLeagueTitle(entry.category)}</div>
                        <div className="font-retro text-[11px] text-muted-foreground">{entry.tier} tier · {entry.wins} wins</div>
                      </div>
                    </div>
                    <div className="font-retro text-[11px] text-muted-foreground">
                      {entry.nextTier && entry.nextThreshold
                        ? `${entry.nextTier} unlocks at ${entry.nextThreshold} wins`
                        : "Top mastery tier unlocked"}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <LeagueWinsDialog open={open} onOpenChange={setOpen} cabinet={cabinet ?? { summary: { totalWins: 0, totalTitles: 0, uniqueLeagues: 0, latestWinAt: null, favoriteLeague: null, bestTier: null }, items: [], mastery: [] }} displayName={displayName} />
    </>
  );
}
