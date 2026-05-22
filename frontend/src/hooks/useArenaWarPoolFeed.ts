import type { WarPool } from "@/features/postgrad/contracts";
import { useMockWarPool, useMockWarPoolSummary } from "@/hooks/useMockWarPoolRuntime";

export type ArenaWarPoolFeedSource = "qa-runtime" | "api";

type WarPoolState = WarPool["state"];

/**
 * Adapter boundary for War Pool surfaces.
 *
 * Current implementation preserves the QA runtime so support, cutoff, settlement,
 * and payout routing remain testable. When real War Pool data is ready, swap this
 * hook internals to API/contract state and keep the UI stable.
 */
export function useArenaWarPool(battleId?: string | null) {
  const runtime = useMockWarPool(battleId);

  return {
    source: "qa-runtime" as ArenaWarPoolFeedSource,
    pool: runtime.pool,
    settlementSummary: runtime.settlementSummary,
    supportSide: runtime.supportWarPoolSide,
    transitionWarPool: (battleIdToUpdate: string, state: WarPoolState) => runtime.transitionMockWarPool(battleIdToUpdate, state),
    resetWarPoolRuntime: runtime.resetMockWarPoolRuntime,
  };
}

export function useArenaWarPoolSummary() {
  const runtime = useMockWarPoolSummary();

  return {
    source: "qa-runtime" as ArenaWarPoolFeedSource,
    summary: runtime.summary,
    resetWarPoolRuntime: runtime.resetMockWarPoolRuntime,
  };
}
