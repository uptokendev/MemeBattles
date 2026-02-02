import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("relative w-full", className)}>
      {/* Glow strip / separator */}
      <div className="relative h-[200px] md:h-[96px] rounded-2xl overflow-hidden border border-border/40 bg-card/20">
        {/* background glow */}
        <div
          className="absolute inset-0"
        />

        {/* horizontal highlight band */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2">
          <div
            className="h-[10px] md:h-[10px] opacity-90"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(255,229,92,0.7) 25%, rgba(255,159,28,0.8) 50%, rgba(255,59,59,0.75) 75%, rgba(0,0,0,0) 100%)",
              filter: "blur(0.2px)",
            }}
          />
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(255,229,92,0.35) 25%, rgba(255,159,28,0.45) 50%, rgba(255,59,59,0.35) 75%, rgba(0,0,0,0) 100%)",
            }}
          />
        </div>

        {/* centered logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="/assets/logo.png"
            alt="Meme Battles"
            className="h-[200px] md:h-[200px] w-auto drop-shadow-[0_0_18px_rgba(255,160,0,0.35)]"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
