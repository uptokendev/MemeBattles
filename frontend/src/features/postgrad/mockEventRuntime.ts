import type { EventCardContract, EventStatus, TournamentBracketStage } from "@/features/postgrad/contracts";
import { POST_GRAD_EVENT_TRANSITIONS, TOURNAMENT_BRACKET_STAGES } from "@/features/postgrad/contracts";
import { pushMockActivity } from "@/features/postgrad/mockActivityRuntime";
import { scheduledEvents } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-events";
const ARCHIVE_STORAGE_KEY = "mwz:postgrad:mock-event-archive";
const UPDATE_EVENT = "mwz:postgrad-mock-events-updated";

type MockEventRuntimeState = {
  status: EventStatus;
  startsAt?: string;
  endsAt?: string;
  participantCount?: number;
  bracketStage?: TournamentBracketStage;
};

type MockEventRuntimeMap = Record<string, MockEventRuntimeState>;

type MockArchivedEvent = {
  id: string;
  title: string;
  type: EventCardContract["type"];
  completedAt: string;
  participantCount: number;
  summary: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchRuntimeUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readRuntimeMap(): MockEventRuntimeMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeMap(next: MockEventRuntimeMap) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  dispatchRuntimeUpdate();
}

function readArchive(): MockArchivedEvent[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArchive(next: MockArchivedEvent[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
}

function archiveEvent(event: EventCardContract) {
  const nextArchive = [
    {
      id: event.id,
      title: event.title,
      type: event.type,
      completedAt: new Date().toISOString(),
      participantCount: event.participantCount,
      summary: event.summary,
    },
    ...readArchive().filter((entry) => entry.id !== event.id),
  ];

  writeArchive(nextArchive);
}

function futureIso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function defaultBracketStage(event: EventCardContract): TournamentBracketStage | undefined {
  if (event.type !== "tournament") return undefined;
  if (event.status === "completed") return "completed";
  if (event.status === "live") return "quarterfinals";
  return "registration";
}

function mergeEvent(base: EventCardContract): EventCardContract & { bracketStage?: TournamentBracketStage } {
  const overrides = readRuntimeMap()[base.id];
  if (!overrides) {
    return {
      ...base,
      bracketStage: defaultBracketStage(base),
    };
  }

  return {
    ...base,
    status: overrides.status,
    startsAt: overrides.startsAt ?? base.startsAt,
    endsAt: overrides.endsAt ?? base.endsAt,
    participantCount: overrides.participantCount ?? base.participantCount,
    bracketStage: overrides.bracketStage ?? defaultBracketStage(base),
  };
}

export function getResolvedScheduledEvents() {
  return scheduledEvents.map(mergeEvent);
}

export function getResolvedEventById(eventId?: string | null) {
  const base = scheduledEvents.find((event) => event.id === eventId) ?? null;
  return base ? mergeEvent(base) : null;
}

export function getResolvedEventArchive() {
  return readArchive();
}

export function subscribeToMockEventRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockEventRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(ARCHIVE_STORAGE_KEY);
  dispatchRuntimeUpdate();
  pushMockActivity("events", "Event sandbox reset", "Scheduled events, tournament stages, and archives returned to baseline.");
}

export function transitionMockEvent(eventId: string, nextStatus: EventStatus) {
  const event = getResolvedEventById(eventId);
  if (!event) return false;

  const allowed = POST_GRAD_EVENT_TRANSITIONS[event.status] ?? [];
  if (!allowed.includes(nextStatus)) return false;

  const nextMap = readRuntimeMap();
  const nextEntry: MockEventRuntimeState = {
    status: nextStatus,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    participantCount: event.participantCount,
    bracketStage: event.bracketStage,
  };

  if (nextStatus === "deploying") {
    nextEntry.startsAt = futureIso(20);
  }

  if (nextStatus === "live") {
    nextEntry.startsAt = new Date().toISOString();
    nextEntry.endsAt = futureIso(180);
    if (event.type === "tournament" && (!nextEntry.bracketStage || nextEntry.bracketStage === "registration")) {
      nextEntry.bracketStage = "quarterfinals";
    }
  }

  if (nextStatus === "completed") {
    nextEntry.endsAt = new Date().toISOString();
    if (event.type === "tournament") {
      nextEntry.bracketStage = "completed";
    }
    archiveEvent(event);
  }

  nextMap[eventId] = nextEntry;
  writeRuntimeMap(nextMap);
  pushMockActivity("events", "Event state changed", `${event.title}: ${event.status} → ${nextStatus}.`);
  return true;
}

export function advanceTournamentBracket(eventId: string) {
  const event = getResolvedEventById(eventId);
  if (!event || event.type !== "tournament") return false;

  const currentStage = event.bracketStage ?? defaultBracketStage(event) ?? "registration";
  const currentIndex = TOURNAMENT_BRACKET_STAGES.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= TOURNAMENT_BRACKET_STAGES.length - 1) return false;

  const nextStage = TOURNAMENT_BRACKET_STAGES[currentIndex + 1];
  const nextMap = readRuntimeMap();
  nextMap[eventId] = {
    status: nextStage === "completed" ? "completed" : event.status === "scheduled" || event.status === "deploying" ? "live" : event.status,
    startsAt: event.status === "scheduled" || event.status === "deploying" ? new Date().toISOString() : event.startsAt,
    endsAt: nextStage === "completed" ? new Date().toISOString() : event.endsAt,
    participantCount: event.participantCount,
    bracketStage: nextStage,
  };

  if (nextStage === "completed") {
    archiveEvent(event);
  }

  writeRuntimeMap(nextMap);
  pushMockActivity("events", "Tournament bracket advanced", `${event.title}: ${currentStage} → ${nextStage}.`);
  return true;
}
