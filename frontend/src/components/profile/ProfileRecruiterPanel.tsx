import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import {
  fetchRecruiterSummaryByWallet,
  fetchWalletAttributionState,
  fetchWalletRewardClaims,
  fetchWalletRewardHistory,
  fetchWalletRewardSummary,
  type RecruiterSummary,
  type WalletAttributionPublicState,
  type WalletRewardSummary,
} from "@/lib/recruiterApi";

type ProfileRecruiterPanelProps = {
  account: string | null;
  isConnected: boolean;
  isOwnProfile: boolean;
};

type RewardHistoryItem = {
  id: number;
  epochId: number;
  startAt: string;
  endAt: string;
  grossAmount: string;
  netAmount: string;
  status: string;
  claimableAt: string | null;
  claimDeadlineAt: string | null;
  claimedAt: string | null;
  createdAt: string;
};

type RewardClaimItem = {
  id: number;
  epochId: number;
  claimedAmount: string;
  claimTxHash: string | null;
  claimedAt: string;
  status: string;
};

function formatBnb(raw: string): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet" : date.toLocaleString();
}

export function ProfileRecruiterPanel({ account, isConnected, isOwnProfile }: ProfileRecruiterPanelProps) {
  const [recruiter, setRecruiter] = useState<RecruiterSummary | null>(null);
  const [summary, setSummary] = useState<WalletRewardSummary | null>(null);
  const [attribution, setAttribution] = useState<WalletAttributionPublicState | null>(null);
  const [history, setHistory] = useState<RewardHistoryItem[]>([]);
  const [claims, setClaims] = useState<RewardClaimItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setRecruiter(null);
      setSummary(null);
      setAttribution(null);
      setHistory([]);
      setClaims([]);
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [recruiterSummary, walletSummary, historyItems, claimItems, attributionState] = await Promise.all([
          fetchRecruiterSummaryByWallet(account).catch((err: any) => {
            const message = String(err?.message || "");
            if (message.includes("404") || message.toLowerCase().includes("not found")) return null;
            throw err;
          }),
          fetchWalletRewardSummary(account).catch(() => null),
          fetchWalletRewardHistory(account, 10, "recruiter").catch(() => []),
          fetchWalletRewardClaims(account, 10, "recruiter").catch(() => []),
          fetchWalletAttributionState(account).catch(() => null),
        ]);

        if (cancelled) return;
        setRecruiter(recruiterSummary);
        setSummary(walletSummary);
        setHistory(Array.isArray(historyItems) ? historyItems : []);
        setClaims(Array.isArray(claimItems) ? claimItems : []);
        setAttribution(attributionState);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || "Failed to load recruiter state"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!isOwnProfile) {
    return (
      <Card className="border-border/60 bg-card/65 p-6">
        <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Recruiter</p>
        <h3 className="mt-2 font-retro text-2xl text-foreground">Recruiter earnings and claims are private to the owning wallet.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Public recruiter standings and profile stats still live on the recruiter pages, but routed earnings and claim history only show on your own profile.
        </p>
        <div className="mt-5">
          <Button asChild variant="outline" className="font-retro">
            <Link to="/recruiters">
              Public recruiters
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (!isConnected || !account) {
    return (
      <Card className="border-border/60 bg-card/65 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Recruiter</p>
            <h3 className="mt-2 font-retro text-2xl text-foreground">Connect your recruiter wallet.</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Your recruiter code, routed earnings, and claim history are all shown here once the wallet is connected.
            </p>
          </div>
          <ConnectWalletButton />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <Card className="border-border/60 bg-card/65 px-6 py-12 text-center text-sm text-muted-foreground">
          Loading recruiter state...
        </Card>
      ) : error ? (
        <Card className="border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center text-sm text-rose-100">
          {error}
        </Card>
      ) : !recruiter ? (
        <Card className="border-border/60 bg-card/65 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Not a recruiter wallet</p>
              <h3 className="mt-2 font-retro text-2xl text-foreground">This wallet is not mapped to a recruiter code yet.</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Start the recruiter signup flow from here to claim a code for this wallet and move into the recruiter program.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="font-retro">
                <Link to="/recruiter/signup">Become a Recruiter</Link>
              </Button>
              <Button asChild variant="outline" className="font-retro">
                <Link to="/recruiters">Browse recruiters</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary?.pendingByProgram?.recruiter ?? "0")} BNB</p>
            </Card>
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Claimable</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary?.claimableByProgram?.recruiter ?? "0")} BNB</p>
            </Card>
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Claimed lifetime</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary?.claimedByProgram?.recruiter ?? "0")} BNB</p>
            </Card>
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Total earned</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(recruiter.totalEarnedRaw)} BNB</p>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/60 bg-card/65 p-6">
              <div className="flex items-center gap-3">
                <Wallet className="h-4 w-4 text-sky-200" />
                <div>
                  <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Current state</p>
                  <h3 className="mt-1 font-retro text-xl text-foreground">Recruiter + wallet posture</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recruiter code</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{recruiter.code}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{recruiter.status}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Wallet recruiter link state</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{attribution?.recruiterLinkState ?? "unknown"}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last claim</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{formatDate(summary?.lastClaimedAt ?? recruiter.lastClaimedAt)}</p>
                </div>
              </div>

              <div className="mt-5">
                <Button asChild variant="outline" className="font-retro">
                  <Link to={`/recruiters/${encodeURIComponent(recruiter.code)}`}>
                    Public recruiter page
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>

            <Card className="border-border/60 bg-card/65 p-6">
              <div className="flex items-center gap-3">
                <Clock3 className="h-4 w-4 text-amber-200" />
                <div>
                  <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Claim history</p>
                  <h3 className="mt-1 font-retro text-xl text-foreground">Recorded settlements</h3>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {claims.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                    No recruiter claims recorded yet.
                  </div>
                ) : (
                  claims.slice(0, 3).map((claim) => (
                    <div key={claim.id} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-retro text-sm text-foreground">Epoch #{claim.epochId}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{claim.status}</p>
                        </div>
                        <p className="font-retro text-sm text-foreground">{formatBnb(claim.claimedAmount)} BNB</p>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">Claimed at {formatDate(claim.claimedAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="border-border/60 bg-card/65 p-6">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Reward history</p>
              <h3 className="mt-1 font-retro text-xl text-foreground">Weekly recruiter ledger entries</h3>
            </div>

            <div className="mt-5 space-y-3">
              {history.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                  No recruiter reward history has been published for this wallet yet.
                </div>
              ) : (
                history.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-retro text-sm text-foreground">Epoch #{item.epochId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(item.startAt)} to {formatDate(item.endAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Net</p>
                          <p className="mt-1 font-retro text-foreground">{formatBnb(item.netAmount)} BNB</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                          <p className="mt-1 font-retro text-foreground">{item.status}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Deadline</p>
                          <p className="mt-1 font-retro text-foreground">{formatDate(item.claimDeadlineAt)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
