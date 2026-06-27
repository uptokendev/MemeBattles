import type { LaunchpadPreflight } from "@/lib/recruiterApi";
import { getTradeSafetyState } from "@/lib/launchpadTradeSafety";

type TradeSafetyPanelProps = {
  preflight: LaunchpadPreflight | null;
  loading?: boolean;
  error?: string | null;
  side?: "buy" | "sell";
};

function toneClass(status: ReturnType<typeof getTradeSafetyState>["status"]) {
  if (status === "blocked") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "warning" || status === "unavailable") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (status === "clear") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  return "border-border bg-muted/20 text-muted-foreground";
}

export function TradeSafetyPanel({ preflight, loading = false, error = null, side = "buy" }: TradeSafetyPanelProps) {
  const state = getTradeSafetyState(preflight, loading, error);
  const details = [
    ...(preflight?.reasons || []),
    ...(preflight?.warnings || []),
    ...(preflight?.lookupErrors || []),
  ].filter(Boolean);

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs ${toneClass(state.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Trading safety</p>
          <p className="mt-1 text-muted-foreground">
            {side === "buy" ? "Buy" : "Sell"} check - {state.message}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {state.label}
        </span>
      </div>

      {details.length > 1 ? (
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {details.slice(0, 3).map((item, index) => (
            <li key={`${item}-${index}`} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default TradeSafetyPanel;
