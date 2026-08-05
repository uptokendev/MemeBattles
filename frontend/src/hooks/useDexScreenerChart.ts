import { useEffect, useState } from "react";

// "Chart only" query params (legacy embed; app chart is UnifiedMarketChart)
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

export type UseDexScreenerChartOptions = {
  /**
   * Preferred Topaz (or known) pair address. When set, DexScreener is only used
   * as an external reference for that pair — never a Pancake-first guess.
   */
  preferredPairAddress?: string | null;
  /** Prefer this chain id string on DexScreener (default bsc). */
  chainIdHint?: string;
};

function sameAddr(a: unknown, b: unknown): boolean {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function isBnbQuote(pair: any): boolean {
  const sym = String(pair?.quoteToken?.symbol || "").toUpperCase();
  return sym === "BNB" || sym === "WBNB";
}

/**
 * Optional external DexScreener reference for a token.
 * Trading and primary liquidity always use on-chain Topaz — not this hook.
 *
 * Pair selection rules (Topaz-first product):
 * 1) Exact preferred pair when provided
 * 2) BSC pair whose dexId looks like Topaz
 * 3) Any BSC pair with BNB/WBNB quote (no Pancake preference)
 * 4) First BSC pair, else first pair
 */
export function useDexScreenerChart(
  tokenAddress?: string,
  options?: UseDexScreenerChartOptions,
): DexChartState {
  const preferredPair = String(options?.preferredPairAddress || "").trim().toLowerCase();
  const chainHint = String(options?.chainIdHint || "bsc").trim().toLowerCase() || "bsc";

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

    // If we already know the Topaz pair, build the external URL without preferring
    // another venue (Pancake) from DexScreener rankings.
    if (/^0x[a-f0-9]{40}$/.test(preferredPair)) {
      const base = `https://dexscreener.com/${chainHint}/${preferredPair}`;
      setBaseUrl(base);
      setUrl(buildChartOnlyUrl(base));
      setLoading(false);
      // Still try liquidity fetch in background for optional display.
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(undefined);

        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        );

        if (!res.ok) {
          throw new Error(`DexScreener HTTP ${res.status}`);
        }

        const data = await res.json();
        const pairs: any[] = data.pairs ?? [];

        if (!pairs.length) {
          if (!cancelled && !preferredPair) setUrl(undefined);
          return;
        }

        const bscPairs = pairs.filter((p) => String(p.chainId || "").toLowerCase() === "bsc");
        const pool = bscPairs.length ? bscPairs : pairs;

        let bestPair: any | undefined;

        if (preferredPair) {
          bestPair =
            pool.find((p) => sameAddr(p.pairAddress, preferredPair)) ||
            pairs.find((p) => sameAddr(p.pairAddress, preferredPair));
        }

        if (!bestPair) {
          bestPair =
            pool.find((p) => String(p.dexId || "").toLowerCase().includes("topaz")) ||
            pool.find((p) => isBnbQuote(p)) ||
            pool[0] ||
            pairs[0];
        }

        // Never elevate Pancake over Topaz/BNB pairs: if we already have preferred Topaz
        // pair URL set and DexScreener has no matching pair, keep preferred URL.
        if (!bestPair) {
          if (!cancelled && !preferredPair) setUrl(undefined);
          return;
        }

        // If preferred pair was set and DexScreener returned a different pair, keep preferred.
        if (preferredPair && !sameAddr(bestPair.pairAddress, preferredPair)) {
          // Use preferred for link; still may use bestPair only for liquidity if same venue.
          const base = `https://dexscreener.com/${chainHint}/${preferredPair}`;
          if (!cancelled) {
            setBaseUrl(base);
            setUrl(buildChartOnlyUrl(base));
          }
          // Skip liquidity from a mismatched pair (often Pancake).
          return;
        }

        const chain = bestPair.chainId || chainHint;
        const pairAddress = bestPair.pairAddress;
        const base = `https://dexscreener.com/${chain}/${pairAddress}`;

        const quoteSym = (bestPair.quoteToken?.symbol ?? "").toUpperCase();
        const liqUsd = Number(bestPair.liquidity?.usd ?? NaN);
        const priceUsd = Number(bestPair.priceUsd ?? NaN);
        const priceNative = Number(bestPair.priceNative ?? NaN);

        let liqBnb: number | undefined;
        if (
          (quoteSym === "BNB" || quoteSym === "WBNB") &&
          Number.isFinite(liqUsd) &&
          Number.isFinite(priceUsd) &&
          Number.isFinite(priceNative) &&
          priceNative > 0
        ) {
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
          setError(e?.message || "Failed to load external pair reference");
          // Keep preferred Topaz pair URL if we already set it.
          if (!preferredPair) {
            setUrl(undefined);
            setBaseUrl(undefined);
          }
          setLiquidityBnb(undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [tokenAddress, preferredPair, chainHint]);

  return { url, baseUrl, liquidityBnb, loading, error };
}
