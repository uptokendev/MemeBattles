import { getRankBadgeSrc, normalizeRank, type RankName } from "@/lib/ranks";
import { cn } from "@/lib/utils";

type Props = {
  rank: RankName;
  subtitle?: string;
  className?: string;
};

export function RankBadgeCard({ rank, subtitle = "Current rank", className }: Props) {
  const resolvedRank = normalizeRank(rank);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-md",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />

      <div className="mb-2 text-[10px] font-retro uppercase tracking-[0.24em] text-muted-foreground">
        {subtitle}
      </div>

      <div className="relative mx-auto mb-3 w-full max-w-[220px]">
        <div className="absolute inset-5 rounded-full bg-yellow-500/12 blur-2xl" />
        <img
          src={getRankBadgeSrc(resolvedRank)}
          alt={`${resolvedRank} badge`}
          className="relative z-10 mx-auto w-full drop-shadow-[0_0_18px_rgba(250,204,21,0.18)]"
        />
      </div>

      <div className="text-center">
        <div className="text-lg font-retro uppercase tracking-[0.16em] text-foreground">
          {resolvedRank}
        </div>
      </div>
    </div>
  );
}
