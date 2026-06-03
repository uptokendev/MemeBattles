import { formatCompactUsd } from "@/features/postgrad/warRoomMetrics";
import type { BattleParticipant } from "@/features/postgrad/contracts";

/**
 * Tactical comparison of the three core battlefield metrics
 * (Market Cap / Holders / Volume) between the two sides.
 * 
 * These are the exact same three metrics used for rival similarity in Command Center.
 * Showing deltas here creates strong continuity across PostGrad surfaces.
 */

interface Props {
  left: BattleParticipant & Record<string, any>;
  right: BattleParticipant & Record<string, any>;
  className?: string;
}

function getMetricValue(participant: any, key: "marketCapUsd" | "holderCount" | "volumeUsd") {
  if (key === "marketCapUsd") {
    return Number(participant?.marketCapUsd ?? participant?.marketCap ?? 0);
  }
  if (key === "volumeUsd") {
    return Number(participant?.volumeUsd ?? participant?.volume24hUsd ?? participant?.volume24h ?? 0);
  }
  return Number(participant?.holderCount ?? participant?.holders ?? 0);
}

function formatValue(key: string, value: number) {
  if (key === "holderCount") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString();
  }
  return formatCompactUsd(value);
}

export function BattlefieldMetricsComparison({ left, right, className = "" }: Props) {
  const metrics: Array<{ key: "marketCapUsd" | "holderCount" | "volumeUsd"; label: string }> = [
    { key: "marketCapUsd", label: "Market Cap" },
    { key: "holderCount", label: "Holders" },
    { key: "volumeUsd", label: "Volume" },
  ];

  return (
    <div className={`mwz-hud-frame p-4 ${className}`}>
      <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-accent/80">Core Battlefield Metrics</div>

      <div className="grid gap-3">
        {metrics.map(({ key, label }) => {
          const leftVal = getMetricValue(left, key);
          const rightVal = getMetricValue(right, key);
          const total = leftVal + rightVal || 1;

          const leftPct = Math.round((leftVal / total) * 100);
          const rightPct = 100 - leftPct;

          const diff = leftVal - rightVal;
          const diffPct = total > 0 ? (diff / (Math.abs(leftVal + rightVal) / 2 || 1)) * 100 : 0;

          return (
            <div key={key} className="text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="font-retro text-muted-foreground">{label}</div>
                <div className="tabular-nums text-muted-foreground/70">
                  {diffPct > 2 ? "Left +" : diffPct < -2 ? "Right +" : "Even"} {Math.abs(diffPct).toFixed(0)}%
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Left bar */}
                <div className="flex-1 h-2 bg-border/40 rounded overflow-hidden">
                  <div
                    className="h-2 bg-accent transition-all"
                    style={{ width: `${leftPct}%` }}
                  />
                </div>

                <div className="flex items-center gap-1.5 min-w-[92px] text-right tabular-nums font-retro text-[11px]">
                  <span className="text-foreground">{formatValue(key, leftVal)}</span>
                  <span className="text-muted-foreground/60">vs</span>
                  <span className="text-foreground">{formatValue(key, rightVal)}</span>
                </div>

                {/* Right bar */}
                <div className="flex-1 h-2 bg-border/40 rounded overflow-hidden">
                  <div
                    className="h-2 bg-orange-400/70 transition-all"
                    style={{ width: `${rightPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[9px] text-muted-foreground/70 tracking-wide">
        These three metrics drive both rival matching and future battle resolution.
      </div>
    </div>
  );
}
