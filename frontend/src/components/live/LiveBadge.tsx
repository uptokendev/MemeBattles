// frontend/src/components/live/LiveBadge.tsx
import { cn } from "@/lib/utils";

export const LiveBadge = ({ isLive }: { isLive: boolean }) => {
  if (isLive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border border-red-500/60",
          "bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-red-400"
        )}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      OFFLINE
    </span>
  );
};
