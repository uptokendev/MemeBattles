/**
 * Sitewide recon-radar loader (same visual language as Prepare promotion radar).
 * Modes:
 *  - fullscreen: blurs the viewport until content is ready
 *  - panel: covers a relative parent section
 *  - inline: compact radar + label (lists / empty rows)
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function RadarScope({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPulse((prev) => (prev + 1) % 3);
    }, 900);
    return () => window.clearInterval(timer);
  }, []);

  const box =
    size === "lg" ? "h-40 w-40" : size === "sm" ? "h-16 w-16" : "h-28 w-28";
  const dots =
    size === "sm"
      ? [
          "left-[30%] top-[34%] h-1 w-1",
          "right-[28%] top-[52%] h-1 w-1",
          "bottom-[28%] left-[44%] h-1 w-1",
        ]
      : [
          "left-[28%] top-[36%] h-2 w-2",
          "right-[30%] top-[55%] h-1.5 w-1.5",
          "bottom-[27%] left-[42%] h-1.5 w-1.5",
        ];

  return (
    <div className={cn("mwz-radar mx-auto", box)}>
      <span className="mwz-radar-sweep" />
      {dots.map((classes, index) => (
        <span
          key={classes}
          className={cn(
            "absolute rounded-full bg-orange-300 transition-all duration-300",
            classes,
            pulse === index
              ? "scale-150 opacity-100 shadow-[0_0_18px_rgba(255,185,71,0.9)]"
              : "opacity-55 shadow-[0_0_8px_rgba(255,153,0,0.4)]",
          )}
        />
      ))}
    </div>
  );
}

export function RadarLoader({
  label = "Scanning…",
  size = "md",
  className,
}: {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center", className)}>
      <RadarScope size={size} />
      <div className="space-y-1">
        <p className="font-retro text-xs uppercase tracking-[0.22em] text-orange-300">// Recon</p>
        <p className="font-retro text-sm uppercase tracking-[0.14em] text-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Solid black cover while a page/section loads (no ugly grey/green bleed-through).
 * Parent needs `relative` + min-height for panel mode.
 * Site boot screen is unchanged — this is for in-app waits only.
 */
export function RadarLoaderOverlay({
  show,
  label = "Loading…",
  mode = "panel",
  className,
}: {
  show: boolean;
  label?: string;
  mode?: "fullscreen" | "panel";
  className?: string;
}) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "z-[90] flex items-center justify-center bg-black",
        mode === "fullscreen" ? "fixed inset-0" : "absolute inset-0 min-h-[240px]",
        className,
      )}
    >
      <RadarLoader label={label} size={mode === "fullscreen" ? "lg" : "md"} />
    </div>
  );
}

export default RadarLoader;
