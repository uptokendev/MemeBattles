import { useEffect, useState } from "react";
import type { Battle } from "@/features/postgrad/contracts";
import {
  getResolvedLiveBattles,
  getResolvedMockBattleById,
  getResolvedOpenForBattleQueue,
  resetMockBattleRuntime,
  subscribeToMockBattleRuntime,
  transitionMockBattle,
} from "@/features/postgrad/mockRuntime";

export function useMockBattleLists() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeToMockBattleRuntime(() => setTick((value) => value + 1));
  }, []);

  return {
    liveBattles: getResolvedLiveBattles(),
    openForBattleQueue: getResolvedOpenForBattleQueue(),
    resetMockBattleRuntime,
    tick,
  };
}

export function useMockBattleDetails(battleId?: string) {
  const [battle, setBattle] = useState<Battle | null>(() => getResolvedMockBattleById(battleId));

  useEffect(() => {
    setBattle(getResolvedMockBattleById(battleId));
  }, [battleId]);

  useEffect(() => {
    return subscribeToMockBattleRuntime(() => {
      setBattle(getResolvedMockBattleById(battleId));
    });
  }, [battleId]);

  return {
    battle,
    transitionMockBattle,
    resetMockBattleRuntime,
  };
}
