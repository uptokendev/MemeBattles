import { json, getQuery, isAddress, badMethod } from "../../server/http.js";
import {
  derivePortfolioMetrics,
} from "../lib/portfolioCalculations.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = String(q.address ?? "").trim().toLowerCase();

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });

    // NOTE: This is currently a stub.
    // Real implementation will need to:
    // - Fetch user's native BNB balance (from on-chain or cached)
    // - Fetch token holdings + their marketCapBnb / balances (likely from user_holdings or similar table + token stats)
    // - Fetch current BNB/USD price
    // - Pass createdAt from user_profiles or auth
    // Then call derivePortfolioMetrics(...)
    //
    // For now we return a safe empty response so dev server and any early callers don't explode.

    const metrics = derivePortfolioMetrics({
      nativeBnb: 0,
      tokenHoldingsWithValues: [],
      bnbUsd: 0,
      createdAt: null,
    });

    return json(res, 200, {
      metrics,
      warning: "portfolio endpoint is stubbed — real data fetching not wired yet",
    });
  } catch (e) {
    console.error("[api/profile/portfolio]", e);
    return json(res, 500, { error: "Server error" });
  }
}
