import { useEffect, useState } from "react";
import type { Battle } from "@/features/postgrad/contracts";
import {
  getResolvedArchivedBattles,
  getResolvedLiveBattles,
  getResolvedMockBattleById,
  getResolvedOpenForBattleQueue,
  resetMockBattleRuntime,
  subscribeToMockBattleRuntime,
  transitionMockBattle,
} from "@/features/postgrad/mockRuntime";

type ArchivedBattle = ReturnType<typeof getResolvedArchivedBattles>[number];

export function useMockBattleLists() {
  const [tick, setTick] = useState(0);
  const [archivedBattles, setArchivedBattles] = useState<ArchivedBattle[]>(() => getResolvedArchivedBattles());

  useEffect(() => {
    return subscribeToMockBattleRuntime(() => {
      setTick((value) => value + 1);
      setArchivedBattles(getResolvedArchivedBattles());
    });
  }, []);

  return {
    liveBattles: getResolvedLiveBattles(),
    openForBattleQueue: getResolvedOpenForBattleQueue(),
    archivedBattles,
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
