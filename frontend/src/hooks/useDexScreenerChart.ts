import { useEffect, useState } from "react";
import { USE_MOCK_DATA } from "@/config/mockConfig";

// Mock demo pair
const MOCK_BASE_URL =
  "https://dexscreener.com/bsc/0x7dff3085e3fa13ba0d0c4a0f9baccb872ff3351e";

// "Chart only" query params
const CHART_QUERY =
  "embed=1&theme=dark&chartTheme=dark&tabs=0&trades=0&info=0&interval=15";

const buildChartOnlyUrl = (base: string) =>
  base.includes("?") ? `${base}&${CHART_QUERY}` : `${base}?${CHART_QUERY}`;

type DexChartState = {
  url?: string;
  baseUrl?: string; // non-embed page URL
  liquidityBnb?: number; // best-effort, only when quote is BNB/WBNB
  loading: boolean;
  error?: string;
};

export function useDexScreenerChart(tokenAddress?: string): DexChartState {
  const [url, setUrl] = useState<string | undefined>();
  const [baseUrl, setBaseUrl] = useState<string | undefined>();
  const [liquidityBnb, setLiquidityBnb] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setUrl(undefined);
    setBaseUrl(undefined);
    setLiquidityBnb(undefined);
    setError(undefined);

    if (!tokenAddress) return;

    // MOCK MODE – always show the same demo pair
    if (USE_MOCK_DATA) {
      setBaseUrl(MOCK_BASE_URL);
      setUrl(buildChartOnlyUrl(MOCK_BASE_URL));
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
        );

        if (!res.ok) {
          throw new Error(`DexScreener HTTP ${res.status}`);
        }

        const data = await res.json();
        const pairs: any[] = data.pairs ?? [];

        if (!pairs.length) {
          if (!cancelled) setUrl(undefined);
          return;
        }

        // Prefer BSC + Pancake pair; fallback to first
        const bestPair =
          pairs.find(
            (p) =>
              p.chainId?.toLowerCase() === "bsc" &&
              p.dexId?.toLowerCase().includes("pancake")
          ) ?? pairs[0];

        if (!bestPair) {
          if (!cancelled) setUrl(undefined);
          return;
        }

        const chain = bestPair.chainId;
        const pairAddress = bestPair.pairAddress;
        const base = `https://dexscreener.com/${chain}/${pairAddress}`;

        // Best-effort liquidity in BNB equivalent.
        // DexScreener provides liquidity.usd and priceUsd/priceNative for the base token.
        // If the quote token is BNB/WBNB, we can estimate bnbUsd = priceUsd / priceNative.
        const quoteSym = (bestPair.quoteToken?.symbol ?? "").toUpperCase();
        const liqUsd = Number(bestPair.liquidity?.usd ?? NaN);
        const priceUsd = Number(bestPair.priceUsd ?? NaN);
        const priceNative = Number(bestPair.priceNative ?? NaN);

        let liqBnb: number | undefined;
        if ((quoteSym === "BNB" || quoteSym === "WBNB") && Number.isFinite(liqUsd) && Number.isFinite(priceUsd) && Number.isFinite(priceNative) && priceNative > 0) {
          const bnbUsd = priceUsd / priceNative;
          if (Number.isFinite(bnbUsd) && bnbUsd > 0) {
            liqBnb = liqUsd / bnbUsd;
          }
        }

        if (!cancelled) {
          setBaseUrl(base);
          setUrl(buildChartOnlyUrl(base));
          setLiquidityBnb(liqBnb);
        }
      } catch (e: any) {
        console.error("DexScreener fetch failed", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load chart");
          setUrl(undefined);
          setBaseUrl(undefined);
          setLiquidityBnb(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  return { url, baseUrl, liquidityBnb, loading, error };
}
