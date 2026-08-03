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
        <div className={`flex items-center justify-end gap-1 ${compact ? "mb-1.5" : "mb-2"}`}>
          <Button
            type="button"
            size="sm"
            variant={denomination === "USD" ? "secondary" : "ghost"}
            className="h-6 px-2.5 text-[10px]"
            onClick={() => setDenomination("USD")}
          >
            USD
          </Button>
          <Button
            type="button"
            size="sm"
            variant={denomination === "BNB" ? "secondary" : "ghost"}
            className="h-6 px-2.5 text-[10px]"
            onClick={() => setDenomination("BNB")}
          >
            BNB
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <UnifiedMarketChart
          curvePoints={market.tradePoints}
          marketCandles={market.unifiedMarket.candles}
          marketState={market.unifiedMarket.state}
          graduationMarker={market.unifiedMarket.graduationMarker}
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
