// frontend/src/components/live/PlayerOffline.tsx
import { Radio } from "lucide-react";

export const PlayerOffline = () => {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-card/65">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.04),transparent_60%)]" aria-hidden />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <Radio className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Standby
        </div>
        <div className="max-w-sm font-retro text-2xl md:text-3xl">
          Stream starting soon
        </div>
        <div className="max-w-sm text-sm text-muted-foreground">
          Hold the line, soldier. Comms will be live shortly.
        </div>
      </div>
    </div>
  );
};
