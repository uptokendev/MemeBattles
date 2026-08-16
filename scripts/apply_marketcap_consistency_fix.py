from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


canonical = Path("realtime-indexer/src/canonicalCandleMaterializer.ts")
s = canonical.read_text()
if "const VERSION = 2;" not in s:
    s = replace_once(s, "const VERSION = 1;", "const VERSION = 2;", "canonical version")
    s = replace_once(
        s,
        'const BNB_CURVE_ABI = [\n  "function basePrice() view returns (uint256)",\n  "function priceSlope() view returns (uint256)",\n];',
        'const BNB_CURVE_ABI = [\n  "function basePrice() view returns (uint256)",\n  "function priceSlope() view returns (uint256)",\n  "function sold() view returns (uint256)",\n];',
        "bnb abi sold",
    )
    s = replace_once(
        s,
        "type SpotCalculator = (soldRaw: bigint) => CurveState;\n",
        "type SpotCalculator = (soldRaw: bigint) => CurveState;\n\ntype SpotModel = {\n  calculate: SpotCalculator;\n  currentSoldRaw: bigint | null;\n};\n",
        "spot model type",
    )

    old_bnb = '''async function bnbSpotCalculator(chainId: number, campaign: string): Promise<SpotCalculator> {
  const provider = await bscProvider(chainId);
  const contract = new ethers.Contract(campaign, BNB_CURVE_ABI, provider) as any;
  const [basePriceRaw, priceSlopeRaw] = await Promise.all([
    contract.basePrice() as Promise<bigint>,
    contract.priceSlope() as Promise<bigint>,
  ]);

  return (soldRaw: bigint) => {
    const safeSold = soldRaw > 0n ? soldRaw : 0n;
    const spotRaw = basePriceRaw + (priceSlopeRaw * safeSold) / WAD;
    const spotNative = bigintRatio(spotRaw, WAD);
    const soldWhole = bigintRatio(safeSold, WAD);
    return {
      soldRaw: safeSold,
      spotNative,
      mcapNative: spotNative * soldWhole,
    };
  };
}'''
    new_bnb = '''async function bnbSpotCalculator(chainId: number, campaign: string): Promise<SpotModel> {
  const provider = await bscProvider(chainId);
  const contract = new ethers.Contract(campaign, BNB_CURVE_ABI, provider) as any;
  const [basePriceRaw, priceSlopeRaw, currentSoldRaw] = await Promise.all([
    contract.basePrice() as Promise<bigint>,
    contract.priceSlope() as Promise<bigint>,
    contract.sold() as Promise<bigint>,
  ]);

  const calculate: SpotCalculator = (soldRaw: bigint) => {
    const safeSold = soldRaw > 0n ? soldRaw : 0n;
    const spotRaw = basePriceRaw + (priceSlopeRaw * safeSold) / WAD;
    const spotNative = bigintRatio(spotRaw, WAD);
    const soldWhole = bigintRatio(safeSold, WAD);
    return {
      soldRaw: safeSold,
      spotNative,
      mcapNative: spotNative * soldWhole,
    };
  };

  return { calculate, currentSoldRaw };
}'''
    s = replace_once(s, old_bnb, new_bnb, "bnb spot model")

    s = replace_once(
        s,
        "async function solanaSpotCalculator(campaign: string): Promise<SpotCalculator> {",
        "async function solanaSpotCalculator(campaign: string): Promise<SpotModel> {",
        "solana spot signature",
    )

    old_sol_tail = '''  const curve = decodeSolanaCurve(Buffer.from(encoded, "base64"));
  if (!curve) throw new Error(`Could not decode Solana curve parameters: ${campaign}`);
  const tokenUnits = pow10(curve.tokenDecimals);
  const slopeScale = curve.economicsVersion >= 3 ? tokenUnits * 1_000_000_000n : tokenUnits;

  return (soldRaw: bigint) => {
    const safeSold = soldRaw > 0n ? soldRaw : 0n;
    const slopeComponentLamports = slopeScale > 0n
      ? (curve.priceSlopeLamports * safeSold) / slopeScale
      : 0n;
    const spotLamports = curve.basePriceLamports + slopeComponentLamports;
    const spotNative = bigintRatio(spotLamports, 1_000_000_000n);
    const soldWhole = bigintRatio(safeSold, tokenUnits);
    return {
      soldRaw: safeSold,
      spotNative,
      mcapNative: spotNative * soldWhole,
    };
  };
}

async function spotCalculator(chainId: number, campaign: string): Promise<SpotCalculator> {
  if (chainId === 101) return solanaSpotCalculator(campaign);
  if (chainId === 56 || chainId === 97) return bnbSpotCalculator(chainId, campaign);
  throw new Error(`Unsupported canonical candle chain ${chainId}`);
}'''
    new_sol_tail = '''  const curve = decodeSolanaCurve(Buffer.from(encoded, "base64"));
  if (!curve) throw new Error(`Could not decode Solana curve parameters: ${campaign}`);
  const tokenUnits = pow10(curve.tokenDecimals);

  const calculate: SpotCalculator = (soldRaw: bigint) => {
    const safeSold = soldRaw > 0n ? soldRaw : 0n;
    const soldWhole = bigintRatio(safeSold, tokenUnits);
    const baseLamports = Number(curve.basePriceLamports);
    const slopeRaw = Number(curve.priceSlopeLamports);
    const slopeLamports = curve.economicsVersion >= 3
      ? (slopeRaw * soldWhole) / 1_000_000_000
      : slopeRaw * soldWhole;
    const spotNative = (baseLamports + slopeLamports) / LAMPORTS_PER_SOL;
    const safeSpotNative = Number.isFinite(spotNative) && spotNative > 0 ? spotNative : 0;
    return {
      soldRaw: safeSold,
      spotNative: safeSpotNative,
      mcapNative: safeSpotNative * soldWhole,
    };
  };

  return { calculate, currentSoldRaw: null };
}

async function spotCalculator(chainId: number, campaign: string): Promise<SpotModel> {
  if (chainId === 101) return solanaSpotCalculator(campaign);
  if (chainId === 56 || chainId === 97) return bnbSpotCalculator(chainId, campaign);
  throw new Error(`Unsupported canonical candle chain ${chainId}`);
}'''
    s = replace_once(s, old_sol_tail, new_sol_tail, "solana precision + spot model")

    old_derive = '''function deriveBuckets(chainId: number, trades: TradeRow[], calculate: SpotCalculator): Map<string, CanonicalBucket> {
  const buckets = new Map<string, CanonicalBucket>();
  let reconstructedSold = 0n;

  for (const trade of trades) {'''
    new_derive = '''function indexedNetSold(trades: TradeRow[]): bigint {
  let net = 0n;
  for (const trade of trades) {
    const amount = toBigInt(trade.token_amount_raw);
    net += String(trade.side || "").toLowerCase() === "sell" ? -amount : amount;
  }
  return net;
}

function deriveBuckets(
  chainId: number,
  trades: TradeRow[],
  calculate: SpotCalculator,
  currentSoldRaw: bigint | null = null,
): Map<string, CanonicalBucket> {
  const buckets = new Map<string, CanonicalBucket>();
  let reconstructedSold = 0n;

  // Older BNB campaigns can have valid trades before the durable trade mirror began.
  // Anchor the reconstructed history to the live contract sold() state so the latest
  // canonical close uses the exact same circulating-supply basis as TokenDetails.
  if ((chainId === 56 || chainId === 97) && currentSoldRaw != null && currentSoldRaw >= 0n) {
    const inferredOpeningSold = currentSoldRaw - indexedNetSold(trades);
    if (inferredOpeningSold > 0n) reconstructedSold = inferredOpeningSold;
  }

  for (const trade of trades) {'''
    s = replace_once(s, old_derive, new_derive, "bnb history anchor")
    s = replace_once(
        s,
        "  const calculate = await spotCalculator(chainId, normalizedCampaign);\n  const buckets = deriveBuckets(chainId, trades, calculate);",
        "  const model = await spotCalculator(chainId, normalizedCampaign);\n  const buckets = deriveBuckets(chainId, trades, model.calculate, model.currentSoldRaw);",
        "materialize model use",
    )
    s = replace_once(
        s,
        '''      having max(tc.canonical_updated_at) is null
          or max(tc.canonical_updated_at) < max(t.block_time)
      order by max(t.block_time) asc
      limit $1`,
    [campaignBatchSize()],''',
        '''      having max(tc.canonical_updated_at) is null
          or max(tc.canonical_updated_at) < max(t.block_time)
          or min(coalesce(tc.canonical_version,0)) < $2
      order by max(t.block_time) asc
      limit $1`,
    [campaignBatchSize(), VERSION],''',
        "versioned rematerialization",
    )
    canonical.write_text(s)

meteora = Path("realtime-indexer/src/meteoraSwapIndexer.ts")
s = meteora.read_text()
if "fixedBondingSupplyWhole" not in s:
    marker = "async function touchCampaignActivity(campaign: string, at: Date) {"
    helper = '''async function fixedBondingSupplyWhole(campaign: string, tokenDecimals: number): Promise<number> {
  const latest = await pool.query(
    `select sold_tokens_after_raw
       from public.curve_trades
      where chain_id=$1 and campaign_address=$2 and sold_tokens_after_raw is not null
      order by block_number desc,log_index desc
      limit 1`,
    [SOLANA_CHAIN_ID, campaign],
  );
  const raw = bigintValue(latest.rows[0]?.sold_tokens_after_raw ?? 0);
  if (raw > 0n) {
    const whole = Number(raw) / 10 ** tokenDecimals;
    if (Number.isFinite(whole) && whole > 0) return whole;
  }

  const fallback = await pool.query(
    `select sold_tokens from public.token_stats where chain_id=$1 and campaign_address=$2 limit 1`,
    [SOLANA_CHAIN_ID, campaign],
  );
  const whole = Number(fallback.rows[0]?.sold_tokens ?? 0);
  return Number.isFinite(whole) && whole > 0 ? whole : 0;
}

'''
    s = replace_once(s, marker, helper + marker, "fixed graduation supply helper")

    old_upsert = '''async function upsertCandle(campaign: string, tf: TF, bucketSec: number, priceSol: number, volumeSol: number) {
  await pool.query(
    `insert into public.token_candles(
       chain_id,campaign_address,timeframe,bucket_start,o,h,l,c,volume_bnb,trades_count
     ) values($1,$2,$3,$4,$5,$5,$5,$5,$6,1)
     on conflict (chain_id,campaign_address,timeframe,bucket_start) do update set
       h=greatest(public.token_candles.h,excluded.h),
       l=least(public.token_candles.l,excluded.l),
       c=excluded.c,
       volume_bnb=public.token_candles.volume_bnb+excluded.volume_bnb,
       trades_count=public.token_candles.trades_count+1,
       updated_at=now()`,
    [SOLANA_CHAIN_ID, campaign, tf, new Date(bucketSec * 1000), priceSol, volumeSol],
  );
  await publishCandle(SOLANA_CHAIN_ID, campaign, {
    type: "candle_upsert",
    tf,
    bucket: bucketSec,
    c: String(priceSol),
    v: String(volumeSol),
  });
}'''
    new_upsert = '''async function upsertCandle(
  campaign: string,
  tf: TF,
  bucketSec: number,
  priceSol: number,
  volumeSol: number,
  fixedSupplyWhole: number,
  blockNumber: number,
  logIndex: number,
) {
  const mcapSol = Number.isFinite(fixedSupplyWhole) && fixedSupplyWhole > 0
    ? priceSol * fixedSupplyWhole
    : null;
  await pool.query(
    `insert into public.token_candles(
       chain_id,campaign_address,timeframe,bucket_start,o,h,l,c,volume_bnb,trades_count,
       source_mask,bonding_trade_count,dex_trade_count,bonding_volume_bnb,dex_volume_bnb,
       last_block_number,last_log_index,
       price_o,price_h,price_l,price_c,mcap_o,mcap_h,mcap_l,mcap_c,
       canonical_version,canonical_updated_at
     ) values(
       $1,$2,$3,$4,$5,$5,$5,$5,$6,1,
       2,0,1,0,$6,
       $7,$8,
       $5,$5,$5,$5,$9,$9,$9,$9,
       2,now()
     )
     on conflict (chain_id,campaign_address,timeframe,bucket_start) do update set
       h=greatest(public.token_candles.h,excluded.h),
       l=least(public.token_candles.l,excluded.l),
       c=excluded.c,
       volume_bnb=public.token_candles.volume_bnb+excluded.volume_bnb,
       trades_count=public.token_candles.trades_count+1,
       source_mask=((coalesce(public.token_candles.source_mask,0)::int | 2)::smallint),
       bonding_trade_count=coalesce(public.token_candles.bonding_trade_count,0),
       dex_trade_count=coalesce(public.token_candles.dex_trade_count,0)+1,
       bonding_volume_bnb=coalesce(public.token_candles.bonding_volume_bnb,0),
       dex_volume_bnb=coalesce(public.token_candles.dex_volume_bnb,0)+excluded.dex_volume_bnb,
       last_block_number=excluded.last_block_number,
       last_log_index=excluded.last_log_index,
       price_o=coalesce(public.token_candles.price_o,excluded.price_o),
       price_h=greatest(coalesce(public.token_candles.price_h,excluded.price_h),excluded.price_h),
       price_l=least(coalesce(public.token_candles.price_l,excluded.price_l),excluded.price_l),
       price_c=excluded.price_c,
       mcap_o=coalesce(public.token_candles.mcap_o,excluded.mcap_o),
       mcap_h=case
         when excluded.mcap_h is null then public.token_candles.mcap_h
         else greatest(coalesce(public.token_candles.mcap_h,excluded.mcap_h),excluded.mcap_h)
       end,
       mcap_l=case
         when excluded.mcap_l is null then public.token_candles.mcap_l
         else least(coalesce(public.token_candles.mcap_l,excluded.mcap_l),excluded.mcap_l)
       end,
       mcap_c=coalesce(excluded.mcap_c,public.token_candles.mcap_c),
       canonical_version=greatest(coalesce(public.token_candles.canonical_version,0),excluded.canonical_version),
       canonical_updated_at=now(),
       updated_at=now()`,
    [
      SOLANA_CHAIN_ID,
      campaign,
      tf,
      new Date(bucketSec * 1000),
      priceSol,
      volumeSol,
      blockNumber,
      logIndex,
      mcapSol,
    ],
  );
  await publishCandle(SOLANA_CHAIN_ID, campaign, {
    type: "candle_upsert",
    tf,
    bucket: bucketSec,
    c: String(priceSol),
    v: String(volumeSol),
  });
}'''
    s = replace_once(s, old_upsert, new_upsert, "meteora canonical candle upsert")

    s = replace_once(
        s,
        "     from public.curve_trades where chain_id=$1 and campaign_address=$2`,",
        "     from public.curve_trades\n     where chain_id=$1 and campaign_address=$2 and sold_tokens_after_raw is not null`,",
        "exclude dex swaps from graduated sold supply",
    )
    s = replace_once(
        s,
        "  pair: PoolPair;\n  swap: MeteoraSwap;",
        "  pair: PoolPair;\n  fixedSupplyWhole: number;\n  swap: MeteoraSwap;",
        "insert swap supply input",
    )
    s = replace_once(
        s,
        "      await upsertCandle(input.market.campaign, tf, bucketStart(tsSec, tf), priceNative, nativeAmount);",
        '''      await upsertCandle(
        input.market.campaign,
        tf,
        bucketStart(tsSec, tf),
        priceNative,
        nativeAmount,
        input.fixedSupplyWhole,
        input.slot,
        logIndex,
      );''',
        "meteora upsert call",
    )
    s = replace_once(
        s,
        "  const pair = await loadPoolPair(market);\n  let maxSlot = currentState;",
        "  const pair = await loadPoolPair(market);\n  const fixedSupplyWhole = await fixedBondingSupplyWhole(market.campaign, pair.tokenDecimals);\n  let maxSlot = currentState;",
        "load fixed supply",
    )
    s = replace_once(
        s,
        "        pair,\n        swap: swaps[eventIndex],",
        "        pair,\n        fixedSupplyWhole,\n        swap: swaps[eventIndex],",
        "pass fixed supply",
    )
    meteora.write_text(s)

print("market-cap consistency patch applied or already present")
