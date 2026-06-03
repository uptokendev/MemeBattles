import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standardized metric pieces for PostGradCoinCard and similar coin representations.
 * This helps keep visual consistency across the platform.
 */

export function CoinMetric({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/50">{label}</div>
      <div className="mt-0.5 font-retro text-sm text-white truncate">{value}</div>
    </div>
  );
}

export interface CoinMetricsGridProps {
  children: ReactNode; // Use multiple <CoinMetric /> components
  className?: string;
}

/**
 * 3 or 4 column metrics row that matches the Featured card style.
 */
export function CoinMetricsGrid({ children, className }: CoinMetricsGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]", className)}>
      {children}
    </div>
  );
}

/**
 * Simple ATH / progress bar that matches the one in Featured cards.
 */
export function CoinAthBar({ 
  currentLabel, 
  progress = 85, 
  className 
}: { 
  currentLabel?: string | null; 
  progress?: number; 
  className?: string;
}) {
  return (
    <div className={cn("mt-auto pt-1", className)}>
      <div className="h-1.5 border border-white/20 bg-black/60 p-[1px]">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-green-500 transition-all" 
          style={{ width: `${Math.max(5, Math.min(100, progress))}%` }} 
        />
      </div>
      {currentLabel && (
        <div className="text-[9px] text-white/50 mt-0.5">ATH {currentLabel}</div>
      )}
    </div>
  );
}
