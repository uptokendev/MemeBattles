import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { buildRankShareText, getRankBadgeSrc, normalizeRank, type RankName } from "@/lib/ranks";

type Props = {
  isOpen: boolean;
  rank: RankName;
  onClose: () => void;
  autoDismissMs?: number;
};

export default function RankUpModal({
  isOpen,
  rank,
  onClose,
  autoDismissMs = 8000,
}: Props) {
  const resolvedRank = normalizeRank(rank);

  useEffect(() => {
    if (!isOpen || autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => onClose(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, autoDismissMs, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shareText = buildRankShareText(resolvedRank);

  const shareOnX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareOnTelegram = () => {
    const url = `https://t.me/share/url?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://memewar.zone")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rank-up-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[360px] overflow-hidden rounded-3xl border border-yellow-500/20 bg-[#0a0a0d]/95 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/5" />

        <div className="relative mx-auto mb-5 w-[220px] max-w-full">
          <div className="absolute inset-6 rounded-full bg-yellow-500/20 blur-3xl" />
          <img
            src={getRankBadgeSrc(resolvedRank)}
            alt={`${resolvedRank} badge`}
            className="relative z-10 mx-auto w-full drop-shadow-[0_0_24px_rgba(250,204,21,0.28)] animate-pulse"
          />
        </div>

        <h2 id="rank-up-title" className="mb-2 text-xl font-retro text-yellow-400 md:text-2xl">
          🔥 PROMOTED TO {resolvedRank.toUpperCase()}
        </h2>

        <p className="mb-6 text-sm font-retro text-muted-foreground">
          You’ve reached a new rank in MemeWarzone.
        </p>

        <div className="flex flex-col gap-2">
          <Button onClick={shareOnX} className="font-retro text-sm uppercase tracking-[0.16em]">
            Share on X
          </Button>

          <Button
            onClick={shareOnTelegram}
            variant="outline"
            className="border-border bg-white/5 font-retro text-sm uppercase tracking-[0.16em] hover:bg-white/10"
          >
            Share on Telegram
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 text-xs font-retro uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
