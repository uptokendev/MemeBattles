import { useEffect, useState } from "react";
import type { EventCardContract, TournamentBracketStage } from "@/features/postgrad/contracts";
import { apiFetch } from "@/lib/apiBase";
import { useMockEvents, useMockEventDetails } from "@/hooks/useMockEventRuntime";

export type ArenaEventFeedSource = "qa-runtime" | "api";

export type ArenaEventSummary = EventCardContract & {
  bracketStage?: TournamentBracketStage;
};

export type ArenaArchivedEvent = ReturnType<typeof useMockEvents>["archivedEvents"][number];

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
  return value.filter((entry: any) => isEventSummary(entry) && typeof entry.completedAt === "string") as ArenaArchivedEvent[];
}

async function fetchEventFeed(signal?: AbortSignal): Promise<ArenaEventFeedPayload | null> {
  const response = await apiFetch("/api/arena/events", { cache: "no-store", signal });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") return null;

  const events = normalizeEventList((json as any).events ?? (json as any).items ?? (json as any).items?.events);
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

/**
 * Adapter boundary for Arena event surfaces.
 *
 * It attempts the API-shaped event feed first and falls back to the QA runtime
 * when the backend is unavailable, keeping the page stable while real endpoints
 * are added.
 */
export function useArenaEventFeed() {
  const runtime = useMockEvents();
  const [apiPayload, setApiPayload] = useState<ArenaEventFeedPayload | null>(null);
  const [loading, setLoading] = useState(true);

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

  return {
    source: apiPayload ? "api" as ArenaEventFeedSource : "qa-runtime" as ArenaEventFeedSource,
    loading,
    events: apiPayload?.events ?? runtime.events,
    archivedEvents: apiPayload?.archivedEvents ?? runtime.archivedEvents,
    transitionEvent: (eventId: string, status: EventStatus) => runtime.transitionMockEvent(eventId, status),
    advanceTournamentBracket: runtime.advanceTournamentBracket,
  };
}

export function useArenaEventDetails(eventId?: string) {
  const runtime = useMockEventDetails(eventId);
  const [apiEvent, setApiEvent] = useState<ArenaEventSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId));

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

  return {
    source: apiEvent ? "api" as ArenaEventFeedSource : "qa-runtime" as ArenaEventFeedSource,
    loading,
    event: apiEvent ?? runtime.event,
    transitionEvent: (eventIdToUpdate: string, status: EventStatus) => runtime.transitionMockEvent(eventIdToUpdate, status),
    advanceTournamentBracket: runtime.advanceTournamentBracket,
  };
}
