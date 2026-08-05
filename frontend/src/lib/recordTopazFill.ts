import type { CurveTradePoint } from "@/hooks/useCurveTrades";
import { appendLocalTopazTrade } from "@/lib/localTopazTrades";
import { reportTopazTrade } from "@/lib/topazTradeReports";
import { SYNTHETIC_LOG_INDEX_MIN } from "@/lib/tradeDedupe";

export const TOPAZ_FILL_EVENT = "memewarzone:topaz-fill";

export type TopazFillDetail = {
  chainId: number;
  campaignAddress: string;
  point: CurveTradePoint;
};

export function notifyTopazFill(detail: TopazFillDetail) {
  try {
    window.dispatchEvent(new CustomEvent(TOPAZ_FILL_EVENT, { detail }));
  } catch {
    // ignore (SSR / non-browser)
  }
}

/**
 * Persist a confirmed Topaz fill for chart continuity:
 * localStorage merge + frontend API report + UI event for War Room / Token Details charts.
 */
export async function recordTopazFill(input: {
  chainId: number;
  campaignAddress: string;
  side: "buy" | "sell";
  txHash: string;
  tokenAmountRaw: bigint | string;
  nativeAmountRaw: bigint | string;
  wallet?: string | null;
  pairAddress?: string | null;
  blockNumber?: number | null;
  timestampSec?: number | null;
}): Promise<CurveTradePoint | null> {
  const campaignAddress = String(input.campaignAddress || "").trim().toLowerCase();
  const txHash = String(input.txHash || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(campaignAddress) || !/^0x[a-f0-9]{64}$/.test(txHash)) {
    return null;
  }

  const tokensWei = typeof input.tokenAmountRaw === "bigint" ? input.tokenAmountRaw : BigInt(input.tokenAmountRaw || "0");
  const nativeWei = typeof input.nativeAmountRaw === "bigint" ? input.nativeAmountRaw : BigInt(input.nativeAmountRaw || "0");
  const tokenAmount = Number(tokensWei) / 1e18;
  const bnbAmount = Number(nativeWei) / 1e18;
  const pricePerToken =
    tokenAmount > 0 && Number.isFinite(bnbAmount) && Number.isFinite(tokenAmount) ? bnbAmount / tokenAmount : 0;
  const timestamp = Number(input.timestampSec) || Math.floor(Date.now() / 1000);

  const point: CurveTradePoint = {
    type: input.side,
    from: String(input.wallet || "").toLowerCase(),
    to: String(input.wallet || campaignAddress).toLowerCase(),
    tokensWei,
    nativeWei,
    pricePerToken: Number.isFinite(pricePerToken) ? pricePerToken : 0,
    timestamp,
    txHash,
    blockNumber: Number(input.blockNumber || 0),
    logIndex: SYNTHETIC_LOG_INDEX_MIN,
  };

  appendLocalTopazTrade(input.chainId, campaignAddress, point);

  void reportTopazTrade({
    chainId: input.chainId,
    campaignAddress,
    side: input.side,
    txHash,
    tokenAmountRaw: tokensWei.toString(),
    nativeAmountRaw: nativeWei.toString(),
    wallet: input.wallet || undefined,
    pairAddress: input.pairAddress || null,
    blockNumber: point.blockNumber || null,
    logIndex: SYNTHETIC_LOG_INDEX_MIN,
    blockTime: new Date(timestamp * 1000).toISOString(),
  });

  notifyTopazFill({ chainId: input.chainId, campaignAddress, point });
  return point;
}
