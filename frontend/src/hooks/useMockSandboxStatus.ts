import { useEffect, useState } from "react";
import { getResolvedArenaState, subscribeToMockArenaRuntime } from "@/features/postgrad/mockArenaRuntime";
import { getResolvedEventArchive, getResolvedScheduledEvents, subscribeToMockEventRuntime } from "@/features/postgrad/mockEventRuntime";
import { getResolvedLeagueHistory, getResolvedLeagueSeason, subscribeToMockLeagueRuntime } from "@/features/postgrad/mockLeagueRuntime";
import { getResolvedLiveBattles, getResolvedOpenForBattleQueue, subscribeToMockBattleRuntime } from "@/features/postgrad/mockRuntime";
import { getResolvedWarRoomState, subscribeToMockWarRoomRuntime } from "@/features/postgrad/mockWarRoomRuntime";

function getSnapshot() {
  const arena = getResolvedArenaState();
  const battles = getResolvedLiveBattles();
  const queue = getResolvedOpenForBattleQueue();
  const warRoom = getResolvedWarRoomState();
  const events = getResolvedScheduledEvents();
  const archivedEvents = getResolvedEventArchive();
  const season = getResolvedLeagueSeason();
  const leagueHistory = getResolvedLeagueHistory();

  return {
    liveBattleCount: battles.filter((battle) => battle.state === "live").length,
    queuedBattleCount: queue.filter((battle) => battle.state === "open_for_battle" || battle.state === "pending" || battle.state === "accepted").length,
    watchedTokenCount: warRoom.watchlistTokenIds.length,
    featuredTokenCount: arena.featuredTokens.length,
    sponsoredTokenCount: arena.sponsoredTokenIds.length,
    liveEventCount: events.filter((event) => event.status === "live").length,
    archivedEventCount: archivedEvents.length,
    leagueState: season.state,
    leagueWeek: season.week,
    archivedSeasonCount: leagueHistory.length,
  };
}

export function useMockSandboxStatus() {
  const [status, setStatus] = useState(() => getSnapshot());

  useEffect(() => {
    const update = () => setStatus(getSnapshot());

    const unsubscribers = [
      subscribeToMockArenaRuntime(update),
      subscribeToMockBattleRuntime(update),
      subscribeToMockWarRoomRuntime(update),
      subscribeToMockEventRuntime(update),
      subscribeToMockLeagueRuntime(update),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return status;
}
