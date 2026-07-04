import { Badge } from "@/components/ui/badge";
import type { LaunchpadSafetyStatus as LaunchpadSafetyStatusModel } from "@/lib/launchpad/adapters/types";

const stateClassName: Record<string, string> = {
  ready: "border-green-500/30 bg-green-500/10 text-green-200",
  pending: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  blocked: "border-red-500/30 bg-red-500/10 text-red-200",
};

export function LaunchpadSafetyStatus({ status }: { status: LaunchpadSafetyStatusModel }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-retro text-sm text-foreground">Launch Safety</div>
          <p className="mt-1 text-xs text-muted-foreground">{status.description}</p>
        </div>
        <Badge variant="outline" className={stateClassName[status.protocolStatus === "ready" ? "ready" : "blocked"]}>
          {status.adapterId.toUpperCase()}
        </Badge>
      </div>
      <div className="grid gap-2">
        {status.checks.map((check) => (
          <div key={check.id} className="rounded-lg border border-border/40 bg-background/30 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-retro text-[0.68rem] uppercase tracking-[0.12em] text-foreground">{check.label}</span>
              <Badge variant="outline" className={stateClassName[check.state]}>
                {check.state}
              </Badge>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
