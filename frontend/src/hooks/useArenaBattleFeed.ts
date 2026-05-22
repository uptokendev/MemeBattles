import { useEffect, useMemo, useState } from "react";
import type { Battle } from "@/features/postgrad/contracts";
import { apiFetch } from "@/lib/apiBase";
import {
  useMockBattleDetails,
  useMockBattleLists,
} from "@/hooks/useMockBattleRuntime";

export type ArenaBattleFeedSource = "qa-runtime" | "api";

type BattleTransitionState = Battle["state"];
type ArchivedBattleEntry = ReturnType<typeof useMockBattleLists>["archivedBattles"][number];

type ArenaBattleFeedPayload = {
  liveBattles?: Battle[];
  openForBattleQueue?: Battle[];
  archivedBattles?: ArchivedBattleEntry[];
};

function isBattle(value: any): value is Battle {
  return Boolean(value?.id && value?.state && Array.isArray(value?.participants));
}

function normalizeBattleList(value: unknown): Battle[] {
  return Array.isArray(value) ? value.filter(isBattle) : [];
}

function normalizeArchivedBattleList(value: unknown): ArchivedBattleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => isBattle((entry as any)?.battle) && typeof (entry as any)?.archivedAt === "string") as ArchivedBattleEntry[];
}

async function fetchBattleFeed(signal?: AbortSignal): Promise<ArenaBattleFeedPayload | null> {
  const response = await apiFetch("/api/arena/battles", { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") return null;

  const liveBattles = normalizeBattleList((json as any).liveBattles ?? (json as any).live ?? (json as any).items?.liveBattles);
  const openForBattleQueue = normalizeBattleList((json as any).openForBattleQueue ?? (json as any).openForBattle ?? (json as any).items?.openForBattleQueue);
  const archivedBattles = normalizeArchivedBattleList((json as any).archivedBattles ?? (json as any).recentSettled ?? (json as any).items?.archivedBattles);

  if (!liveBattles.length && !openForBattleQueue.length && !archivedBattles.length) return null;

  return { liveBattles, openForBattleQueue, archivedBattles };
}

async function fetchBattleDetails(battleId: string, signal?: AbortSignal): Promise<Battle | null> {
  const response = await apiFetch(`/api/arena/battles/${encodeURIComponent(battleId)}`, { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const battle = (json as any)?.battle ?? json;
  return isBattle(battle) ? battle : null;
}

async function openBattleViaApi(tokenId: string): Promise<boolean> {
  const response = await apiFetch("/api/arena/battles/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tokenId }),
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

/**
 * Adapter boundary for the Arena battle surfaces.
 *
 * It now attempts the API-shaped battle feed first and falls back to the QA
 * runtime when the backend is unavailable, so pages can move to real endpoints
 * without another UI rewrite.
 */
export function useArenaBattleFeed() {
  const runtime = useMockBattleLists();
  const [apiPayload, setApiPayload] = useState<ArenaBattleFeedPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchBattleFeed(controller.signal)
      .then((payload) => {
        if (!cancelled) setApiPayload(payload);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaBattleFeed] API feed unavailable", error);
        if (!cancelled) setApiPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtime.tick]);

  const liveBattles = apiPayload?.liveBattles ?? runtime.liveBattles;
  const openForBattleQueue = apiPayload?.openForBattleQueue ?? runtime.openForBattleQueue;
  const archivedBattles = apiPayload?.archivedBattles ?? runtime.archivedBattles;

  const getBattleForToken = useMemo(() => {
    if (!apiPayload) return runtime.getBattleForToken;
    const allBattles = [...liveBattles, ...openForBattleQueue, ...archivedBattles.map((entry) => entry.battle)];
    return (tokenId: string) => allBattles.find((battle) => battle.participants.some((participant) => participant.tokenId === tokenId)) ?? null;
  }, [apiPayload, archivedBattles, liveBattles, openForBattleQueue, runtime.getBattleForToken]);

  const openCreatorCoinForBattle = async (tokenId: string) => {
    try {
      const opened = await openBattleViaApi(tokenId);
      if (opened) return true;
    } catch (error) {
      console.warn("[useArenaBattleFeed] API open-for-battle unavailable", error);
    }
    return runtime.createMockOpenForBattle(tokenId);
  };

  return {
    source: apiPayload ? "api" as ArenaBattleFeedSource : "qa-runtime" as ArenaBattleFeedSource,
    loading,
    liveBattles,
    openForBattleQueue,
    archivedBattles,
    getBattleForToken,
    openCreatorCoinForBattle,
    tick: runtime.tick,
  };
}

export function useArenaBattleDetails(battleId?: string) {
  const runtime = useMockBattleDetails(battleId);
  const [apiBattle, setApiBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(Boolean(battleId));

  useEffect(() => {
    if (!battleId) {
      setApiBattle(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    fetchBattleDetails(battleId, controller.signal)
      .then((battle) => {
        if (!cancelled) setApiBattle(battle);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaBattleDetails] API detail unavailable", error);
        if (!cancelled) setApiBattle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [battleId]);

  return {
    source: apiBattle ? "api" as ArenaBattleFeedSource : "qa-runtime" as ArenaBattleFeedSource,
    loading,
    battle: apiBattle ?? runtime.battle,
    transitionBattle: (battleIdToUpdate: string, state: BattleTransitionState) => runtime.transitionMockBattle(battleIdToUpdate, state),
  };
}
