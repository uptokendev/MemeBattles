import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Share2, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LeagueClaimRecordedDetail } from "@/hooks/profile/useProfileRewards";
import type { LeagueCabinet, LeagueCabinetWin } from "@/lib/leagueCabinet";
import {
  buildShareCardUrl,
  buildShareText,
  formatEpochLabel,
  formatMetric,
  formatWinPlacement,
  getLeagueImage,
  getLeagueTitle,
} from "@/lib/leagueCabinet";
import { LeagueWinsDialog } from "@/components/profile/LeagueWinsDialog";

async function shareWin(
  item: LeagueCabinetWin,
  cabinet: LeagueCabinet,
  displayName?: string | null
) {
  const mastery = cabinet.mastery.find((entry) => entry.category === item.category) ?? null;
  const text = buildShareText({ win: item, displayName, mastery });
  const imageUrl = buildShareCardUrl({
    kind: "win",
    chainId: item.chainId,
    address: item.recipientAddress,
    win: item,
    format: "png",
  });

  try {
    if (typeof navigator.share === "function") {
      try {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], `memewarzone-${item.category}-${item.rank}.png`, {
            type: blob.type || "image/png",
          });

          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `${getLeagueTitle(item.category)} victory`,
              text,
              url: window.location.href,
              files: [file],
            });
            return;
          }
        }
      } catch (error: any) {
        if (error?.name === "AbortError") return;
      }

      try {
        await navigator.share({
          title: `${getLeagueTitle(item.category)} victory`,
          text,
          url: imageUrl,
        });
        return;
      } catch (error: any) {
        if (error?.name === "AbortError") return;
      }
    }

    const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(
      imageUrl
    )}`;
    window.open(xUrl, "_blank", "noopener,noreferrer");
  } catch {
    try {
      await navigator.clipboard.writeText(`${text}\n${imageUrl}`);
      toast.success("Win text and victory-card link copied.");
    } catch {
      toast.error("Unable to open sharing. Please try again.");
    }
  }
}

function PreviewWinCard({
  item,
  onShare,
  sharing,
  highlighted,
}: {
  item: LeagueCabinet["items"][number];
  onShare: () => void;
  sharing: boolean;
  highlighted: boolean;
}) {
  const metric = formatMetric(item);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-background/60 transition-all duration-700 ${
        highlighted
          ? "scale-[1.015] border-accent shadow-[0_0_34px_rgba(249,115,22,0.42)]"
          : "border-border"
      }`}
    >
      {highlighted ? (
        <div className="pointer-events-none absolute inset-y-0 -left-1/2 z-20 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-[shine_1.2s_ease-out_1]" />
      ) : null}
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border/80">
        <img
          src={getLeagueImage(item.category)}
          alt={getLeagueTitle(item.category)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />
        <Badge className="absolute left-3 top-3 font-retro text-[10px] uppercase tracking-[0.2em]">
          {formatWinPlacement(item)}
        </Badge>
        <div className="absolute bottom-3 left-3 right-3">
          <div className="font-retro text-base text-foreground drop-shadow-md">
            {getLeagueTitle(item.category)}
          </div>
          <div className="mt-1 font-retro text-[11px] text-muted-foreground">
            {formatEpochLabel(item)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 font-retro text-[11px] text-muted-foreground">
          {metric.label}: <span className="text-foreground">{metric.value}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 font-retro"
          onClick={onShare}
          disabled={sharing}
        >
          <Share2 className="mr-2 h-3.5 w-3.5" />
          {sharing ? "sharing..." : "share win"}
        </Button>
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
  const cabinetRef = useRef<HTMLDivElement | null>(null);
  const glowTimerRef = useRef<number | null>(null);
  const trophyTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [sharingWinId, setSharingWinId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [newTrophyId, setNewTrophyId] = useState<string | null>(null);

  const latestWins = useMemo(() => cabinet?.items.slice(0, 3) ?? [], [cabinet]);
  const topMastery = useMemo(() => cabinet?.mastery.slice(0, 3) ?? [], [cabinet]);

  useEffect(() => {
    const revealCabinet = () => {
      window.requestAnimationFrame(() => {
        cabinetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setFocused(true);

        if (glowTimerRef.current) window.clearTimeout(glowTimerRef.current);
        glowTimerRef.current = window.setTimeout(() => setFocused(false), 2400);
      });
    };

    const onFocusCabinet = () => revealCabinet();
    const onClaimRecorded = (event: Event) => {
      const detail = (event as CustomEvent<LeagueClaimRecordedDetail>).detail;
      if (!detail?.reward) return;

      setNewTrophyId(
        `${detail.reward.period}:${detail.reward.epochStart}:${detail.reward.category}:${detail.reward.rank}`
      );
      if (trophyTimerRef.current) window.clearTimeout(trophyTimerRef.current);
      trophyTimerRef.current = window.setTimeout(() => setNewTrophyId(null), 4200);
    };

    window.addEventListener("memebattles:focus-league-cabinet", onFocusCabinet);
    window.addEventListener("memebattles:league-claim-recorded", onClaimRecorded);

    const hashTimer = window.setTimeout(() => {
      if (window.location.hash === "#league-cabinet") revealCabinet();
    }, 180);

    return () => {
      window.removeEventListener("memebattles:focus-league-cabinet", onFocusCabinet);
      window.removeEventListener("memebattles:league-claim-recorded", onClaimRecorded);
      window.clearTimeout(hashTimer);
      if (glowTimerRef.current) window.clearTimeout(glowTimerRef.current);
      if (trophyTimerRef.current) window.clearTimeout(trophyTimerRef.current);
    };
  }, []);

  const handleShare = async (item: LeagueCabinetWin) => {
    if (!cabinet || sharingWinId) return;
    setSharingWinId(item.id);
    try {
      await shareWin(item, cabinet, displayName);
    } finally {
      setSharingWinId(null);
    }
  };

  return (
    <>
      <div
        id="league-cabinet"
        ref={cabinetRef}
        className={`scroll-mt-24 rounded-2xl border bg-background/40 p-4 transition-all duration-700 md:p-5 ${
          focused
            ? "scale-[1.008] border-accent shadow-[0_0_42px_rgba(249,115,22,0.38)]"
            : "border-border"
        }`}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-retro text-lg text-foreground">League Cabinet</div>
            <div className="font-retro text-xs text-muted-foreground">
              Your league artwork becomes a collectible trophy card, ready to share after every win.
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
              <div key={idx} className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
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
                <PreviewWinCard
                  key={item.id}
                  item={item}
                  onShare={() => void handleShare(item)}
                  sharing={sharingWinId === item.id}
                  highlighted={newTrophyId === item.id}
                />
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
