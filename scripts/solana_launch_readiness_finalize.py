#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise RuntimeError(f"{label}: start marker not found")
    b = text.find(end, a + len(start))
    if b < 0:
        raise RuntimeError(f"{label}: end marker not found")
    if text.find(start, a + len(start)) >= 0 and text.find(start, a + len(start)) < b:
        raise RuntimeError(f"{label}: ambiguous nested start marker")
    return text[:a] + replacement + text[b:]


def patch_server() -> None:
    rel = "realtime-indexer/src/server.ts"
    s = read(rel)

    s = replace_once(
        s,
        '      indexerBuild: "lp-fees-harvest-action-2026-08-05",',
        '      indexerBuild: "solana-v4-trades-2026-08-13",',
        "server health build marker",
    )

    s = replace_once(
        s,
        '''    const campaign = String(req.query.campaign || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(campaign)) {
      return res.status(400).json({ error: "Invalid campaign address" });
    }

    const channel = tokenChannel(chainId, campaign);''',
        '''    const campaignRaw = String(req.query.campaign || "").trim();
    const isSolanaCampaign = chainId === 101 && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(campaignRaw);
    const campaign = isSolanaCampaign ? campaignRaw : campaignRaw.toLowerCase();
    if (!isSolanaCampaign && !/^0x[a-f0-9]{40}$/.test(campaign)) {
      return res.status(400).json({ error: "Invalid campaign address" });
    }

    const channel = tokenChannel(chainId, campaign);''',
        "server Ably Solana campaign auth",
    )

    s = replace_once(
        s,
        '''  if ((r.rowCount ?? 0) > 0) {
    res.json(r.rows);
    // Still repair cursor in the background when history exists.
    void import("./emptyTradeCursorRewind.js")
      .then(({ rewindEmptyCampaignTradeCursor }) => rewindEmptyCampaignTradeCursor(chainId, campaign))
      .catch(() => undefined);
    return;
  }

  // Empty history: bounded ensure+backfill (paid RPC). Graduated tokens often need''',
        '''  if ((r.rowCount ?? 0) > 0) {
    res.json(r.rows);
    // EVM history can still repair its cursor in the background. Solana uses the
    // dedicated program-signature indexer and must never enter eth_getLogs recovery.
    if (chainId !== 101) {
      void import("./emptyTradeCursorRewind.js")
        .then(({ rewindEmptyCampaignTradeCursor }) => rewindEmptyCampaignTradeCursor(chainId, campaign))
        .catch(() => undefined);
    }
    return;
  }

  if (chainId === 101) {
    // Fast empty response while the Solana V4 indexer catches up. The frontend
    // polls and subscribes to Ably, so this converges without blocking the page.
    return res.json([]);
  }

  // Empty history: bounded ensure+backfill (paid RPC). Graduated tokens often need''',
        "server Solana trade empty fast path",
    )

    write(rel, s)


def patch_token_details() -> None:
    rel = "frontend/src/pages/TokenDetails.tsx"
    s = read(rel)

    s = replace_once(
        s,
        'import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";\n',
        'import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";\nimport { useSolUsdPrice } from "@/hooks/useSolUsdPrice";\n',
        "TokenDetails SOL USD import",
    )

    s = replace_once(
        s,
        'import { mergeTradePoints, SYNTHETIC_LOG_INDEX_MIN, tradeDedupeKey } from "@/lib/tradeDedupe";',
        'import { mergeTradePoints, normalizeTradeTxHash, SYNTHETIC_LOG_INDEX_MIN, tradeDedupeKey } from "@/lib/tradeDedupe";',
        "TokenDetails trade hash import",
    )

    s = replace_between(
        s,
        'function parseRawOrDecimalWei(value: unknown, kind: "ether" | "token"): bigint {',
        'function shortenAddress(addr?: string | null): string {',
        r'''function parseRawOrDecimalUnits(rawValue: unknown, decimalValue: unknown, decimals: number): bigint {
  if (typeof rawValue === "bigint") return rawValue;
  const raw = String(rawValue ?? "").trim();
  if (/^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      // fall through
    }
  }
  try {
    return ethers.parseUnits(String(decimalValue ?? "0"), decimals);
  } catch {
    return 0n;
  }
}

function tradeTimestampSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value > 1e12 ? value / 1000 : value);
  const raw = String(value ?? "").trim();
  if (!raw) return Math.floor(Date.now() / 1000);
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n > 1e12 ? n / 1000 : n) : Math.floor(Date.now() / 1000);
  }
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

function mergeCurveTradePoints(prev: CurveTradePoint[], next: CurveTradePoint[]) {
  return mergeTradePoints(prev, next);
}

function confirmedRowsToCurvePoints(
  rows: any[],
  campaignAddress: string,
  chainId: number,
  tokenDecimals: number,
): CurveTradePoint[] {
  const solana = isSolanaChainId(chainId);
  const campaign = solana ? String(campaignAddress || "").trim() : String(campaignAddress || "").toLowerCase();
  const nativeDecimals = solana ? 9 : 18;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const type = String(row?.side || row?.type || "").toLowerCase() === "sell" ? "sell" : "buy";
      const tokensWei = parseRawOrDecimalUnits(
        row?.token_amount_raw ?? row?.tokensWei,
        row?.token_amount ?? row?.tokens,
        tokenDecimals,
      );
      const nativeWei = parseRawOrDecimalUnits(
        row?.bnb_amount_raw ?? row?.nativeWei,
        row?.bnb_amount ?? row?.native,
        nativeDecimals,
      );
      const tokens = Number(ethers.formatUnits(tokensWei, tokenDecimals));
      const native = Number(ethers.formatUnits(nativeWei, nativeDecimals));
      const txHash = normalizeTradeTxHash(row?.tx_hash || row?.txHash);
      return {
        type,
        from: solana
          ? String(row?.wallet || row?.trader || row?.from || "").trim()
          : String(row?.wallet || row?.trader || row?.from || "").toLowerCase(),
        to: campaign,
        tokensWei,
        nativeWei,
        pricePerToken: Number(row?.price_bnb ?? row?.pricePerToken) || (tokens > 0 ? native / tokens : 0),
        timestamp: tradeTimestampSeconds(row?.timestamp ?? row?.block_time ?? row?.time),
        txHash,
        blockNumber: Number(row?.block_number ?? row?.blockNumber ?? 0),
        logIndex: Number(row?.log_index ?? row?.logIndex ?? 0),
      } satisfies CurveTradePoint;
    })
    .filter((point) => Boolean(point.txHash) && point.tokensWei > 0n && point.nativeWei >= 0n);
}

function getExplorerBase(chainId?: number): string {
  const id = Number(chainId ?? 0);
  if (id === 101) return "https://explorer.solana.com";
  if (id === 56) return "https://bscscan.com";
  if (id === 97) return "https://testnet.bscscan.com";
  return "https://bscscan.com";
}

''',
        "TokenDetails chain-aware confirmed trade converter",
    )

    s = replace_once(
        s,
        '''        if (n >= 1) return `${n.toFixed(4)} ${nativeUnit}`;
        if (n >= 0.01) return `${n.toFixed(6)} ${nativeUnit}`;
        return `${n.toPrecision(4)} ${nativeUnit}`;''',
        '''        if (n >= 1) return `${n.toFixed(4)} ${nativeUnit}`;
        if (n >= 0.01) return `${n.toFixed(6)} ${nativeUnit}`;
        const pretty = raw.replace(/0+$/, "").replace(/\.$/, "");
        return `${pretty || "0"} ${nativeUnit}`;''',
        "TokenDetails Solana price fixed notation",
    )

    s = replace_once(
        s,
        '''        if (n > 0 && n < 1e-9) return `<0.000000001 ${nativeUnit}`;
        if (n >= 1) return `${n.toFixed(4)} ${nativeUnit}`;
        if (n >= 0.01) return `${n.toFixed(6)} ${nativeUnit}`;
        return `${n.toPrecision(4)} ${nativeUnit}`;''',
        '''        if (n > 0 && n < 1e-9) return `<0.000000001 ${nativeUnit}`;
        if (n >= 1) return `${n.toFixed(4)} ${nativeUnit}`;
        if (n >= 0.01) return `${n.toFixed(6)} ${nativeUnit}`;
        const pretty = raw.replace(/0+$/, "").replace(/\.$/, "");
        return `${pretty || "0"} ${nativeUnit}`;''',
        "TokenDetails Solana native fixed notation",
    )

    s = replace_once(
        s,
        '''    if (p === 0) return `0 ${nativeUnit}`;
    if (p >= 1) return `${p.toFixed(2)} ${nativeUnit}`;''',
        '''    if (p === 0) return `0 ${nativeUnit}`;
    if (isSolanaPage && p > 0 && p < 0.01) {
      const pretty = p.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
      return `${pretty || "0"} ${nativeUnit}`;
    }
    if (p >= 1) return `${p.toFixed(2)} ${nativeUnit}`;''',
        "TokenDetails numeric SOL price fixed notation",
    )

    s = replace_between(
        s,
        '  // Read curve trades for transactions + analytics (live mode)\n',
        '  const liveCurvePointsSafe = useMemo<CurveTradePoint[]>(\n',
        r'''  // Read curve trades for transactions + analytics (BNB + Solana).
  const resolvedCampaignAddress = useMemo(() => {
    const raw = String(campaign?.campaign || campaignAddr || "").trim();
    if (isSolanaPage) {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw) ? raw : "";
    }
    const value = raw.toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(value) ? value : "";
  }, [campaign?.campaign, campaignAddr, isSolanaPage]);

  const hasValidCampaignAddress = Boolean(resolvedCampaignAddress);
  const localTradeStorageAddress = useMemo(
    () =>
      isSolanaPage
        ? String(campaign?.campaign || campaignAddr || "").trim()
        : resolvedCampaignAddress,
    [campaign?.campaign, campaignAddr, isSolanaPage, resolvedCampaignAddress],
  );

  const { points: liveCurvePoints, loading: liveCurveLoading, error: liveCurveError } = useCurveTrades(
    hasValidCampaignAddress ? resolvedCampaignAddress : undefined,
    {
      chainId: chainIdForStorage,
      enabled: hasValidCampaignAddress,
    },
  );
''',
        "TokenDetails enable Solana indexed curve trades",
    )

    s = replace_once(
        s,
        '''      const confirmedCampaign = String(detail?.campaignAddress || "").toLowerCase();
      if ((kind !== "buy" && kind !== "sell") || confirmedCampaign !== resolvedCampaignAddress) return;

      const points = confirmedRowsToCurvePoints(detail?.trades || [], resolvedCampaignAddress);''',
        '''      const confirmedRaw = String(detail?.campaignAddress || "").trim();
      const confirmedCampaign = isSolanaPage ? confirmedRaw : confirmedRaw.toLowerCase();
      if ((kind !== "buy" && kind !== "sell") || confirmedCampaign !== resolvedCampaignAddress) return;

      const points = confirmedRowsToCurvePoints(
        detail?.trades || [],
        resolvedCampaignAddress,
        chainIdForStorage,
        tokenDecimals,
      );''',
        "TokenDetails confirmation identity",
    )

    s = replace_once(
        s,
        '  }, [hasValidCampaignAddress, resolvedCampaignAddress]);\n\n  // Prevent chart flicker:',
        '  }, [hasValidCampaignAddress, resolvedCampaignAddress, isSolanaPage, chainIdForStorage, tokenDecimals]);\n\n  // Prevent chart flicker:',
        "TokenDetails confirmation dependencies",
    )

    spot_marker = '  // Realtime stats from Railway (price/marketcap/24h vol), patched via Ably.\n'
    spot_helper = r'''  const solanaSpotNative = useMemo(() => {
    if (!isSolanaPage || !solanaCurve || solanaCurve.economicsVersion < 2) return null;
    const decimals = Number(solanaCurve.tokenDecimals || 6);
    const tokenScale = 10 ** decimals;
    const soldWhole = Number(solanaCurve.soldTokens) / tokenScale;
    const baseLamports = Number(solanaCurve.basePriceLamports);
    const slopeRaw = Number(solanaCurve.priceSlopeLamports);
    if (![soldWhole, baseLamports, slopeRaw].every(Number.isFinite)) return null;
    const slopeLamports = solanaCurve.economicsVersion >= 3
      ? (slopeRaw * soldWhole) / 1_000_000_000
      : slopeRaw * soldWhole;
    const spotSol = (baseLamports + slopeLamports) / 1_000_000_000;
    return Number.isFinite(spotSol) && spotSol > 0 ? spotSol : null;
  }, [isSolanaPage, solanaCurve]);

'''
    s = replace_once(s, spot_marker, spot_helper + spot_marker, "TokenDetails V3 marginal spot helper")

    s = replace_once(
        s,
        '''    const endPrice =
      (contractGraduatedEarly && topazMarket.priceBnb != null ? Number(topazMarket.priceBnb) : undefined) ??
      (rtStats?.lastPriceBnb != null ? Number(rtStats.lastPriceBnb) : undefined) ??
      (metrics?.currentPrice != null && metrics.currentPrice > 0n
        ? Number(ethers.formatUnits(metrics.currentPrice, isSolanaPage ? 9 : 18))
        : undefined);''',
        '''    const endPrice =
      (isSolanaPage && solanaSpotNative != null ? solanaSpotNative : undefined) ??
      (contractGraduatedEarly && topazMarket.priceBnb != null ? Number(topazMarket.priceBnb) : undefined) ??
      (rtStats?.lastPriceBnb != null ? Number(rtStats.lastPriceBnb) : undefined) ??
      (metrics?.currentPrice != null && metrics.currentPrice > 0n
        ? Number(ethers.formatUnits(metrics.currentPrice, isSolanaPage ? 9 : 18))
        : undefined);''',
        "TokenDetails timeframe V3 spot",
    )

    s = replace_once(
        s,
        '  }, [contractGraduatedEarly, marketTradePoints, metrics, rtStats?.lastPriceBnb, topazMarket.priceBnb]);',
        '  }, [contractGraduatedEarly, isSolanaPage, marketTradePoints, metrics, rtStats?.lastPriceBnb, solanaSpotNative, topazMarket.priceBnb]);',
        "TokenDetails timeframe spot dependencies",
    )

    s = replace_once(
        s,
        '''    if (!contractGraduatedEarly && metrics?.currentPrice != null && metrics?.sold != null) {
      try {
        const mcWei = (metrics.currentPrice * metrics.sold) / 10n ** BigInt(isSolanaPage ? tokenDecimals : 18);
        bondingMcapLabel = formatBnbFromWei(mcWei);
      } catch {
        bondingMcapLabel = null;
      }
    }''',
        '''    if (!contractGraduatedEarly && metrics?.sold != null) {
      try {
        if (isSolanaPage && solanaSpotNative != null) {
          const soldWhole = Number(ethers.formatUnits(metrics.sold, tokenDecimals));
          const mcapNative = soldWhole * solanaSpotNative;
          bondingMcapLabel = Number.isFinite(mcapNative) ? `${formatCompact(mcapNative)} ${nativeUnit}` : null;
        } else if (metrics.currentPrice != null) {
          const mcWei = (metrics.currentPrice * metrics.sold) / 10n ** 18n;
          bondingMcapLabel = formatBnbFromWei(mcWei);
        }
      } catch {
        bondingMcapLabel = null;
      }
    }''',
        "TokenDetails V3 bonding market cap",
    )

    s = replace_once(
        s,
        '''      price:
        topazPrice != null && Number.isFinite(topazPrice) && topazPrice > 0
          ? formatPriceBnb(topazPrice)
          : !contractGraduatedEarly && metrics?.currentPrice != null
            ? formatPriceFromWei(metrics.currentPrice)
            : rtPrice != null && Number.isFinite(rtPrice)
              ? formatPriceBnb(rtPrice)
              : formatPriceFromWei(metrics?.currentPrice ?? null),''',
        '''      price:
        topazPrice != null && Number.isFinite(topazPrice) && topazPrice > 0
          ? formatPriceBnb(topazPrice)
          : !contractGraduatedEarly && isSolanaPage && solanaSpotNative != null
            ? formatPriceBnb(solanaSpotNative)
            : !contractGraduatedEarly && metrics?.currentPrice != null
              ? formatPriceFromWei(metrics.currentPrice)
              : rtPrice != null && Number.isFinite(rtPrice)
                ? formatPriceBnb(rtPrice)
                : formatPriceFromWei(metrics?.currentPrice ?? null),''',
        "TokenDetails V3 token price",
    )

    s = replace_once(
        s,
        '  }, [campaign, contractGraduatedEarly, curveReserveWei, metrics, summary, timeframeTiles, rtStats, topazMarket.liquidityBnb, topazMarket.marketCapBnb, topazMarket.priceBnb, nativeUnit]);',
        '  }, [campaign, contractGraduatedEarly, curveReserveWei, isSolanaPage, metrics, nativeUnit, solanaSpotNative, summary, timeframeTiles, tokenDecimals, rtStats, topazMarket.liquidityBnb, topazMarket.marketCapBnb, topazMarket.priceBnb]);',
        "TokenDetails tokenData dependencies",
    )

    usd_start = '  // Keep USD reference price available for UI conversions and ATH tracking.\n'
    usd_end = '  const flywheel = useMemo(() => {\n'
    usd_section = r'''  // Native/USD reference for TokenDetails conversions: BNB on EVM, SOL on Solana.
  const { price: bnbUsdPrice, loading: bnbUsdLoading } = useBnbUsdPrice(!isSolanaPage);
  const { price: liveSolUsdPrice, loading: solUsdLoading } = useSolUsdPrice(isSolanaPage);
  const nativeUsdPrice = isSolanaPage ? liveSolUsdPrice : bnbUsdPrice;
  const nativeUsdLoading = isSolanaPage ? solUsdLoading : bnbUsdLoading;

  const nativeUsd = useMemo(() => {
    if (nativeUsdPrice == null) return null;
    const n = Number(nativeUsdPrice);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!isSolanaPage && n > 100_000) return n / 1e18;
    return n;
  }, [isSolanaPage, nativeUsdPrice]);

  const marketCapDisplay = useMemo(() => {
    const nativeLabel = tokenData.marketCap;
    if (displayDenom === "BNB") return nativeLabel;
    const marketCapNative =
      parseBnbLabel(nativeLabel) ??
      (rtStats?.marketcapBnb != null && Number.isFinite(rtStats.marketcapBnb)
        ? Number(rtStats.marketcapBnb)
        : null);
    if (marketCapNative == null) return "—";
    if (!nativeUsd) return nativeUsdLoading ? "…" : "—";
    return formatCompactUsd(marketCapNative * nativeUsd);
  }, [displayDenom, nativeUsd, nativeUsdLoading, rtStats?.marketcapBnb, tokenData.marketCap]);

  const marketCapUsdLabel = useMemo(() => {
    const marketCapNative =
      parseBnbLabel(tokenData.marketCap) ??
      (rtStats?.marketcapBnb != null && Number.isFinite(rtStats.marketcapBnb)
        ? Number(rtStats.marketcapBnb)
        : null);
    if (marketCapNative == null || !nativeUsd) return null;
    const usd = marketCapNative * nativeUsd;
    return Number.isFinite(usd) && usd > 0 ? formatCompactUsd(usd) : null;
  }, [nativeUsd, rtStats?.marketcapBnb, tokenData.marketCap]);

  const priceDisplay = useMemo(() => {
    const fromSolanaSpot = isSolanaPage ? solanaSpotNative : null;
    const fromWei =
      metrics?.currentPrice != null && metrics.currentPrice > 0n
        ? Number(ethers.formatUnits(metrics.currentPrice, isSolanaPage ? 9 : 18))
        : null;
    const fromTopaz =
      contractGraduatedEarly && topazMarket.priceBnb != null && Number.isFinite(topazMarket.priceBnb) && topazMarket.priceBnb > 0
        ? Number(topazMarket.priceBnb)
        : null;
    const fromRt =
      rtStats?.lastPriceBnb != null && Number.isFinite(rtStats.lastPriceBnb) && rtStats.lastPriceBnb > 0
        ? Number(rtStats.lastPriceBnb)
        : null;
    const fromUnified = unifiedMarket.summary?.last_price_bnb != null
      ? Number(unifiedMarket.summary.last_price_bnb)
      : null;
    const fromTrades = (() => {
      const pts = Array.isArray(marketTradePoints) ? marketTradePoints : [];
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = Number((pts[i] as any)?.pricePerToken ?? 0);
        if (Number.isFinite(p) && p > 0) return p;
      }
      return null;
    })();

    const priceNative =
      fromSolanaSpot ??
      (contractGraduatedEarly ? fromTopaz : null) ??
      fromWei ??
      fromRt ??
      (Number.isFinite(fromUnified) && (fromUnified as number) > 0 ? (fromUnified as number) : null) ??
      fromTrades ??
      parseBnbLabel(tokenData.price);

    if (priceNative == null || !Number.isFinite(priceNative) || priceNative <= 0) {
      return tokenData.price && tokenData.price !== "—" ? tokenData.price : "—";
    }
    if (displayDenom === "BNB") return formatPriceBnb(priceNative);
    if (!nativeUsd) return nativeUsdLoading ? "…" : formatPriceBnb(priceNative);
    return formatCompactUsd(priceNative * nativeUsd);
  }, [
    contractGraduatedEarly,
    displayDenom,
    isSolanaPage,
    marketTradePoints,
    metrics?.currentPrice,
    nativeUsd,
    nativeUsdLoading,
    rtStats?.lastPriceBnb,
    solanaSpotNative,
    tokenData.price,
    topazMarket.priceBnb,
    unifiedMarket.summary?.last_price_bnb,
  ]);

  const volumeDisplay = useMemo(() => {
    const nativeLabel = tokenData.metrics[selectedTimeframe]?.volume ?? "—";
    if (displayDenom === "BNB") return nativeLabel;
    const volumeNative = parseBnbLabel(nativeLabel);
    if (volumeNative == null) return "—";
    if (!nativeUsd) return nativeUsdLoading ? "…" : "—";
    return formatCompactUsd(volumeNative * nativeUsd);
  }, [displayDenom, nativeUsd, nativeUsdLoading, selectedTimeframe, tokenData.metrics]);

  const formatBnbOrUsd = useMemo(() => {
    return (native: number | null | undefined): string => {
      if (native == null || !Number.isFinite(native)) return "—";
      if (displayDenom === "BNB") return `${formatCompact(native)} ${nativeUnit}`;
      if (!nativeUsd) return nativeUsdLoading ? "…" : "—";
      return formatCompactUsd(native * nativeUsd);
    };
  }, [displayDenom, nativeUnit, nativeUsd, nativeUsdLoading]);

'''
    s = replace_between(s, usd_start, usd_end, usd_section, "TokenDetails native USD conversions")

    s = replace_once(
        s,
        '        buyers: String(solanaCurve.buyerCount),',
        '''        buyers: String(
          new Set(
            marketTradePoints
              .filter((point) => point.type === "buy" && point.from)
              .map((point) => String(point.from).trim()),
          ).size || Number(solanaCurve.buyerCount),
        ),''',
        "TokenDetails indexed Solana buyer count",
    )
    s = replace_once(
        s,
        '  }, [activity, metrics, formatBnbOrUsd, isSolanaPage, solanaCurve]);',
        '  }, [activity, metrics, formatBnbOrUsd, isSolanaPage, marketTradePoints, solanaCurve]);',
        "TokenDetails flywheel dependencies",
    )

    s = replace_once(
        s,
        '''    for (const p of combinedCurvePointsSafe) {
      const addr = (p.from || "").toLowerCase();''',
        '''    for (const p of marketTradePoints) {
      const rawAddr = String(p.from || "").trim();
      const addr = isSolanaPage ? rawAddr : rawAddr.toLowerCase();''',
        "TokenDetails holder source and base58 casing",
    )
    s = replace_once(
        s,
        '  }, [combinedCurvePointsSafe, metrics?.liquiditySupply, metrics?.launched, metrics?.finalizedAt]);',
        '  }, [isSolanaPage, marketTradePoints, metrics?.liquiditySupply, metrics?.launched, metrics?.finalizedAt]);',
        "TokenDetails holder dependencies",
    )

    s = replace_once(
        s,
        '''        // V2 marginal spot is lamports per WHOLE token. soldTokens is raw SPL units.
        // V3 fixed-point slope will override this in the economics upgrade; keep V1/V2 dimensional math correct here.
        const tokenScale = 10n ** BigInt(state.tokenDecimals);
        const spot =
          state.basePriceLamports +
          (state.priceSlopeLamports * state.soldTokens) / tokenScale;''',
        '''        // Marginal spot stored in CampaignMetrics is integer lamports. V3 keeps
        // the precise sub-lamport component in solanaSpotNative for display/chart math.
        const tokenScale = 10n ** BigInt(state.tokenDecimals);
        const slopeDenominator = state.economicsVersion >= 3
          ? tokenScale * 1_000_000_000n
          : tokenScale;
        const spot =
          state.basePriceLamports +
          (state.priceSlopeLamports * state.soldTokens) / slopeDenominator;''',
        "TokenDetails V3 fixed-point marginal spot",
    )

    write(rel, s)


def patch_lib_rs() -> None:
    rel = "programs/memewarzone_solana/src/lib.rs"
    s = read(rel)

    s = replace_once(
        s,
        '''pub const ECONOMICS_VERSION_V1: u16 = 1;
/// BNB-parity linear curve: base/slope priced per whole token (÷ 10^decimals), like LaunchCampaign WAD.
pub const ECONOMICS_VERSION_V2: u16 = 2;
pub const CURVE_KIND_LINEAR_V1: u8 = 1;''',
        '''pub const ECONOMICS_VERSION_V1: u16 = 1;
/// Whole-token linear curve used by the legacy flat Devnet V2 generation.
pub const ECONOMICS_VERSION_V2: u16 = 2;
/// BNB-parity fixed-point curve. price_slope_lamports is nano-lamports per whole-token².
pub const ECONOMICS_VERSION_V3: u16 = 3;
pub const CURVE_KIND_LINEAR_V1: u8 = 1;''',
        "lib.rs V3 constant",
    )

    s = replace_once(
        s,
        '''        settings.economics_version == ECONOMICS_VERSION_V1
            || settings.economics_version == ECONOMICS_VERSION_V2,''',
        '''        settings.economics_version == ECONOMICS_VERSION_V1
            || settings.economics_version == ECONOMICS_VERSION_V2
            || settings.economics_version == ECONOMICS_VERSION_V3,''',
        "lib.rs V3 validation allowlist",
    )

    s = replace_once(
        s,
        '''    // V1 required slope > 0 (legacy). V2 allows slope = 0 for flat early bonding
    // (BNB-like: base dominates; slope optional for later steepness).
    if settings.economics_version < ECONOMICS_VERSION_V2 {
        require!(
            settings.price_slope_lamports > 0,
            LaunchpadError::InvalidGenerationEconomics
        );
    }''',
        '''    // Preserve the already-deployed V2 flat generation, but all new BNB-parity
    // V3 generations require a non-zero fixed-point slope (same invariant as BNB).
    if settings.economics_version == ECONOMICS_VERSION_V1
        || settings.economics_version >= ECONOMICS_VERSION_V3
    {
        require!(
            settings.price_slope_lamports > 0,
            LaunchpadError::InvalidGenerationEconomics
        );
    }''',
        "lib.rs V3 slope invariant",
    )

    test_marker = '''    #[test]
    fn generation_economics_reject_fee_drift() {'''
    test_block = '''    #[test]
    fn generation_economics_v3_requires_fixed_point_slope() {
        let global = sample_global();
        let mut settings = sample_generation();
        settings.economics_version = ECONOMICS_VERSION_V3;
        settings.price_slope_lamports = 850;
        assert!(validate_generation_settings(&global, &settings).is_ok());

        settings.price_slope_lamports = 0;
        assert!(validate_generation_settings(&global, &settings).is_err());
    }

'''
    s = replace_once(s, test_marker, test_block + test_marker, "lib.rs V3 tests")
    write(rel, s)


def patch_authorized_trade() -> None:
    rel = "programs/memewarzone_solana/src/authorized_trade.rs"
    s = read(rel)

    s = replace_once(
        s,
        '    ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, GLOBAL_CONFIG_SEED, RISK_PROFILE_SEED,',
        '    ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, ECONOMICS_VERSION_V3, GLOBAL_CONFIG_SEED, RISK_PROFILE_SEED,',
        "authorized_trade V3 import",
    )

    s = replace_once(
        s,
        'const ED25519_CURRENT_INSTRUCTION: u16 = u16::MAX;\n',
        'const ED25519_CURRENT_INSTRUCTION: u16 = u16::MAX;\nconst SLOPE_NANO_LAMPORT_SCALE: u128 = 1_000_000_000;\n',
        "authorized_trade V3 slope scale",
    )

    cost_marker = 'pub fn checked_linear_curve_cost(\n'
    v3_cost = r'''/// BNB-parity V3 cost. base stays lamports/whole-token; slope is stored as
/// nano-lamports/whole-token² so the BNB-equivalent 850 wei slope is representable.
pub fn checked_linear_curve_cost_v3(
    base_price_lamports: u64,
    price_slope_nano_lamports: u64,
    start_supply: u64,
    token_amount: u64,
    token_decimals: u8,
) -> Result<u64> {
    if token_amount == 0 {
        return Ok(0);
    }
    let scale = token_scale(token_decimals)?;
    let a = u128::from(token_amount);
    let s = u128::from(start_supply);
    let base = u128::from(base_price_lamports);
    let slope = u128::from(price_slope_nano_lamports);

    let linear = a
        .checked_mul(base)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(scale)
        .ok_or(LaunchpadError::MathOverflow)?;

    let two_sa = s
        .checked_mul(a)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_mul(2)
        .ok_or(LaunchpadError::MathOverflow)?;
    let a2 = a.checked_mul(a).ok_or(LaunchpadError::MathOverflow)?;
    let numer = two_sa.checked_add(a2).ok_or(LaunchpadError::MathOverflow)?;
    let scale2 = scale.checked_mul(scale).ok_or(LaunchpadError::MathOverflow)?;
    let denom = scale2
        .checked_mul(2)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_mul(SLOPE_NANO_LAMPORT_SCALE)
        .ok_or(LaunchpadError::MathOverflow)?;
    let slope_term = slope
        .checked_mul(numer)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(denom)
        .ok_or(LaunchpadError::MathOverflow)?;

    let total = linear
        .checked_add(slope_term)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(total <= u128::from(u64::MAX), LaunchpadError::MathOverflow);
    Ok(total as u64)
}

'''
    s = replace_once(s, cost_marker, v3_cost + cost_marker, "authorized_trade V3 cost function")

    s = replace_once(
        s,
        '''    if economics_version >= ECONOMICS_VERSION_V2 {
        checked_linear_curve_cost_v2(
            base_price_lamports,
            price_slope_lamports,
            start_supply,
            token_amount,
            token_decimals,
        )
    } else {''',
        '''    if economics_version >= ECONOMICS_VERSION_V3 {
        checked_linear_curve_cost_v3(
            base_price_lamports,
            price_slope_lamports,
            start_supply,
            token_amount,
            token_decimals,
        )
    } else if economics_version >= ECONOMICS_VERSION_V2 {
        checked_linear_curve_cost_v2(
            base_price_lamports,
            price_slope_lamports,
            start_supply,
            token_amount,
            token_decimals,
        )
    } else {''',
        "authorized_trade V3 cost dispatch",
    )

    sell_marker = '/// Gross SOL refund for selling `token_amount` (exact tokens-in quote, pre-fee).\n'
    v3_buy_quote = r'''/// V3 exact-SOL-in quote with BNB fee semantics: find the most tokens whose
/// curve cost + fee(curve cost) fits inside the authorized gross input.
pub fn quote_buy_tokens_v3_gross(
    base_price_lamports: u64,
    price_slope_nano_lamports: u64,
    sold_tokens: u64,
    curve_token_supply: u64,
    gross_lamports: u64,
    fee_bps: u16,
    token_decimals: u8,
) -> Result<(u64, u64, u64, u64)> {
    require!(gross_lamports > 0, LaunchpadError::InvalidTradeAmount);
    require!(base_price_lamports > 0, LaunchpadError::InvalidTradeAmount);
    require!(sold_tokens < curve_token_supply, LaunchpadError::CurveSupplyExhausted);

    let scale = token_scale(token_decimals)?;
    let remaining = curve_token_supply
        .checked_sub(sold_tokens)
        .ok_or(LaunchpadError::MathOverflow)?;
    let max_by_base = u128::from(gross_lamports)
        .checked_mul(scale)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(u128::from(base_price_lamports))
        .ok_or(LaunchpadError::MathOverflow)?;
    let mut high = u64::try_from(max_by_base.min(u128::from(u64::MAX)))
        .unwrap_or(u64::MAX)
        .min(remaining);
    let mut low = 0u64;

    while low < high {
        let mid = low
            .checked_add(
                high.checked_sub(low)
                    .ok_or(LaunchpadError::MathOverflow)?
                    .checked_add(1)
                    .ok_or(LaunchpadError::MathOverflow)?
                    .checked_div(2)
                    .ok_or(LaunchpadError::MathOverflow)?,
            )
            .ok_or(LaunchpadError::MathOverflow)?;
        let fits = match checked_linear_curve_cost_v3(
            base_price_lamports,
            price_slope_nano_lamports,
            sold_tokens,
            mid,
            token_decimals,
        ) {
            Ok(curve_cost) => match calculate_fee(curve_cost, fee_bps) {
                Ok(fee) => curve_cost
                    .checked_add(fee)
                    .map(|total| total <= gross_lamports)
                    .unwrap_or(false),
                Err(_) => false,
            },
            Err(_) => false,
        };
        if fits {
            low = mid;
        } else {
            high = mid.checked_sub(1).ok_or(LaunchpadError::MathOverflow)?;
        }
    }

    require!(low > 0, LaunchpadError::InvalidTradeAmount);
    let curve_cost = checked_linear_curve_cost_v3(
        base_price_lamports,
        price_slope_nano_lamports,
        sold_tokens,
        low,
        token_decimals,
    )?;
    let fee = calculate_fee(curve_cost, fee_bps)?;
    let total_spent = curve_cost
        .checked_add(fee)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(total_spent <= gross_lamports, LaunchpadError::MathOverflow);
    Ok((low, curve_cost, fee, total_spent))
}

'''
    s = replace_once(s, sell_marker, v3_buy_quote + sell_marker, "authorized_trade V3 gross buy quote")

    s = replace_once(
        s,
        '''        fee,
        net,
        tokens_out,
        was_zero_sold,
        creator_bought_update,''',
        '''        fee,
        net,
        lamports_spent,
        tokens_out,
        buy_volume_increment,
        was_zero_sold,
        creator_bought_update,''',
        "authorized_trade buy tuple destructure",
    )

    s = replace_once(
        s,
        '''        let fee = calculate_fee(args.lamports_in, campaign.buy_fee_bps)?;
        let net = args
            .lamports_in
            .checked_sub(fee)
            .ok_or(LaunchpadError::MathOverflow)?;
        require!(net > 0, LaunchpadError::InvalidTradeAmount);

        let tokens_out = quote_buy_tokens(
            campaign.economics_version,
            campaign.base_price_lamports,
            campaign.price_slope_lamports,
            campaign.sold_tokens,
            campaign.curve_token_supply,
            net,
            campaign.token_decimals,
        )?;''',
        '''        let (tokens_out, net, fee, lamports_spent) =
            if campaign.economics_version >= ECONOMICS_VERSION_V3 {
                let (tokens, curve_cost, curve_fee, total_spent) = quote_buy_tokens_v3_gross(
                    campaign.base_price_lamports,
                    campaign.price_slope_lamports,
                    campaign.sold_tokens,
                    campaign.curve_token_supply,
                    args.lamports_in,
                    campaign.buy_fee_bps,
                    campaign.token_decimals,
                )?;
                (tokens, curve_cost, curve_fee, total_spent)
            } else {
                let legacy_fee = calculate_fee(args.lamports_in, campaign.buy_fee_bps)?;
                let legacy_net = args
                    .lamports_in
                    .checked_sub(legacy_fee)
                    .ok_or(LaunchpadError::MathOverflow)?;
                require!(legacy_net > 0, LaunchpadError::InvalidTradeAmount);
                let tokens = quote_buy_tokens(
                    campaign.economics_version,
                    campaign.base_price_lamports,
                    campaign.price_slope_lamports,
                    campaign.sold_tokens,
                    campaign.curve_token_supply,
                    legacy_net,
                    campaign.token_decimals,
                )?;
                (tokens, legacy_net, legacy_fee, args.lamports_in)
            };''',
        "authorized_trade V3 BNB fee semantics",
    )

    s = replace_once(
        s,
        '''            fee,
            net,
            tokens_out,
            campaign.sold_tokens == 0,
            creator_bought_update,''',
        '''            fee,
            net,
            lamports_spent,
            tokens_out,
            if campaign.economics_version >= ECONOMICS_VERSION_V3 {
                net
            } else {
                lamports_spent
            },
            campaign.sold_tokens == 0,
            creator_bought_update,''',
        "authorized_trade buy tuple values",
    )

    s = replace_once(
        s,
        '&system_instruction::transfer(&trader, &sol_vault_key, args.lamports_in),',
        '&system_instruction::transfer(&trader, &sol_vault_key, lamports_spent),',
        "authorized_trade V3 actual spend transfer",
    )

    s = replace_once(
        s,
        '''    campaign.total_buy_volume_lamports = campaign
        .total_buy_volume_lamports
        .checked_add(args.lamports_in)''',
        '''    campaign.total_buy_volume_lamports = campaign
        .total_buy_volume_lamports
        .checked_add(buy_volume_increment)''',
        "authorized_trade BNB-style V3 buy volume",
    )

    s = replace_once(
        s,
        '        lamports_in: args.lamports_in,',
        '        lamports_in: lamports_spent,',
        "authorized_trade V3 event actual spend",
    )

    test_marker = '''    #[test]
    fn quote_buy_roundtrip_v1() {'''
    test_block = '''    #[test]
    fn quote_buy_v3_same_size_buy_gets_fewer_tokens() {
        let gross = 1_000_000u64; // 0.001 SOL
        let supply = 840_000_000_000_000u64;
        let (first_tokens, first_cost, first_fee, first_total) = quote_buy_tokens_v3_gross(
            1, 850, 0, supply, gross, 200, 6,
        )
        .unwrap();
        let (second_tokens, _, _, second_total) = quote_buy_tokens_v3_gross(
            1, 850, first_tokens, supply, gross, 200, 6,
        )
        .unwrap();

        assert!(first_tokens > 0);
        assert!(second_tokens > 0);
        assert!(second_tokens < first_tokens);
        assert_eq!(first_total, first_cost + first_fee);
        assert!(first_total <= gross);
        assert!(second_total <= gross);

        let refund = quote_sell_refund(
            ECONOMICS_VERSION_V3,
            1,
            850,
            first_tokens,
            first_tokens,
            6,
        )
        .unwrap();
        assert_eq!(refund, first_cost);
    }

'''
    s = replace_once(s, test_marker, test_block + test_marker, "authorized_trade V3 regression tests")

    write(rel, s)


def patch_solana_trade_ts() -> None:
    rel = "frontend/src/lib/solanaTradeV1.ts"
    s = read(rel)

    s = replace_once(
        s,
        '''  // V2: area(x) = x*base/scale + slope*x^2/(2*scale^2); cost = area(s+a)-area(s)
  const scale = 10n ** BigInt(Math.max(0, Math.min(18, tokenDecimals)));
  const a = tokenAmount;
  const s = startSupply;
  const linear = (a * basePrice) / scale;
  const slopeTerm = (slope * (2n * s * a + a * a)) / (2n * scale * scale);
  return linear + slopeTerm;''',
        '''  // V2: integer lamport slope. V3: fixed-point nano-lamport slope.
  const scale = 10n ** BigInt(Math.max(0, Math.min(18, tokenDecimals)));
  const a = tokenAmount;
  const s = startSupply;
  const linear = (a * basePrice) / scale;
  const slopeScale = economicsVersion >= 3 ? 1_000_000_000n : 1n;
  const slopeTerm = (slope * (2n * s * a + a * a)) / (2n * scale * scale * slopeScale);
  return linear + slopeTerm;''',
        "solanaTradeV1 V3 cost",
    )

    old_buy = '''export function quoteBuyExactSolIn(input: {
  lamportsIn: bigint;
  basePrice: bigint;
  slope: bigint;
  sold: bigint;
  curveSupply: bigint;
  buyFeeBps: number;
  economicsVersion?: number;
  tokenDecimals?: number;
}): { feeLamports: bigint; netLamports: bigint; tokensOut: bigint } {
  const feeLamports = calculateFee(input.lamportsIn, input.buyFeeBps);
  const netLamports = input.lamportsIn > feeLamports ? input.lamportsIn - feeLamports : 0n;
  const tokensOut = quoteBuyTokens(
    input.basePrice,
    input.slope,
    input.sold,
    input.curveSupply,
    netLamports,
    input.economicsVersion ?? 2,
    input.tokenDecimals ?? 6,
  );
  return { feeLamports, netLamports, tokensOut };
}'''
    new_buy = '''export function quoteBuyExactSolIn(input: {
  lamportsIn: bigint;
  basePrice: bigint;
  slope: bigint;
  sold: bigint;
  curveSupply: bigint;
  buyFeeBps: number;
  economicsVersion?: number;
  tokenDecimals?: number;
}): { feeLamports: bigint; netLamports: bigint; tokensOut: bigint; totalSpentLamports?: bigint } {
  const economicsVersion = input.economicsVersion ?? 2;
  const tokenDecimals = input.tokenDecimals ?? 6;

  if (economicsVersion >= 3) {
    if (input.lamportsIn <= 0n || input.basePrice <= 0n || input.sold >= input.curveSupply) {
      return { feeLamports: 0n, netLamports: 0n, tokensOut: 0n, totalSpentLamports: 0n };
    }
    const scale = 10n ** BigInt(Math.max(0, Math.min(18, tokenDecimals)));
    const remaining = input.curveSupply - input.sold;
    let high = (input.lamportsIn * scale) / input.basePrice;
    if (high > remaining) high = remaining;
    let low = 0n;
    while (low < high) {
      const mid = low + (high - low + 1n) / 2n;
      const curveCost = checkedLinearCurveCost(
        input.basePrice,
        input.slope,
        input.sold,
        mid,
        economicsVersion,
        tokenDecimals,
      );
      const fee = calculateFee(curveCost, input.buyFeeBps);
      if (curveCost + fee <= input.lamportsIn) low = mid;
      else high = mid - 1n;
    }
    if (low <= 0n) {
      return { feeLamports: 0n, netLamports: 0n, tokensOut: 0n, totalSpentLamports: 0n };
    }
    const netLamports = checkedLinearCurveCost(
      input.basePrice,
      input.slope,
      input.sold,
      low,
      economicsVersion,
      tokenDecimals,
    );
    const feeLamports = calculateFee(netLamports, input.buyFeeBps);
    return {
      feeLamports,
      netLamports,
      tokensOut: low,
      totalSpentLamports: netLamports + feeLamports,
    };
  }

  const feeLamports = calculateFee(input.lamportsIn, input.buyFeeBps);
  const netLamports = input.lamportsIn > feeLamports ? input.lamportsIn - feeLamports : 0n;
  const tokensOut = quoteBuyTokens(
    input.basePrice,
    input.slope,
    input.sold,
    input.curveSupply,
    netLamports,
    economicsVersion,
    tokenDecimals,
  );
  return { feeLamports, netLamports, tokensOut, totalSpentLamports: input.lamportsIn };
}'''
    s = replace_once(s, old_buy, new_buy, "solanaTradeV1 V3 gross buy quote")
    write(rel, s)


def main() -> None:
    patch_server()
    patch_token_details()
    patch_lib_rs()
    patch_authorized_trade()
    patch_solana_trade_ts()
    print("[solana-launch-readiness] asserted source transforms applied")
    print("[solana-launch-readiness] files: server.ts TokenDetails.tsx lib.rs authorized_trade.rs solanaTradeV1.ts")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[solana-launch-readiness] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
