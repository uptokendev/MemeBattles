import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, ExternalLink, ShieldCheck, Trophy } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LeagueClaimRecordedDetail } from "@/hooks/profile/useProfileRewards";
import {
  buildShareCardUrl,
  formatEpochLabel,
  formatWinPlacement,
  getLeagueImage,
  getLeagueTitle,
  trimBnb,
  type LeagueCabinetWin,
} from "@/lib/leagueCabinet";

function toWin(detail: LeagueClaimRecordedDetail): LeagueCabinetWin {
  const reward = detail.reward;
  return {
    id: `${reward.period}:${reward.epochStart}:${reward.category}:${reward.rank}`,
    chainId: detail.chainId,
    period: reward.period,
    epochStart: reward.epochStart,
    epochEnd: reward.epochEnd,
    category: reward.category as LeagueCabinetWin["category"],
    rank: reward.rank,
    recipientAddress: detail.recipient,
    amountRaw: reward.amountRaw,
    expiresAt: reward.expiresAt ?? null,
    isTitle: reward.rank === 1,
    meta: reward.payload ?? {},
  };
}

export function VictoryUnlockModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<LeagueClaimRecordedDetail | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onClaimRecorded = (event: Event) => {
      const claimEvent = event as CustomEvent<LeagueClaimRecordedDetail>;
      if (!claimEvent.detail?.reward) return;
      setDetail(claimEvent.detail);
      setOpen(true);
    };

    window.addEventListener("memebattles:league-claim-recorded", onClaimRecorded);
    return () => window.removeEventListener("memebattles:league-claim-recorded", onClaimRecorded);
  }, []);

  const win = useMemo(() => (detail ? toWin(detail) : null), [detail]);
  const imageUrl = useMemo(() => {
    if (!detail || !win) return "";
    return buildShareCardUrl({
      kind: "win",
      chainId: detail.chainId,
      address: detail.recipient,
      win,
      format: "png",
    });
  }, [detail, win]);
  const downloadUrl = useMemo(() => {
    if (!detail || !win) return "";
    return buildShareCardUrl({
      kind: "win",
      chainId: detail.chainId,
      address: detail.recipient,
      win,
      format: "png",
      download: true,
    });
  }, [detail, win]);

  if (!detail || !win) return null;

  const leagueTitle = getLeagueTitle(win.category);
  const placement = formatWinPlacement(win);
  const rewardAmount = trimBnb(win.amountRaw);
  const shareText = `Victory unlocked: ${placement} in ${leagueTitle} on MemeWarzone. ${rewardAmount} BNB claimed. Compete. Create. Conquer.`;

  const handleShare = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(imageUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const handleViewCabinet = () => {
    setOpen(false);
    const profilePath = `/profile/${detail.recipient}`;

    if (location.pathname.toLowerCase() === profilePath.toLowerCase()) {
      navigate(`${profilePath}#league-cabinet`, { replace: true });
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("memebattles:focus-league-cabinet"));
      }, 80);
      return;
    }

    navigate(`${profilePath}#league-cabinet`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto rounded-3xl border border-accent/40 bg-card/95 p-0 shadow-2xl shadow-accent/10">
        <div className="relative overflow-hidden rounded-3xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.22),transparent_48%)]" />
          <div className="relative p-5 sm:p-7">
            <DialogHeader className="items-center text-center">
              <div className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/50 bg-accent/15 shadow-lg shadow-accent/20">
                <Trophy className="h-7 w-7 text-accent" />
              </div>
              <DialogTitle className="font-retro text-2xl uppercase tracking-[0.12em] text-foreground sm:text-3xl">
                Victory Unlocked
              </DialogTitle>
              <DialogDescription className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Your reward is secured and your trophy is entering the League Cabinet.
              </DialogDescription>
            </DialogHeader>

            <div className="mx-auto mt-6 grid max-w-2xl gap-5 md:grid-cols-[0.95fr_1.05fr]">
              <div className="overflow-hidden rounded-2xl border border-accent/30 bg-background/70 shadow-xl shadow-black/20">
                <div className="relative aspect-square overflow-hidden">
                  <img src={imageUrl || getLeagueImage(win.category)} alt={`${leagueTitle} victory card`} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="font-retro text-lg text-foreground drop-shadow">{leagueTitle}</div>
                    <div className="mt-1 font-retro text-[11px] uppercase tracking-[0.16em] text-accent">{placement}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-background/55 p-5">
                <div className="space-y-4">
                  <div>
                    <div className="font-retro text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Achievement</div>
                    <div className="mt-1 font-retro text-xl text-foreground">{placement}</div>
                    <div className="mt-1 font-retro text-xs text-muted-foreground">{formatEpochLabel(win)}</div>
                  </div>

                  <div className="rounded-2xl border border-accent/25 bg-accent/10 p-4">
                    <div className="font-retro text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Reward claimed</div>
                    <div className="mt-1 font-retro text-2xl text-accent">{rewardAmount} BNB</div>
                  </div>

                  <div className="space-y-2 font-retro text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Transaction confirmed
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-accent" />
                      Cabinet synchronization started
                    </div>
                  </div>
                </div>

                {detail.txHash ? (
                  <a
                    href={`https://bscscan.com/tx/${detail.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-retro text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View transaction <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-3">
              <Button type="button" className="font-retro" onClick={handleShare}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Share on X
              </Button>
              <Button type="button" variant="outline" className="font-retro" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Trophy
              </Button>
              <Button type="button" variant="outline" className="font-retro" onClick={handleViewCabinet}>
                <Trophy className="mr-2 h-4 w-4" />
                View Cabinet
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
