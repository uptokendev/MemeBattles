import { badMethod, json, readJson } from "../server/http.js";

const EVENT_TRANSITIONS = {
  scheduled: ["deploying", "live"],
  deploying: ["live"],
  live: ["completed"],
  completed: [],
};

const TOURNAMENT_STAGES = ["registration", "quarterfinals", "semifinals", "finals", "completed"];

const baseTime = Date.parse("2026-05-21T00:00:00.000Z");

function atMinutes(offsetMinutes) {
  return new Date(baseTime + offsetMinutes * 60_000).toISOString();
}

const BASE_EVENTS = [
  {
    id: "event-battle-night-01",
    type: "battle_night",
    title: "Battle Night: Founder Grudge Match",
    status: "scheduled",
    startsAt: atMinutes(180),
    endsAt: atMinutes(320),
    participantCount: 12,
    summary: "Twelve graduated tokens enter a timed rotation bracket with boosted arena placement.",
  },
  {
    id: "event-weekend-02",
    type: "battle_weekend",
    title: "Weekend Siege",
    status: "live",
    startsAt: atMinutes(-60),
    endsAt: atMinutes(720),
    participantCount: 24,
    summary: "Open deployment weekend with pooled scoring, featured rivalries, and live lane coverage.",
  },
  {
    id: "event-tournament-03",
    type: "tournament",
    title: "Rookie Crown Qualifier",
    status: "scheduled",
    startsAt: atMinutes(1440),
    endsAt: atMinutes(1800),
    participantCount: 16,
    summary: "Single-elimination tournament seeded from battle activity and holder growth.",
  },
];

function getEventStore() {
  if (!globalThis.__memebattlesArenaEventStore) {
    globalThis.__memebattlesArenaEventStore = {
      overrides: {},
      archive: [],
    };
  }
  return globalThis.__memebattlesArenaEventStore;
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function defaultBracketStage(event) {
  if (event.type !== "tournament") return undefined;
  if (event.status === "completed") return "completed";
  if (event.status === "live") return "quarterfinals";
  return "registration";
}

function resolveEvent(base) {
  const overrides = getEventStore().overrides[base.id];
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

function listEvents() {
  return BASE_EVENTS.map(resolveEvent);
}

function findEventById(eventId) {
  const base = BASE_EVENTS.find((event) => event.id === eventId);
  return base ? resolveEvent(base) : null;
}

function archiveEvent(event) {
  const store = getEventStore();
  store.archive = [
    {
      ...event,
      status: "completed",
      bracketStage: event.type === "tournament" ? event.bracketStage || "completed" : undefined,
      completedAt: nowIso(),
    },
    ...store.archive.filter((entry) => entry.id !== event.id),
  ];
}

async function handleList(_req, res) {
  return json(res, 200, {
    events: listEvents(),
    archivedEvents: getEventStore().archive,
  });
}

async function handleDetail(_req, res, eventId) {
  const event = findEventById(eventId);
  if (!event) return json(res, 404, { error: "Event not found" });
  return json(res, 200, { event });
}

async function handleTransition(req, res, eventId) {
  const event = findEventById(eventId);
  if (!event) return json(res, 404, { ok: false, error: "Event not found" });

  const body = await readJson(req);
  const nextStatus = String(body?.status || "");
  const allowed = EVENT_TRANSITIONS[event.status] || [];
  if (!allowed.includes(nextStatus)) {
    return json(res, 409, { ok: false, error: "Invalid event transition", currentStatus: event.status });
  }

  const nextEntry = {
    status: nextStatus,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    participantCount: event.participantCount,
    bracketStage: event.bracketStage,
  };

  if (nextStatus === "deploying") nextEntry.startsAt = futureIso(20);
  if (nextStatus === "live") {
    nextEntry.startsAt = nowIso();
    nextEntry.endsAt = futureIso(180);
    if (event.type === "tournament" && (!nextEntry.bracketStage || nextEntry.bracketStage === "registration")) {
      nextEntry.bracketStage = "quarterfinals";
    }
  }
  if (nextStatus === "completed") {
    nextEntry.endsAt = nowIso();
    if (event.type === "tournament") nextEntry.bracketStage = "completed";
    archiveEvent({ ...event, ...nextEntry });
  }

  getEventStore().overrides[eventId] = nextEntry;
  return json(res, 200, { ok: true, event: findEventById(eventId) });
}

async function handleAdvanceBracket(_req, res, eventId) {
  const event = findEventById(eventId);
  if (!event || event.type !== "tournament") {
    return json(res, 404, { ok: false, error: "Tournament event not found" });
  }

  const currentStage = event.bracketStage || defaultBracketStage(event) || "registration";
  const currentIndex = TOURNAMENT_STAGES.indexOf(currentStage);
  if (currentIndex < 0 || currentIndex >= TOURNAMENT_STAGES.length - 1) {
    return json(res, 409, { ok: false, error: "Tournament bracket cannot advance", currentStage });
  }

  const nextStage = TOURNAMENT_STAGES[currentIndex + 1];
  getEventStore().overrides[eventId] = {
    status: nextStage === "completed" ? "completed" : event.status === "scheduled" || event.status === "deploying" ? "live" : event.status,
    startsAt: event.status === "scheduled" || event.status === "deploying" ? nowIso() : event.startsAt,
    endsAt: nextStage === "completed" ? nowIso() : event.endsAt,
    participantCount: event.participantCount,
    bracketStage: nextStage,
  };

  if (nextStage === "completed") archiveEvent({ ...event, ...getEventStore().overrides[eventId] });
  return json(res, 200, { ok: true, event: findEventById(eventId) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  if (method === "GET" && path === "/arena/events") return handleList(req, res);

  const advanceMatch = path.match(/^\/arena\/events\/([^/]+)\/advance-bracket$/);
  if (advanceMatch) {
    if (method !== "POST") return badMethod(res);
    return handleAdvanceBracket(req, res, decodeURIComponent(advanceMatch[1]));
  }

  const transitionMatch = path.match(/^\/arena\/events\/([^/]+)\/transition$/);
  if (transitionMatch) {
    if (method !== "POST") return badMethod(res);
    return handleTransition(req, res, decodeURIComponent(transitionMatch[1]));
  }

  const detailMatch = path.match(/^\/arena\/events\/([^/]+)$/);
  if (detailMatch) {
    if (method !== "GET") return badMethod(res);
    return handleDetail(req, res, decodeURIComponent(detailMatch[1]));
  }

  return json(res, 404, { error: `Unknown arena events route: ${path}` });
}
