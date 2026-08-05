import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  UnifiedMarketChart,
  type UnifiedChartDenomination,
  type UnifiedChartResolution,
} from "@/components/token/UnifiedMarketChart";
import { useContinuousMarketTrades } from "@/hooks/useContinuousMarketTrades";

type ContinuousMarketChartPanelProps = {
  campaignAddress?: string;
  tokenAddress?: string;
  /** Creator wallet — marked as circles on the continuous chart. */
  creatorAddress?: string | null;
  chainId: number;
  /** Compact War Room chrome vs full Token Details controls. */
  compact?: boolean;
  className?: string;
  showDenomToggle?: boolean;
};

/**
 * Same continuous chart stack as Token Details:
 * bonding history + Topaz scans/reports + optional market API candles.
 * Used by War Room so expanded rows don't fall back to bonding-only CurvePriceChart.
 */
export function ContinuousMarketChartPanel({
  campaignAddress,
  tokenAddress,
  creatorAddress,
  chainId,
  compact = false,
  className,
  showDenomToggle = true,
}: ContinuousMarketChartPanelProps) {
  const [resolution, setResolution] = useState<UnifiedChartResolution>("1m");
  const [denomination, setDenomination] = useState<UnifiedChartDenomination>("USD");

  const market = useContinuousMarketTrades({
    campaignAddress,
    tokenAddress,
    chainId,
    resolution,
    enabled: Boolean(campaignAddress),
    enableTopazScan: true,
  });

  return (
    <div className={className ?? "flex h-full min-h-[220px] w-full flex-col"}>
      {showDenomToggle ? (
        <div className={`flex shrink-0 items-center justify-end gap-1 ${compact ? "mb-1" : "mb-2"}`}>
          <Button
            type="button"
            size="sm"
            variant={denomination === "USD" ? "secondary" : "ghost"}
            className={`h-6 px-2.5 text-[10px] ${
              denomination === "USD"
                ? "border border-orange-400/40 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30"
                : "text-muted-foreground hover:text-orange-200"
            }`}
            onClick={() => setDenomination("USD")}
          >
            USD
          </Button>
          <Button
            type="button"
            size="sm"
            variant={denomination === "BNB" ? "secondary" : "ghost"}
            className={`h-6 px-2.5 text-[10px] ${
              denomination === "BNB"
                ? "border border-orange-400/40 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30"
                : "text-muted-foreground hover:text-orange-200"
            }`}
            onClick={() => setDenomination("BNB")}
          >
            BNB
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <UnifiedMarketChart
          curvePoints={market.tradePoints}
          marketCandles={market.unifiedMarket.candles}
          marketState={market.unifiedMarket.state}
          graduationMarker={market.unifiedMarket.graduationMarker}
          creatorAddress={creatorAddress}
          resolution={resolution}
          onResolutionChange={setResolution}
          denomination={denomination}
          loading={market.loading}
          error={market.error}
        />
      </div>
    </div>
  );
}
