import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";

type TokenSafetyState = {
  chain?: string;
  blocked: boolean;
  warning: boolean;
  buyAllowed: boolean;
  sellAllowed: boolean;
  reasons: string[];
  warnings: string[];
  campaignAddress: string;
  updatedAt: number;
};

function getCurrentSafetyState(): TokenSafetyState | null {
  if (typeof window === "undefined") return null;
  return window.__mwzTokenSafetyState || null;
}

function toneClass(state: TokenSafetyState | null) {
  if (!state) return "border-border/60 bg-muted/15 text-muted-foreground";
  if (state.blocked) return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  if (state.warning) return "border-orange-400/40 bg-orange-500/10 text-orange-100";
  return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
}

function StatusIcon({ state }: { state: TokenSafetyState | null }) {
  if (!state) return <ShieldAlert className="h-4 w-4" />;
  if (state.blocked) return <XCircle className="h-4 w-4" />;
  if (state.warning) return <AlertTriangle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function shortText(state: TokenSafetyState | null) {
  if (!state) return "Checking campaign safety...";
  if (state.blocked) return "Trading is blocked by the safety preflight.";
  if (state.warning) return "Trading is open, but there are warnings to review.";
  return "Campaign safety preflight is clear.";
}

export function TokenTradeSafetyPanel() {
  const [state, setState] = useState<TokenSafetyState | null>(() => getCurrentSafetyState());

  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<TokenSafetyState> | undefined)?.detail;
      setState(detail || getCurrentSafetyState());
    };
    sync();
    window.addEventListener("mwz:tokenSafetyChanged", sync as EventListener);
    return () => window.removeEventListener("mwz:tokenSafetyChanged", sync as EventListener);
  }, []);

  const visibleItems = [
    ...(state?.reasons || []),
    ...(state?.warnings || []),
  ].filter(Boolean).slice(0, 3);

  return (
    <div className={`rounded-2xl border p-3 text-xs ${toneClass(state)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <StatusIcon state={state} />
          <div className="min-w-0">
            <div className="font-retro text-[10px] uppercase tracking-[0.16em]">Trade Safety</div>
            <div className="mt-1 leading-5 opacity-90">{shortText(state)}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("mwz:openTokenSafety"))}
          className="shrink-0 rounded-lg border border-current/20 px-2 py-1 font-retro text-[9px] uppercase tracking-[0.14em] opacity-80 hover:opacity-100"
        >
          Details
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-current/15 bg-black/15 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.14em] opacity-70">Buy</div>
          <div className="mt-0.5 font-retro text-[10px]">{state ? (state.buyAllowed ? "Allowed" : "Blocked") : "Checking"}</div>
        </div>
        <div className="rounded-xl border border-current/15 bg-black/15 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.14em] opacity-70">Sell</div>
          <div className="mt-0.5 font-retro text-[10px]">{state ? (state.sellAllowed ? "Allowed" : "Blocked") : "Checking"}</div>
        </div>
      </div>

      {visibleItems.length ? (
        <div className="mt-2 space-y-1.5">
          {visibleItems.map((item) => (
            <div key={item} className="rounded-lg border border-current/15 bg-black/15 px-2 py-1.5 leading-5">
              {item}
            </div>
          ))}
        </div>
      ) : null}

      {!state ? null : (
        <div className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] opacity-70">
          <ShieldCheck className="h-3 w-3" />
          {state.chain || "bnb"} · updated {new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
