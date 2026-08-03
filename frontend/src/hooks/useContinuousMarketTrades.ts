import { useEffect, useMemo, useRef, useState } from "react";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { useTopazMarket } from "@/hooks/useTopazMarket";
import { useUnifiedMarket, type MarketResolution } from "@/hooks/useUnifiedMarket";
import {
  fetchTopazTradeReports,
  loadLocalTopazTrades,
  saveLocalTopazTrades,
} from "@/lib/localTopazTrades";
import { mergeTradePoints } from "@/lib/tradeDedupe";

/**
 * Shared continuous trade stream for Token Details + War Room:
 * bonding indexer history + Topaz on-chain scan + wallet reports + unified market API.
 */
export function useContinuousMarketTrades(input: {
  campaignAddress?: string;
  tokenAddress?: string;
  chainId: number;
  resolution?: MarketResolution;
  enabled?: boolean;
  /** When true, enable browser Topaz pair scan even if market stage API is down. */
  enableTopazScan?: boolean;
}) {
  const campaignAddress = String(input.campaignAddress || "").trim().toLowerCase();
  const tokenAddress = String(input.tokenAddress || "").trim().toLowerCase();
  const chainId = Number(input.chainId || 97);
  const enabled =
    (input.enabled ?? true) && /^0x[a-f0-9]{40}$/.test(campaignAddress);
  const resolution = input.resolution ?? "1m";

  const { points: curvePoints, loading: curveLoading, error: curveError } = useCurveTrades(
    enabled ? campaignAddress : undefined,
    { chainId, enabled },
  );

  const [localTopazTrades, setLocalTopazTrades] = useState<CurveTradePoint[]>([]);
  const lastNonEmptyRef = useRef<CurveTradePoint[]>([]);

  useEffect(() => {
    if (!enabled) {
      setLocalTopazTrades([]);
      return;
    }
    const cached = loadLocalTopazTrades(chainId, campaignAddress);
    setLocalTopazTrades(cached);

    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchTopazTradeReports({
          chainId,
          campaignAddress,
          limit: 100,
        });
        if (cancelled || !remote.length) return;
        setLocalTopazTrades((prev) => {
          const merged = mergeTradePoints(prev, remote);
          saveLocalTopazTrades(chainId, campaignAddress, merged);
          return merged;
        });
      } catch {
        // optional
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, campaignAddress, chainId]);

  useEffect(() => {
    if (!enabled) return;
    saveLocalTopazTrades(chainId, campaignAddress, localTopazTrades);
  }, [enabled, campaignAddress, chainId, localTopazTrades]);

  const unifiedMarket = useUnifiedMarket({
    campaignAddress: enabled ? campaignAddress : undefined,
    chainId,
    resolution,
    enabled,
  });

  const stage = unifiedMarket.state?.marketStage;
  const graduatedFromApi =
    stage === "TOPAZ_ACTIVE" ||
    stage === "TOPAZ_PENDING" ||
    stage === "TOPAZ_DEGRADED" ||
    stage === "GRADUATING";

  // Always try Topaz scan for live campaigns: snapshot no-ops when not launched.
  // Needed for older factories before graduation handoff writes market_stage.
  const topazScanEnabled = enabled && input.enableTopazScan !== false;

  const topazMarket = useTopazMarket({
    campaignAddress: enabled ? campaignAddress : undefined,
    tokenAddress: tokenAddress || undefined,
    chainId,
    enabled: topazScanEnabled,
    pollMs: 45_000,
  });

  const tradePoints = useMemo(() => {
    const curve = Array.isArray(curvePoints) ? curvePoints : [];
    const unifiedAsPoints: CurveTradePoint[] = (unifiedMarket.trades || []).map((trade) => {
      let tokensWei = 0n;
      let nativeWei = 0n;
      try {
        tokensWei = BigInt(trade.tokenAmountRaw || "0");
      } catch {
        tokensWei = 0n;
      }
      try {
        nativeWei = BigInt(trade.nativeAmountRaw || "0");
      } catch {
        nativeWei = 0n;
      }
      return {
        type: trade.side,
        from: trade.wallet,
        to: trade.recipient || trade.wallet,
        tokensWei,
        nativeWei,
        pricePerToken: Number(trade.priceBnb || 0),
        timestamp: Math.floor(new Date(trade.blockTime).getTime() / 1000),
        txHash: trade.txHash,
        blockNumber: trade.blockNumber,
        logIndex: trade.logIndex,
      };
    });
    return mergeTradePoints(curve, topazMarket.trades, localTopazTrades, unifiedAsPoints);
  }, [curvePoints, topazMarket.trades, localTopazTrades, unifiedMarket.trades]);

  useEffect(() => {
    if (tradePoints.length) lastNonEmptyRef.current = tradePoints;
  }, [tradePoints]);

  const stableTradePoints = tradePoints.length ? tradePoints : lastNonEmptyRef.current;

  const loading =
    stableTradePoints.length > 0
      ? false
      : curveLoading || unifiedMarket.loading || topazMarket.loading;

  const error =
    stableTradePoints.length > 0
      ? null
      : curveError || unifiedMarket.error || topazMarket.error;

  return {
    campaignAddress: enabled ? campaignAddress : "",
    tradePoints: stableTradePoints,
    localTopazTrades,
    setLocalTopazTrades,
    curvePoints: Array.isArray(curvePoints) ? curvePoints : [],
    curveLoading,
    curveError,
    topazMarket,
    unifiedMarket,
    loading,
    error,
    isDexStage:
      graduatedFromApi ||
      Boolean(topazMarket.pairAddress) ||
      Boolean(unifiedMarket.state?.pairAddress),
  };
}
