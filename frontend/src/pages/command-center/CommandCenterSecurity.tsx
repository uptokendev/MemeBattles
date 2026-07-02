import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Database,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";

type Notice = {
  tone: "success" | "error";
  message: string;
};

type SecurityStatus = {
  globalRiskStatus?: string;
  openManualReviews?: number;
  restrictedCreators?: number;
  restrictedWallets?: number;
  suspiciousClusters?: number;
  massDeployerAlerts?: number;
  bnbContractSync?: string;
  solanaProgramSync?: string;
  backendSignerStatus?: string;
  routeAuthorityStatus?: string;
  schemaReady?: boolean;
  paused?: {
    global?: boolean;
    create?: boolean;
    buys?: boolean;
    sells?: boolean;
    graduation?: boolean;
  };
};

type CreatorProfile = {
  wallet: string;
  tier: string;
  trustScore?: number;
  liveBondingCount?: number;
  cooldownEndsAt?: string | null;
  creatorBuyLockEndsAt?: string | null;
  creatorBuyCapBnb?: number;
  clusterWallets?: number;
  restricted?: boolean;
  manualReviewRequired?: boolean;
  clusterId?: string | null;
  updatedAt?: string | null;
};

type ClusterSummary = {
  id: string;
  wallets: number;
  riskLevel: string;
  restricted: boolean;
  primarySignals?: string[];
  lastSeenAt?: string | null;
};

type ManualReviewItem = {
  id: string;
  creatorWallet: string;
  reason: string;
  priority: string;
  status: string;
  createdAt?: string | null;
};

type MassDeployerFlag = {
  id: string;
  wallet: string;
  launches24h: number;
  failedTokens: number;
  repeatedMetadata: number;
  action: string;
};

type AuditRecord = {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  txHash?: string | null;
  timestamp?: string | null;
};

type SyncJob = {
  id: string;
  chain: string;
  jobType: string;
  target: string;
  status: string;
  txHash?: string | null;
  error?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const creatorTiers = ["New", "Trusted", "Proven"];
const campaignPauseFields = [
  { value: "paused", label: "Full campaign pause" },
  { value: "buyPaused", label: "Buy pause" },
  { value: "sellPaused", label: "Sell pause" },
  { value: "graduationPaused", label: "Graduation pause" },
];

function normalizeWalletInput(value: string) {
  return value.trim().toLowerCase();
}

function formatAddress(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= 14) return text;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toneForRisk(value?: string | null): "success" | "hot" | "sponsored" {
  const risk = String(value || "").toLowerCase();
  if (risk === "normal" || risk === "low" || risk === "synced" || risk === "confirmed") return "success";
  if (risk === "high" || risk === "critical" || risk === "watch" || risk === "failed" || risk === "pending") return "hot";
  return "sponsored";
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function StatCard({ icon: Icon, label, value, detail, tone = "sponsored" }: { icon: any; label: string; value: string; detail: string; tone?: "success" | "hot" | "sponsored" }) {
  return (
    <div className="mwz-hud-frame p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" />
        <span className="font-retro text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="font-retro text-xl text-foreground">{value}</div>
        <TacticalTag label={tone} tone={tone} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <label className="font-retro text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{children}</label>;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-border/50 bg-background/40 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-accent/60"
    />
  );
}

function SelectInput({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-border/50 bg-background/40 px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/60"
    >
      {children}
    </select>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">{label}</div>;
}

export default function CommandCenterSecurity() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [reviews, setReviews] = useState<ManualReviewItem[]>([]);
  const [massDeployers, setMassDeployers] = useState<MassDeployerFlag[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [targetWallet, setTargetWallet] = useState("");
  const [targetCluster, setTargetCluster] = useState("");
  const [targetCampaign, setTargetCampaign] = useState("");
  const [creatorTier, setCreatorTier] = useState("New");
  const [campaignField, setCampaignField] = useState("buyPaused");
  const [reason, setReason] = useState("Launch safety operator action");

  const normalizedWallet = normalizeWalletInput(targetWallet);
  const normalizedCampaign = normalizeWalletInput(targetCampaign);
  const normalizedCluster = targetCluster.trim();

  const refreshSecurity = async () => {
    setLoading(true);
    const [nextStatus, nextCreators, nextClusters, nextReviews, nextMassDeployers, nextAuditLog, nextSyncJobs] = await Promise.all([
      readJson<SecurityStatus>("/api/security/status", {}),
      readJson<CreatorProfile[]>("/api/security/creators", []),
      readJson<ClusterSummary[]>("/api/security/clusters", []),
      readJson<ManualReviewItem[]>("/api/security/manual-review", []),
      readJson<MassDeployerFlag[]>("/api/security/mass-deployers", []),
      readJson<AuditRecord[]>("/api/security/audit-log", []),
      readJson<SyncJob[]>("/api/security/contracts/sync-jobs?chain=bnb", []),
    ]);
    setStatus(nextStatus);
    setCreators(nextCreators);
    setClusters(nextClusters);
    setReviews(nextReviews);
    setMassDeployers(nextMassDeployers);
    setAuditLog(nextAuditLog);
    setSyncJobs(nextSyncJobs);
    setLoading(false);
  };

  useEffect(() => {
    void refreshSecurity();
  }, []);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyAction(label);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: `${label} queued. Run the BNB contract sync worker to push queued jobs on-chain.` });
      await refreshSecurity();
    } catch (error: any) {
      setNotice({ tone: "error", message: error?.message || `${label} failed.` });
    } finally {
      setBusyAction(null);
    }
  };

  const requireWallet = () => {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) throw new Error("Enter a valid EVM wallet address.");
    return normalizedWallet;
  };

  const requireCampaign = () => {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedCampaign)) throw new Error("Enter a valid EVM campaign address.");
    return normalizedCampaign;
  };

  const requireCluster = () => {
    if (!normalizedCluster) throw new Error("Enter a cluster ID.");
    return normalizedCluster;
  };

  const globalRisk = status?.globalRiskStatus || "unknown";
  const paused = status?.paused || {};
  const pendingJobs = syncJobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const failedJobs = syncJobs.filter((job) => job.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <CommandCenterPageHeader
          eyebrow="Command Center"
          title="Security Ops"
          description="Private Phase 2 launch controls for creator eligibility, wallet risk, cluster restrictions, BNB pause state, and contract sync evidence."
        />
        <Button size="sm" variant="outline" disabled={loading || busyAction === "Refresh security"} onClick={() => void runAction("Refresh security", refreshSecurity)} className="w-fit">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh security
        </Button>
      </div>

      {notice ? (
        <div className={`mwz-hud-frame p-3 text-sm ${notice.tone === "error" ? "text-rose-100" : "text-muted-foreground"}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Risk posture" value={globalRisk} detail={`${reviews.length} open reviews · ${clusters.length} clusters watched`} tone={toneForRisk(globalRisk)} />
        <StatCard icon={PauseCircle} label="Pause state" value={paused.global ? "Paused" : "Live"} detail={`create ${paused.create ? "off" : "on"} · buys ${paused.buys ? "off" : "on"} · sells ${paused.sells ? "off" : "on"}`} tone={paused.global ? "hot" : "success"} />
        <StatCard icon={Route} label="BNB sync" value={status?.bnbContractSync || "unknown"} detail={`${pendingJobs} pending · ${failedJobs} failed jobs`} tone={toneForRisk(status?.bnbContractSync)} />
        <StatCard icon={Database} label="Schema" value={status?.schemaReady === false ? "Missing" : "Ready"} detail={`${creators.length} creators · ${auditLog.length} audit entries`} tone={status?.schemaReady === false ? "hot" : "success"} />
      </div>

      <CommandCenterCard title="Emergency BNB controls" description="Queue global factory and campaign pause jobs. These actions are database-backed first, then executed on-chain by the contract sync worker.">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="mwz-hud-frame space-y-3 p-4">
            <div className="flex items-center gap-2 font-retro text-sm text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Factory create gate
            </div>
            <p className="text-xs text-muted-foreground">Use this to stop or reopen new BNB campaign creation from the LaunchFactory path.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runAction("Pause BNB factory", () => postJson("/api/security/contracts/pause-factory", { paused: true, reason }))}>
                <PauseCircle className="mr-2 h-4 w-4" />
                Pause factory
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Unpause BNB factory", () => postJson("/api/security/contracts/pause-factory", { paused: false, reason }))}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Unpause factory
              </Button>
            </div>
          </div>

          <div className="mwz-hud-frame space-y-3 p-4">
            <div className="flex items-center gap-2 font-retro text-sm text-foreground">
              <PauseCircle className="h-4 w-4 text-accent" />
              Campaign pause gate
            </div>
            <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-2">
                <FieldLabel>Campaign address</FieldLabel>
                <TextInput value={targetCampaign} onChange={setTargetCampaign} placeholder="0x campaign address" />
              </div>
              <div className="space-y-2">
                <FieldLabel>Pause field</FieldLabel>
                <SelectInput value={campaignField} onChange={setCampaignField}>
                  {campaignPauseFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                </SelectInput>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runAction("Pause campaign field", () => postJson("/api/security/contracts/pause-campaign", { campaignAddress: requireCampaign(), field: campaignField, paused: true, reason }))}>
                Pause field
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Unpause campaign field", () => postJson("/api/security/contracts/pause-campaign", { campaignAddress: requireCampaign(), field: campaignField, paused: false, reason }))}>
                Unpause field
              </Button>
            </div>
          </div>
        </div>
      </CommandCenterCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <CommandCenterCard title="Creator and wallet actions" description="Update creator tiers, manual review status, and wallet restrictions. Every mutation writes an audit record and queues a BNB sync job.">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <FieldLabel>Wallet address</FieldLabel>
                <TextInput value={targetWallet} onChange={setTargetWallet} placeholder="0x creator or trader wallet" />
              </div>
              <div className="space-y-2">
                <FieldLabel>Creator tier</FieldLabel>
                <SelectInput value={creatorTier} onChange={setCreatorTier}>
                  {creatorTiers.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                </SelectInput>
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>Reason</FieldLabel>
              <TextInput value={reason} onChange={setReason} placeholder="Operator reason for audit log" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={Boolean(busyAction)} onClick={() => void runAction("Set creator tier", () => postJson(`/api/security/creator/${requireWallet()}/tier`, { tier: creatorTier, reason }))}>
                <UserCheck className="mr-2 h-4 w-4" />
                Set tier
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Require manual review", () => postJson(`/api/security/creator/${requireWallet()}/manual-review`, { required: true, priority: "high", reason }))}>
                Manual review
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Clear manual review", () => postJson(`/api/security/creator/${requireWallet()}/manual-review`, { required: false, reason }))}>
                Clear review
              </Button>
              <Button size="sm" variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runAction("Restrict creator", () => postJson(`/api/security/creator/${requireWallet()}/restrict`, { restricted: true, reason }))}>
                <Ban className="mr-2 h-4 w-4" />
                Restrict creator
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Unrestrict creator", () => postJson(`/api/security/creator/${requireWallet()}/restrict`, { restricted: false, reason }))}>
                Unrestrict creator
              </Button>
              <Button size="sm" variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runAction("Restrict wallet", () => postJson(`/api/security/wallet/${requireWallet()}/restrict`, { restricted: true, reason }))}>
                <Wallet className="mr-2 h-4 w-4" />
                Restrict wallet
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Unrestrict wallet", () => postJson(`/api/security/wallet/${requireWallet()}/restrict`, { restricted: false, reason }))}>
                Unrestrict wallet
              </Button>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Cluster actions" description="Restrict or reopen linked wallet clusters when mass deployment or coordinated wallet activity is detected.">
          <div className="space-y-3">
            <div className="space-y-2">
              <FieldLabel>Cluster ID</FieldLabel>
              <TextInput value={targetCluster} onChange={setTargetCluster} placeholder="cluster id" />
            </div>
            <div className="space-y-2">
              <FieldLabel>Reason</FieldLabel>
              <TextInput value={reason} onChange={setReason} placeholder="Operator reason for audit log" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runAction("Restrict cluster", () => postJson(`/api/security/cluster/${encodeURIComponent(requireCluster())}/restrict`, { restricted: true, reason }))}>
                <Users className="mr-2 h-4 w-4" />
                Restrict cluster
              </Button>
              <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction("Unrestrict cluster", () => postJson(`/api/security/cluster/${encodeURIComponent(requireCluster())}/restrict`, { restricted: false, reason }))}>
                Unrestrict cluster
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {clusters.slice(0, 4).map((cluster) => (
                <button key={cluster.id} type="button" onClick={() => setTargetCluster(cluster.id)} className="mwz-hud-frame p-3 text-left transition hover:border-accent/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{cluster.id}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{cluster.wallets} wallets · {formatDateTime(cluster.lastSeenAt)}</div>
                    </div>
                    <TacticalTag label={cluster.restricted ? "restricted" : cluster.riskLevel} tone={cluster.restricted ? "hot" : toneForRisk(cluster.riskLevel)} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CommandCenterCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CommandCenterCard title="Manual review queue" description="Creators currently blocked for operator review before launch eligibility is restored.">
          {reviews.length > 0 ? (
            <div className="space-y-2">
              {reviews.slice(0, 8).map((review) => (
                <button key={review.id} type="button" onClick={() => setTargetWallet(review.creatorWallet)} className="mwz-hud-frame w-full p-3 text-left transition hover:border-accent/50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-retro text-sm text-foreground">{formatAddress(review.creatorWallet)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{review.reason}</div>
                    </div>
                    <TacticalTag label={review.priority} tone={review.priority === "high" ? "hot" : "sponsored"} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(review.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : <EmptyState label={loading ? "Loading manual review queue..." : "No open manual reviews."} />}
        </CommandCenterCard>

        <CommandCenterCard title="Mass deployer alerts" description="Wallets flagged for repeated launches, failed tokens, repeated metadata, or other launch-abuse signals.">
          {massDeployers.length > 0 ? (
            <div className="space-y-2">
              {massDeployers.slice(0, 8).map((flag) => (
                <button key={flag.id} type="button" onClick={() => setTargetWallet(flag.wallet)} className="mwz-hud-frame w-full p-3 text-left transition hover:border-accent/50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-retro text-sm text-foreground">{formatAddress(flag.wallet)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{flag.launches24h} launches / 24h · {flag.failedTokens} failed · {flag.repeatedMetadata} metadata repeats</div>
                    </div>
                    <TacticalTag label={flag.action} tone={flag.action === "restricted" ? "hot" : "sponsored"} />
                  </div>
                </button>
              ))}
            </div>
          ) : <EmptyState label={loading ? "Loading deployer alerts..." : "No mass deployer alerts."} />}
        </CommandCenterCard>
      </div>

      <CommandCenterCard title="BNB contract sync queue" description="Latest queued, running, confirmed, or failed BNB sync jobs. The worker must turn launch-critical rows into confirmed tx hashes before sign-off.">
        {syncJobs.length > 0 ? (
          <div className="space-y-2">
            {syncJobs.slice(0, 10).map((job) => (
              <div key={job.id} className="mwz-hud-frame p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {job.status === "confirmed" ? <CheckCircle2 className="h-4 w-4 text-accent" /> : job.status === "failed" ? <XCircle className="h-4 w-4 text-rose-300" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <div className="font-retro text-sm text-foreground">{job.jobType}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{job.chain} · {formatAddress(job.target)} · {formatDateTime(job.createdAt)}</div>
                  </div>
                  <TacticalTag label={job.status} tone={toneForRisk(job.status)} />
                </div>
                {job.txHash ? <div className="mt-2 break-all text-[11px] text-muted-foreground">tx: {job.txHash}</div> : null}
                {job.error ? <div className="mt-2 text-[11px] text-rose-100">{job.error}</div> : null}
              </div>
            ))}
          </div>
        ) : <EmptyState label={loading ? "Loading sync jobs..." : "No BNB sync jobs found."} />}
      </CommandCenterCard>

      <CommandCenterCard title="Recent security audit log" description="Last recorded security actions, including dashboard mutations and contract action queue writes.">
        {auditLog.length > 0 ? (
          <div className="space-y-2">
            {auditLog.slice(0, 10).map((entry) => (
              <div key={entry.id} className="mwz-hud-frame p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-retro text-sm text-foreground">{entry.action}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatAddress(entry.target)} · {entry.adminEmail} · {formatDateTime(entry.timestamp)}</div>
                  </div>
                  <TacticalTag label={entry.txHash ? "tx" : "audit"} tone={entry.txHash ? "success" : "sponsored"} />
                </div>
                {entry.reason ? <div className="mt-2 text-xs text-muted-foreground">{entry.reason}</div> : null}
              </div>
            ))}
          </div>
        ) : <EmptyState label={loading ? "Loading audit log..." : "No security audit entries yet."} />}
      </CommandCenterCard>

      {creators.length > 0 ? (
        <CommandCenterCard title="Watched creators" description="Recently updated creator profiles that influence launch eligibility and on-chain registry sync.">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {creators.slice(0, 9).map((creator) => (
              <button key={creator.wallet} type="button" onClick={() => setTargetWallet(creator.wallet)} className="mwz-hud-frame p-3 text-left transition hover:border-accent/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-retro text-sm text-foreground">{formatAddress(creator.wallet)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{creator.liveBondingCount || 0} live · cap {creator.creatorBuyCapBnb || 0} BNB</div>
                  </div>
                  <TacticalTag label={creator.restricted ? "restricted" : creator.manualReviewRequired ? "review" : creator.tier} tone={creator.restricted || creator.manualReviewRequired ? "hot" : "success"} />
                </div>
              </button>
            ))}
          </div>
        </CommandCenterCard>
      ) : null}

      <div className="mwz-hud-frame flex items-start gap-3 p-4 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          Security Ops actions are launch-critical. Queue mutations here, run <span className="font-mono">npm run worker:contract-sync</span> from the frontend runtime, then verify every representative job is confirmed with a tx hash before BNB launch sign-off.
        </div>
      </div>
    </div>
  );
}
