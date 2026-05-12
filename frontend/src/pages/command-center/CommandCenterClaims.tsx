import { useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { Clock3, History, Hourglass, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import {
  fetchWalletRewardClaims,
  fetchWalletRewardHistory,
  fetchWalletRewardSummary,
  type WalletRewardSummary,
} from "@/lib/recruiterApi";

type RewardHistoryItem = {
  id: number;
  epochId: number;
  program?: string;
  category?: string;
  startAt?: string;
  endAt?: string;
  grossAmount?: string;
  netAmount?: string;
  amount?: string;
  status?: string;
  claimableAt?: string | null;
  claimDeadlineAt?: string | null;
  claimedAt?: string | null;
  createdAt?: string;
};

type RewardClaimItem = {
  id: number;
  epochId: number;
  program?: string;
  claimedAmount?: string;
  amount?: string;
  claimTxHash?: string | null;
  claimedAt?: string;
  status?: string;
};

const rewardCategories = [
  { key: "recruiter", label: "Recruiter rewards" },
  { key: "squad", label: "Squad rewards" },
  { key: "airdrop_trader", label: "Airdrop trader" },
  { key: "airdrop_creator", label: "Airdrop creator" },
  { key: "league", label: "League rewards" },
];

function formatBnb(raw?: string | null): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function programLabel(program?: string | null) {
  const key = String(program || "").trim();
  return rewardCategories.find((item) => item.key === key)?.label || key.replace(/_/g, " ") || "Reward";
}

function isExpiringSoon(deadline?: string | null) {
  if (!deadline) return false;
  const date = new Date(deadline).getTime();
  if (!Number.isFinite(date)) return false;
  const remaining = date - Date.now();
  return remaining > 0 && remaining <= 48 * 60 * 60 * 1000;
}

export default function CommandCenterClaims() {
  const { walletAddress } = useCommandCenterData();
  const [summary, setSummary] = useState<WalletRewardSummary | null>(null);
  const [history, setHistory] = useState<RewardHistoryItem[]>([]);
  const [claims, setClaims] = useState<RewardClaimItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [rewardSummary, historyItems, claimItems] = await Promise.all([
          fetchWalletRewardSummary(walletAddress).catch(() => null),
          fetchWalletRewardHistory(walletAddress, 25).catch(() => []),
          fetchWalletRewardClaims(walletAddress, 25).catch(() => []),
        ]);

        if (cancelled) return;
        setSummary(rewardSummary);
        setHistory(Array.isArray(historyItems) ? historyItems : []);
        setClaims(Array.isArray(claimItems) ? claimItems : []);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || "Failed to load rewards."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const totals = useMemo(() => {
    const pendingByProgram = summary?.pendingByProgram ?? {};
    const claimableByProgram = summary?.claimableByProgram ?? {};
    const claimedByProgram = summary?.claimedByProgram ?? {};

    return rewardCategories.map((category) => ({
      ...category,
      pending: pendingByProgram[category.key] ?? "0",
      claimable: claimableByProgram[category.key] ?? "0",
      claimed: claimedByProgram[category.key] ?? "0",
    }));
  }, [summary]);

  const expiringRewards = useMemo(
    () => history.filter((item) => isExpiringSoon(item.claimDeadlineAt)),
    [history],
  );

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Rewards / Claims"
        description="One hub for recruiter rewards, squad rewards, Warzone Airdrops, League rewards, pending balances, claim history, and expiring rewards."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CommandCenterCard title="Claimable now" description="Rewards ready for user-initiated claim.">
          <div className="font-retro text-3xl text-foreground">{formatBnb(summary?.totalClaimableAmount)} BNB</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Claimable rewards will appear here when they are ready to collect.
          </p>
        </CommandCenterCard>
        <CommandCenterCard title="Claimed lifetime" description="Previously claimed rewards across programs.">
          <div className="font-retro text-3xl text-foreground">{formatBnb(summary?.claimedLifetimeAmount)} BNB</div>
          <p className="mt-3 text-sm text-muted-foreground">Last claim: {formatDate(summary?.lastClaimedAt)}</p>
        </CommandCenterCard>
        <CommandCenterCard title="Expiring soon" description="Rewards inside the next 48 hours of their visible deadline.">
          <div className="font-retro text-3xl text-foreground">{expiringRewards.length}</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Review these first so you do not miss a claim window.
          </p>
        </CommandCenterCard>
      </div>

      <CommandCenterCard title="Reward categories" description="Claimable, pending, and claimed amounts separated by program.">
        {loading ? (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">Loading reward categories...</div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {totals.map((item) => (
              <div key={item.key} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                <div className="font-retro text-sm text-foreground">{item.label}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl border border-border/40 bg-card/25 p-2">
                    <div className="font-retro text-foreground">{formatBnb(item.claimable)}</div>
                    <div className="mt-1 text-muted-foreground">Claimable</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card/25 p-2">
                    <div className="font-retro text-foreground">{formatBnb(item.pending)}</div>
                    <div className="mt-1 text-muted-foreground">Pending</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card/25 p-2">
                    <div className="font-retro text-foreground">{formatBnb(item.claimed)}</div>
                    <div className="mt-1 text-muted-foreground">Claimed</div>
                  </div>
                </div>
                <Button disabled variant="outline" className="mt-4 w-full font-retro">
                  Claim coming soon
                </Button>
              </div>
            ))}
          </div>
        )}
      </CommandCenterCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <CommandCenterCard
          title="Pending / reward history"
          description="Latest reward ledger entries."
          action={<Hourglass className="h-5 w-5 text-accent" />}
        >
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
                No reward history published for this wallet yet.
              </div>
            ) : (
              history.slice(0, 8).map((item) => (
                <div key={`${item.id}-${item.epochId}`} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-retro text-sm text-foreground">{programLabel(item.program || item.category)} · Epoch #{item.epochId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Status: {item.status || "unknown"}</div>
                    </div>
                    <div className="font-retro text-sm text-foreground">{formatBnb(item.netAmount || item.amount || item.grossAmount)} BNB</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/40 bg-card/25 px-2.5 py-1">Claimable: {formatDate(item.claimableAt)}</span>
                    <span className={`rounded-full border px-2.5 py-1 ${isExpiringSoon(item.claimDeadlineAt) ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-border/40 bg-card/25"}`}>
                      Deadline: {formatDate(item.claimDeadlineAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CommandCenterCard>

        <CommandCenterCard
          title="Claim history"
          description="Recorded claim transactions and settlement states."
          action={<History className="h-5 w-5 text-accent" />}
        >
          <div className="space-y-3">
            {claims.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
                No claims recorded for this wallet yet.
              </div>
            ) : (
              claims.slice(0, 8).map((claim) => (
                <div key={`${claim.id}-${claim.epochId}`} className="rounded-2xl border border-border/50 bg-background/25 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-retro text-sm text-foreground">{programLabel(claim.program)} · Epoch #{claim.epochId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(claim.claimedAt)}</div>
                    </div>
                    <div className="font-retro text-sm text-foreground">{formatBnb(claim.claimedAmount || claim.amount)} BNB</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/40 bg-card/25 px-2.5 py-1">Status: {claim.status || "claimed"}</span>
                    {claim.claimTxHash && (
                      <span className="rounded-full border border-border/40 bg-card/25 px-2.5 py-1 font-mono">{claim.claimTxHash}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CommandCenterCard>
      </div>

      <CommandCenterCard
        title="Claim-state guide"
        description="Reward states help you understand what is ready, pending, already claimed, or no longer available."
        action={<Clock3 className="h-5 w-5 text-accent" />}
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {["Claimable now", "Pending", "Already claimed", "Expired", "Rolled over", "Ineligible", "Under review", "Expiring rewards"].map((state) => (
            <div key={state} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
              <Trophy className="mb-2 h-4 w-4 text-accent" />
              {state}
            </div>
          ))}
        </div>
      </CommandCenterCard>
    </div>
  );
}
