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
}