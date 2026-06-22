import { randomBytes } from "crypto";

import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../server/http.js";

const MIN_INITIAL_POT_BNB = 0.1;
const PUBLIC_LIVE = new Set(["live"]);
const PUBLIC_QUEUE = new Set(["open_for_battle", "pending", "accepted"]);
const ARCHIVE = new Set(["completed", "settled"]);
const TRANSITIONS = {
  open_for_battle: ["pending", "accepted", "live", "cancelled"],
  pending: ["accepted", "live", "cancelled"],
  accepted: ["live", "cancelled"],
  live: ["completed"],
  completed: ["settled"],
  settled: [],
  cancelled: [],
};

function nowIso() {
  return new Date().toISOString();
}

function plusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeInitialPotBnb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1e8) / 1e8 : 0;
}

function participant(row) {
  return {
    tokenId: normalizeAddress(row.campaign_address),
    campaignAddress: normalizeAddress(row.campaign_address),
    tokenAddress: normalizeAddress(row.token_address),
    tokenName: String(row.name || row.symbol || "Unknown token"),
    symbol: String(row.symbol || "TBD"),
    score: Math.max(0, Math.round(toNumber(row.marketcap_bnb, 0) * 100) / 100),
    priceChangePct: 0,
    volumeUsd: Math.max(0, Math.round(toNumber(row.vol_24h_bnb, 0) * 1000)),
    uniqueTraders: 0,
    holdersDelta: Math.round(toNumber(row.votes_24h, 0)),
  };
}

function placeholder() {
  return { tokenId: "", campaignAddress: "", tokenAddress: "", tokenName: "Awaiting rival", symbol: "TBD", score: 0, priceChangePct: 0, volumeUsd: 0, uniqueTraders: 0, holdersDelta: 0 };
}

function mapBattle(row) {
  if (!row) return null;
  const state = String(row.state || "open_for_battle");
  return {
    id: String(row.id),
    chainId: Number(row.chain_id ?? 97),
    state,
    format: String(row.format || "duel"),
    startedAt: row.started_at || row.created_at || nowIso(),
    endsAt: row.ends_at || null,
    settlementAt: row.settlement_at || null,
    featured: Boolean(row.featured),
    arenaLane: row.arena_lane || (PUBLIC_QUEUE.has(state) ? "open_for_battle" : "live_battles"),
    scoreBasis: row.score_basis || "market_cap",
    leaderSide: row.leader_side || null,
    initialPotBnb: normalizeInitialPotBnb(row.initial_pot_bnb),
    potCurrency: row.pot_currency || "BNB",
    potStatus: row.pot_status || "pending_escrow",
    updatedAt: row.updated_at || row.created_at || nowIso(),
    participants: Array.isArray(row.participants) ? row.participants : [],
  };
}

function battleSelect() {
  return `id, chain_id, state, format, participants, started_at, ends_at, settlement_at, featured, arena_lane, score_basis, leader_side, initial_pot_bnb, pot_currency, pot_status, created_at, updated_at`;
}

function feedFromBattles(battles) {
  const sorted = [...battles].sort((a, b) => Date.parse(b.updatedAt || b.startedAt || 0) - Date.parse(a.updatedAt || a.startedAt || 0));
  return {
    liveBattles: sorted.filter((battle) => PUBLIC_LIVE.has(battle.state)),
    openForBattleQueue: sorted.filter((battle) => PUBLIC_QUEUE.has(battle.state)),
    archivedBattles: sorted.filter((battle) => ARCHIVE.has(battle.state)).slice(0, 12).map((battle) => ({ battle, archivedAt: battle.settlementAt || battle.endsAt || battle.startedAt || nowIso() })),
  };
}

async function listBattles() {
  const result = await pool.query(
    `select ${battleSelect()}
       from public.arena_battles
      where state in ('open_for_battle', 'pending', 'accepted', 'live', 'completed', 'settled')
      order by coalesce(updated_at, created_at) desc
      limit 200`,
  );
  return result.rows.map(mapBattle).filter(Boolean);
}

async function findBattle(id) {
  const result = await pool.query(
    `select ${battleSelect()}
       from public.arena_battles where id = $1 limit 1`,
    [id],
  );
  return mapBattle(result.rows?.[0]);
}

async function campaignByIdentity(chainId, identity) {
  const normalized = normalizeAddress(identity);
  if (!normalized) return null;
  const result = await pool.query(
    `select c.chain_id, c.campaign_address, c.token_address, c.creator_address, c.name, c.symbol, c.is_active, c.graduated_at_chain,
            ts.marketcap_bnb, ts.vol_24h_bnb, coalesce(va.votes_24h, 0) as votes_24h
       from public.campaigns c
       left join public.token_stats ts on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
       left join public.vote_aggregates va on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
      where c.chain_id = $1 and (lower(c.campaign_address::text) = $2 or lower(coalesce(c.token_address::text, '')) = $2)
      order by c.created_block desc nulls last limit 1`,
    [chainId, normalized],
  );
  return result.rows?.[0] || null;
}

async function activeBattleFor(row) {
  const campaign = normalizeAddress(row?.campaign_address);
  const token = normalizeAddress(row?.token_address);
  const result = await pool.query(
    `select ${battleSelect()}
       from public.arena_battles
      where state in ('open_for_battle', 'pending', 'accepted', 'live', 'completed')
        and (lower(coalesce(primary_campaign_address, '')) = $1 or lower(coalesce(primary_token_address, '')) = $2 or participants::text ilike $3 or participants::text ilike $4)
      order by coalesce(updated_at, created_at) desc limit 1`,
    [campaign, token, `%${campaign}%`, token ? `%${token}%` : "__never_match__"],
  );
  return mapBattle(result.rows?.[0]);
}

async function creatorCampaigns(chainId, creatorAddress, limit) {
  const creator = normalizeAddress(creatorAddress);
  if (!isAddress(creator)) return [];
  const result = await pool.query(
    `select c.chain_id, c.campaign_address, c.token_address, c.creator_address, c.name, c.symbol, c.is_active, c.graduated_at_chain,
            ts.marketcap_bnb, ts.vol_24h_bnb, coalesce(va.votes_24h, 0) as votes_24h
       from public.campaigns c
       left join public.token_stats ts on ts.chain_id = c.chain_id and ts.campaign_address = c.campaign_address
       left join public.vote_aggregates va on va.chain_id = c.chain_id and va.campaign_address = c.campaign_address
      where c.chain_id = $1 and lower(c.creator_address::text) = $2 and c.campaign_address is not null
      order by c.created_block desc nulls last, c.created_at_chain desc nulls last limit $3`,
    [chainId, creator, limit],
  );
  return result.rows;
}

async function statusFor(row) {
  const battle = await activeBattleFor(row);
  const graduated = Boolean(row.graduated_at_chain);
  const active = Boolean(row.is_active);
  const base = { tokenId: normalizeAddress(row.campaign_address), campaignAddress: normalizeAddress(row.campaign_address), tokenAddress: normalizeAddress(row.token_address), tokenName: String(row.name || row.symbol || "Unknown token"), symbol: String(row.symbol || "") };
  if (battle) return { ...base, eligibility: false, currentState: battle.state, battleState: battle.state, battleId: battle.id, initialPotBnb: battle.initialPotBnb, openForBattleState: battle.state === "open_for_battle" ? "open" : "matched", unavailableReason: battle.state === "open_for_battle" ? "already_open_for_battle" : "already_in_battle" };
  if (!active) return { ...base, eligibility: false, currentState: "unavailable", battleState: null, battleId: null, openForBattleState: "not_open", unavailableReason: "campaign_inactive" };
  if (!graduated) return { ...base, eligibility: false, currentState: "unavailable", battleState: null, battleId: null, openForBattleState: "not_open", unavailableReason: "not_post_grad" };
  return { ...base, eligibility: true, currentState: "eligible", battleState: null, battleId: null, openForBattleState: "not_open", unavailableReason: null };
}

async function handleList(_req, res) {
  try {
    return json(res, 200, feedFromBattles(await listBattles()));
  } catch (error) {
    console.error("[api/arenaBattles] list failed", error);
    return json(res, 200, { ...feedFromBattles([]), warning: "Arena battle data is unavailable." });
  }
}

async function handleCreatorStatus(req, res) {
  const query = getQuery(req);
  const chainId = Number(query.chainId) || 97;
  const creator = String(query.creator || query.creatorAddress || "");
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));
  if (!isAddress(creator)) return json(res, 200, { items: [], updatedAt: nowIso() });
  try {
    const rows = await creatorCampaigns(chainId, creator, limit);
    return json(res, 200, { items: await Promise.all(rows.map(statusFor)), updatedAt: nowIso() });
  } catch (error) {
    console.error("[api/arenaBattles] creator status failed", error);
    return json(res, 200, { items: [], updatedAt: nowIso(), warning: "Creator battle status is unavailable." });
  }
}

async function handleOpen(req, res) {
  const body = await readJson(req);
  const chainId = Number(body?.chainId) || 97;
  const identity = String(body?.tokenId || body?.campaignAddress || body?.identity || "");
  const initialPotBnb = normalizeInitialPotBnb(body?.initialPotBnb);
  if (!identity) return json(res, 400, { ok: false, error: "tokenId is required" });
  if (initialPotBnb < MIN_INITIAL_POT_BNB) return json(res, 400, { ok: false, error: `initialPotBnb must be at least ${MIN_INITIAL_POT_BNB} BNB`, minInitialPotBnb: MIN_INITIAL_POT_BNB });

  const campaign = await campaignByIdentity(chainId, identity);
  if (!campaign) return json(res, 404, { ok: false, error: "Campaign not found", reason: "campaign_not_found" });
  const creatorStatus = await statusFor(campaign);
  if (!creatorStatus.eligibility) return json(res, 409, { ok: false, reason: creatorStatus.unavailableReason || "unavailable", status: creatorStatus });

  const battle = { id: `arena-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`, chainId, state: "open_for_battle", format: "duel", startedAt: nowIso(), endsAt: plusHours(12), settlementAt: plusHours(14), featured: false, arenaLane: "open_for_battle", scoreBasis: "market_cap", initialPotBnb, potCurrency: "BNB", potStatus: "pending_escrow", participants: [participant(campaign), placeholder()] };
  await pool.query(
    `insert into public.arena_battles (id, chain_id, state, format, primary_campaign_address, primary_token_address, creator_address, participants, started_at, ends_at, settlement_at, featured, arena_lane, score_basis, initial_pot_bnb, pot_currency, pot_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [battle.id, chainId, battle.state, battle.format, normalizeAddress(campaign.campaign_address), normalizeAddress(campaign.token_address) || null, normalizeAddress(campaign.creator_address) || null, JSON.stringify(battle.participants), battle.startedAt, battle.endsAt, battle.settlementAt, false, battle.arenaLane, battle.scoreBasis, initialPotBnb, battle.potCurrency, battle.potStatus],
  );
  return json(res, 200, { ok: true, battle, creatorStatus: await statusFor(campaign) });
}

async function handleTransition(req, res, battleId) {
  const battle = await findBattle(battleId);
  if (!battle) return json(res, 404, { ok: false, error: "Battle not found" });
  const body = await readJson(req);
  const nextState = String(body?.state || "");
  if (!(TRANSITIONS[battle.state] || []).includes(nextState)) return json(res, 409, { ok: false, error: "Invalid battle transition", currentState: battle.state });
  const nextLane = nextState === "live" ? "live_battles" : PUBLIC_QUEUE.has(nextState) ? "open_for_battle" : "live_battles";
  const result = await pool.query(
    `update public.arena_battles set state = $2, arena_lane = $3, ends_at = case when $2 = 'completed' then now() else ends_at end, settlement_at = case when $2 = 'settled' then now() else settlement_at end, updated_at = now()
      where id = $1 returning ${battleSelect()}`,
    [battleId, nextState, nextLane],
  );
  return json(res, 200, { ok: true, battle: mapBattle(result.rows?.[0]) });
}

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || new URL(req.url, "http://localhost").pathname);

  try {
    if (method === "GET" && path === "/arena/battles") return handleList(req, res);
    if (method === "GET" && path === "/arena/battles/creator-status") return handleCreatorStatus(req, res);
    if (method === "POST" && path === "/arena/battles/open") return handleOpen(req, res);
    const transition = path.match(/^\/arena\/battles\/([^/]+)\/transition$/);
    if (transition) return method === "POST" ? handleTransition(req, res, decodeURIComponent(transition[1])) : badMethod(res);
    const detail = path.match(/^\/arena\/battles\/([^/]+)$/);
    if (detail) {
      if (method !== "GET") return badMethod(res);
      const battle = await findBattle(decodeURIComponent(detail[1]));
      return battle ? json(res, 200, { battle }) : json(res, 404, { error: "Battle not found" });
    }
    return json(res, 404, { error: `Unknown arena battles route: ${path}` });
  } catch (error) {
    console.error("[api/arenaBattles] request failed", error);
    return json(res, 503, { ok: false, error: "Arena battles storage is unavailable", detail: String(error?.message || error || "unknown error") });
  }
}
