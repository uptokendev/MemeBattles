import type { Battle } from "@/features/postgrad/contracts";
import {
  useMockBattleDetails,
  useMockBattleLists,
} from "@/hooks/useMockBattleRuntime";

export type ArenaBattleFeedSource = "qa-runtime" | "api";

type BattleTransitionState = Battle["state"];

/**
 * Adapter boundary for the Arena battle surfaces.
 *
 * Today it preserves the QA runtime so battle flows stay testable. When the
 * battle APIs are ready, this hook is the single place to swap list/detail data
 * to backend responses without rewriting the pages again.
 */
export function useArenaBattleFeed() {
  const runtime = useMockBattleLists();

  return {
    source: "qa-runtime" as ArenaBattleFeedSource,
    liveBattles: runtime.liveBattles,
    openForBattleQueue: runtime.openForBattleQueue,
    archivedBattles: runtime.archivedBattles,
    getBattleForToken: runtime.getBattleForToken,
    openCreatorCoinForBattle: runtime.createMockOpenForBattle,
    tick: runtime.tick,
  };
}

export function useArenaBattleDetails(battleId?: string) {
  const runtime = useMockBattleDetails(battleId);

  return {
    source: "qa-runtime" as ArenaBattleFeedSource,
    battle: runtime.battle,
    transitionBattle: (battleIdToUpdate: string, state: BattleTransitionState) => runtime.transitionMockBattle(battleIdToUpdate, state),
  };
}
