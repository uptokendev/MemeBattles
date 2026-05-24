import { useEffect, useState } from "react";
import type { EventCardContract, TournamentBracketStage } from "@/features/postgrad/contracts";
import { postGradFlags } from "@/features/postgrad/config";
import { apiFetch } from "@/lib/apiBase";
import { useMockEvents, useMockEventDetails } from "@/hooks/useMockEventRuntime";

export type ArenaEventFeedSource = "qa-runtime" | "api" | "empty";

export type ArenaEventSummary = EventCardContract & {
  bracketStage?: TournamentBracketStage;
};

export type ArenaArchivedEvent = ArenaEventSummary & {
  completedAt: string;
};

type EventStatus = ArenaEventSummary["status"];

type ArenaEventFeedPayload = {
  events: ArenaEventSummary[];
  archivedEvents: ArenaArchivedEvent[];
};

const EVENT_STATUSES = new Set(["scheduled", "deploying", "live", "completed"]);
const EVENT_TYPES = new Set(["battle_weekend", "battle_night", "featured_rivalry", "tournament", "seasonal_league"]);
const BRACKET_STAGES = new Set(["registration", "quarterfinals", "semifinals", "finals", "completed"]);

function isEventSummary(value: any): value is ArenaEventSummary {
  return Boolean(
    value?.id &&
      EVENT_TYPES.has(value?.type) &&
      EVENT_STATUSES.has(value?.status) &&
      typeof value?.title === "string" &&
      typeof value?.startsAt === "string" &&
      typeof value?.endsAt === "string" &&
      Number.isFinite(Number(value?.participantCount)),
  );
}

function normalizeEventList(value: unknown): ArenaEventSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isEventSummary)
    .map((event) => ({
      ...event,
      participantCount: Number(event.participantCount),
      summary: String(event.summary ?? ""),
      bracketStage: BRACKET_STAGES.has((event as any).bracketStage) ? (event as any).bracketStage : undefined,
    }));
}

function normalizeArchivedEventList(value: unknown): ArenaArchivedEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry: any) => isEventSummary(entry) && typeof entry.completedAt === "string")
    .map((entry: any) => ({
      ...entry,
      participantCount: Number(entry.participantCount),
      summary: String(entry.summary ?? ""),
      bracketStage: BRACKET_STAGES.has(entry.bracketStage) ? entry.bracketStage : undefined,
      completedAt: String(entry.completedAt),
    }));
}

async function fetchEventFeed(signal?: AbortSignal): Promise<ArenaEventFeedPayload | null> {
  const response = await apiFetch("/api/arena/events", { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") return null;

  const events = normalizeEventList((json as any).events ?? (json as any).items?.events ?? (json as any).items);
  const archivedEvents = normalizeArchivedEventList((json as any).archivedEvents ?? (json as any).archive ?? (json as any).items?.archivedEvents);

  if (!events.length && !archivedEvents.length) return null;
  return { events, archivedEvents };
}

async function fetchEventDetails(eventId: string, signal?: AbortSignal): Promise<ArenaEventSummary | null> {
  const response = await apiFetch(`/api/arena/events/${encodeURIComponent(eventId)}`, { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const event = (json as any)?.event ?? json;
  return isEventSummary(event) ? event : null;
}

async function transitionEventViaApi(eventId: string, status: EventStatus): Promise<boolean> {
  const response = await apiFetch(`/api/arena/events/${encodeURIComponent(eventId)}/transition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

async function advanceTournamentBracketViaApi(eventId: string): Promise<boolean> {
  const response = await apiFetch(`/api/arena/events/${encodeURIComponent(eventId)}/advance-bracket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  if (!response.ok) return false;
  const json = await response.json().catch(() => null);
  return json == null || json?.ok !== false;
}

/**
 * Adapter boundary for Arena event surfaces.
 *
 * It attempts the API-shaped event feed first and only falls back to the QA
 * runtime when mock mode is explicitly enabled.
 */
export function useArenaEventFeed() {
  const runtime = useMockEvents();
  const allowMockFallback = postGradFlags.mocks;
  const [apiPayload, setApiPayload] = useState<ArenaEventFeedPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshFeed = async () => {
    const payload = await fetchEventFeed().catch(() => null);
    setApiPayload(payload);
    return payload;
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchEventFeed(controller.signal)
      .then((payload) => {
        if (!cancelled) setApiPayload(payload);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaEventFeed] API feed unavailable", error);
        if (!cancelled) setApiPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtime.events.length, runtime.archivedEvents.length]);

  const transitionEvent = async (eventId: string, status: EventStatus) => {
    try {
      const transitioned = await transitionEventViaApi(eventId, status);
      if (transitioned) {
        await refreshFeed();
        return true;
      }
    } catch (error) {
      console.warn("[useArenaEventFeed] API transition unavailable", error);
    }
    return allowMockFallback ? runtime.transitionMockEvent(eventId, status) : false;
  };

  const advanceTournamentBracket = async (eventId: string) => {
    try {
      const advanced = await advanceTournamentBracketViaApi(eventId);
      if (advanced) {
        await refreshFeed();
        return true;
      }
    } catch (error) {
      console.warn("[useArenaEventFeed] API bracket advance unavailable", error);
    }
    return allowMockFallback ? runtime.advanceTournamentBracket(eventId) : false;
  };

  return {
    source: apiPayload ? "api" as ArenaEventFeedSource : allowMockFallback ? "qa-runtime" as ArenaEventFeedSource : "empty" as ArenaEventFeedSource,
    loading,
    events: apiPayload?.events ?? (allowMockFallback ? runtime.events : []),
    archivedEvents: apiPayload?.archivedEvents ?? (allowMockFallback ? runtime.archivedEvents : []),
    transitionEvent,
    advanceTournamentBracket,
    refreshFeed,
  };
}

export function useArenaEventDetails(eventId?: string) {
  const runtime = useMockEventDetails(eventId);
  const allowMockFallback = postGradFlags.mocks;
  const [apiEvent, setApiEvent] = useState<ArenaEventSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId));

  const refreshEvent = async (eventIdToRefresh: string) => {
    const freshEvent = await fetchEventDetails(eventIdToRefresh).catch(() => null);
    setApiEvent(freshEvent);
    return freshEvent;
  };

  useEffect(() => {
    if (!eventId) {
      setApiEvent(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    fetchEventDetails(eventId, controller.signal)
      .then((event) => {
        if (!cancelled) setApiEvent(event);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn("[useArenaEventDetails] API detail unavailable", error);
        if (!cancelled) setApiEvent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [eventId]);

  const transitionEvent = async (eventIdToUpdate: string, status: EventStatus) => {
    try {
      const transitioned = await transitionEventViaApi(eventIdToUpdate, status);
      if (transitioned) {
        await refreshEvent(eventIdToUpdate);
        return true;
      }
    } catch (error) {
      console.warn("[useArenaEventDetails] API transition unavailable", error);
    }
    return allowMockFallback ? runtime.transitionMockEvent(eventIdToUpdate, status) : false;
  };

  const advanceTournamentBracket = async (eventIdToUpdate: string) => {
    try {
      const advanced = await advanceTournamentBracketViaApi(eventIdToUpdate);
      if (advanced) {
        await refreshEvent(eventIdToUpdate);
        return true;
      }
    } catch (error) {
      console.warn("[useArenaEventDetails] API bracket advance unavailable", error);
    }
    return allowMockFallback ? runtime.advanceTournamentBracket(eventIdToUpdate) : false;
  };

  return {
    source: apiEvent ? "api" as ArenaEventFeedSource : allowMockFallback ? "qa-runtime" as ArenaEventFeedSource : "empty" as ArenaEventFeedSource,
    loading,
    event: apiEvent ?? (allowMockFallback ? runtime.event : null),
    transitionEvent,
    advanceTournamentBracket,
    refreshEvent,
  };
}
