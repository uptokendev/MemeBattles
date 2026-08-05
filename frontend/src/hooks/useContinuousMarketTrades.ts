import { useEffect, useMemo, useRef, useState } from "react";
import { Contract, ethers } from "ethers";
import { useCurveTrades, type CurveTradePoint } from "@/hooks/useCurveTrades";
import { useTopazMarket } from "@/hooks/useTopazMarket";
import { useUnifiedMarket, type MarketResolution } from "@/hooks/useUnifiedMarket";
import type { SupportedChainId } from "@/lib/chainConfig";
import { loadLocalTopazTrades, saveLocalTopazTrades } from "@/lib/localTopazTrades";
import { getReadProvider } from "@/lib/readProvider";
import { TOPAZ_FILL_EVENT, type TopazFillDetail } from "@/lib/recordTopazFill";
import { fetchTopazTradeReports } from "@/lib/topazTradeReports";
import { mergeTradePoints } from "@/lib/tradeDedupe";

const CAMPAIGN_GRAD_ABI = [
  "function launched() view returns (bool)",
  "function getGraduationState() view returns (address dexPair,uint256 finalCurvePrice,uint256 initialDexPrice,uint256 graduatedLiquidityTokens,uint256 graduatedLiquidityBnb,uint256 graduatedLiquidityLp,uint256 burnedUnsoldTokens,uint256 burnedUnusedLpTokens,uint256 postBurnTotalSupply,uint256 graduationBalance,uint256 graduationOvershoot)",
] as const;

/**
 * Shared continuous trade stream for Token Details + War Room:
 * bonding indexer history + Topaz on-chain scan + wallet reports + unified market API.
 *
 * Topaz scan enablement matches Token Details: use market API stage when available,
 * but also open on-chain launched/pair so CMS lag (stuck BONDING) does not blank War Room.
 */
export function useContinuousMarketTrades(input: {
  campaignAddress?: string;
  tokenAddress?: string;
  chainId: number;
  resolution?: MarketResolution;
  enabled?: boolean;
  /** When false, never enable browser Topaz pair scan. Default true. */
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

  // On-chain graduation independent of campaign_market_state (same idea as TokenDetails).
  const [onChainLaunched, setOnChainLaunched] = useState(false);
  const [onChainPair, setOnChainPair] = useState("");

  useEffect(() => {
    if (!enabled || !campaignAddress) {
      setOnChainLaunched(false);
      setOnChainPair("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const provider = getReadProvider(chainId as SupportedChainId);
        const c = new Contract(campaignAddress, CAMPAIGN_GRAD_ABI, provider) as any;
        const [launched, graduation] = await Promise.all([
          c.launched().catch(() => false),
          c.getGraduationState().catch(() => null),
        ]);
        if (cancelled) return;
        const pair = String(graduation?.[0] ?? graduation?.dexPair ?? "").toLowerCase();
        const pairOk = ethers.isAddress(pair) && pair !== ethers.ZeroAddress.toLowerCase();
        setOnChainLaunched(Boolean(launched) || pairOk);
        setOnChainPair(pairOk ? pair : "");
      } catch {
        if (!cancelled) {
          setOnChainLaunched(false);
          setOnChainPair("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, campaignAddress, chainId]);

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

  const stage = String(unifiedMarket.state?.marketStage || "").toUpperCase();
  const apiPair = String(unifiedMarket.state?.pairAddress || "").toLowerCase();
  const apiPairOk = /^0x[a-f0-9]{40}$/.test(apiPair) && apiPair !== ethers.ZeroAddress.toLowerCase();

  const graduatedFromApi =
    stage === "TOPAZ_ACTIVE" ||
    stage === "TOPAZ_DEGRADED" ||
    stage === "TOPAZ_PENDING" ||
    stage === "GRADUATING";

  // Post-grad if API says so, CMS has a pair, or on-chain launched/pair (CMS lag path).
  const isPostGrad =
    graduatedFromApi ||
    onChainLaunched ||
    apiPairOk ||
    Boolean(onChainPair);

  // Scan Topaz once graduated — including CMS lag (API still BONDING, on-chain launched).
  // Do not scan pure bonding (no API post-grad, no on-chain launch/pair).
  const topazScanEnabledResolved =
    enabled &&
    input.enableTopazScan !== false &&
    (graduatedFromApi || onChainLaunched || apiPairOk || Boolean(onChainPair));

  const topazMarket = useTopazMarket({
    campaignAddress: enabled ? campaignAddress : undefined,
    tokenAddress: tokenAddress || undefined,
    chainId,
    enabled: topazScanEnabledResolved,
    pollMs: 45_000,
  });

  // War Room / Token Details post-fill: merge optimistic trade without full page reload.
  useEffect(() => {
    if (!enabled) return;
    const onFill = (event: Event) => {
      const detail = (event as CustomEvent<TopazFillDetail>).detail;
      if (!detail) return;
      if (Number(detail.chainId) !== chainId) return;
      if (String(detail.campaignAddress || "").toLowerCase() !== campaignAddress) return;
      setLocalTopazTrades((prev) => {
        const next = mergeTradePoints(prev, [detail.point]);
        saveLocalTopazTrades(chainId, campaignAddress, next);
        return next;
      });
      void topazMarket.refresh?.();
    };
    window.addEventListener(TOPAZ_FILL_EVENT, onFill as EventListener);
    return () => window.removeEventListener(TOPAZ_FILL_EVENT, onFill as EventListener);
  }, [enabled, campaignAddress, chainId, topazMarket]);

  const tradePoints = useMemo(() => {
    const curve = Array.isArray(curvePoints) ? curvePoints : [];
    const postGrad =
      isPostGrad ||
      Boolean(topazMarket.pairAddress) ||
      (Array.isArray(topazMarket.trades) && topazMarket.trades.length > 0) ||
      localTopazTrades.length > 0;

    // Bonding-only: never mix DEX/unified rows into circulating mcap walks.
    if (!postGrad) {
      return mergeTradePoints(curve);
    }

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
  }, [
    curvePoints,
    topazMarket.trades,
    topazMarket.pairAddress,
    localTopazTrades,
    unifiedMarket.trades,
    isPostGrad,
  ]);

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
    onChainLaunched,
    onChainPair: onChainPair || null,
    isDexStage:
      isPostGrad ||
      Boolean(topazMarket.pairAddress) ||
      Boolean(unifiedMarket.state?.pairAddress),
  };
}
