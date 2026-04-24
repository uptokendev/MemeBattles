import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/contexts/WalletContext";
import { fetchSquadSummary, fetchWalletAttributionState, fetchWalletRewardSummary, type SquadSummary, type WalletAttributionPublicState, type WalletRewardSummary } from "@/lib/recruiterApi";
import { fetchSquadMembers, type SquadMemberItem } from "@/lib/rewardProgramsApi";

function formatBnb(raw: string): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

export default function SquadDashboard() {
  const wallet = useWallet();
  const account = wallet.account || "";

  const [summary, setSummary] = useState<WalletRewardSummary | null>(null);
  const [attribution, setAttribution] = useState<WalletAttributionPublicState | null>(null);
  const [squad, setSquad] = useState<SquadSummary | null>(null);
  const [member, setMember] = useState<SquadMemberItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setSummary(null);
      setAttribution(null);
      setSquad(null);
      setMember(null);
      return;
    }

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const attributionState = await fetchWalletAttributionState(account).catch(() => null);
        const [walletSummary, squadMembers] = await Promise.all([
          fetchWalletRewardSummary(account).catch(() => null),
          fetchSquadMembers({ walletAddress: account, limit: 1 }).catch(() => ({ items: [] })),
        ]);

        const recruiterCode = attributionState?.recruiterCode ?? null;
        const squadSummary = recruiterCode ? await fetchSquadSummary(recruiterCode).catch(() => null) : null;

        if (cancelled) return;
        setSummary(walletSummary);
        setAttribution(attributionState);
        setSquad(squadSummary);
        setMember(Array.isArray(squadMembers?.items) ? squadMembers.items[0] ?? null : null);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || "Failed to load squad dashboard"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!wallet.isConnected || !account) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-10">
        <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_40%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-8 text-center">
          <p className="font-retro text-xs uppercase tracking-[0.24em] text-sky-100/70">Squad Dashboard</p>
          <h1 className="mt-4 font-retro text-3xl text-foreground">Connect your wallet to inspect squad posture.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            We’ll show your current squad linkage, detached or solo messaging, exact weekly score, and the estimated squad pool payout from backend allocation state.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <ConnectWalletButton />
            <Button asChild variant="outline" className="font-retro">
              <Link to="/squads">Open public squad leaderboard</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_38%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="font-retro text-xs uppercase tracking-[0.24em] text-sky-100/70">Squad Dashboard</p>
            <h1 className="font-retro text-3xl text-foreground md:text-5xl">Wallet-specific squad state, without raw SQL.</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Your dashboard combines attribution state, the public squad leaderboard preview, and wallet reward balances so detached, solo, and active squad members all see the same backend truth.
            </p>
          </div>

          <Button asChild className="font-retro">
            <Link to="/squads">
              Public squad leaderboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="border-border/60 bg-card/65 px-6 py-12 text-center text-sm text-muted-foreground">
          Loading squad dashboard...
        </Card>
      ) : error ? (
        <Card className="border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center text-sm text-rose-100">
          {error}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Squad reward claimable</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(summary?.claimableByProgram?.squad ?? "0")} BNB</p>
            </Card>
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Exact member score</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(member?.rawScore ?? "0")} BNB</p>
            </Card>
            <Card className="border-border/60 bg-card/70 p-5">
              <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Estimated payout</p>
              <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(member?.estimatedPayoutAmount ?? "0")} BNB</p>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="border-border/60 bg-card/65 p-6">
              <div className="flex items-center gap-3">
                <Wallet className="h-4 w-4 text-sky-200" />
                <div>
                  <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Attribution</p>
                  <h2 className="mt-1 font-retro text-xl text-foreground">Current wallet posture</h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recruiter link</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{attribution?.recruiterLinkState ?? "unknown"}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Squad state</p>
                  <p className="mt-2 font-retro text-lg text-foreground">{attribution?.squadState ?? "unknown"}</p>
                </div>
              </div>

              {attribution?.squadState?.includes("solo") ? (
                <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                  This wallet is currently solo, so it does not share the Squad Pool. Unassigned paths continue through the airdrop engine instead.
                </div>
              ) : null}

              {attribution?.squadState === "solo_detached" ? (
                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
                  This wallet looks detached from its previous squad. The dashboard is showing the detached state directly from attribution state so ops does not need to inspect raw membership tables.
                </div>
              ) : null}
            </Card>

            <Card className="border-border/60 bg-card/65 p-6">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-amber-200" />
                <div>
                  <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Squad preview</p>
                  <h2 className="mt-1 font-retro text-xl text-foreground">Estimated reward surface</h2>
                </div>
              </div>

              {!squad ? (
                <div className="mt-5 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                  No active squad summary found for this wallet right now.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Squad recruiter</p>
                    <p className="mt-2 font-retro text-lg text-foreground">{squad.recruiterDisplayName || squad.recruiterCode}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Eligible members</p>
                    <p className="mt-2 font-retro text-lg text-foreground">{squad.eligibleMemberCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Estimated pending pool</p>
                    <p className="mt-2 font-retro text-lg text-foreground">{formatBnb(squad.estimatedPendingPoolAmount)} BNB</p>
                  </div>
                  {member?.memberCapApplied ? (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                      <ShieldAlert className="mb-2 h-4 w-4" />
                      Your current estimated member payout is sitting on the member cap, so additional redistribution would flow to other eligible members first.
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
