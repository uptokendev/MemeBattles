import { badMethod, getQuery, json } from "../../server/http.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
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

async function queryFirst(pool, sql, params) {
  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (err) {
    console.warn("[ticker-availability] query failed", err?.message || err);
    return null;
  }
}

export async function tickerAvailability(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  const q = getQuery(req);
  const ticker = normalizeTicker(q.ticker || q.symbol);
  const chainId = Number(q.chainId || process.env.VITE_TARGET_CHAIN_ID || 97);

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

  const activeDraft = await queryFirst(
    pool,
    "select 1 from public.campaign_drafts where chain_id = $1 and lower(ticker) = lower($2) and status <> 'archived' limit 1",
    [chainId, ticker],
  );

  if (activeDraft) {
    return json(res, 200, {
      ticker,
      chainId,
      available: false,
      reason: "Ticker already reserved by an active draft.",
      source: "draft",
    });
  }

  const liveCampaign = await queryFirst(
    pool,
    "select 1 from public.campaigns where chain_id = $1 and lower(symbol) = lower($2) limit 1",
    [chainId, ticker],
  );

  if (liveCampaign) {
    return json(res, 200, {
      ticker,
      chainId,
      available: false,
      reason: "Ticker already used by a live campaign.",
      source: "campaign",
    });
  }

  return json(res, 200, {
    ticker,
    chainId,
    available: true,
    reason: "Ticker available.",
    source: "available",
  });
}
