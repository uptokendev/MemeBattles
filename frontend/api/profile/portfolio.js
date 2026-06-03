/**
 * GET/POST /api/profile/portfolio
 *
 * Cached portfolio metrics endpoint (1h TTL).
 * Returns the same PortfolioMetrics shape the frontend uses + cache metadata.
 *
 * This is a minimal viable implementation to unblock local dev + Public Profile.
 * Full on-chain first-activity binary search + richer holdings can be added here later
 * (the pure calc functions are already in api/lib/portfolioCalculations.js).
 */

import { pool } from "../../server/db.js";
import getServerReadProvider from "../lib/getServerReadProvider.js";
import {
  derivePortfolioMetrics,
  calculateHoldingValueUsd,
} from "../lib/portfolioCalculations.js";

const PORTFOLIO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const BNB_PRICE_CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes for BNB price

// In-memory caches (process lifetime, same pattern as other api/ modules)
if (!globalThis.__memebattlesPortfolioCache) {
  globalThis.__memebattlesPortfolioCache = new Map();
}
if (!globalThis.__memebattlesBnbPriceCache) {
  globalThis.__memebattlesBnbPriceCache = { value: null, ts: 0 };
}

function normalizeAddress(addr) {
  return String(addr || "").trim().toLowerCase();
}

function isHexAddress(addr) {
  return /^0x[a-f0-9]{40}$/i.test(addr || "");
}

async function fetchBnbUsd() {
  const cache = globalThis.__memebattlesBnbPriceCache;
  const now = Date.now();
  if (cache.value && now - cache.ts < BNB_PRICE_CACHE_TTL_MS) {
    return cache.value;
  }

  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd", {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const j = await res.json();
      const price = Number(j?.binancecoin?.usd) || 0;
      if (price > 0) {
        globalThis.__memebattlesBnbPriceCache = { value: price, ts: now };
        return price;
      }
    }
  } catch (e) {
    console.warn("[api/profile/portfolio] BNB price fetch failed, using fallback 580", e?.message);
  }
  return 580; // last-resort fallback
}

async function getBasicHoldingsFromDb(address, chainId) {
  // Lightweight: pull from campaigns table what we can (similar to other routes)
  // This is intentionally conservative — full rich holdings still happen client-side for owners.
  try {
    const { rows } = await pool.query(
      `SELECT campaign_address, token_address, symbol, name, logo_uri, market_cap_bnb, market_cap
         FROM campaigns
        WHERE chain_id = $1
          AND (creator ILIKE $2 OR token_address ILIKE $2 OR campaign_address ILIKE $2)
        LIMIT 50`,
      [Number(chainId) || 97, `%${address}%`]
    );
    return rows || [];
  } catch (e) {
    console.warn("[api/profile/portfolio] DB holdings lookup failed", e?.message);
    return [];
  }
}

export default async function portfolioHandler(req, res) {
  try {
    const address = normalizeAddress(req.query?.address || req.body?.address);
    const chainId = Number(req.query?.chainId || req.body?.chainId || 97);
    const forceRefresh = Boolean(req.query?.forceRefresh || req.query?.refresh || req.body?.forceRefresh);

    if (!address || !isHexAddress(address)) {
      return res.status(400).json({ error: "Valid EVM address is required" });
    }

    const cacheKey = `${chainId}:${address}`;
    const cache = globalThis.__memebattlesPortfolioCache;
    const cached = cache.get(cacheKey);
    const now = Date.now();

    if (cached && !forceRefresh && now - cached.fetchedAt < PORTFOLIO_CACHE_TTL_MS) {
      return res.json({
        ...cached.metrics,
        cachedAt: new Date(cached.fetchedAt).toISOString(),
        isCached: true,
      });
    }

    // === Compute fresh (lightweight path for now) ===
    const bnbUsd = await fetchBnbUsd();

    // We intentionally keep this light:
    // - Owners get rich fresh data via the improved client-side useProfileBalances hook.
    // - Public viewers get a cached (even if partial) view.
    // Full server-side balance scanning + on-chain first-activity can be expanded here later.

    const dbHoldings = await getBasicHoldingsFromDb(address, chainId);

    // Very rough value estimation from DB market_cap where available (best effort)
    const tokenHoldingsWithValues = dbHoldings.map((row) => {
      const mcapBnb = Number(row.market_cap_bnb || row.market_cap || 0);
      // We have no per-holder balance here in this stub path — return 0 value contribution.
      // Real implementation would do balanceOf reads.
      return {
        ticker: row.symbol || row.name || "???",
        valueUsd: 0,
      };
    });

    // Wallet age: return null here (client already does the good on-chain binary search for owners).
    // Public profiles can use profile.created_at as fallback (already handled in frontend).
    const metrics = derivePortfolioMetrics({
      nativeBnb: 0,
      tokenHoldingsWithValues,
      bnbUsd,
      firstActivityTimestamp: null,
    });

    const payload = {
      ...metrics,
      cachedAt: new Date(now).toISOString(),
      isCached: false,
      // Helpful hint for observers while we iterate the full server implementation
      note: "Lightweight cached path. Owners see richer live data via Command Center client computation.",
    };

    cache.set(cacheKey, { metrics: payload, fetchedAt: now });

    return res.json(payload);
  } catch (err) {
    console.error("[api/profile/portfolio] handler error", err);
    // Never hard-fail public profile pages
    return res.status(200).json({
      totalValueUsd: null,
      topHolding: null,
      coinsCount: 0,
      walletAge: "—",
      cachedAt: new Date().toISOString(),
      isCached: false,
      error: "temporary backend issue",
    });
  }
}
