import { useEffect, useMemo, useState } from "react";
import type { Battle } from "@/features/postgrad/contracts";
import { postGradFlags } from "@/features/postgrad/config";
import { apiFetch } from "@/lib/apiBase";
import {
  useMockBattleDetails,
  useMockBattleLists,
} from "@/hooks/useMockBattleRuntime";

export type ArenaBattleFeedSource = "qa-runtime" | "api" | "empty";

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

function normalizeIdentity(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isHexIdentity(value: string) {
  return /^0x[a-f0-9]{40}$/i.test(value);
}

function battleMatchesIdentity(battle: Battle, identity: string) {
  const normalized = normalizeIdentity(identity);
  if (!normalized) return false;

  return battle.participants.some((participant: any) => {
    const participantIdentity = normalizeIdentity(participant?.tokenId);
    const campaignIdentity = normalizeIdentity(participant?.campaignAddress ?? participant?.campaign_address ?? participant?.campaign);
    const tokenIdentity = normalizeIdentity(participant?.tokenAddress ?? participant?.token_address ?? participant?.token);
    return participantIdentity === normalized || campaignIdentity === normalized || tokenIdentity === normalized;
  });
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

async function transitionBattleViaApi(battleId: string, state: BattleTransitionState): Promise<boolean> {
  const response = await apiFetch(`/api/arena/battles/${encodeURIComponent(battleId)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

/**
 * Adapter boundary for the Arena battle surfaces.
 *
 * It attempts the API-shaped battle feed first and only falls back to the QA
 * runtime when mock mode is explicitly enabled.
 */
export function useArenaBattleFeed() {
  const runtime = useMockBattleLists();
  const allowMockFallback = postGradFlags.mocks;
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

  const liveBattles = apiPayload?.liveBattles ?? (allowMockFallback ? runtime.liveBattles : []);
  const openForBattleQueue = apiPayload?.openForBattleQueue ?? (allowMockFallback ? runtime.openForBattleQueue : []);
  const archivedBattles = apiPayload?.archivedBattles ?? (allowMockFallback ? runtime.archivedBattles : []);

  const getBattleForToken = useMemo(() => {
    if (!apiPayload && allowMockFallback) return runtime.getBattleForToken;
    const allBattles = [...liveBattles, ...openForBattleQueue, ...archivedBattles.map((entry) => entry.battle)];
    return (tokenId: string) => {
      const normalized = normalizeIdentity(tokenId);
      if (!normalized) return null;
      return allBattles.find((battle) => battleMatchesIdentity(battle, normalized)) ?? null;
    };
  }, [allowMockFallback, apiPayload, archivedBattles, liveBattles, openForBattleQueue, runtime.getBattleForToken]);

  const openCreatorCoinForBattle = async (tokenId: string) => {
    try {
      const opened = await openBattleViaApi(tokenId);
      if (opened) return true;
    } catch (error) {
      console.warn("[useArenaBattleFeed] API open-for-battle unavailable", error);
    }

    const normalized = normalizeIdentity(tokenId);
    if (allowMockFallback && !isHexIdentity(normalized)) {
      return runtime.createMockOpenForBattle(tokenId);
    }

    return false;
  };

  return {
    source: apiPayload ? "api" as ArenaBattleFeedSource : allowMockFallback ? "qa-runtime" as ArenaBattleFeedSource : "empty" as ArenaBattleFeedSource,
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
  const allowMockFallback = postGradFlags.mocks;
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

  const transitionBattle = async (battleIdToUpdate: string, state: BattleTransitionState) => {
    try {
      const updated = await transitionBattleViaApi(battleIdToUpdate, state);
      if (updated) {
        const freshBattle = await fetchBattleDetails(battleIdToUpdate).catch(() => null);
        if (freshBattle) setApiBattle(freshBattle);
        return true;
      }
    } catch (error) {
      console.warn("[useArenaBattleDetails] API transition unavailable", error);
    }
    return allowMockFallback ? runtime.transitionMockBattle(battleIdToUpdate, state) : false;
  };

  return {
    source: apiBattle ? "api" as ArenaBattleFeedSource : allowMockFallback ? "qa-runtime" as ArenaBattleFeedSource : "empty" as ArenaBattleFeedSource,
    loading,
    battle: apiBattle ?? (allowMockFallback ? runtime.battle : null),
    transitionBattle,
  };
}