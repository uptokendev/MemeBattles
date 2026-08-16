from pathlib import Path

p = Path('frontend/src/components/token/UnifiedMarketChart.tsx')
s = p.read_text()

old = '''  solanaCurvePricing,
  solanaGraduated = false,
  liveSupplyWhole = null,
  nativeUsdPrice,'''
new = '''  solanaCurvePricing,
  solanaGraduated = false,
  livePriceNative = null,
  liveSupplyWhole = null,
  nativeUsdPrice,'''
if old not in s:
    raise SystemExit('props target not found')
s = s.replace(old, new, 1)

old = '''  const data = useMemo(() => {
    if (!seriesPoints.length && !(marketCandles || []).length) return [] as CandleRow[];
    const fromTrades = buildCandles(seriesPoints, intervalSeconds, {
      extendToNow: false,
      maxGapFillBuckets: 0,
      genesisFromZero: false,
    }).candles as CandleRow[];
    const fromServer = marketCandlesForChart(marketCandles, marketState, metric, denomination, nativeUsd, tokenDecimals);
    return authoritativeCandleData(fromTrades, fromServer);
  }, [denomination, intervalSeconds, marketCandles, marketState, metric, nativeUsd, seriesPoints, tokenDecimals]);'''
new = '''  const data = useMemo(() => {
    const hasHistoricalData = seriesPoints.length > 0 || (marketCandles || []).length > 0;
    const livePrice = Number(livePriceNative);
    const liveSupply = Number(liveSupplyWhole);
    const hasGraduatedSolanaSpot =
      solana &&
      solanaGraduated &&
      Number.isFinite(livePrice) &&
      livePrice > 0 &&
      (metric === "price" || (Number.isFinite(liveSupply) && liveSupply > 0)) &&
      (denomination !== "USD" || nativeUsd > 0);

    if (!hasHistoricalData && !hasGraduatedSolanaSpot) return [] as CandleRow[];

    const fromTrades = buildCandles(seriesPoints, intervalSeconds, {
      extendToNow: false,
      maxGapFillBuckets: 0,
      genesisFromZero: false,
    }).candles as CandleRow[];
    const fromServer = marketCandlesForChart(marketCandles, marketState, metric, denomination, nativeUsd, tokenDecimals);
    const authoritative = authoritativeCandleData(fromTrades, fromServer);

    // A graduated Solana campaign can have a live Meteora pool before the first
    // DEX swap is indexed. Keep the chart's right edge on the exact same live
    // pool-price x fixed-supply basis as the TokenDetails headline. This is only
    // a visual live overlay; durable bonding/DEX history remains server-authoritative.
    if (!hasGraduatedSolanaSpot) return authoritative;

    const liveNativeValue = metric === "marketcap" ? livePrice * liveSupply : livePrice;
    const liveValue = denomination === "USD" ? liveNativeValue * nativeUsd : liveNativeValue;
    if (!Number.isFinite(liveValue) || liveValue <= 0) return authoritative;

    const nowSec = Math.floor(Date.now() / 1000);
    const bucketSec = Math.floor(nowSec / intervalSeconds) * intervalSeconds;
    const rows = authoritative.map((row) => ({ ...row }));
    const last = rows[rows.length - 1];
    const lastSec = last ? timeToSec(last.time) : 0;

    if (last && lastSec === bucketSec) {
      last.high = Math.max(last.high, liveValue);
      last.low = Math.min(last.low, liveValue);
      last.close = liveValue;
      return rows;
    }

    if (!last || bucketSec > lastSec) {
      rows.push({
        time: bucketSec as Time,
        open: liveValue,
        high: liveValue,
        low: liveValue,
        close: liveValue,
      });
    }
    return rows;
  }, [
    denomination,
    intervalSeconds,
    livePriceNative,
    liveSupplyWhole,
    marketCandles,
    marketState,
    metric,
    nativeUsd,
    seriesPoints,
    solana,
    solanaGraduated,
    tokenDecimals,
  ]);'''
if old not in s:
    raise SystemExit('data block target not found')
s = s.replace(old, new, 1)

p.write_text(s)
print('graduated Solana live spot chart fix applied')
