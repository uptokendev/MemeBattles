// frontend/src/components/live/ViewerCount.tsx
import { Users } from "lucide-react";

export const ViewerCount = ({ count }: { count: number }) => {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card/50 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      <Users className="h-3 w-3" aria-hidden />
      {count} watching
    </span>
  );
};
