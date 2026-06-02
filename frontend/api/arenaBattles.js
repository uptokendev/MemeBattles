import { randomBytes } from "crypto";

import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";

const ACTIVE_BATTLE_STATES = new Set(["open_for_battle", "pending", "accepted", "live", "completed"]);
const PUBLIC_LIVE_STATES = new Set(["live"]);
const PUBLIC_QUEUE_STATES = new Set(["open_for_battle", "pending", "accepted"]);
const ARCHIVE_STATES = new Set(["completed", "settled"]);
const CREATOR_STATUS_STATES = new Set([
  "eligible",
  "open_for_battle",
  "pending",
  "accepted",
  "live",
  "completed",
  "settled",
  "unavailable",
]);

const ALLOWED_TRANSITIONS = {
  open_for_battle: ["pending", "accepted", "live", "cancelled"],
  pending: ["accepted", "live", "cancelled"],
  accepted: ["live", "cancelled"],
  live: ["completed"],
  completed: ["settled"],
  settled: [],
  cancelled: [],
};

function getBattleStore() {
  if (!globalThis.__memebattlesArenaBattleStore) {
    globalThis.__memebattlesArenaBattleStore = {
      battles: [],
    };
  }
  return globalThis.__memebattlesArenaBattleStore;
}

function normalizeAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeIdentity(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function plusHoursIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function getCampaignLifecycle(row) {
  if (row?.graduated_at_chain) return "graduated";
  if (row?.is_active) return "live";
  return "ended";
}

function createBattleParticipant(row) {
  return {
    tokenId: normalizeAddress(row.campaign_address),
    campaignAddress: normalizeAddress(row.campaign_address),
    tokenAddress: normalizeAddress(row.token_address),
    tokenName: String(row.name || row.symbol || "Unknown token"),
    symbol: String(row.symbol || "TBD"),
    score: Math.max(0, Math.round(toNumber(row.marketcap_bnb, 0) * 100) / 100),
    priceChangePct: Math.round(toNumber(row.progress_pct, 0) * 10) / 10,
    volumeUsd: Math.max(0, Math.round(toNumber(row.vol_24h_bnb, 0) * 1000)),
    uniqueTraders: Math.max(0, Math.round(toNumber(row.holder_count, 0))),
    holdersDelta: Math.round(toNumber(row.votes_24h, 0)),
  };
}

function createPlaceholderParticipant() {
  return {
    tokenId: "",
    campaignAddress: "",
    tokenAddress: "",
    tokenName: "Awaiting rival",
    symbol: "TBD",
    score: 0,
    priceChangePct: 0,
    volumeUsd: 0,
    uniqueTraders: 0,
    holdersDelta: 0,
  };
}

function createBattleFromCampaign(row) {
  const participant = createBattleParticipant(row);
  return {
    id: `arena-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    chainId: Number(row.chain_id) || 97,
    state: "open_for_battle",
    format: "duel",
    startedAt: nowIso(),
    endsAt: plusHoursIso(12),
    settlementAt: plusHoursIso(14),
    featured: false,
    arenaLane: "open_for_battle",
    participants: [participant, createPlaceholderParticipant()],
  };
}

function sortBattlesNewestFirst(left, right) {
  return Date.parse(right.startedAt || right.endsAt || 0) - Date.parse(left.startedAt || left.endsAt || 0);
}

function battleMatchesIdentity(battle, identity) {
  const normalized = normalizeIdentity(identity);
  if (!normalized) return false;
  return Array.isArray(battle?.participants)
    ? battle.participants.some((participant) => {
        return [participant?.tokenId, participant?.campaignAddress, participant?.tokenAddress].some((value) => normalizeIdentity(value) === normalized);
      })
    : false;
}

function mapBattleRow(row) {
  if (!row) return null;
  const participants = Array.isArray(row.participants) ? row.participants : [];
  return {
    id: String(row.id),
    chainId: Number(row.chain_id ?? row.chainId ?? 97),
    state: String(row.state || "open_for_battle"),
    format: String(row.format || "duel"),
    startedAt: row.started_at || row.startedAt || row.created_at || row.createdAt || nowIso(),
    endsAt: row.ends_at || row.endsAt || null,
    settlementAt: row.settlement_at || row.settlementAt || null,
    featured: Boolean(row.featured),
    arenaLane: row.arena_lane || row.arenaLane || (PUBLIC_QUEUE_STATES.has(String(row.state)) ? "open_for_battle" : "live_battles"),
    scoreBasis: row.score_basis || row.scoreBasis || "market_cap",
    leaderSide: row.leader_side || row.leaderSide || null,
    updatedAt: row.updated_at || row.updatedAt || row.created_at || row.createdAt || nowIso(),
    participants,
  };
}

async function listDbBattles() {
  const result = await pool.query(
    `select
       id,
       chain_id,
       state,
       format,
       participants,
       started_at,
       ends_at,
       settlement_at,
       featured,
       arena_lane,
       score_basis,
       leader_side,
       created_at,
       updated_at
     from public.arena_battles
     where state in ('open_for_battle', 'pending', 'accepted', 'live', 'completed', 'settled')
     order by coalesce(updated_at, created_at) desc
     limit 200`,
  );
  return result.rows.map(mapBattleRow).filter(Boolean);
}

async function findDbBattleById(battleId) {
  const result = await pool.query(
    `select
       id,
       chain_id,
       state,
       format,
       participants,
       started_at,
       ends_at,
       settlement_at,
       featured,
       arena_lane,
       score_basis,
       leader_side,
       created_at,
       updated_at
     from public.arena_battles
     where id = $1
     limit 1`,
    [battleId],
  );
  return mapBattleRow(result.rows?.[0]);
}

async function findActiveDbBattleForCampaign(row) {
  const campaignAddress = normalizeAddress(row?.campaign_address);
  const tokenAddress = normalizeAddress(row?.token_address);
  if (!campaignAddress && !tokenAddress) return null;

  const result = await pool.query(
    `select
       id,
       chain_id,
       state,
       format,
       participants,
       started_at,
       ends_at,
       settlement_at,
       featured,
       arena_lane,
       score_basis,
       leader_side,
       created_at,
       updated_at
     from public.arena_battles
     where state in ('open_for_battle', 'pending', 'accepted', 'live', 'completed')
       and (
         lower(coalesce(primary_campaign_address, '')) = $1
         or lower(coalesce(primary_token_address, '')) = $2
         or participants::text ilike $3
         or participants::text ilike $4
       )
     order by coalesce(updated_at, created_at) desc
     limit 1`,
    [campaignAddress, tokenAddress, `%${campaignAddress}%`, tokenAddress ? `%${tokenAddress}%` : "__never_match__"],
  );
  return mapBattleRow(result.rows?.[0]);
}

async function insertDbBattle(battle, campaign) {
  await pool.query(
    `insert into public.arena_battles (
       id,
       chain_id,
       state,
       format,
       primary_campaign_address,
       primary_token_address,
       creator_address,
       participants,
       started_at,
       ends_at,
       settlement_at,
       featured,
       arena_lane,
       score_basis,
       leader_side
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15
     )`,
    [
      battle.id,
      Number(campaign?.chain_id) || battle.chainId || 97,
      battle.state,
      battle.format,
      normalizeAddress(campaign?.campaign_address),
      normalizeAddress(campaign?.token_address) || null,
      normalizeAddress(campaign?.creator_address) || null,
      JSON.stringify(battle.participants),
      battle.startedAt || nowIso(),
      battle.endsAt || null,
      battle.settlementAt || null,
      Boolean(battle.featured),
      battle.arenaLane || "open_for_battle",
      battle.scoreBasis || "market_cap",
      battle.leaderSide || null,
    ],
  );
}

async function transitionDbBattle(battle, nextState) {
  const nextLane = nextState === "live" ? "live_battles" : PUBLIC_QUEUE_STATES.has(nextState) ? "open_for_battle" : "live_battles";
  const startedAt = nextState === "live" && !battle.startedAt ? nowIso() : battle.startedAt;
  const endsAt = nextState === "completed" ? nowIso() : battle.endsAt;
  const settlementAt = nextState === "settled" ? nowIso() : battle.settlementAt;

  const result = await pool.query(
    `update public.arena_battles
       set state = $2,
           arena_lane = $3,
           started_at = $4,
           ends_at = $5,
           settlement_at = $6,
           updated_at = now()
     where id = $1
     returning
       id,
       chain_id,
       state,
       format,
       participants,
       started_at,
       ends_at,
       settlement_at,
       featured,
       arena_lane,
       score_basis,
       leader_side,
       created_at,
       updated_at`,
    [battle.id, nextState, nextLane, startedAt, endsAt, settlementAt],
  );
  return mapBattleRow(result.rows?.[0]);
}

function listMemoryBattleFeed() {
  const battles = [...getBattleStore().battles].sort(sortBattlesNewestFirst);
  return {
    liveBattles: battles.filter((battle) => PUBLIC_LIVE_STATES.has(battle.state)),
    openForBattleQueue: battles.filter((battle) => PUBLIC_QUEUE_STATES.has(battle.state)),
    archivedBattles: battles
      .filter((battle) => ARCHIVE_STATES.has(battle.state))
      .slice(0, 12)
      .map((battle) => ({
        battle,
        archivedAt: battle.settlementAt || battle.endsAt || battle.startedAt || nowIso(),
      })),
  };
}

async function listBattleFeed() {
  try {
    const battles = (await listDbBattles()).sort(sortBattlesNewestFirst);
    return {
      liveBattles: battles.filter((battle) => PUBLIC_LIVE_STATES.has(battle.state)),
      openForBattleQueue: battles.filter((battle) => PUBLIC_QUEUE_STATES.has(battle.state)),
      archivedBattles: battles
        .filter((battle) => ARCHIVE_STATES.has(battle.state))
        .slice(0, 12)
        .map((battle) => ({
          battle,
          archivedAt: battle.settlementAt || battle.endsAt || battle.startedAt || nowIso(),
        })),
    };
  } catch (error) {
    console.warn("[api/arenaBattles] DB battle feed unavailable, using memory store", error);
    return listMemoryBattleFeed();
  }
}

async function findBattleById(battleId) {
  try {
    const dbBattle = await findDbBattleById(battleId);
    if (dbBattle) return dbBattle;
  } catch (error) {
    console.warn("[api/arenaBattles] DB battle detail unavailable, using memory store", error);
  }
  return getBattleStore().battles.find((battle) => battle.id === battleId) || null;
}

async function findActiveBattleForCampaign(row) {
  try {
    const dbBattle = await findActiveDbBattleForCampaign(row);
    if (dbBattle) return dbBattle;
  } catch (error) {
    console.warn("[api/arenaBattles] DB active battle lookup unavailable, using memory store", error);
  }

  const campaignAddress = normalizeAddress(row?.campaign_address);
  const tokenAddress = normalizeAddress(row?.token_address);
  return (
    getBattleStore().battles.find((battle) => {
      if (!ACTIVE_BATTLE_STATES.has(String(battle?.state || ""))) return false;
      return battleMatchesIdentity(battle, campaignAddress) || (tokenAddress ? battleMatchesIdentity(battle, tokenAddress) : false);
    }) || null
  );
}

async function fetchCampaignByIdentity({ chainId, identity }) {
  const normalizedIdentity = normalizeAddress(identity);
  if (!normalizedIdentity) return null;
  const result = await pool.query(
    `select
       c.chain_id,
       c.campaign_address,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       c.is_active,
       c.graduated_at_chain,
       ts.marketcap_bnb,
       ts.vol_24h_bnb,
       0::numeric as holder_count,
       coalesce(va.votes_24h, 0) as votes_24h,
       0::numeric as progress_pct
     from public.campaigns c
     left join public.token_stats ts
       on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
     left join public.vote_aggregates va
       on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
     where c.chain_id = $1
       and (
         lower(c.campaign_address::text) = $2
         or lower(coalesce(c.token_address::text, '')) = $2
       )
     order by c.created_block desc nulls last
     limit 1`,
    [chainId, normalizedIdentity],
  );
  return result.rows?.[0] || null;
}

async function fetchCreatorCampaigns({ chainId, creatorAddress, limit }) {
  const normalizedCreator = normalizeAddress(creatorAddress);
  if (!isAddress(normalizedCreator)) return [];
  const result = await pool.query(
    `select
       c.chain_id,
       c.campaign_address,
       c.token_address,
       c.creator_address,
       c.name,
       c.symbol,
       c.is_active,
       c.graduated_at_chain,
       ts.marketcap_bnb,
       ts.vol_24h_bnb,
       0::numeric as holder_count,
       coalesce(va.votes_24h, 0) as votes_24h,
       0::numeric as progress_pct
     from public.campaigns c
     left join public.token_stats ts
       on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
     left join public.vote_aggregates va
       on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
     where c.chain_id = $1
       and lower(c.creator_address::text) = $2
       and c.campaign_address is not null
     order by c.created_block desc nulls last, c.created_at_chain desc nulls last
     limit $3`,
    [chainId, normalizedCreator, limit],
  );
  return result.rows || [];
}

async function buildCreatorStatus(row) {
  const battle = await findActiveBattleForCampaign(row);
  const lifecycle = getCampaignLifecycle(row);

  if (battle) {
    const currentState = battle.state === "settled" ? "settled" : battle.state;
    const unavailableReason =
      battle.state === "open_for_battle"
        ? "already_open_for_battle"
        : battle.state === "pending" || battle.state === "accepted"
          ? "battle_match_pending"
          : "already_in_battle";

    return {
      tokenId: normalizeAddress(row.campaign_address),
      campaignAddress: normalizeAddress(row.campaign_address),
      tokenAddress: normalizeAddress(row.token_address),
      tokenName: String(row.name || row.symbol || "Unknown token"),
      symbol: String(row.symbol || ""),
      eligibility: false,
      currentState: CREATOR_STATUS_STATES.has(currentState) ? currentState : "unavailable",
      battleState: battle.state,
      battleId: battle.id,
      openForBattleState: battle.state === "open_for_battle" ? "open" : "matched",
      unavailableReason,
    };
  }

  if (lifecycle === "graduated") {
    return {
      tokenId: normalizeAddress(row.campaign_address),
      campaignAddress: normalizeAddress(row.campaign_address),
      tokenAddress: normalizeAddress(row.token_address),
      tokenName: String(row.name || row.symbol || "Unknown token"),
      symbol: String(row.symbol || ""),
      eligibility: false,
      currentState: "unavailable",
      battleState: null,
      battleId: null,
      openForBattleState: "not_open",
      unavailableReason: "graduated_to_dex",
    };
  }

  if (lifecycle === "ended") {
    return {
      tokenId: normalizeAddress(row.campaign_address),
      campaignAddress: normalizeAddress(row.campaign_address),
      tokenAddress: normalizeAddress(row.token_address),
      tokenName: String(row.name || row.symbol || "Unknown token"),
      symbol: String(row.symbol || ""),
      eligibility: false,
      currentState: "unavailable",
      battleState: null,
      battleId: null,
      openForBattleState: "not_open",
      unavailableReason: "campaign_inactive",
    };
  }

  return {
    tokenId: normalizeAddress(row.campaign_address),
    campaignAddress: normalizeAddress(row.campaign_address),
    tokenAddress: normalizeAddress(row.token_address),
    tokenName: String(row.name || row.symbol || "Unknown token"),
    symbol: String(row.symbol || ""),
    eligibility: true,
    currentState: "eligible",
    battleState: null,
    battleId: null,
    openForBattleState: "not_open",
    unavailableReason: null,
  };
}

async function handleList(_req, res) {
  return json(res, 200, await listBattleFeed());
}

async function handleCreatorStatus(req, res) {
  const query = getQuery(req);
  const chainId = Number(query.chainId) || 97;
  const creatorAddress = String(query.creator || query.creatorAddress || "");
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));

  if (!isAddress(creatorAddress)) {
    return json(res, 200, { items: [], updatedAt: nowIso() });
  }

  try {
    const rows = await fetchCreatorCampaigns({ chainId, creatorAddress, limit });
    const items = await Promise.all(rows.map((row) => buildCreatorStatus(row)));
    return json(res, 200, {
      items,
      updatedAt: nowIso(),
    });
  } catch (error) {
    console.error("[api/arenaBattles] creator status lookup failed", error);
    return json(res, 200, { items: [], updatedAt: nowIso(), warning: "Creator battle status is temporarily unavailable." });
  }
}

async function handleOpen(req, res) {
  const body = await readJson(req);
  const chainId = Number(body?.chainId) || 97;
  const identity = String(body?.tokenId || body?.campaignAddress || body?.identity || "");

  if (!identity) return json(res, 400, { ok: false, error: "tokenId is required" });

  try {
    const campaign = await fetchCampaignByIdentity({ chainId, identity });
    if (!campaign) return json(res, 404, { ok: false, error: "Campaign not found", reason: "campaign_not_found" });

    const creatorStatus = await buildCreatorStatus(campaign);
    if (!creatorStatus.eligibility) {
      return json(res, 409, {
        ok: false,
        reason: creatorStatus.unavailableReason || "unavailable",
        status: creatorStatus,
      });
    }

    const battle = createBattleFromCampaign(campaign);
    try {
      await insertDbBattle(battle, campaign);
    } catch (error) {
      console.warn("[api/arenaBattles] DB battle insert unavailable, using memory store", error);
      getBattleStore().battles.unshift(battle);
    }

    return json(res, 200, { ok: true, battle, creatorStatus: await buildCreatorStatus(campaign) });
  } catch (error) {
    console.error("[api/arenaBattles] open failed", error);
    return json(res, 500, { ok: false, error: "Unable to open battle" });
  }
}

async function handleDetail(_req, res, battleId) {
  const battle = await findBattleById(battleId);
  if (!battle) return json(res, 404, { error: "Battle not found" });
  return json(res, 200, { battle });
}

async function handleTransition(req, res, battleId) {
  const battle = await findBattleById(battleId);
  if (!battle) return json(res, 404, { ok: false, error: "Battle not found" });
  const body = await readJson(req);
  const nextState = String(body?.state || "");

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, battle.state)) {
    return json(res, 400, { ok: false, error: "Battle state cannot be transitioned" });
  }
  if (!ALLOWED_TRANSITIONS[battle.state].includes(nextState)) {
    return json(res, 409, { ok: false, error: "Invalid battle transition", currentState: battle.state });
  }

  try {
    const updated = await transitionDbBattle(battle, nextState);
    if (updated) return json(res, 200, { ok: true, battle: updated });
  } catch (error) {
    console.warn("[api/arenaBattles] DB battle transition unavailable, using memory store", error);
  }

  battle.state = nextState;
  battle.arenaLane = nextState === "live" ? "live_battles" : PUBLIC_QUEUE_STATES.has(nextState) ? "open_for_battle" : "live_battles";
  if (nextState === "live" && !battle.startedAt) battle.startedAt = nowIso();
  if (nextState === "completed") battle.endsAt = nowIso();
  if (nextState === "settled") battle.settlementAt = nowIso();

  return json(res, 200, { ok: true, battle });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  if (method === "GET" && path === "/arena/battles") return handleList(req, res);
  if (method === "GET" && path === "/arena/battles/creator-status") return handleCreatorStatus(req, res);
  if (method === "POST" && path === "/arena/battles/open") return handleOpen(req, res);

  const transitionMatch = path.match(/^\/arena\/battles\/([^/]+)\/transition$/);
  if (transitionMatch) {
    if (method !== "POST") return badMethod(res);
    return handleTransition(req, res, decodeURIComponent(transitionMatch[1]));
  }

  const detailMatch = path.match(/^\/arena\/battles\/([^/]+)$/);
  if (detailMatch) {
    if (method !== "GET") return badMethod(res);
    return handleDetail(req, res, decodeURIComponent(detailMatch[1]));
  }

  return json(res, 404, { error: `Unknown arena battles route: ${path}` });
}
