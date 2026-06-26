import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, LockKeyhole, WalletCards } from "lucide-react";
import { formatEther } from "ethers";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchRecruiterSignupStatus,
  fetchWalletRewardSummary,
  type RecruiterSignupStatus,
  type WalletRewardSummary,
} from "@/lib/recruiterApi";
import {
  fetchRecruiterPortal,
  getPortalSquadImageUrl,
  getSquadRoleLabel,
  requestRecruiterAuthNonce,
  verifyRecruiterAuth,
  type RecruiterPortalData,
} from "@/lib/recruiterPortalApi";

function shortAddress(value?: string | null) {
  const raw = String(value || "");
  return raw.length > 10 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString();
}

function formatRewardAmount(value?: string | null, currency = "BNB") {
  const raw = String(value || "0").trim();
  if (!raw || raw === "0") return `0 ${currency}`;
  if (/^\d+$/.test(raw)) {
    try {
      const formatted = formatEther(BigInt(raw));
      return `${Number(formatted).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${currency}`;
    } catch {
      return `${raw} ${currency}`;
    }
  }
  return `${raw} ${currency}`;
}

function hasAmount(value?: string | null) {
  const raw = String(value || "0").trim();
  if (!raw) return false;
  if (/^\d+$/.test(raw)) return BigInt(raw) > 0n;
  return Number(raw) > 0;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-retro text-xl text-foreground">{value}</div>
    </div>
  );
}

function RoleBadge({ role }: { role?: string | null }) {
  return (
    <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-accent">
      {getSquadRoleLabel(role)}
    </span>
  );
}

function ClaimButton({ claimableRaw }: { claimableRaw?: string | null }) {
  const claimable = hasAmount(claimableRaw);
  const helper = claimable ? "Claim endpoint unavailable" : "No recruiter rewards to claim yet";

  return (
    <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
      <Button disabled className="w-full font-retro">
        <WalletCards className="mr-2 h-4 w-4" />
        Claim Weekly Recruiter Rewards
      </Button>
      <p className="mt-3 text-center text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function CommandCenterRecruiter() {
  const { walletAddress } = useCommandCenterData();
  const wallet = useWallet();
  const [status, setStatus] = useState<RecruiterSignupStatus | null>(null);
  const [rewards, setRewards] = useState<WalletRewardSummary | null>(null);
  const [portal, setPortal] = useState<RecruiterPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextRewards, nextPortal] = await Promise.all([
        fetchRecruiterSignupStatus(walletAddress),
        fetchWalletRewardSummary(walletAddress).catch(() => null),
        fetchRecruiterPortal().catch(() => null),
      ]);
      setStatus(nextStatus);
      setRewards(nextRewards);
      setPortal(nextPortal);
    } catch (err: any) {
      setError(String(err?.message || err || "Could not load recruiter status."));
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recruiter = status?.recruiter ?? null;
  const isRecruiter = Boolean(status?.isRecruiter && recruiter);
  const activeCode = portal?.recruiter?.recruiter_code || recruiter?.code || "";
  const imageUrl = getPortalSquadImageUrl(portal);
  const baseUrl = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://memewar.zone";
  const recruiterLink = activeCode ? `${baseUrl}/r/${encodeURIComponent(activeCode)}` : "";
  const pendingRaw = rewards?.pendingByProgram?.recruiter || recruiter?.pendingEarningsRaw || "0";
  const claimableRaw = rewards?.claimableByProgram?.recruiter || recruiter?.claimableEarningsRaw || "0";
  const claimedRaw = rewards?.claimedByProgram?.recruiter || recruiter?.claimedLifetimeRaw || "0";

  const squadCounts = useMemo(() => portal?.squad?.counts || null, [portal]);

  const signIntoPortal = async () => {
    if (!wallet.account || !wallet.signer) {
      toast.error("Connect the approved recruiter wallet first.");
      return;
    }

    setPortalLoading(true);
    try {
      const challenge = await requestRecruiterAuthNonce(wallet.account);
      const signature = await wallet.signer.signMessage(challenge.message);
      await verifyRecruiterAuth(wallet.account, signature);
      const nextPortal = await fetchRecruiterPortal();
      setPortal(nextPortal);
      toast.success("Recruiter squad loaded");
    } catch (err: any) {
      toast.error(String(err?.message || err || "Could not unlock recruiter squad."));
    } finally {
      setPortalLoading(false);
    }
  };

  const copyRecruiterLink = async () => {
    if (!recruiterLink) return;
    try {
      await navigator.clipboard.writeText(recruiterLink);
      toast.success("Recruiter link copied");
    } catch {
      toast.error("Could not copy recruiter link");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Loading recruiter rewards and squad status." />
        <CommandCenterCard title="Recruiter status" description="Checking this wallet.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-6 text-sm text-muted-foreground">Loading...</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="Recruiter status could not be loaded." />
        <CommandCenterCard title="Recruiter status unavailable" description="Try again after refreshing.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">{error}</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (!isRecruiter) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Recruiter" description="You are not a recruiter yet." />
        <CommandCenterCard title="You are not a recruiter yet" description="Apply if you want to recruit a squad and earn recruiter rewards.">
          <Button asChild className="font-retro">
            <Link to="/recruiter/signup">Apply to become a recruiter</Link>
          </Button>
        </CommandCenterCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title="Recruiter" description="Your recruiter identity, squad, earnings, and weekly claim status." />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard title="Recruiter identity" description="Who you recruit under and the link you share.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {imageUrl ? <img src={imageUrl} alt="Recruiter squad" className="h-24 w-24 rounded-2xl border border-border/50 object-cover" /> : null}
            <div className="min-w-0 flex-1 space-y-3">
              <Metric label="Name" value={portal?.recruiter?.name || recruiter.displayName || activeCode} />
              <Metric label="Wallet" value={shortAddress(recruiter.walletAddress || walletAddress)} />
              <Metric label="Code" value={activeCode || "Not set"} />
              <Metric label="Status" value={String(portal?.recruiter?.status || recruiter.status || "pending")} />
            </div>
          </div>

          {recruiterLink ? (
            <div className="mt-4 rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="break-all font-mono text-xs text-muted-foreground">{recruiterLink}</div>
              <Button onClick={copyRecruiterLink} variant="outline" className="mt-3 font-retro">
                <Copy className="mr-2 h-4 w-4" />
                Copy recruiter link
              </Button>
            </div>
          ) : null}
        </CommandCenterCard>

        <CommandCenterCard title="Recruiter earnings" description="Weekly recruiter reward status for this wallet.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Pending" value={formatRewardAmount(pendingRaw)} />
            <Metric label="Claimable" value={formatRewardAmount(claimableRaw)} />
            <Metric label="Claimed Lifetime" value={formatRewardAmount(claimedRaw)} />
            <Metric label="Current Epoch" value="Weekly" />
          </div>
          <div className="mt-4">
            <ClaimButton claimableRaw={claimableRaw} />
          </div>
        </CommandCenterCard>
      </div>

      <CommandCenterCard title="Squad members" description="Wallets currently linked to your recruiter squad.">
        {!portal ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-amber-100" />
              <div>
                <div className="font-retro text-sm text-foreground">Unlock squad list</div>
                <p className="mt-1 text-sm text-muted-foreground">Sign with the approved recruiter wallet to view members and their roles.</p>
                <Button onClick={signIntoPortal} disabled={portalLoading} className="mt-4 font-retro">
                  {portalLoading ? "Waiting for signature..." : "Sign in to view squad"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-5">
              <Metric label="Total" value={String(squadCounts?.total ?? 0)} />
              <Metric label="Creators" value={String(squadCounts?.creators ?? 0)} />
              <Metric label="Traders" value={String(squadCounts?.traders ?? 0)} />
              <Metric label="Both" value={String(squadCounts?.both ?? 0)} />
              <Metric label="Legacy" value={String(squadCounts?.legacyUnknown ?? squadCounts?.unknown ?? 0)} />
            </div>

            {portal.squad.rows.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">No squad members yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/50">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-background/40 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portal.squad.rows.map((row) => (
                      <tr key={`${row.wallet_address}-${row.bound_at}`} className="border-t border-border/50">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{shortAddress(row.wallet_address)}</td>
                        <td className="px-4 py-3"><RoleBadge role={row.role} /></td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(row.bound_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.source || "referral"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
