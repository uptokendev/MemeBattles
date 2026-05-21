import { useEffect, useState } from "react";
import {
  advanceLeagueWeek,
  cycleMockLeagueState,
  getResolvedLeagueHistory,
  getResolvedLeagueSeason,
  rebalanceLeagueDivisions,
  resetMockLeagueRuntime,
  subscribeToMockLeagueRuntime,
} from "@/features/postgrad/mockLeagueRuntime";

type ArchivedLeagueSeason = ReturnType<typeof getResolvedLeagueHistory>[number];

export function useMockLeagueSeason() {
  const [season, setSeason] = useState(() => getResolvedLeagueSeason());
  const [history, setHistory] = useState<ArchivedLeagueSeason[]>(() => getResolvedLeagueHistory());

  useEffect(() => {
    return subscribeToMockLeagueRuntime(() => {
      setSeason(getResolvedLeagueSeason());
      setHistory(getResolvedLeagueHistory());
    });
  }, []);

  return {
    season,
    history,
    advanceLeagueWeek,
    cycleMockLeagueState,
    rebalanceLeagueDivisions,
    resetMockLeagueRuntime,
  };
}
