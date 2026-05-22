import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellRing, ChevronRight, Coins, Crown, Flame, Shield, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Battle, CommanderStreakState, EventCardContract, GraduatedToken, RankingPayload, WarPool } from "@/features/postgrad/contracts";
import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import { useMockWarPool } from "@/hooks/useMockWarPoolRuntime";

function formatCompactUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatWhen(value?: string) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PostGradPanel({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-white/10 bg-black/30 p-4 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.85)] backdrop-blur-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">{eyebrow}</div> : null}
          <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export function TacticalTag({ label, tone = "default" }: { label: string; tone?: "default" | "hot" | "sponsored" | "success" }) {
  const toneClass = {
    default: "border-white/10 bg-white/5 text-white/80",
    hot: "border-orange-400/25 bg-orange-500/10 text-orange-200",
    sponsored: "border-cyan-400/25 bg-cyan-500/10 text-cyan-100",
    success: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
  }[tone];

  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]", toneClass)}>{label}</span>;
}

export function MockModeBanner({ subject = "Post-grad preview" }: { subject?: string }) {
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-white shadow-[0_18px_45px_-30px_rgba(34,211,238,0.55)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/75">Preview mode</div>
          <div className="mt-1 text-sm text-cyan-50/90">{subject} is using preview data in this branch. Changes here do not affect live battles, events, rankings, or placements.</div>
        </div>
        <TacticalTag label="Preview data" tone="sponsored" />
      </div>
    </div>
  );
}

export function BattleCard({ battle, ctaLabel = "Open battle" }: { battle: Battle; ctaLabel?: string }) {
  const [left, right] = battle.participants;
  const { pool } = useMockWarPool(battle.id);
  const leftPoolUsd = pool?.entries.filter((entry) => entry.sideTokenId === left.tokenId).reduce((total, entry) => total + entry.amountUsd, 0) ?? 0;
  const rightPoolUsd = pool?.entries.filter((entry) => entry.sideTokenId === right.tokenId).reduce((total, entry) => total + entry.amountUsd, 0) ?? 0;
  const leftShare = pool && pool.totalPotUsd > 0 ? Math.round((leftPoolUsd / pool.totalPotUsd) * 100) : 0;
  const rightShare = pool && pool.totalPotUsd > 0 ? Math.round((rightPoolUsd / pool.totalPotUsd) * 100) : 0;
  const leftTokenRoute = getMockTokenRouteById(left.tokenId);
  const rightTokenRoute = getMockTokenRouteById(right.tokenId);

  return (
    <PostGradPanel title={`${left.tokenName} vs ${right.tokenName}`} eyebrow={battle.state.replaceAll("_", " ")}>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="rounded-xl border border-orange-400/15 bg-orange-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{left.tokenName}</div>
                <div className="text-xs text-white/55">{left.symbol}</div>
              </div>
              <TacticalTag label={`${left.score.toFixed(1)} pts`} tone="hot" />
            </div>
            <div className="mt-3 text-xs text-white/65">{left.uniqueTraders} traders · {formatCompactUsd(left.volumeUsd)} volume · {left.holdersDelta >= 0 ? "+" : ""}{left.holdersDelta} holders</div>
            {pool ? <div className="mt-2 text-xs text-orange-100/75">War Pool {formatCompactUsd(leftPoolUsd)} · {leftShare}%</div> : null}
            {leftTokenRoute ? (
              <Link to={leftTokenRoute} className="mt-3 inline-flex text-xs text-accent transition-colors hover:text-accent/80">
                Open token details
              </Link>
            ) : null}
          </div>
          <div className="flex items-center justify-center text-sm font-semibold uppercase tracking-[0.24em] text-white/35">
            <Swords className="mr-2 h-4 w-4" />VS
          </div>
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{right.tokenName}</div>
                <div className="text-xs text-white/55">{right.symbol}</div>
              </div>
              <TacticalTag label={`${right.score.toFixed(1)} pts`} tone="sponsored" />
            </div>
            <div className="mt-3 text-xs text-white/65">{right.uniqueTraders} traders · {formatCompactUsd(right.volumeUsd)} volume · {right.holdersDelta >= 0 ? "+" : ""}{right.holdersDelta} holders</div>
            {pool ? <div className="mt-2 text-xs text-cyan-100/75">War Pool {formatCompactUsd(rightPoolUsd)} · {rightShare}%</div> : null}
            {rightTokenRoute ? (
              <Link to={rightTokenRoute} className="mt-3 inline-flex text-xs text-accent transition-colors hover:text-accent/80">
                Open token details
              </Link>
            ) : null}
          </div>
        </div>
        {pool ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
            <Coins className="h-4 w-4 text-accent" />
            <span>War Pool {formatCompactUsd(pool.totalPotUsd)}</span>
            <TacticalTag label={pool.state} tone={pool.state === "open" ? "success" : pool.state === "locked" ? "hot" : pool.state === "settling" ? "sponsored" : "default"} />
            <span>Cutoff {formatWhen(pool.cutoffAt)}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
          <div className="flex flex-wrap items-center gap-2">
            {battle.featured ? <TacticalTag label="Featured" tone="hot" /> : null}
            <TacticalTag label={battle.format.replaceAll("_", " ")} />
            <span>Ends {formatWhen(battle.endsAt)}</span>
          </div>
          <Button asChild size="sm">
            <Link to={`/battle/${battle.id}`}>{ctaLabel}</Link>
          </Button>
        </div>
      </div>
    </PostGradPanel>
  );
}

export function EventCard({
  event,
  href,
  ctaLabel,
}: {
  event: EventCardContract;
  href?: string;
  ctaLabel?: string;
}) {
  const tone = event.status === "live" ? "success" : event.type === "tournament" ? "sponsored" : "default";
  return (
    <PostGradPanel title={event.title} eyebrow={event.type.replaceAll("_", " ")}>
      <div className="space-y-4">
        <p className="text-sm text-white/70">{event.summary}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <TacticalTag label={event.status} tone={tone} />
          <span>{event.participantCount} tokens deployed</span>
          <span>Starts {formatWhen(event.startsAt)}</span>
        </div>
        {href && ctaLabel ? (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline">
              <Link to={href}>{ctaLabel}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </PostGradPanel>
  );
}

export function TokenIntelRow({ token, metricLabel, metricValue, href }: { token: GraduatedToken; metricLabel: string; metricValue: string; href?: string }) {
  const body = (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-white">{token.name}</div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
          {token.tacticalTags.slice(0, 2).map((tag) => (
            <TacticalTag key={tag} label={tag} tone={tag === "Sponsored" ? "sponsored" : "default"} />
          ))}
        </div>
        <div className="mt-2 text-xs text-white/55">MC {formatCompactUsd(token.marketCapUsd)} · Liquidity {formatCompactUsd(token.liquidityUsd)} · {token.holders.toLocaleString()} holders</div>
      </div>
      <div className="flex items-center gap-3 text-right">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{metricLabel}</div>
          <div className="text-sm font-semibold text-white">{metricValue}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/30" />
      </div>
    </div>
  );

  if (!href) return body;

  return (
    <Link to={href} className="block transition-transform hover:translate-y-[-1px]">
      {body}
    </Link>
  );
}

export function WarPoolModule({ pool }: { pool: WarPool }) {
  return (
    <PostGradPanel title="War Pool" eyebrow={pool.state}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Total pot</div>
          <div className="mt-1 text-2xl font-semibold text-white">{formatCompactUsd(pool.totalPotUsd)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Cutoff</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatWhen(pool.cutoffAt)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Routing</div>
          <div className="mt-1 text-sm text-white/70">Winners {formatCompactUsd(pool.routingBreakdown.winnersUsd)} · Protocol {formatCompactUsd(pool.routingBreakdown.protocolUsd)}</div>
        </div>
      </div>
    </PostGradPanel>
  );
}

export function RankingsPanel({ payload, icon = "flame" }: { payload: RankingPayload; icon?: "flame" | "crown" | "trophy" }) {
  const Icon = icon === "crown" ? Crown : icon === "trophy" ? Trophy : Flame;
  return (
    <PostGradPanel title={payload.key.replaceAll("_", " ")} eyebrow="Rankings">
      <div className="space-y-3">
        {payload.entries.map((entry) => (
          <div key={`${payload.key}-${entry.rank}-${entry.tokenId}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-xs font-semibold text-white">{entry.rank}</div>
              <div>
                <div className="text-sm font-semibold text-white">{entry.label}</div>
                <div className="text-xs text-white/55">{entry.metricLabel}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <Icon className="h-4 w-4 text-accent" />
              <div>
                <div className="text-sm font-semibold text-white">{entry.metricValue}</div>
                {entry.deltaLabel ? <div className="text-xs text-white/55">{entry.deltaLabel}</div> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PostGradPanel>
  );
}

export function StreakPopup({ streakDays, nextReward }: { streakDays: number; nextReward: string }) {
  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-white shadow-[0_20px_50px_-30px_rgba(16,185,129,0.6)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/70">Daily streak</div>
          <div className="mt-1 text-lg font-semibold">{streakDays}-day commander streak</div>
          <div className="mt-1 text-sm text-emerald-50/80">Next weekly reward unlock: {nextReward}</div>
        </div>
        <BellRing className="h-5 w-5 text-emerald-100" />
      </div>
    </div>
  );
}

export function WeeklyRewardPanel({
  streak,
  onCheckIn,
  onClaim,
  onReset,
  className,
}: {
  streak: CommanderStreakState;
  onCheckIn?: () => void;
  onClaim?: () => void;
  onReset?: () => void;
  className?: string;
}) {
  const rewardReady = streak.activeReward.status === "claimable";

  return (
    <div className={cn("rounded-2xl border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(14,40,30,0.78),rgba(5,14,11,0.92))] p-4 text-white shadow-[0_20px_50px_-30px_rgba(16,185,129,0.55)]", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/70">Weekly commander rewards</div>
          <div className="mt-1 text-lg font-semibold">{streak.activeReward.label}</div>
          <div className="mt-2 max-w-2xl text-sm text-emerald-50/80">{streak.activeReward.description}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TacticalTag label={`${streak.weekProgressDays}/${streak.weeklyGoalDays} days`} tone="success" />
          <TacticalTag label={rewardReady ? "Claimable" : "Locked"} tone={rewardReady ? "hot" : "default"} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Current streak</div>
          <div className="mt-1 text-2xl font-semibold text-white">{streak.currentStreakDays}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Best streak</div>
          <div className="mt-1 text-2xl font-semibold text-white">{streak.bestStreakDays}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Rewards claimed</div>
          <div className="mt-1 text-2xl font-semibold text-white">{streak.claimedRewardsCount}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: streak.weeklyGoalDays }, (_, index) => {
          const unlocked = index < streak.weekProgressDays;
          return (
            <div
              key={`streak-day-${index + 1}`}
              className={cn(
                "flex min-w-[72px] flex-1 items-center justify-center rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.18em]",
                unlocked ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-50" : "border-white/10 bg-white/5 text-white/45",
              )}
            >
              Day {index + 1}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-emerald-50/80">
          <div>Next check-in target: {formatWhen(streak.nextCheckInAt)}</div>
          {streak.lastClaimedRewardLabel && streak.lastClaimedAt ? (
            <div className="mt-1 text-emerald-100/65">Last claimed: {streak.lastClaimedRewardLabel} on {formatWhen(streak.lastClaimedAt)}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onCheckIn ? (
            <Button size="sm" onClick={onCheckIn}>
              Log day
            </Button>
          ) : null}
          {onClaim ? (
            <Button size="sm" variant={rewardReady ? "default" : "outline"} onClick={onClaim} disabled={!rewardReady}>
              Claim weekly reward
            </Button>
          ) : null}
          {onReset ? (
            <Button size="sm" variant="outline" onClick={onReset}>
              Reset streak
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TacticalHint({ label, body }: { label: string; body: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/65 transition-colors hover:bg-white/10">
          <Shield className="mr-1.5 h-3.5 w-3.5 text-accent" />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs border-white/10 bg-black/90 text-white">
        {body}
      </TooltipContent>
    </Tooltip>
  );
}
