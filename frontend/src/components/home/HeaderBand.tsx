import { cn } from "@/lib/utils";

type HeaderBandProps = {
  className?: string;
};

export function HeaderBand({ className }: HeaderBandProps) {
  return (
    <div className={cn("relative w-full", className)}>
      {/* Glow strip / separator */}
      {/* Slightly shorter hero height to reduce dead space above Featured grid */}
      <div className="relative h-[200px] md:h-[200px] lg:h-[200px] overflow-hidden">

        {/* horizontal highlight band */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2">
          <div
            className="h-[10px] md:h-[10px] opacity-90"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(57,227,23,0.14) 18%, rgba(240,106,26,0.68) 48%, rgba(255,72,24,0.55) 72%, rgba(0,0,0,0) 100%)",
              filter: "blur(0.2px)",
            }}
          />
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(57,227,23,0.08) 18%, rgba(240,106,26,0.42) 48%, rgba(255,72,24,0.28) 72%, rgba(0,0,0,0) 100%)",
            }}
          />
        </div>

        {/* centered logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="/assets/logo.png"
            alt="MemeWarzone"
            className="h-[200px] md:h-[200px] lg:h-[200px] w-auto drop-shadow-[0_0_22px_rgba(240,106,26,0.22)]"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
