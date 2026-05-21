import type { QuickTradeRequest, QuickTradeResult } from "@/features/postgrad/contracts";
import { pushMockActivity } from "@/features/postgrad/mockActivityRuntime";
import { getMockTokenById } from "@/features/postgrad/mockRegistry";

const STORAGE_KEY = "mwz:postgrad:mock-quick-trades";
const UPDATE_EVENT = "mwz:postgrad-mock-quick-trades-updated";
const MAX_RESULTS = 24;

function isBrowser() {
  return typeof window !== "undefined";
}

function dispatchQuickTradeUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function readTrades(): QuickTradeResult[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTrades(next: QuickTradeResult[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RESULTS)));
  dispatchQuickTradeUpdate();
}

function formatExecutionPrice(amountUsd: number, side: QuickTradeRequest["side"]) {
  const basis = side === "buy" ? 1.024 : 0.986;
  return `${basis.toFixed(3)} mock fill / ${Math.round(amountUsd / 10)} units`;
}

function estimateImpactBps(amountUsd: number, liquidityUsd: number) {
  const ratio = liquidityUsd > 0 ? amountUsd / liquidityUsd : 0;
  return Math.max(8, Math.min(220, Math.round(ratio * 10000)));
}

export function getResolvedQuickTrades() {
  return readTrades();
}

export function getResolvedQuickTradesForToken(tokenId?: string | null) {
  return readTrades().filter((trade) => trade.tokenId === tokenId);
}

export function subscribeToMockQuickTradeRuntime(listener: () => void) {
  if (!isBrowser()) return () => undefined;
  const handler = () => listener();
  window.addEventListener(UPDATE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export function resetMockQuickTradeRuntime() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  dispatchQuickTradeUpdate();
  pushMockActivity("war_room", "Quick trade sandbox reset", "Quick trade intents and fills returned to baseline.");
}

export function submitMockQuickTrade(request: QuickTradeRequest): QuickTradeResult | null {
  const token = getMockTokenById(request.tokenId);
  if (!token) return null;

  const impactBps = estimateImpactBps(request.amountUsd, token.liquidityUsd);
  const status: QuickTradeResult["status"] = request.amountUsd > token.liquidityUsd * 0.55 ? "rejected" : request.amountUsd > token.liquidityUsd * 0.18 ? "queued" : "filled";
  const statusDetail = status === "filled"
    ? "Mock order filled instantly in the sandbox."
    : status === "queued"
      ? "Mock order queued for routing review because the size is large versus liquidity."
      : "Mock order rejected because the requested size exceeds the sandbox liquidity guardrail.";

  const result: QuickTradeResult = {
    ...request,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status,
    createdAt: new Date().toISOString(),
    executionPriceLabel: formatExecutionPrice(request.amountUsd, request.side),
    estimatedImpactBps: impactBps,
    statusDetail,
  };

  writeTrades([result, ...readTrades()]);
  pushMockActivity(
    "war_room",
    status === "filled" ? "Quick trade filled" : status === "queued" ? "Quick trade queued" : "Quick trade rejected",
    `${request.side.toUpperCase()} ${token.symbol} for $${request.amountUsd.toFixed(0)}. Impact ${impactBps} bps.`,
  );
  return result;
}
