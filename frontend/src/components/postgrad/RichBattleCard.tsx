import { Link } from "react-router-dom";
import { Coins, Crown, Swords, TrendingUp, Users } from "lucide-react";

import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import type { Battle } from "@/features/postgrad/contracts";
import { formatCompactCount, formatCompactUsd } from "@/features/postgrad/warRoomMetrics";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { useArenaWarPool } from "@/hooks/useArenaWarPoolFeed";
import { cn } from "@/lib/utils";

function formatWhen(value?: string) {
  if (!value) return "Awaiting schedule";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting schedule";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getParticipantImage(participant: any) {
  return participant?.imageUrl || participant?.image || participant?.logoURI || participant?.logoUrl || "/placeholder.svg";
}

function getParticipantMarketCap(participant: any) {
  const value = Number(participant?.marketCapUsd ?? participant?.marketCap ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getParticipantVolume(participant: any) {
  const value = Number(participant?.volume24hUsd ?? participant?.volume24h ?? participant?.volumeUsd ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getParticipantAudience(participant: any) {
  const holders = Number(participant?.holderCount ?? participant?.holders ?? 0);
  if (Number.isFinite(holders) && holders > 0) {
    return { label: "Holders", value: holders };
  }

  const traders = Number(participant?.traderCount ?? participant?.uniqueTraders ?? 0);
  return {
    label: "Traders",
    value: Number.isFinite(traders) && traders > 0 ? traders : 0,
  };
}

function getBattleLeaderState(battle: Battle) {
  const leaderSide = String((battle as any)?.leaderSide ?? "").toLowerCase();
  const left = battle.participants[0] as any;
  const right = battle.participants[1] as any;

  const explicitLeft = typeof left?.isLeading === "boolean" ? left.isLeading : null;
  const explicitRight = typeof right?.isLeading === "boolean" ? right.isLeading : null;

  if (leaderSide === "left") return { left: true, right: false, tied: false };
  if (leaderSide === "right") return { left: false, right: true, tied: false };
  if (leaderSide === "tied") return { left: false, right: false, tied: true };
  if (explicitLeft === true && explicitRight !== true) return { left: true, right: false, tied: false };
  if (explicitRight === true && explicitLeft !== true) return { left: false, right: true, tied: false };

  if (left.score > right.score) return { left: true, right: false, tied: false };
  if (right.score > left.score) return { left: false, right: true, tied: false };
  return { left: false, right: false, tied: true };
}

function getParticipantTone(isLeading: boolean, tied: boolean, side: "left" | "right") {
  if (tied) return "default" as const;
  if (isLeading) return "success" as const;
  return side === "left" ? "hot" : "sponsored";
}

function getParticipantRoute(participant: any) {
  return getArenaTokenRoute(participant?.campaignAddress ?? participant?.tokenId ?? participant?.tokenAddress ?? null);
}

function BattleParticipantPanel({
  participant,
  battle,
  isLeading,
  tied,
  side,
  poolUsd,
  poolShare,
}: {
  participant: any;
  battle: Battle;
  isLeading: boolean;
  tied: boolean;
  side: "left" | "right";
  poolUsd: number;
  poolShare: number;
}) {
  const imageUrl = getParticipantImage(participant);
  const marketCapUsd = getParticipantMarketCap(participant);
  const volumeUsd = getParticipantVolume(participant);
  const audience = getParticipantAudience(participant);
  const tokenRoute = getParticipantRoute(participant);
  const stateTone = getParticipantTone(isLeading, tied, side);
  const stateLabel = tied ? "Tied" : isLeading ? "Leading" : "Chasing";
  const scoreBasis = String((battle as any)?.scoreBasis ?? "score").replaceAll("_", " ");

  const panel = (
    <div
      className={cn(
        "rounded-[22px] border p-4 transition-colors",
        side === "left"
          ? "border-orange-400/20 bg-orange-500/6"
          : "border-cyan-400/20 bg-cyan-500/6",
      )}
    >
      <div className="flex items-start gap-3">
        <img src={imageUrl} alt={participant.tokenName} className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-base font-semibold text-white">{participant.tokenName}</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">{participant.symbol}</div>
            <TacticalTag label={stateLabel} tone={stateTone} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <TacticalTag label={`${participant.score.toFixed(1)} ${scoreBasis}`} tone={side === "left" ? "hot" : "sponsored"} />
            {poolUsd > 0 ? <TacticalTag label={`War Pool ${poolShare}%`} tone="default" /> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Market cap</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatCompactUsd(marketCapUsd)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">24h volume</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatCompactUsd(volumeUsd)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">{audience.label}</div>
          <div className="mt-1 text-sm font-semibold text-white">{formatCompactCount(audience.value)}</div>
        </div>
      </div>

      {poolUsd > 0 ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/65">
          <Coins className="h-3.5 w-3.5 text-accent" />
          <span>{formatCompactUsd(poolUsd)} routed to this side</span>
        </div>
      ) : null}
    </div>
  );

  if (!tokenRoute) return panel;

  return (
    <Link to={tokenRoute} className="block transition-transform hover:translate-y-[-1px]">
      {panel}
    </Link>
  );
}

export function RichBattleCard({ battle, ctaLabel = "Open battle" }: { battle: Battle; ctaLabel?: string }) {
  const [left, right] = battle.participants as any[];
  const { pool } = useArenaWarPool(battle.id);
  const leaderState = getBattleLeaderState(battle);
  const updatedAt = String((battle as any)?.updatedAt ?? battle.startedAt ?? battle.endsAt ?? "");
  const scoreBasis = String((battle as any)?.scoreBasis ?? "score").replaceAll("_", " ");

  const leftPoolUsd = pool?.entries.filter((entry) => entry.sideTokenId === left.tokenId).reduce((total, entry) => total + entry.amountUsd, 0) ?? 0;
  const rightPoolUsd = pool?.entries.filter((entry) => entry.sideTokenId === right.tokenId).reduce((total, entry) => total + entry.amountUsd, 0) ?? 0;
  const leftShare = pool && pool.totalPotUsd > 0 ? Math.round((leftPoolUsd / pool.totalPotUsd) * 100) : 0;
  const rightShare = pool && pool.totalPotUsd > 0 ? Math.round((rightPoolUsd / pool.totalPotUsd) * 100) : 0;

  return (
    <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(8,10,14,0.97))] p-4 shadow-[0_24px_60px_-38px_rgba(0,0,0,0.9)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
            <TacticalTag label={battle.format.replaceAll("_", " ")} tone="default" />
            <TacticalTag label={leaderState.tied ? "Tied" : `${leaderState.left ? left.symbol : right.symbol} leading`} tone={leaderState.tied ? "default" : "success"} />
            {battle.featured ? <TacticalTag label="Featured" tone="sponsored" /> : null}
          </div>
          <h3 className="mt-3 text-xl font-semibold text-white">{left.tokenName} vs {right.tokenName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-accent" />Score basis: {scoreBasis}</span>
            <span className="inline-flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-accent" />Updated {formatWhen(updatedAt)}</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-accent" />Ends {formatWhen(battle.endsAt)}</span>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to={`/battle/${battle.id}`}>{ctaLabel}</Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
        <BattleParticipantPanel participant={left} battle={battle} isLeading={leaderState.left} tied={leaderState.tied} side="left" poolUsd={leftPoolUsd} poolShare={leftShare} />
        <div className="flex items-center justify-center text-sm font-semibold uppercase tracking-[0.26em] text-white/35">
          <Swords className="mr-2 h-4 w-4" />VS
        </div>
        <BattleParticipantPanel participant={right} battle={battle} isLeading={leaderState.right} tied={leaderState.tied} side="right" poolUsd={rightPoolUsd} poolShare={rightShare} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
        <div className="flex flex-wrap items-center gap-2">
          {pool ? (
            <>
              <TacticalTag label={`War Pool ${formatCompactUsd(pool.totalPotUsd)}`} tone="default" />
              <TacticalTag label={pool.state} tone={pool.state === "open" ? "success" : pool.state === "locked" ? "hot" : pool.state === "settling" ? "sponsored" : "default"} />
              <span>Cutoff {formatWhen(pool.cutoffAt)}</span>
            </>
          ) : (
            <span>War Pool data will appear when this battle has live pool routing.</span>
          )}
        </div>
        <div className="text-white/45">Battle ID {battle.id}</div>
      </div>
    </section>
  );
}
