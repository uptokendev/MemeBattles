/**
 * When true, frontend fetches durable market state / trades / candles from the
 * realtime-indexer (`/api/token/.../market-state`, trades, candles).
 *
 * Chart rendering itself always uses UnifiedMarketChart (TradingView Lightweight)
 * with bonding curve points + browser Topaz scans — this flag only adds server history.
 *
 * Trading always uses Topaz on-chain via topazV2Trade (not gated here).
 */
export function isMarketContinuityApiEnabled(): boolean {
  const chart = String(import.meta.env.VITE_ENABLE_UNIFIED_MARKET_CHART || "").trim();
  const topazApi = String(import.meta.env.VITE_ENABLE_TOPAZ_MARKET_API || "").trim();
  if (chart === "1" || topazApi === "1") return true;

  // Postgrad Netlify builds usually set VITE_ENABLE_POSTGRAD=true — turn on market API
  // with the same deploy so Slice C does not need a second UI flag.
  const postgrad = String(import.meta.env.VITE_ENABLE_POSTGRAD || "").trim().toLowerCase();
  return postgrad === "1" || postgrad === "true";
}
