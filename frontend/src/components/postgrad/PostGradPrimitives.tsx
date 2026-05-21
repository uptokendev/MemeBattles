import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BellRing, ChevronRight, Crown, Flame, Shield, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Battle, EventCardContract, GraduatedToken, RankingPayload, WarPool } from "@/features/postgrad/contracts";

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

export function MockModeBanner({ subject = "Post-grad sandbox" }: { subject?: string }) {
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-white shadow-[0_18px_45px_-30px_rgba(34,211,238,0.55)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/75">Mock mode active</div>
          <div className="mt-1 text-sm text-cyan-50/90">{subject} is running on frontend-only state for QA. Changes here do not touch production battle, event, ranking, or placement systems.</div>
        </div>
        <TacticalTag label="QA sandbox" tone="sponsored" />
      </div>
    </div>
  );
}

export function BattleCard({ battle, ctaLabel = "Open battle" }: { battle: Battle; ctaLabel?: string }) {
  const [left, right] = battle.participants;
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
            {!left.tokenId.startsWith("pending-") ? (
              <Link to={`/arena/token/${left.tokenId}`} className="mt-3 inline-flex text-xs text-accent transition-colors hover:text-accent/80">
                Inspect mock token
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
            {!right.tokenId.startsWith("pending-") ? (
              <Link to={`/arena/token/${right.tokenId}`} className="mt-3 inline-flex text-xs text-accent transition-colors hover:text-accent/80">
                Inspect mock token
              </Link>
            ) : null}
          </div>
        </div>
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
          <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/70">Daily streak scaffold</div>
          <div className="mt-1 text-lg font-semibold">{streakDays}-day commander streak</div>
          <div className="mt-1 text-sm text-emerald-50/80">Next weekly reward unlock: {nextReward}</div>
        </div>
        <BellRing className="h-5 w-5 text-emerald-100" />
      </div>
    </div>
  );
}

export function TacticalHint({ label, body }: { label: string; body: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/70">
          <Shield className="h-3.5 w-3.5" />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs border-white/10 bg-zinc-950 text-xs text-white/80">
        {body}
      </TooltipContent>
    </Tooltip>
  );
}
