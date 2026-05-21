import { useEffect, useState } from "react";
import type { EventCardContract, TournamentBracketStage } from "@/features/postgrad/contracts";
import {
  advanceTournamentBracket,
  getResolvedEventById,
  getResolvedScheduledEvents,
  resetMockEventRuntime,
  subscribeToMockEventRuntime,
  transitionMockEvent,
} from "@/features/postgrad/mockEventRuntime";

type ResolvedEvent = EventCardContract & {
  bracketStage?: TournamentBracketStage;
};

export function useMockEvents() {
  const [events, setEvents] = useState<ResolvedEvent[]>(() => getResolvedScheduledEvents());

  useEffect(() => {
    return subscribeToMockEventRuntime(() => {
      setEvents(getResolvedScheduledEvents());
    });
  }, []);

  return {
    events,
    transitionMockEvent,
    advanceTournamentBracket,
    resetMockEventRuntime,
  };
}

export function useMockEventDetails(eventId?: string) {
  const [event, setEvent] = useState<ResolvedEvent | null>(() => getResolvedEventById(eventId));

  useEffect(() => {
    setEvent(getResolvedEventById(eventId));
  }, [eventId]);

  useEffect(() => {
    return subscribeToMockEventRuntime(() => {
      setEvent(getResolvedEventById(eventId));
    });
  }, [eventId]);

  return {
    event,
    transitionMockEvent,
    advanceTournamentBracket,
    resetMockEventRuntime,
  };
}
