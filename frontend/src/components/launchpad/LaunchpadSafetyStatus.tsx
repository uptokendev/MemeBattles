import { Badge } from "@/components/ui/badge";
import type { LaunchpadSafetyStatus as LaunchpadSafetyStatusModel } from "@/lib/launchpad/adapters/types";

const stateClassName: Record<string, string> = {
  ready: "border-green-500/30 bg-green-500/10 text-green-200",
  in_progress: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  pending: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  blocked: "border-red-500/30 bg-red-500/10 text-red-200",
};

const protocolLabel: Record<string, string> = {
  ready: "Live",
  protocol_pending: "Protocol Pending",
  unavailable: "Unavailable",
};

function statusClass(status: string) {
  if (status === "ready") return stateClassName.ready;
  if (status === "protocol_pending" || status === "in_progress") return stateClassName.in_progress;
  if (status === "pending") return stateClassName.pending;
  return stateClassName.blocked;
}

export function LaunchpadSafetyStatus({
  status,
  compact = false,
  embedded = false,
}: {
  status: LaunchpadSafetyStatusModel;
  compact?: boolean;
  /** When true, omit outer card chrome + title (for use inside a collapsible). */
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "" : `rounded-xl border border-border/50 bg-background/25 ${compact ? "p-2.5" : "p-3"}`}>
      {!embedded ? (
      <div className={`${compact ? "mb-2" : "mb-3"} flex items-start justify-between gap-3`}>
        <div className="min-w-0">
          <div className="font-retro text-sm text-foreground">Launch Safety</div>
          <p className={`${compact ? "line-clamp-1" : ""} mt-1 text-xs text-muted-foreground`}>{status.description}</p>
          <div className={`${compact ? "mt-1.5" : "mt-2"} flex flex-wrap gap-1.5`}>
            <Badge variant="outline" className="border-border/50 bg-background/30 text-muted-foreground">
              {status.chainLabel}
            </Badge>
            <Badge variant="outline" className={statusClass(status.protocolStatus)}>
              {status.protocolLabel ?? protocolLabel[status.protocolStatus] ?? status.protocolStatus}
            </Badge>
          </div>
        </div>
        <Badge variant="outline" className={statusClass(status.protocolStatus)}>
          {status.adapterId.toUpperCase()}
        </Badge>
      </div>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">{status.description}</p>
      )}

      <div className={compact ? "grid gap-1" : "grid gap-2"}>
        {status.checks.map((check) => (
          <div key={check.id} className={`rounded-lg border border-border/40 bg-background/30 ${compact ? "p-1.5" : "p-2"}`}>
            <div className={`${compact ? "items-start" : "items-center"} flex justify-between gap-1.5`}>
              <span className={`font-retro uppercase text-foreground ${compact ? "text-[0.58rem] leading-4 tracking-[0.08em]" : "text-[0.68rem] tracking-[0.12em]"}`}>{check.label}</span>
              <Badge variant="outline" className={`${statusClass(check.state)} shrink-0 ${compact ? "px-1.5 py-0 text-[0.58rem]" : ""}`}>
                {check.state.replace("_", " ")}
              </Badge>
            </div>
            {!compact ? <p className="mt-1 break-words text-xs text-muted-foreground">{check.detail}</p> : null}
          </div>
        ))}
      </div>

      {!compact && status.milestones?.length ? (
        <div className="mt-3 border-t border-border/40 pt-3">
          <div className="mb-2 font-retro text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">Protocol Track</div>
          <div className="grid gap-2">
            {status.milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-start justify-between gap-3 rounded-lg bg-background/20 p-2">
                <div>
                  <div className="font-retro text-[0.72rem] uppercase tracking-[0.1em] text-foreground">{milestone.label}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{milestone.detail}</p>
                </div>
                <Badge variant="outline" className={statusClass(milestone.state)}>
                  {milestone.state.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
