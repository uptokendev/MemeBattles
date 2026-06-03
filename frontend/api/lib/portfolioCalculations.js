/**
 * Server-side (pure JS) mirror of src/lib/profile/portfolioCalculations.ts
 * Keep math and formatting 100% in sync with the frontend version.
 * Used by the /api/profile/portfolio cached endpoint.
 */

export function parseNativeBalanceBnb(nativeBalance) {
  if (!nativeBalance) return 0;
  const cleaned = String(nativeBalance).replace(/[^0-9.]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function calculateHoldingValueUsd(balanceFormatted, marketCapBnb, bnbUsd) {
  const bal = Number.parseFloat(balanceFormatted || "0");
  if (!Number.isFinite(bal) || bal <= 0) return 0;
  if (!bnbUsd || bnbUsd <= 0) return 0;

  const mcap = marketCapBnb && Number.isFinite(marketCapBnb) && marketCapBnb > 0
    ? marketCapBnb
    : 0;

  if (mcap <= 0) return 0;

  // Same approximation used on client
  const estPriceBnbPerWholeToken = mcap / 1_000_000_000;
  const valueUsd = bal * estPriceBnbPerWholeToken * bnbUsd;

  return Number.isFinite(valueUsd) && valueUsd > 0 ? valueUsd : 0;
}

export function selectTopHolding(holdings) {
  if (!Array.isArray(holdings) || holdings.length === 0) return null;

  let best = { ticker: "", valueUsd: 0 };
  let totalPositive = 0;

  for (const h of holdings) {
    const v = Number.isFinite(h.valueUsd) ? h.valueUsd : 0;
    if (v > 0) totalPositive += v;
    if (v > best.valueUsd) {
      best = { ticker: h.ticker || "?", valueUsd: v };
    }
  }

  if (best.valueUsd <= 0 || totalPositive <= 0) return null;

  const percent = (best.valueUsd / totalPositive) * 100;

  return {
    ticker: best.ticker,
    percentOfPortfolio: Math.max(0, Math.min(100, Math.round(percent * 10) / 10)),
    valueUsd: best.valueUsd,
  };
}

function formatWalletAge(firstActivityTimestamp) {
  if (!firstActivityTimestamp) return "—";
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.max(0, now - firstActivityTimestamp);

  const days = Math.floor(ageSeconds / 86400);
  if (days < 1) return "< 1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  return remainingMonths > 0 ? `${years}y ${remainingMonths}m` : `${years} years`;
}

function formatWalletAgeSince(firstActivityTimestamp) {
  if (!firstActivityTimestamp) return undefined;
  const date = new Date(firstActivityTimestamp * 1000);
  return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

export function derivePortfolioMetrics(params) {
  const { nativeBnb = 0, tokenHoldingsWithValues = [], bnbUsd = 0, firstActivityTimestamp } = params || {};

  const nativeUsd = (Number.isFinite(nativeBnb) ? nativeBnb : 0) *
    (Number.isFinite(bnbUsd) && bnbUsd > 0 ? bnbUsd : 0);

  let tokenTotalUsd = 0;
  const positiveHoldings = [];

  for (const h of tokenHoldingsWithValues) {
    const v = Number.isFinite(h.valueUsd) ? h.valueUsd : 0;
    if (v > 0) {
      tokenTotalUsd += v;
      positiveHoldings.push({ ticker: h.ticker || "?", valueUsd: v });
    }
  }

  const totalValueUsd = nativeUsd + tokenTotalUsd;
  const safeTotal = totalValueUsd > 0 ? totalValueUsd : 0;

  let topHolding = selectTopHolding(positiveHoldings);
  if (topHolding && safeTotal > 0) {
    const overallPercent = (topHolding.valueUsd / safeTotal) * 100;
    topHolding = {
      ...topHolding,
      percentOfPortfolio: Math.max(0, Math.min(100, Math.round(overallPercent * 10) / 10)),
    };
  }

  const coinsCount = positiveHoldings.length;
  const walletAge = formatWalletAge(firstActivityTimestamp);
  const walletAgeSince = formatWalletAgeSince(firstActivityTimestamp);

  return {
    totalValueUsd: safeTotal > 0 ? safeTotal : null,
    topHolding,
    coinsCount,
    walletAge,
    walletAgeSince,
  };
}
