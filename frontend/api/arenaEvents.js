import { pool } from "../server/db.js";
import { badMethod, json, readJson } from "../server/http.js";

const EVENT_TRANSITIONS = {
  scheduled: ["deploying", "live"],
  deploying: ["live"],
  live: ["completed"],
  completed: [],
};

const TOURNAMENT_STAGES = ["registration", "quarterfinals", "semifinals", "finals", "completed"];
const EVENT_TYPES = new Set(["battle_weekend", "battle_night", "featured_rivalry", "tournament", "seasonal_league"]);
const EVENT_STATUSES = new Set(["scheduled", "deploying", "live", "completed"]);

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

function normalizeEventType(value) {
  const type = String(value || "battle_night");
  return EVENT_TYPES.has(type) ? type : "battle_night";
}

function normalizeEventStatus(value) {
  const status = String(value || "scheduled");
  return EVENT_STATUSES.has(status) ? status : "scheduled";
}

function normalizeBracketStage(value, event) {
  const stage = String(value || "");
  return TOURNAMENT_STAGES.includes(stage) ? stage : defaultBracketStage(event);
}

function mapDbEvent(row) {
  if (!row) return null;
  const event = {
    id: String(row.id),
    type: normalizeEventType(row.type),
    title: String(row.title || "Arena Event"),
    status: normalizeEventStatus(row.status),
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : nowIso(),
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : futureIso(180),
    participantCount: Number(row.participant_count || 0),
    summary: String(row.summary || ""),
    bracketStage: row.bracket_stage || undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
  };
  event.bracketStage = normalizeBracketStage(event.bracketStage, event);
  if (!event.bracketStage) delete event.bracketStage;
  if (!event.completedAt) delete event.completedAt;
  return event;
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

function listMemoryEvents() {
  return BASE_EVENTS.map(resolveEvent);
}

function findMemoryEventById(eventId) {
  const base = BASE_EVENTS.find((event) => event.id === eventId);
  return base ? resolveEvent(base) : null;
}

function archiveMemoryEvent(event) {
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

async function seedDbEventsIfEmpty() {
  const countResult = await pool.query("select count(*)::int as count from public.arena_events");
  if (Number(countResult.rows?.[0]?.count || 0) > 0) return;

  for (const event of BASE_EVENTS) {
    await pool.query(
      `insert into public.arena_events (
         id,
         type,
         title,
         status,
         starts_at,
         ends_at,
         participant_count,
         summary,
         bracket_stage
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      [
        event.id,
        event.type,
        event.title,
        event.status,
        event.startsAt,
        event.endsAt,
        event.participantCount,
        event.summary,
        defaultBracketStage(event) || null,
      ],
    );
  }
}

async function listDbEvents() {
  await seedDbEventsIfEmpty();
  const result = await pool.query(
    `select id, type, title, status, starts_at, ends_at, participant_count, summary, bracket_stage, completed_at, created_at, updated_at
       from public.arena_events
      order by starts_at asc, created_at asc`,
  );
  return result.rows.map(mapDbEvent).filter(Boolean);
}

async function findDbEventById(eventId) {
  await seedDbEventsIfEmpty();
  const result = await pool.query(
    `select id, type, title, status, starts_at, ends_at, participant_count, summary, bracket_stage, completed_at, created_at, updated_at
       from public.arena_events
      where id = $1
      limit 1`,
    [eventId],
  );
  return mapDbEvent(result.rows?.[0]);
}

async function updateDbEvent(eventId, patch) {
  const result = await pool.query(
    `update public.arena_events
        set status = coalesce($2, status),
            starts_at = coalesce($3, starts_at),
            ends_at = coalesce($4, ends_at),
            participant_count = coalesce($5, participant_count),
            bracket_stage = $6,
            completed_at = $7,
            updated_at = now()
      where id = $1
      returning id, type, title, status, starts_at, ends_at, participant_count, summary, bracket_stage, completed_at, created_at, updated_at`,
    [
      eventId,
      patch.status ?? null,
      patch.startsAt ?? null,
      patch.endsAt ?? null,
      Number.isFinite(Number(patch.participantCount)) ? Number(patch.participantCount) : null,
      patch.bracketStage ?? null,
      patch.completedAt ?? null,
    ],
  );
  return mapDbEvent(result.rows?.[0]);
}

async function listEvents() {
  try {
    return await listDbEvents();
  } catch (error) {
    console.warn("[api/arenaEvents] DB events unavailable, using memory store", error);
    return listMemoryEvents();
  }
}

async function findEventById(eventId) {
  try {
    const event = await findDbEventById(eventId);
    if (event) return event;
  } catch (error) {
    console.warn("[api/arenaEvents] DB event detail unavailable, using memory store", error);
  }
  return findMemoryEventById(eventId);
}

async function handleList(_req, res) {
  const events = await listEvents();
  return json(res, 200, {
    events: events.filter((event) => event.status !== "completed"),
    archivedEvents: events.filter((event) => event.status === "completed" && event.completedAt),
  });
}

async function handleDetail(_req, res, eventId) {
  const event = await findEventById(eventId);
  if (!event) return json(res, 404, { error: "Event not found" });
  return json(res, 200, { event });
}

async function handleTransition(req, res, eventId) {
  const event = await findEventById(eventId);
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
    completedAt: nextStatus === "completed" ? nowIso() : null,
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
  }

  try {
    const updated = await updateDbEvent(eventId, nextEntry);
    if (updated) return json(res, 200, { ok: true, event: updated });
  } catch (error) {
    console.warn("[api/arenaEvents] DB transition unavailable, using memory store", error);
  }

  if (nextStatus === "completed") archiveMemoryEvent({ ...event, ...nextEntry });
  getEventStore().overrides[eventId] = nextEntry;
  return json(res, 200, { ok: true, event: await findEventById(eventId) });
}

async function handleAdvanceBracket(_req, res, eventId) {
  const event = await findEventById(eventId);
  if (!event || event.type !== "tournament") {
    return json(res, 404, { ok: false, error: "Tournament event not found" });
  }

  const currentStage = event.bracketStage || defaultBracketStage(event) || "registration";
  const currentIndex = TOURNAMENT_STAGES.indexOf(currentStage);
  if (currentIndex < 0 || currentIndex >= TOURNAMENT_STAGES.length - 1) {
    return json(res, 409, { ok: false, error: "Tournament bracket cannot advance", currentStage });
  }

  const nextStage = TOURNAMENT_STAGES[currentIndex + 1];
  const nextEntry = {
    status: nextStage === "completed" ? "completed" : event.status === "scheduled" || event.status === "deploying" ? "live" : event.status,
    startsAt: event.status === "scheduled" || event.status === "deploying" ? nowIso() : event.startsAt,
    endsAt: nextStage === "completed" ? nowIso() : event.endsAt,
    participantCount: event.participantCount,
    bracketStage: nextStage,
    completedAt: nextStage === "completed" ? nowIso() : null,
  };

  try {
    const updated = await updateDbEvent(eventId, nextEntry);
    if (updated) return json(res, 200, { ok: true, event: updated });
  } catch (error) {
    console.warn("[api/arenaEvents] DB bracket advance unavailable, using memory store", error);
  }

  getEventStore().overrides[eventId] = nextEntry;
  if (nextStage === "completed") archiveMemoryEvent({ ...event, ...nextEntry });
  return json(res, 200, { ok: true, event: await findEventById(eventId) });
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
