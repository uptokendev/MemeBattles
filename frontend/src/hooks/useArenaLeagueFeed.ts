import { useMockLeagueSeason } from "@/hooks/useMockLeagueRuntime";

export type ArenaLeagueFeedSource = "qa-runtime" | "api";

export type ArenaLeagueSeason = ReturnType<typeof useMockLeagueSeason>["season"];
export type ArenaLeagueHistoryEntry = ReturnType<typeof useMockLeagueSeason>["history"][number];

/**
 * Adapter boundary for Arena league surfaces.
 *
 * Current implementation preserves the QA runtime so season controls, standings,
 * promotion/relegation, and archive flows remain testable. When the real league
 * payload is ready, swap this hook internals to API data and keep the page UI
 * stable.
 */
export function useArenaLeagueFeed() {
  const runtime = useMockLeagueSeason();

  return {
    source: "qa-runtime" as ArenaLeagueFeedSource,
    season: runtime.season,
    history: runtime.history,
    advanceWeek: runtime.advanceLeagueWeek,
    cycleSeasonState: runtime.cycleMockLeagueState,
    rebalanceDivisions: runtime.rebalanceLeagueDivisions,
  };
}
