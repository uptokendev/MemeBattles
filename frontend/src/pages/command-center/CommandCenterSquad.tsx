import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, WalletCards } from "lucide-react";
import { formatEther } from "ethers";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import {
  fetchSquadSummary,
  fetchWalletAttributionState,
  fetchWalletRewardSummary,
  type SquadSummary,
  type WalletAttributionPublicState,
  type WalletRewardSummary,
} from "@/lib/recruiterApi";
import { fetchSquadMembers, type SquadMemberItem } from "@/lib/rewardProgramsApi";
import { getSquadRoleLabel } from "@/lib/recruiterPortalApi";

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
  const helper = claimable ? "Claim endpoint unavailable" : "No squad rewards to claim yet";

  return (
    <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
      <Button disabled className="w-full font-retro">
        <WalletCards className="mr-2 h-4 w-4" />
        Claim Weekly Squad Rewards
      </Button>
      <p className="mt-3 text-center text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function CommandCenterSquad() {
  const { walletAddress } = useCommandCenterData();
  const [attribution, setAttribution] = useState<WalletAttributionPublicState | null>(null);
  const [summary, setSummary] = useState<SquadSummary | null>(null);
  const [rewards, setRewards] = useState<WalletRewardSummary | null>(null);
  const [members, setMembers] = useState<SquadMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAttribution, nextRewards] = await Promise.all([
        fetchWalletAttributionState(walletAddress).catch(() => null),
        fetchWalletRewardSummary(walletAddress).catch(() => null),
      ]);

      setAttribution(nextAttribution);
      setRewards(nextRewards);

      const recruiterCode = nextAttribution?.recruiterCode || null;
      if (!recruiterCode || nextAttribution?.squadState !== "in_squad") {
        setSummary(null);
        setMembers([]);
        return;
      }

      const [nextSummary, membersData] = await Promise.all([
        fetchSquadSummary(recruiterCode).catch(() => null),
        fetchSquadMembers({ recruiterCode, limit: 100 }).catch(() => ({ items: [] })),
      ]);
      setSummary(nextSummary);
      setMembers(Array.isArray(membersData?.items) ? membersData.items as SquadMemberItem[] : []);
    } catch (err: any) {
      setError(String(err?.message || err || "Could not load squad status."));
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isInSquad = Boolean(attribution?.squadState === "in_squad" && attribution?.recruiterCode);
  const ownMember = useMemo(() => {
    const normalized = walletAddress.toLowerCase();
    return members.find((member) => String(member.walletAddress || "").toLowerCase() === normalized) || null;
  }, [members, walletAddress]);

  const displayMembers = useMemo(() => {
    if (members.length > 0) return members;
    if (!isInSquad) return [];
    return [{
      walletAddress,
      recruiterId: summary?.recruiterId || 0,
      recruiterCode: attribution?.recruiterCode || null,
      recruiterDisplayName: attribution?.recruiterDisplayName || null,
      memberRole: "legacy",
      joinedAt: null,
      source: null,
      isEligible: false,
      reasonCodes: [],
      rawScore: "0",
      estimatedPayoutAmount: "0",
      memberCapAmount: "0",
      memberCapApplied: false,
      createdAt: null,
      updatedAt: null,
    } satisfies SquadMemberItem];
  }, [attribution?.recruiterCode, attribution?.recruiterDisplayName, isInSquad, members, summary?.recruiterId, walletAddress]);

  const role = ownMember?.memberRole || (isInSquad ? "legacy" : null);
  const totalRevenueRaw = summary?.routedSquadAmountTotal || "0";
  const currentEpochRevenueRaw = summary?.currentEpochRoutedSquadAmount || "0";
  const userCutRaw = ownMember?.estimatedPayoutAmount || rewards?.pendingByProgram?.squad || "0";
  const claimableRaw = rewards?.claimableByProgram?.squad || "0";
  const claimedRaw = rewards?.claimedByProgram?.squad || "0";

  if (loading) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Squad" description="Loading squad rewards and member status." />
        <CommandCenterCard title="Squad status" description="Checking this wallet.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-6 text-sm text-muted-foreground">Loading...</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Squad" description="Squad status could not be loaded." />
        <CommandCenterCard title="Squad status unavailable" description="Try again after refreshing.">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-6 text-sm text-rose-100">{error}</div>
        </CommandCenterCard>
      </div>
    );
  }

  if (!isInSquad) {
    return (
      <div className="space-y-4">
        <CommandCenterPageHeader title="Squad" description="You are not in a squad yet." />
        <CommandCenterCard title="No recruiter linked yet" description="Join through a recruiter invite to appear in a squad.">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/squads">
              Public squads
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CommandCenterCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title="Squad" description="Your squad identity, revenue, cut, and weekly claim status.">
        <Button asChild variant="outline" className="font-retro">
          <Link to="/squads">
            Public squads
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CommandCenterPageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard title="Squad identity" description="The recruiter and role attached to this wallet.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Squad" value={summary?.recruiterCode || attribution?.recruiterCode || "Linked"} />
            <Metric label="Recruiter" value={summary?.recruiterDisplayName || attribution?.recruiterDisplayName || attribution?.recruiterCode || "Unknown"} />
            <Metric label="Recruiter Wallet" value={shortAddress(summary?.recruiterWalletAddress)} />
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Your Role</div>
              <div className="mt-3"><RoleBadge role={role} /></div>
            </div>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Squad revenue" description="Current squad rewards for this wallet.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Squad Revenue" value={formatRewardAmount(totalRevenueRaw)} />
            <Metric label="Current Epoch" value={formatRewardAmount(currentEpochRevenueRaw)} />
            <Metric label="Your Cut" value={formatRewardAmount(userCutRaw)} />
            <Metric label="Claimable" value={formatRewardAmount(claimableRaw)} />
            <Metric label="Claimed Lifetime" value={formatRewardAmount(claimedRaw)} />
            <Metric label="Epoch Ends" value={formatDate(summary?.currentEpochEndAt)} />
          </div>
          <div className="mt-4">
            <ClaimButton claimableRaw={claimableRaw} />
          </div>
        </CommandCenterCard>
      </div>

      <CommandCenterCard title="Squad members" description="Wallets and roles in this squad.">
        {displayMembers.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">No squad members found.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-background/40 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Earned / Cut</th>
                </tr>
              </thead>
              <tbody>
                {displayMembers.map((member) => (
                  <tr key={`${member.walletAddress}-${member.createdAt || member.joinedAt || "member"}`} className="border-t border-border/50">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{shortAddress(member.walletAddress)}</td>
                    <td className="px-4 py-3"><RoleBadge role={member.memberRole} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(member.joinedAt || member.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatRewardAmount(member.estimatedPayoutAmount || "0")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
