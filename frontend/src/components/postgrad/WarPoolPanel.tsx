import { Link } from "react-router-dom";
import { Coins, Lock, ShieldAlert, Trophy } from "lucide-react";
import type { Battle, WarPool } from "@/features/postgrad/contracts";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import { useArenaWarPool } from "@/hooks/useArenaWarPoolFeed";

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatWhen(value?: string) {
  if (!value) return "No cutoff";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No cutoff";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const stateTone: Record<WarPool["state"], "default" | "hot" | "sponsored" | "success"> = {
  open: "success",
  locked: "hot",
  settling: "sponsored",
  paid: "default",
};

const nextPoolActions: Record<WarPool["state"], { label: string; state: WarPool["state"] }[]> = {
  open: [{ label: "Lock cutoff", state: "locked" }],
  locked: [{ label: "Start settlement", state: "settling" }],
  settling: [{ label: "Mark paid", state: "paid" }],
  paid: [{ label: "Reopen pool", state: "open" }],
};

export function WarPoolPanel({ battle }: { battle: Battle }) {
  const { pool, settlementSummary, supportSide, transitionWarPool } = useArenaWarPool(battle.id);

  if (!pool) return null;

  const supportedParticipants = battle.participants.filter((participant) => !participant.tokenId.startsWith("pending-"));

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">War Pool</div>
          <div className="mt-1 text-xl font-semibold text-white">Spectator support and settlement routing</div>
          <div className="mt-2 text-sm text-white/65">Support either side, lock cutoff, simulate settlement, and verify payout routing before the pool closes.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TacticalTag label={pool.state} tone={stateTone[pool.state]} />
          <TacticalTag label={`${pool.entries.length} entries`} tone="sponsored" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Coins className="h-3.5 w-3.5" />Total pot</div>
          <div className="mt-1 text-2xl font-semibold text-white">{formatUsd(pool.totalPotUsd)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Lock className="h-3.5 w-3.5" />Cutoff</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatWhen(pool.cutoffAt)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Trophy className="h-3.5 w-3.5" />Winner route</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatUsd(pool.routingBreakdown.winnersUsd)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><ShieldAlert className="h-3.5 w-3.5" />Fees</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatUsd(pool.routingBreakdown.protocolUsd + pool.routingBreakdown.featuredUsd)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {supportedParticipants.map((participant) => {
            const sideTotal = pool.entries.filter((entry) => entry.sideTokenId === participant.tokenId).reduce((total, entry) => total + entry.amountUsd, 0);
            const share = pool.totalPotUsd > 0 ? Math.round((sideTotal / pool.totalPotUsd) * 100) : 0;
            const tokenRoute = getMockTokenRouteById(participant.tokenId);
            return (
              <div key={participant.tokenId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{participant.tokenName}</div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">{participant.symbol}</div>
                      <TacticalTag label={`${share}% pool`} tone={share >= 50 ? "hot" : "default"} />
                    </div>
                    <div className="mt-2 text-xs text-white/55">{formatUsd(sideTotal)} supported · Score {participant.score.toFixed(1)} · {participant.uniqueTraders} traders</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[250, 500, 1000].map((amount) => (
                      <Button
                        key={amount}
                        size="sm"
                        variant="outline"
                        disabled={pool.state !== "open"}
                        onClick={() => supportSide(battle.id, participant.tokenId, amount)}
                      >
                        Support {formatUsd(amount)}
                      </Button>
                    ))}
                    {tokenRoute ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={tokenRoute}>Token</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Settlement preview</div>
          {settlementSummary ? (
            <div className="mt-3 space-y-3 text-sm text-white/70">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/45">Current projected winner</div>
                <div className="mt-1 font-semibold text-white">{settlementSummary.winnerLabel}</div>
                <div className="mt-2 text-xs text-white/55">{settlementSummary.settlementStateLabel}</div>
                <div className="mt-1 text-xs text-white/45">{settlementSummary.settlementStateBody}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Winner side: <span className="text-white">{formatUsd(settlementSummary.winnerSideUsd)}</span></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Other side: <span className="text-white">{formatUsd(settlementSummary.loserSideUsd)}</span></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Projected multiple: <span className="text-white">{settlementSummary.projectedPayoutMultiple.toFixed(2)}x</span></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Projected payout: <span className="text-white">{formatUsd(settlementSummary.projectedWinnerPayoutUsd)}</span></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Projected net win: <span className="text-white">{formatUsd(settlementSummary.projectedNetProfitUsd)}</span></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">Eligible winning entries: <span className="text-white">{settlementSummary.eligibleWinningEntries}</span></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/45">Routing breakdown</div>
                <div className="mt-2 space-y-2 text-xs text-white/60">
                  <div>Winners: <span className="text-white">{formatUsd(settlementSummary.routingBreakdown.winnersUsd)}</span></div>
                  <div>Protocol: <span className="text-white">{formatUsd(settlementSummary.routingBreakdown.protocolUsd)}</span></div>
                  <div>Featured: <span className="text-white">{formatUsd(settlementSummary.routingBreakdown.featuredUsd)}</span></div>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {nextPoolActions[pool.state].map((action) => (
              <Button key={action.state} size="sm" onClick={() => transitionWarPool(battle.id, action.state)}>
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
