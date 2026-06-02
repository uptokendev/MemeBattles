import { useEffect, useState } from "react";
import {
  getResolvedWarPoolByBattleId,
  getResolvedWarPoolSummary,
  getWarPoolSettlementSummary,
  resetMockWarPoolRuntime,
  subscribeToMockWarPoolRuntime,
  supportWarPoolSide,
  transitionMockWarPool,
} from "@/features/postgrad/mockWarPoolRuntime";

export function useMockWarPool(battleId?: string | null) {
  const [pool, setPool] = useState(() => getResolvedWarPoolByBattleId(battleId));
  const [settlementSummary, setSettlementSummary] = useState(() => getWarPoolSettlementSummary(battleId));

  useEffect(() => {
    setPool(getResolvedWarPoolByBattleId(battleId));
    setSettlementSummary(getWarPoolSettlementSummary(battleId));
  }, [battleId]);

  useEffect(() => {
    return subscribeToMockWarPoolRuntime(() => {
      setPool(getResolvedWarPoolByBattleId(battleId));
      setSettlementSummary(getWarPoolSettlementSummary(battleId));
    });
  }, [battleId]);

  return {
    pool,
    settlementSummary,
    supportWarPoolSide,
    transitionMockWarPool,
    resetMockWarPoolRuntime,
  };
}

export function useMockWarPoolSummary() {
  const [summary, setSummary] = useState(() => getResolvedWarPoolSummary());

  useEffect(() => {
    return subscribeToMockWarPoolRuntime(() => {
      setSummary(getResolvedWarPoolSummary());
    });
  }, []);

  return {
    summary,
    resetMockWarPoolRuntime,
  };
}
