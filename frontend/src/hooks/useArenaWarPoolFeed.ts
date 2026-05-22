import { useEffect, useState } from "react";
import type { WarPool } from "@/features/postgrad/contracts";
import type { WarPoolSettlementSummary } from "@/features/postgrad/mockWarPoolRuntime";
import { apiFetch } from "@/lib/apiBase";
import { useMockWarPool, useMockWarPoolSummary } from "@/hooks/useMockWarPoolRuntime";

export type ArenaWarPoolFeedSource = "qa-runtime" | "api";

type WarPoolState = WarPool["state"];
type WarPoolSummary = ReturnType<typeof useMockWarPoolSummary>["summary"];

type ArenaWarPoolPayload = {
  pool: WarPool;
  settlementSummary: WarPoolSettlementSummary | null;
};

type ArenaWarPoolSummaryPayload = WarPoolSummary;

const WAR_POOL_STATES = new Set(["open", "locked", "settling", "paid"]);

function isWarPoolEntry(value: any): boolean {
  return Boolean(
    value?.battleId &&
      value?.sideTokenId &&
      Number.isFinite(Number(value?.amountUsd)) &&
      typeof value?.enteredAt === "string" &&
      typeof value?.payoutEligible === "boolean",
  );
}

function normalizeRouting(value: any, totalPotUsd: number): WarPool["routingBreakdown"] {
  const winnersUsd = Number(value?.winnersUsd);
  const protocolUsd = Number(value?.protocolUsd);
  const featuredUsd = Number(value?.featuredUsd);
  if (Number.isFinite(winnersUsd) && Number.isFinite(protocolUsd) && Number.isFinite(featuredUsd)) {
    return { winnersUsd, protocolUsd, featuredUsd };
  }

  return {
    winnersUsd: Math.round(totalPotUsd * 0.85),
    protocolUsd: Math.round(totalPotUsd * 0.05),
    featuredUsd: Math.round(totalPotUsd * 0.1),
  };
}

function normalizeWarPool(value: any): WarPool | null {
  if (!value || typeof value !== "object") return null;
  if (!value.battleId || !WAR_POOL_STATES.has(value.state)) return null;

  const entries = Array.isArray(value.entries)
    ? value.entries.filter(isWarPoolEntry).map((entry: any) => ({
        battleId: String(entry.battleId),
        sideTokenId: String(entry.sideTokenId),
        amountUsd: Number(entry.amountUsd),
        enteredAt: String(entry.enteredAt),
        payoutEligible: Boolean(entry.payoutEligible),
      }))
    : [];

  const totalPotUsd = Number.isFinite(Number(value.totalPotUsd))
    ? Number(value.totalPotUsd)
    : entries.reduce((total: number, entry: WarPool["entries"][number]) => total + entry.amountUsd, 0);

  return {
    battleId: String(value.battleId),
    state: value.state,
    totalPotUsd,
    cutoffAt: String(value.cutoffAt || new Date().toISOString()),
    routingBreakdown: normalizeRouting(value.routingBreakdown, totalPotUsd),
    entries,
  };
}

function normalizeSettlementSummary(value: any): WarPoolSettlementSummary | null {
  if (!value || typeof value !== "object") return null;
  const routingBreakdown = normalizeRouting(value.routingBreakdown, Number(value.totalPotUsd ?? 0));
  return {
    winnerTokenId: value.winnerTokenId ? String(value.winnerTokenId) : null,
    winnerLabel: String(value.winnerLabel ?? "No winner yet"),
    totalPotUsd: Number.isFinite(Number(value.totalPotUsd)) ? Number(value.totalPotUsd) : 0,
    winnerSideUsd: Number.isFinite(Number(value.winnerSideUsd)) ? Number(value.winnerSideUsd) : 0,
    loserSideUsd: Number.isFinite(Number(value.loserSideUsd)) ? Number(value.loserSideUsd) : 0,
    projectedPayoutMultiple: Number.isFinite(Number(value.projectedPayoutMultiple)) ? Number(value.projectedPayoutMultiple) : 0,
    projectedWinnerPayoutUsd: Number.isFinite(Number(value.projectedWinnerPayoutUsd)) ? Number(value.projectedWinnerPayoutUsd) : 0,
    projectedNetProfitUsd: Number.isFinite(Number(value.projectedNetProfitUsd)) ? Number(value.projectedNetProfitUsd) : 0,
    eligibleWinningEntries: Number.isFinite(Number(value.eligibleWinningEntries)) ? Number(value.eligibleWinningEntries) : 0,
    settlementStateLabel: String(value.settlementStateLabel ?? "Settlement preview"),
    settlementStateBody: String(value.settlementStateBody ?? "Settlement details will update as the pool advances."),
    routingBreakdown,
  };
}

function normalizeWarPoolSummary(value: any): WarPoolSummary | null {
  if (!value || typeof value !== "object") return null;
  const pools = Array.isArray(value.pools) ? value.pools.map(normalizeWarPool).filter(Boolean) as WarPool[] : [];
  if (!pools.length) return null;
  return {
    pools,
    totalPotUsd: Number.isFinite(Number(value.totalPotUsd)) ? Number(value.totalPotUsd) : pools.reduce((total, pool) => total + pool.totalPotUsd, 0),
    openPools: Number.isFinite(Number(value.openPools)) ? Number(value.openPools) : pools.filter((pool) => pool.state === "open").length,
    lockedPools: Number.isFinite(Number(value.lockedPools)) ? Number(value.lockedPools) : pools.filter((pool) => pool.state === "locked" || pool.state === "settling").length,
    paidPools: Number.isFinite(Number(value.paidPools)) ? Number(value.paidPools) : pools.filter((pool) => pool.state === "paid").length,
  };
}

async function fetchWarPool(battleId: string, signal?: AbortSignal): Promise<ArenaWarPoolPayload | null> {
  const response = await apiFetch(`/api/arena/war-pools/${encodeURIComponent(battleId)}`, { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") return null;
  const pool = normalizeWarPool((json as any).pool ?? json);
  if (!pool) return null;
  return {
    pool,
    settlementSummary: normalizeSettlementSummary((json as any).settlementSummary),
  };
}

async function fetchWarPoolSummary(signal?: AbortSignal): Promise<ArenaWarPoolSummaryPayload | null> {
  const response = await apiFetch("/api/arena/war-pools", { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") return null;
  return normalizeWarPoolSummary((json as any).summary ?? json);
}

async function supportWarPoolViaApi(battleId: string, sideTokenId: string, amountUsd: number): Promise<boolean> {
  const response = await apiFetch(`/api/arena/war-pools/${encodeURIComponent(battleId)}/support`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sideTokenId, amountUsd }),
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

async function transitionWarPoolViaApi(battleId: string, state: WarPoolState): Promise<boolean> {
  const response = await apiFetch(`/api/arena/war-pools/${encodeURIComponent(battleId)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

/**
 * Adapter boundary for War Pool surfaces.
 *
 * It attempts API-shaped War Pool endpoints first and falls back to the QA
 * runtime when unavailable, keeping support/cutoff/settlement UI stable while
 * the real endpoint is added.
 */
export function useArenaWarPool(battleId?: string | null) {
  const runtime = useMockWarPool(battleId);
  const [apiPayload, setApiPayload] = useState<ArenaWarPoolPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(battleId));

  const refreshPool = async (battleIdToRefresh: string) => {
    const freshPayload = await fetchWarPool(battleIdToRefresh).catch(() => null);
    if (freshPayload) setApiPayload(freshPayload);
    return freshPayload;
  };

  useEffect(() => {
    if (!battleId) {
      setApiPayload(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    fetchWarPool(battleId, controller.signal)
      .then((payload) => {
        if (!cancelled) setApiPayload(payload);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaWarPool] API pool unavailable", error);
        if (!cancelled) setApiPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [battleId, runtime.pool?.state, runtime.pool?.entries.length]);

  const supportSide = async (battleIdToSupport: string, sideTokenId: string, amountUsd = 500) => {
    try {
      const supported = await supportWarPoolViaApi(battleIdToSupport, sideTokenId, amountUsd);
      if (supported) {
        await refreshPool(battleIdToSupport);
        return true;
      }
    } catch (error) {
      console.warn("[useArenaWarPool] API support unavailable", error);
    }
    return runtime.supportWarPoolSide(battleIdToSupport, sideTokenId, amountUsd);
  };

  const transitionWarPool = async (battleIdToUpdate: string, state: WarPoolState) => {
    try {
      const transitioned = await transitionWarPoolViaApi(battleIdToUpdate, state);
      if (transitioned) {
        await refreshPool(battleIdToUpdate);
        return true;
      }
    } catch (error) {
      console.warn("[useArenaWarPool] API transition unavailable", error);
    }
    return runtime.transitionMockWarPool(battleIdToUpdate, state);
  };

  return {
    source: apiPayload ? "api" as ArenaWarPoolFeedSource : "qa-runtime" as ArenaWarPoolFeedSource,
    loading,
    pool: apiPayload?.pool ?? runtime.pool,
    settlementSummary: apiPayload?.settlementSummary ?? runtime.settlementSummary,
    supportSide,
    transitionWarPool,
    resetWarPoolRuntime: runtime.resetMockWarPoolRuntime,
  };
}

export function useArenaWarPoolSummary() {
  const runtime = useMockWarPoolSummary();
  const [apiSummary, setApiSummary] = useState<ArenaWarPoolSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchWarPoolSummary(controller.signal)
      .then((summary) => {
        if (!cancelled) setApiSummary(summary);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaWarPoolSummary] API summary unavailable", error);
        if (!cancelled) setApiSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtime.summary.totalPotUsd, runtime.summary.pools.length]);

  return {
    source: apiSummary ? "api" as ArenaWarPoolFeedSource : "qa-runtime" as ArenaWarPoolFeedSource,
    loading,
    summary: apiSummary ?? runtime.summary,
    resetWarPoolRuntime: runtime.resetMockWarPoolRuntime,
  };
}
