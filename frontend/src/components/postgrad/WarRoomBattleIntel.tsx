import { Link } from "react-router-dom";
import { Activity, ShieldCheck, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { getArenaTokenRoute } from "@/features/postgrad/tokenRoutes";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import type { CampaignInfo } from "@/lib/launchpadClient";

function formatScore(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function resolveSignalLevel(volumeUsd: number, holders: number) {
  if (volumeUsd >= 100_000 || holders >= 1_000) return { label: "Strong signal", tone: "success" as const };
  if (volumeUsd >= 10_000 || holders >= 100) return { label: "Building", tone: "sponsored" as const };
  return { label: "Needs activity", tone: "default" as const };
}

function resolveBattleStateLabel(state?: string) {
  if (!state) return null;
  if (state === "open_for_battle") return "Looking for a match";
  return String(state ?? "").replace(/_/g, " ");
}

export function WarRoomBattleIntel({ campaign, bnbUsd = 0 }: { campaign: CampaignInfo; bnbUsd?: number }) {
  const { getBattleForToken, source } = useArenaBattleFeed();
  const metrics = getWarRoomCampaignMetrics(campaign, bnbUsd);
  const tokenRoute = getArenaTokenRoute(campaign.campaign);
  const linkedBattle = getBattleForToken(campaign.campaign) ?? (campaign.token ? getBattleForToken(campaign.token) : null);
  const signal = resolveSignalLevel(metrics.volumeUsd, metrics.holdersCount);

  const stateLabel = resolveBattleStateLabel(linkedBattle?.state);
  const isReadyCandidate = !linkedBattle && metrics.status !== "draft" && metrics.hasRichStats;
  const statusLabel = stateLabel ?? (isReadyCandidate ? "Candidate" : metrics.status === "draft" ? "Not live yet" : source === "empty" ? "Data unavailable" : "Review needed");
  const statusTone = linkedBattle?.state === "live" ? "hot" : linkedBattle ? "success" : isReadyCandidate ? "success" : "default";
  const poolLabel = linkedBattle?.state === "live" ? "Pool active" : linkedBattle ? "Pool pending" : "No active pool";

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3 md:rounded-[20px] md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Battle intel</div>
          <div className="mt-1 text-sm font-semibold text-white">Arena readiness and matchup context</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TacticalTag label={statusLabel} tone={statusTone} />
          <TacticalTag label={signal.label} tone={signal.tone} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/35">
            <Activity className="h-3.5 w-3.5" /> Volume
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{metrics.volumeLabel}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/35">
            <ShieldCheck className="h-3.5 w-3.5" /> Holders
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{metrics.holdersLabel}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/35">
            <Trophy className="h-3.5 w-3.5" /> Heat
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{formatScore(metrics.trendScore)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Swords className="h-4 w-4 text-accent" />
              {linkedBattle ? "Matchup" : "Lane"}
            </div>
            <div className="mt-1 text-xs text-white/55">
              {linkedBattle
                ? `${linkedBattle.participants[0].symbol} vs ${linkedBattle.participants[1].symbol} · ${poolLabel}`
                : source === "empty"
                  ? "Battle data is not available right now."
                  : isReadyCandidate
                    ? "This coin has enough live market context to review for battle seeding."
                    : "This coin needs more market data before battle seeding is useful."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedBattle ? (
              <Button asChild size="sm" variant="outline" className="h-8 text-[11px] md:text-sm">
                <Link to={`/battle/${linkedBattle.id}`}>Open battle</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="h-8 text-[11px] md:text-sm">
                <Link to="/arena/battles">Battle page</Link>
              </Button>
            )}
            {tokenRoute ? (
              <Button asChild size="sm" variant="outline" className="h-8 text-[11px] md:text-sm">
                <Link to={tokenRoute}>Token</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
