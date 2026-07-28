import { badMethod, json, readJson } from "../../server/http.js";
import { requireDraftActionAuth } from "./draft-auth.js";
import {
  TICKER_RESERVATION_STATUS,
  TickerReservationError,
  createTickerReservation,
  isTickerReservationConflict,
  loadTickerReservationByDraft,
  refreshExpiredTickerReservations,
  releaseTickerReservation,
  renewTickerReservation,
  withTickerReservationTransaction,
} from "./ticker-reservation-service.js";

const MANAGEMENT_OPERATIONS = new Set(["read", "renew", "release", "reclaim"]);
const PUBLISHED_DRAFT_STATUSES = new Set([
  "promotion_published",
  "ready_to_launch",
  "scheduled",
  "deployed",
]);

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

async function getPool() {
  if (!String(process.env.DATABASE_URL || "").trim()) return null;
  try {
    const mod = await import("../../server/db.js");
    return mod.pool || null;
  } catch (error) {
    console.warn("[ticker-reservations] DB unavailable", error?.message || error);
    return null;
  }
}

function availableActions(reservation, draft) {
  if (!reservation) {
    return draft.status === "archived" ? [] : ["reclaim"];
  }

  if ([TICKER_RESERVATION_STATUS.ARMED_ONCHAIN, TICKER_RESERVATION_STATUS.LIVE].includes(reservation.status)) {
    return [];
  }

  const actions = ["release"];
  if (
    reservation.renewalCount < 2 &&
    [TICKER_RESERVATION_STATUS.PREPARE_MODE_RESERVED, TICKER_RESERVATION_STATUS.EXPIRED_GRACE].includes(reservation.status)
  ) {
    actions.unshift("renew");
  }
  return actions;
}

function responsePayload({ operation, draft, reservation }) {
  return {
    operation,
    draftId: draft.id,
    ticker: draft.ticker,
    chainId: draft.chainId,
    reservation,
    availableActions: availableActions(reservation, draft),
  };
}

function mapDraftRow(row) {
  return {
    id: String(row.id),
    chainId: Number(row.chain_id),
    creatorWallet: String(row.creator_wallet || ""),
    ticker: String(row.ticker || ""),
    status: String(row.status || "draft"),
    visibility: String(row.visibility || "private"),
  };
}

async function readDraftForManagement(pool, draftId) {
  const result = await pool.query(
    `select id, chain_id, creator_wallet, ticker, status, visibility
       from public.campaign_drafts
      where id::text = $1
      limit 1`,
    [draftId],
  );
  return result.rows[0] ? mapDraftRow(result.rows[0]) : null;
}

async function reclaimReservation(db, draft) {
  await refreshExpiredTickerReservations(db, { draftId: draft.id });
  const existing = await loadTickerReservationByDraft(db, draft.id, { forUpdate: true });

  if (existing) {
    if (existing.status === TICKER_RESERVATION_STATUS.EXPIRED_GRACE) {
      return renewTickerReservation(db, {
        draftId: draft.id,
        creatorWallet: draft.creatorWallet,
      });
    }
    return existing;
  }

  const published = draft.visibility === "public" || PUBLISHED_DRAFT_STATUSES.has(draft.status);
  return createTickerReservation(db, {
    draftId: draft.id,
    creatorWallet: draft.creatorWallet,
    chainId: draft.chainId,
    ticker: draft.ticker,
    published,
  });
}

export async function tickerReservationManagement(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  const draftId = String(req.params?.draftId || "").trim();
  if (!draftId) return json(res, 400, { error: "Draft id is required." });

  const body = await readJson(req);
  const operation = String(body.operation || body.action || "read").trim().toLowerCase();
  if (!MANAGEMENT_OPERATIONS.has(operation)) {
    return json(res, 400, {
      error: "Ticker reservation operation must be read, renew, release, or reclaim.",
      code: "INVALID_TICKER_RESERVATION_OPERATION",
    });
  }

  const pool = await getPool();
  if (!pool) {
    return json(res, 503, { error: "Ticker reservation management requires DATABASE_URL." });
  }

  const draft = await readDraftForManagement(pool, draftId);
  if (!draft) return json(res, 404, { error: "Draft not found." });

  const ownerOk = await requireDraftActionAuth({
    res,
    pool,
    auth: body.auth,
    expectedWallet: draft.creatorWallet,
    chainId: draft.chainId,
    action: "manage_ticker_reservation",
    draftId,
  });
  if (!ownerOk) return;

  try {
    if (operation === "read") {
      await refreshExpiredTickerReservations(pool, { draftId });
      const reservation = await loadTickerReservationByDraft(pool, draftId, { includeReleased: true });
      return json(res, 200, responsePayload({ operation, draft, reservation }));
    }

    if (draft.status === "archived" && operation !== "release") {
      return json(res, 409, {
        error: "Archived drafts cannot extend or reclaim a ticker reservation.",
        code: "ARCHIVED_DRAFT_RESERVATION_LOCKED",
      });
    }

    const reservation = await withTickerReservationTransaction(pool, async (db) => {
      if (operation === "renew") {
        return renewTickerReservation(db, {
          draftId,
          creatorWallet: draft.creatorWallet,
        });
      }

      if (operation === "release") {
        const released = await releaseTickerReservation(db, {
          draftId,
          creatorWallet: draft.creatorWallet,
          reason: "Ticker reservation released by the draft owner without deleting the draft.",
        });
        if (released) return released;
        return loadTickerReservationByDraft(db, draftId, { includeReleased: true });
      }

      return reclaimReservation(db, draft);
    });

    return json(res, 200, responsePayload({ operation, draft, reservation }));
  } catch (error) {
    if (error instanceof TickerReservationError || isTickerReservationConflict(error)) {
      return json(res, error.httpStatus || 409, {
        error: error.message,
        code: error.code || "TICKER_RESERVATION_CONFLICT",
      });
    }
    console.error("[ticker-reservations] management failed", error);
    return json(res, 500, { error: "Ticker reservation management failed." });
  }
}
