import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchInternalAirdropDraws,
  fetchInternalRewardAdminActions,
  fetchInternalRewardAlerts,
  fetchInternalRewardClaimVault,
  fetchInternalRewardEpochStatus,
  fetchInternalRewardPublications,
  fetchInternalRewardRoutingDiagnostics,
  runInternalAirdropDraw,
  updateInternalRewardPublication,
  type RewardPublicationState,
} from "@/lib/rewardProgramsApi";

const TOKEN_KEY = "mwz:reward-ops-token";

type OpsState = {
  publications: RewardPublicationState[];
  routing: any | null;
  claimVault: any | null;
  epochs: any[];
  alerts: any[];
  actions: any[];
  draws: any[];
};

export default function RewardOps() {
  const [token, setToken] = useState<string>(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [epochId, setEpochId] = useState("");
  const [drawProgram, setDrawProgram] = useState("airdrop_trader");
  const [state, setState] = useState<OpsState>({
    publications: [],
    routing: null,
    claimVault: null,
    epochs: [],
    alerts: [],
    actions: [],
    draws: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (activeToken: string) => {
    if (!activeToken.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [publications, routing, claimVault, epochs, alerts, actions, draws] = await Promise.all([
        fetchInternalRewardPublications(activeToken),
        fetchInternalRewardRoutingDiagnostics(activeToken),
        fetchInternalRewardClaimVault(activeToken),
        fetchInternalRewardEpochStatus(activeToken, 12),
        fetchInternalRewardAlerts(activeToken),
        fetchInternalRewardAdminActions(activeToken, 30),
        fetchInternalAirdropDraws(activeToken, { limit: 20 }),
      ]);
      setState({
        publications: Array.isArray(publications?.items) ? publications.items : [],
        routing: routing?.diagnostics ?? null,
        claimVault: claimVault?.posture ?? null,
        epochs: Array.isArray(epochs?.items) ? epochs.items : [],
        alerts: Array.isArray(alerts?.items) ? alerts.items : [],
        actions: Array.isArray(actions?.items) ? actions.items : [],
        draws: Array.isArray(draws?.items) ? draws.items : [],
      });
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load reward ops state"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token.trim()) return;
    void load(token);
  }, []); // intentional one-time boot with stored token

  const persistToken = (next: string) => {
    setToken(next);
    try {
      window.localStorage.setItem(TOKEN_KEY, next);
    } catch {
      // ignore localStorage failures
    }
  };

  const togglePublication = async (publication: RewardPublicationState) => {
    await updateInternalRewardPublication(token, {
      resourceType: publication.resourceType,
      resourceKey: publication.resourceKey,
      isPublished: !publication.isPublished,
      actedBy: "ops-ui",
      reason: publication.isPublished ? "Temporarily unpublished from ops panel" : "Republished from ops panel",
    });
    await load(token);
  };

  const runDraw = async () => {
    const parsedEpochId = Number(epochId);
    if (!Number.isFinite(parsedEpochId) || parsedEpochId <= 0) {
      setError("Enter a valid epoch ID before running a draw.");
      return;
    }
    setError(null);
    await runInternalAirdropDraw(token, parsedEpochId, {
      program: drawProgram,
      publish: true,
      actedBy: "ops-ui",
      reason: "Manual draw execution from ops panel",
    });
    await load(token);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.22),transparent_40%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <p className="font-retro text-xs uppercase tracking-[0.24em] text-slate-200/70">Reward Ops</p>
        <h1 className="mt-3 font-retro text-3xl text-foreground md:text-5xl">Diagnostics, draw controls, and publishing from one place.</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
          This page uses the internal reward control-plane APIs so ops can inspect routing, claim posture, epoch state, alerts, publications, and draw history without digging through raw tables.
        </p>
      </Card>

      <Card className="border-border/60 bg-card/65 p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Internal token</p>
            <Input
              value={token}
              onChange={(event) => persistToken(event.target.value)}
              placeholder="Paste RANK_EVENTS_TOKEN / internal bearer token"
              className="mt-3 bg-background/40"
            />
          </div>
          <div className="flex items-end">
            <Button className="font-retro" onClick={() => void load(token)} disabled={!token.trim() || loading}>
              {loading ? "Loading..." : "Refresh ops state"}
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Routing posture</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active linked wallets</p>
              <p className="mt-2 font-retro text-lg text-foreground">{state.routing?.activeLinkedWalletCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Locked wallets</p>
              <p className="mt-2 font-retro text-lg text-foreground">{state.routing?.lockedWalletCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recruiter route amount</p>
              <p className="mt-2 font-retro text-lg text-foreground">{state.routing?.recruiterRouteAmount ?? "0"}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Airdrop pool amount</p>
              <p className="mt-2 font-retro text-lg text-foreground">{state.routing?.airdropPoolAmount ?? "0"}</p>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Claim vault posture</p>
          <div className="mt-4 space-y-3">
            {(state.claimVault?.programs ?? []).map((program: any) => (
              <div key={program.program} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <p className="font-retro text-sm text-foreground">{program.program}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Claimable {program.claimableAmount} · Pending {program.pendingAmount} · Rolled over {program.rolledOverAmount}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Publishing controls</p>
          <div className="mt-4 space-y-3">
            {state.publications.map((publication) => (
              <div key={`${publication.resourceType}:${publication.resourceKey}`} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-retro text-sm text-foreground">{publication.resourceType}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {publication.isPublished ? "Published" : "Unpublished"}
                    </p>
                  </div>
                  <Button variant="outline" className="font-retro" onClick={() => void togglePublication(publication)} disabled={!token.trim()}>
                    {publication.isPublished ? "Unpublish" : "Publish"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Draw execution</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <Input value={epochId} onChange={(event) => setEpochId(event.target.value)} placeholder="Epoch ID" className="bg-background/40" />
            <select value={drawProgram} onChange={(event) => setDrawProgram(event.target.value)} className="h-10 rounded-md border border-border/60 bg-background/40 px-3 text-sm text-foreground">
              <option value="airdrop_trader">Trader draw</option>
              <option value="airdrop_creator">Creator draw</option>
            </select>
            <Button className="font-retro" onClick={() => void runDraw()} disabled={!token.trim()}>
              Run + publish
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {state.draws.map((draw: any) => (
              <div key={draw.id} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <p className="font-retro text-sm text-foreground">Draw #{draw.id} · {draw.program}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Epoch #{draw.epochId} · {draw.status} · winners {draw.winnerCount}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Alerts</p>
          <div className="mt-4 space-y-3">
            {state.alerts.map((alert: any) => (
              <div key={alert.code} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <p className="font-retro text-sm text-foreground">{alert.code}</p>
                <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-border/60 bg-card/65 p-6">
          <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Audit trail</p>
          <div className="mt-4 space-y-3">
            {state.actions.map((action: any) => (
              <div key={action.id} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <p className="font-retro text-sm text-foreground">{action.actionType} · {action.resourceType}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.createdAt}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
