import { useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { Link } from "react-router-dom";
import { ArrowRight, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchSquadLeaderboard, fetchSquadMembers, type SquadLeaderboardItem, type SquadMemberItem } from "@/lib/rewardProgramsApi";

function formatBnb(raw: string): string {
  try {
    const value = Number(formatEther(BigInt(raw || "0")));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

export default function SquadLeaderboard() {
  const [epochLabel, setEpochLabel] = useState<string>("");
  const [globalPoolAmount, setGlobalPoolAmount] = useState("0");
  const [carryoverAmount, setCarryoverAmount] = useState("0");
  const [squads, setSquads] = useState<SquadLeaderboardItem[]>([]);
  const [members, setMembers] = useState<SquadMemberItem[]>([]);
  const [selectedRecruiterCode, setSelectedRecruiterCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const leaderboard = await fetchSquadLeaderboard();
        if (cancelled) return;
        const items = Array.isArray(leaderboard?.squads) ? leaderboard.squads as SquadLeaderboardItem[] : [];
        setSquads(items);
        setGlobalPoolAmount(String(leaderboard?.globalPoolAmount ?? "0"));
        setCarryoverAmount(String(leaderboard?.carryoverAmount ?? "0"));
        setEpochLabel(
          leaderboard?.epoch?.startAt && leaderboard?.epoch?.endAt
            ? `${new Date(leaderboard.epoch.startAt).toLocaleDateString()} - ${new Date(leaderboard.epoch.endAt).toLocaleDateString()}`
            : "",
        );
        const initialCode = items[0]?.recruiterCode ?? null;
        setSelectedRecruiterCode(initialCode);
        if (initialCode) {
          const ranking = await fetchSquadMembers({ recruiterCode: initialCode, limit: 50 });
          if (!cancelled) setMembers(Array.isArray(ranking?.items) ? ranking.items : []);
        } else {
          setMembers([]);
        }
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || "Failed to load squad leaderboard"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedRecruiterCode) return;
    let cancelled = false;
    void (async () => {
      try {
        const ranking = await fetchSquadMembers({ recruiterCode: selectedRecruiterCode, limit: 50 });
        if (!cancelled) setMembers(Array.isArray(ranking?.items) ? ranking.items : []);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRecruiterCode]);

  const totals = useMemo(() => ({
    squadCount: squads.length,
    eligibleMembers: squads.reduce((acc, squad) => acc + squad.eligibleMemberCount, 0),
  }), [squads]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <Card className="overflow-hidden border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_40%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="font-retro text-xs uppercase tracking-[0.24em] text-sky-100/70">Squad Pool</p>
            <h1 className="font-retro text-3xl text-foreground md:text-5xl">
              Global squad leaderboard and exact member rankings.
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              This page is driven by the squad allocation engine, including squad-level diminishing returns, member caps, and deterministic redistribution. It surfaces the same score and payout preview the ledger materializer uses.
            </p>
          </div>

          <Button asChild className="font-retro">
            <Link to="/profile?tab=squad">
              Squad dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Epoch</p>
          <p className="mt-4 font-retro text-sm text-foreground">{epochLabel || "Current preview"}</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Global squad pool</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(globalPoolAmount)} BNB</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Squads ranked</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{totals.squadCount}</p>
        </Card>
        <Card className="border-border/60 bg-card/70 p-5">
          <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">Carryover</p>
          <p className="mt-4 font-retro text-3xl text-foreground">{formatBnb(carryoverAmount)} BNB</p>
        </Card>
      </div>

      {loading ? (
        <Card className="border-border/60 bg-card/65 px-6 py-12 text-center text-sm text-muted-foreground">
          Loading squad leaderboard...
        </Card>
      ) : error ? (
        <Card className="border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center text-sm text-rose-100">
          {error}
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-border/60 bg-card/65 p-6">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-sky-200" />
              <div>
                <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Squad leaderboard</p>
                <h2 className="mt-1 font-retro text-xl text-foreground">Estimated weekly squad allocations</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {squads.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                  No squad allocations are published yet.
                </div>
              ) : (
                squads.map((squad, index) => (
                  <button
                    key={`${squad.recruiterId}-${squad.recruiterCode}`}
                    type="button"
                    onClick={() => setSelectedRecruiterCode(squad.recruiterCode ?? null)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedRecruiterCode === squad.recruiterCode ? "border-sky-300/40 bg-sky-300/10" : "border-border/60 bg-background/35 hover:border-sky-300/30 hover:bg-background/50"}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-retro text-sm text-foreground">#{index + 1} {squad.recruiterDisplayName || squad.recruiterCode || `Recruiter ${squad.recruiterId}`}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Effective score {formatBnb(squad.effectiveScore)} · raw {formatBnb(squad.rawScore)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-retro text-sm text-foreground">{formatBnb(squad.estimatedAllocationAmount)} BNB</p>
                        <p className="mt-1 text-xs text-muted-foreground">{squad.eligibleMemberCount} eligible members</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card className="border-border/60 bg-card/65 p-6">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-amber-200" />
              <div>
                <p className="font-retro text-xs uppercase tracking-[0.2em] text-muted-foreground">Member ranking</p>
                <h2 className="mt-1 font-retro text-xl text-foreground">Exact score and estimated payout</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {members.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                  Select a squad to inspect its ranked members.
                </div>
              ) : (
                members.map((member, index) => (
                  <div key={`${member.walletAddress}-${index}`} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-retro text-sm text-foreground">#{index + 1} {member.walletAddress}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Score {formatBnb(member.rawScore)} · {member.isEligible ? "eligible" : "ineligible"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-retro text-sm text-foreground">{formatBnb(member.estimatedPayoutAmount)} BNB</p>
                        <p className="mt-1 text-xs text-muted-foreground">Member cap {formatBnb(member.memberCapAmount)} BNB</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
