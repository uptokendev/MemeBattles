import type { EventCardContract, TournamentBracketStage } from "@/features/postgrad/contracts";
import { useMockEvents, useMockEventDetails } from "@/hooks/useMockEventRuntime";

export type ArenaEventFeedSource = "qa-runtime" | "api";

export type ArenaEventSummary = EventCardContract & {
  bracketStage?: TournamentBracketStage;
};

export type ArenaArchivedEvent = ReturnType<typeof useMockEvents>["archivedEvents"][number];

type EventStatus = ArenaEventSummary["status"];

/**
 * Adapter boundary for Arena event surfaces.
 *
 * Current implementation preserves the QA runtime. When the real events feed is
 * available, swap this hook internals to API data and keep the page components
 * stable.
 */
export function useArenaEventFeed() {
  const runtime = useMockEvents();

  return {
    source: "qa-runtime" as ArenaEventFeedSource,
    events: runtime.events,
    archivedEvents: runtime.archivedEvents,
    transitionEvent: (eventId: string, status: EventStatus) => runtime.transitionMockEvent(eventId, status),
    advanceTournamentBracket: runtime.advanceTournamentBracket,
  };
}

export function useArenaEventDetails(eventId?: string) {
  const runtime = useMockEventDetails(eventId);

  return {
    source: "qa-runtime" as ArenaEventFeedSource,
    event: runtime.event,
    transitionEvent: (eventIdToUpdate: string, status: EventStatus) => runtime.transitionMockEvent(eventIdToUpdate, status),
    advanceTournamentBracket: runtime.advanceTournamentBracket,
  };
}
