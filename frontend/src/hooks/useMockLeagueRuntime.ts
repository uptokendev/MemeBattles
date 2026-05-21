import { useEffect, useState } from "react";
import {
  advanceLeagueWeek,
  cycleMockLeagueState,
  getResolvedLeagueSeason,
  rebalanceLeagueDivisions,
  resetMockLeagueRuntime,
  subscribeToMockLeagueRuntime,
} from "@/features/postgrad/mockLeagueRuntime";

export function useMockLeagueSeason() {
  const [season, setSeason] = useState(() => getResolvedLeagueSeason());

  useEffect(() => {
    return subscribeToMockLeagueRuntime(() => {
      setSeason(getResolvedLeagueSeason());
    });
  }, []);

  return {
    season,
    advanceLeagueWeek,
    cycleMockLeagueState,
    rebalanceLeagueDivisions,
    resetMockLeagueRuntime,
  };
}
