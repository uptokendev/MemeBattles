import { badMethod, getQuery, json } from "../../server/http.js";
import {
  TICKER_RESERVATION_STATUS,
  TickerReservationError,
  getTickerAvailability,
  isTickerReservationSchemaMissing,
  normalizeTicker,
} from "./ticker-reservation-service.js";

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
  } catch (err) {
    console.warn("[ticker-availability] DB unavailable", err?.message || err);
    return null;
  }
}

async function legacyAvailability(pool, { chainId, ticker }) {
  const activeDraft = await pool.query(
    "select 1 from public.campaign_drafts where chain_id = $1 and lower(ticker) = lower($2) and status <> 'archived' limit 1",
    [chainId, ticker],
  );
  if (activeDraft.rows.length) {
    return {
      ticker,
      chainId,
      available: false,
      reason: "Ticker already reserved by an active draft.",
      source: "legacy_draft",
    };
  }

  const liveCampaign = await pool.query(
    "select 1 from public.campaigns where chain_id = $1 and lower(symbol) = lower($2) limit 1",
    [chainId, ticker],
  );
  if (liveCampaign.rows.length) {
    return {
      ticker,
      chainId,
      available: false,
      reason: "Ticker already used by a live campaign.",
      source: "legacy_campaign",
    };
  }

  return {
    ticker,
    chainId,
    available: true,
    reason: "Ticker available.",
    source: "legacy_available",
  };
}

function blockedReason(status) {
  if (status === TICKER_RESERVATION_STATUS.LIVE) {
    return "Ticker already used by a live campaign.";
  }
  if (status === TICKER_RESERVATION_STATUS.ARMED_ONCHAIN) {
    return "Ticker is permanently bound to a scheduled on-chain campaign.";
  }
  if (status === TICKER_RESERVATION_STATUS.EXPIRED_GRACE) {
    return "Ticker reservation is in its 24-hour creator grace period.";
  }
  if (status === TICKER_RESERVATION_STATUS.ARM_AUTHORIZED || status === TICKER_RESERVATION_STATUS.ARMING) {
    return "Ticker is currently being armed for on-chain deployment.";
  }
  return "Ticker already reserved by an active draft.";
}

export async function tickerAvailability(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  const q = getQuery(req);
  const ticker = normalizeTicker(q.ticker || q.symbol);
  const chainId = Number(q.chainId || process.env.VITE_TARGET_CHAIN_ID || 97);
  const cluster = String(q.cluster || "").trim();

  if (!ticker) {
    return json(res, 200, {
      ticker: "",
      available: false,
      reason: "Ticker is required.",
      source: "validation",
    });
  }

  if (!Number.isFinite(chainId) || chainId <= 0) {
    return json(res, 400, { error: "Invalid chain id." });
  }

  const pool = await getPool();
  if (!pool) return json(res, 503, { error: "Ticker availability requires DATABASE_URL." });

  try {
    const result = await getTickerAvailability(pool, { chainId, cluster, ticker });
    if (result.available) {
      return json(res, 200, {
        ticker,
        chainId,
        cluster: result.cluster,
        available: true,
        reason: "Ticker available.",
        source: "canonical_reservations",
      });
    }

    return json(res, 200, {
      ticker,
      chainId,
      cluster: result.cluster,
      available: false,
      reason: blockedReason(result.reservation?.status),
      source: "canonical_reservations",
      reservation: result.reservation ? {
        status: result.reservation.status,
        expiresAt: result.reservation.expiresAt,
        graceEndAt: result.reservation.graceEndAt,
        renewalCount: result.reservation.renewalCount,
        scheduledLaunchAt: result.reservation.scheduledLaunchAt,
        reservationVersion: result.reservation.reservationVersion,
      } : null,
    });
  } catch (error) {
    if (isTickerReservationSchemaMissing(error)) {
      console.warn("[ticker-availability] canonical schema unavailable; using legacy lookup");
      return json(res, 200, await legacyAvailability(pool, { chainId, ticker }));
    }
    if (error instanceof TickerReservationError) {
      return json(res, error.httpStatus || 400, { error: error.message, code: error.code });
    }
    console.error("[ticker-availability] canonical lookup failed", error);
    return json(res, 500, { error: "Ticker availability check failed." });
  }
}
