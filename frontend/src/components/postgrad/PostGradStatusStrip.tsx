import { Link } from "react-router-dom";
import { Activity, CalendarDays, Crosshair, Eye, Shield, Swords, Trophy } from "lucide-react";
import { postGradFlags } from "@/features/postgrad/config";
import { useMockArenaState } from "@/hooks/useMockArenaRuntime";
import { useMockBattleLists } from "@/hooks/useMockBattleRuntime";
import { useMockEvents } from "@/hooks/useMockEventRuntime";
import { useMockLeagueSeason } from "@/hooks/useMockLeagueRuntime";
import { useMockWarRoomState } from "@/hooks/useMockWarRoomRuntime";

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function StatusTile({
  to,
  icon: Icon,
  label,
  value,
  detail,
}: {
  to: string;
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:border-accent/35 hover:bg-white/[0.07]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-accent transition-colors group-hover:border-accent/30">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">{label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
          <div className="mt-1 truncate text-xs text-white/55">{detail}</div>
        </div>
      </div>
    </Link>
  );
}

export function PostGradStatusStrip() {
  const { featuredTokens, sponsoredTokenIds } = useMockArenaState();
  const { liveBattles, openForBattleQueue } = useMockBattleLists();
  const { events, archivedEvents } = useMockEvents();
  const { season, history } = useMockLeagueSeason();
  const { watchlistTokenIds } = useMockWarRoomState();

  if (!postGradFlags.mocks) return null;

  const activeEvents = events.filter((event) => event.status === "deploying" || event.status === "live").length;
  const completedEvents = events.filter((event) => event.status === "completed").length + archivedEvents.length;
  const topLeagueToken = season.entries[0];

  return (
    <section className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,17,23,0.78),rgba(7,8,12,0.88))] p-4 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.85)]">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Post-grad ops snapshot</div>
          <div className="mt-1 text-sm text-white/65">Shared frontend sandbox state across Arena, War Room, Battles, Events, and League.</div>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-100">
          <Activity className="h-3.5 w-3.5" /> Live mock runtime
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatusTile
          to="/arena"
          icon={Crosshair}
          label="Arena"
          value={`${featuredTokens.length} featured`}
          detail={`${sponsoredTokenIds.length} sponsored placements`}
        />
        <StatusTile
          to="/battle/battle-redline-vs-sdoge"
          icon={Swords}
          label="Battles"
          value={`${liveBattles.length} live`}
          detail={`${openForBattleQueue.length} open challenges`}
        />
        <StatusTile
          to="/war-room"
          icon={Eye}
          label="War Room"
          value={`${watchlistTokenIds.length} watched`}
          detail="Persistent QA watchlist"
        />
        <StatusTile
          to="/events"
          icon={CalendarDays}
          label="Events"
          value={`${activeEvents} active`}
          detail={`${completedEvents} completed or archived`}
        />
        <StatusTile
          to="/league"
          icon={Trophy}
          label="League"
          value={`Week ${season.week} · ${season.state}`}
          detail={`${topLeagueToken?.symbol ?? "---"} leads · ${formatUsd(season.rewardPoolUsd)} pool · ${history.length} archive`}
        />
      </div>
    </section>
  );
}
