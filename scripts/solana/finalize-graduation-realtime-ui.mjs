import fs from "node:fs";

const indexerPath = "realtime-indexer/src/solanaIndexer.ts";
const statsPath = "frontend/src/hooks/useTokenStatsRealtime.ts";
const explosionPath = "frontend/src/components/token/GraduationExplosion.tsx";
const tokenDetailsPath = "frontend/src/pages/TokenDetails.tsx";
const serverPath = "realtime-indexer/src/server.ts";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

let indexer = fs.readFileSync(indexerPath, "utf8");
let stats = fs.readFileSync(statsPath, "utf8");
let explosion = fs.readFileSync(explosionPath, "utf8");
let tokenDetails = fs.readFileSync(tokenDetailsPath, "utf8");
let server = fs.readFileSync(serverPath, "utf8");

indexer = replaceOnce(
  indexer,
  `type AnchorEvent = CampaignCreatedEvent | TokensBoughtEvent | TokensSoldEvent;`,
  `type CampaignGraduatedEvent = {\n  kind: "CampaignGraduated";\n  campaign: string;\n  creator: string;\n  mint: string;\n  meteoraPool: string;\n  meteoraPosition: string;\n  liquidityTokens: bigint;\n  liquidityLamports: bigint;\n  finalizeFeeLamports: bigint;\n  creatorPayoutLamports: bigint;\n  burnedUnsoldCurveTokens: bigint;\n  burnedUnusedLiquidityTokens: bigint;\n  creatorReserveTokens: bigint;\n  finalSpotNanoLamports: bigint;\n  graduatedAt: bigint;\n};\n\ntype AnchorEvent = CampaignCreatedEvent | TokensBoughtEvent | TokensSoldEvent | CampaignGraduatedEvent;`,
  "graduation event type",
);

indexer = replaceOnce(
  indexer,
  `  u64(): bigint {\n    if (this.offset + 8 > this.data.length) throw new Error("Anchor event u64 out of bounds");\n    const value = this.data.readBigUInt64LE(this.offset);\n    this.offset += 8;\n    return value;\n  }\n}`,
  `  u64(): bigint {\n    if (this.offset + 8 > this.data.length) throw new Error("Anchor event u64 out of bounds");\n    const value = this.data.readBigUInt64LE(this.offset);\n    this.offset += 8;\n    return value;\n  }\n\n  i64(): bigint {\n    if (this.offset + 8 > this.data.length) throw new Error("Anchor event i64 out of bounds");\n    const value = this.data.readBigInt64LE(this.offset);\n    this.offset += 8;\n    return value;\n  }\n\n  u128(): bigint {\n    if (this.offset + 16 > this.data.length) throw new Error("Anchor event u128 out of bounds");\n    const lo = this.data.readBigUInt64LE(this.offset);\n    const hi = this.data.readBigUInt64LE(this.offset + 8);\n    this.offset += 16;\n    return lo + (hi << 64n);\n  }\n}`,
  "event reader integers",
);

indexer = replaceOnce(
  indexer,
  `  [eventDiscriminator("TokensSold"), (r) => ({\n    kind: "TokensSold",\n    campaign: r.pubkey(),\n    trader: r.pubkey(),\n    tokensIn: r.u64(),\n    grossLamports: r.u64(),\n    feeLamports: r.u64(),\n    lamportsOut: r.u64(),\n    soldTokensAfter: r.u64(),\n    netRaisedAfter: r.u64(),\n  })],\n]);`,
  `  [eventDiscriminator("TokensSold"), (r) => ({\n    kind: "TokensSold",\n    campaign: r.pubkey(),\n    trader: r.pubkey(),\n    tokensIn: r.u64(),\n    grossLamports: r.u64(),\n    feeLamports: r.u64(),\n    lamportsOut: r.u64(),\n    soldTokensAfter: r.u64(),\n    netRaisedAfter: r.u64(),\n  })],\n  [eventDiscriminator("CampaignGraduated"), (r) => ({\n    kind: "CampaignGraduated",\n    campaign: r.pubkey(),\n    creator: r.pubkey(),\n    mint: r.pubkey(),\n    meteoraPool: r.pubkey(),\n    meteoraPosition: r.pubkey(),\n    liquidityTokens: r.u64(),\n    liquidityLamports: r.u64(),\n    finalizeFeeLamports: r.u64(),\n    creatorPayoutLamports: r.u64(),\n    burnedUnsoldCurveTokens: r.u64(),\n    burnedUnusedLiquidityTokens: r.u64(),\n    creatorReserveTokens: r.u64(),\n    finalSpotNanoLamports: r.u128(),\n    graduatedAt: r.i64(),\n  })],\n]);`,
  "graduation decoder",
);

indexer = replaceOnce(
  indexer,
  `async function handleEvent(event: AnchorEvent, signature: string, slot: number, blockTime: Date, logIndex: number) {\n  if (event.kind === "CampaignCreated") {\n    await upsertCampaign(event, slot, blockTime);\n    return;\n  }\n  await insertTrade(event, signature, slot, blockTime, logIndex);\n}`,
  `async function persistGraduation(\n  event: CampaignGraduatedEvent,\n  signature: string,\n  slot: number,\n  blockTime: Date,\n) {\n  const meta = {\n    source: "solana-v4-graduation",\n    solanaGraduation: {\n      dex: "meteora-damm-v2",\n      pool: event.meteoraPool,\n      position: event.meteoraPosition,\n      liquidityTokensRaw: event.liquidityTokens.toString(),\n      liquidityLamports: event.liquidityLamports.toString(),\n      finalizeFeeLamports: event.finalizeFeeLamports.toString(),\n      creatorPayoutLamports: event.creatorPayoutLamports.toString(),\n      burnedUnsoldCurveTokens: event.burnedUnsoldCurveTokens.toString(),\n      burnedUnusedLiquidityTokens: event.burnedUnusedLiquidityTokens.toString(),\n      creatorReserveTokens: event.creatorReserveTokens.toString(),\n      finalSpotNanoLamports: event.finalSpotNanoLamports.toString(),\n      graduatedAt: event.graduatedAt.toString(),\n      transactionSignature: signature,\n      slot,\n    },\n  };\n\n  await pool.query(\n    \`insert into public.campaigns(\n       chain_id, factory_address, campaign_address, token_address, creator_address,\n       name, symbol, created_block, created_at_chain, is_active, meta\n     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)\n     on conflict (chain_id, campaign_address) do update set\n       token_address=excluded.token_address,\n       creator_address=excluded.creator_address,\n       is_active=true,\n       meta=coalesce(public.campaigns.meta, '{}'::jsonb) || excluded.meta,\n       updated_at=now()\`,\n    [\n      SOLANA_CHAIN_ID,\n      programId(),\n      event.campaign,\n      event.mint,\n      event.creator,\n      "Solana Launch",\n      "SOL",\n      slot,\n      blockTime.toISOString(),\n      JSON.stringify(meta),\n    ],\n  );\n  await touchCampaignActivity(event.campaign, blockTime);\n  await insertActivityEvent({\n    campaign: event.campaign,\n    eventType: "GRADUATED",\n    actor: event.creator,\n    tokenAddress: event.mint,\n    signature,\n    slot,\n    eventTime: blockTime,\n    meta: meta.solanaGraduation,\n  });\n  await publishStats(SOLANA_CHAIN_ID, event.campaign, {\n    type: "stats_patch",\n    graduated: true,\n    dex: "meteora-damm-v2",\n    dexPool: event.meteoraPool,\n    dexPosition: event.meteoraPosition,\n    graduationLiquiditySol: toSol(event.liquidityLamports),\n    graduationLiquidityTokensRaw: event.liquidityTokens.toString(),\n    graduatedAt: blockTime.toISOString(),\n    txHash: signature,\n  });\n}\n\nasync function handleEvent(event: AnchorEvent, signature: string, slot: number, blockTime: Date, logIndex: number) {\n  if (event.kind === "CampaignCreated") {\n    await upsertCampaign(event, slot, blockTime);\n    return;\n  }\n  if (event.kind === "CampaignGraduated") {\n    await persistGraduation(event, signature, slot, blockTime);\n    return;\n  }\n  await insertTrade(event, signature, slot, blockTime, logIndex);\n}`,
  "graduation persistence",
);

stats = replaceOnce(
  stats,
  `  soldTokens: number | null;\n  updatedAt?: string;`,
  `  soldTokens: number | null;\n  graduated?: boolean;\n  dex?: string | null;\n  dexPool?: string | null;\n  dexPosition?: string | null;\n  graduationLiquidityNative?: number | null;\n  graduatedAt?: string | null;\n  updatedAt?: string;`,
  "realtime graduation type",
);

stats = replaceOnce(
  stats,
  `        soldTokens: prev?.soldTokens ?? null,\n        updatedAt: prev?.updatedAt,`,
  `        soldTokens: prev?.soldTokens ?? null,\n        graduated: data.graduated === true ? true : prev?.graduated,\n        dex: data.dex != null ? String(data.dex) : prev?.dex ?? null,\n        dexPool: data.dexPool != null ? String(data.dexPool) : prev?.dexPool ?? null,\n        dexPosition: data.dexPosition != null ? String(data.dexPosition) : prev?.dexPosition ?? null,\n        graduationLiquidityNative:\n          num(data.graduationLiquiditySol) ?? prev?.graduationLiquidityNative ?? null,\n        graduatedAt:\n          data.graduatedAt != null ? String(data.graduatedAt) : prev?.graduatedAt ?? null,\n        updatedAt: prev?.updatedAt,`,
  "realtime graduation patch",
);

explosion = replaceOnce(
  explosion,
  `  transitionAt,\n}: {\n  campaignAddress?: string;\n  active: boolean;\n  transitionAt?: number | null;\n}) {`,
  `  transitionAt,\n  venueLabel = "Topaz",\n}: {\n  campaignAddress?: string;\n  active: boolean;\n  transitionAt?: number | null;\n  venueLabel?: string;\n}) {`,
  "explosion venue prop",
);

explosion = replaceOnce(
  explosion,
  `              Trading continues on Topaz inside MemeWarzone`,
  `              Trading continues on {venueLabel} inside MemeWarzone`,
  "explosion venue copy",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `  // Solana campaigns stay in Bonding until Solana graduation/P1 trading exists.\n  const contractGraduated = isSolanaPage ? false : contractGraduatedEarly;\n  const verifiedMarketStage = isSolanaPage ? null : unifiedMarket.state?.marketStage;\n  // Do NOT treat TOPAZ_PENDING alone as DEX UI — that broke bonding metrics when\n  // handoff rows existed without a live pair. Require on-chain graduation or ACTIVE.\n  const isDexStage = isSolanaPage\n    ? false\n    : contractGraduated ||\n      verifiedMarketStage === "TOPAZ_ACTIVE" ||\n      (verifiedMarketStage === "TOPAZ_DEGRADED" && contractGraduated);`,
  `  // Solana switches stage only on the real on-chain graduated flag or the indexed\n  // CampaignGraduated event — never merely because progress reached 100%.\n  const contractGraduated = isSolanaPage\n    ? Boolean(solanaCurve?.graduated || rtStats?.graduated)\n    : contractGraduatedEarly;\n  const verifiedMarketStage = isSolanaPage ? null : unifiedMarket.state?.marketStage;\n  // Do NOT treat TOPAZ_PENDING alone as DEX UI — that broke bonding metrics when\n  // handoff rows existed without a live pair. Require on-chain graduation or ACTIVE.\n  const isDexStage = isSolanaPage\n    ? contractGraduated\n    : contractGraduated ||\n      verifiedMarketStage === "TOPAZ_ACTIVE" ||\n      (verifiedMarketStage === "TOPAZ_DEGRADED" && contractGraduated);`,
  "Solana graduated stage",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `  const isTopazTradingActive =\n    !isSolanaPage &&\n    Boolean(campaign?.campaign && campaign?.token) &&\n    (verifiedMarketStage === "TOPAZ_ACTIVE" || contractGraduated);`,
  `  const isTopazTradingActive =\n    !isSolanaPage &&\n    Boolean(campaign?.campaign && campaign?.token) &&\n    (verifiedMarketStage === "TOPAZ_ACTIVE" || contractGraduated);\n  const [solanaGraduationTransitionAt, setSolanaGraduationTransitionAt] = useState<number | null>(null);\n  const previousSolanaGraduatedRef = useRef<boolean | null>(null);\n  useEffect(() => {\n    if (!isSolanaPage) return;\n    const previous = previousSolanaGraduatedRef.current;\n    if (previous === false && contractGraduated) {\n      setSolanaGraduationTransitionAt(Date.now());\n    }\n    previousSolanaGraduatedRef.current = contractGraduated;\n  }, [isSolanaPage, contractGraduated]);`,
  "Solana graduation transition",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `    if (!isDexStage) return tokenData.liquidity;\n    // On-chain Topaz pool liquidity only (2 × WBNB reserve). No external DEX APIs.`,
  `    if (!isDexStage) return tokenData.liquidity;\n    if (isSolanaPage && rtStats?.graduationLiquidityNative != null && rtStats.graduationLiquidityNative > 0) {\n      // Initial DAMM v2 TVL is approximately two equal-value sides at handoff.\n      return \`${"${formatCompact(rtStats.graduationLiquidityNative * 2)} ${nativeUnit}"}\`;\n    }\n    // On-chain Topaz pool liquidity only (2 × WBNB reserve). No external DEX APIs.`,
  "Solana graduation liquidity",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `  const stagePill = isSolanaPage\n    ? solanaCurve?.graduated\n      ? "Graduated · Solana"\n      : "Bonding · Solana"`,
  `  const stagePill = isSolanaPage\n    ? contractGraduated\n      ? "Graduated · Meteora"\n      : "Bonding · Solana"`,
  "Solana stage pill",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `        // ── Solana bonding quotes (exact SOL-in buy / exact tokens-in sell) ──\n        if (isSolanaPage) {\n          const solStr = String(tradeAmount || "").trim();`,
  `        // ── Solana bonding quotes (exact SOL-in buy / exact tokens-in sell) ──\n        if (isSolanaPage) {\n          if (contractGraduated) {\n            setEffectiveTokenWei(0n);\n            setEffectiveBnbWei(0n);\n            setQuoteWei(null);\n            setQuoteError("Graduated to Meteora DAMM v2. Loading the verified pool route…");\n            setQuoteLoading(false);\n            return;\n          }\n          const solStr = String(tradeAmount || "").trim();`,
  "graduated bonding quote guard",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, onChainLaunched, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb, isSolanaPage, solanaCurve]);`,
  `  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, onChainLaunched, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb, isSolanaPage, solanaCurve, contractGraduated]);`,
  "quote graduation dependency",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `    // ── Solana bonding: exact SOL in (buy) / exact tokens in (sell) ─────────\n    if (isSolanaPage) {\n      try {`,
  `    // ── Solana bonding: exact SOL in (buy) / exact tokens in (sell) ─────────\n    if (isSolanaPage) {\n      if (contractGraduated) {\n        toast({\n          title: "Meteora market active",\n          description: "This campaign has graduated. Bonding-curve trading is closed; the verified Meteora route is being loaded.",\n        });\n        return;\n      }\n      try {`,
  "graduated bonding trade guard",
);

tokenDetails = replaceOnce(
  tokenDetails,
  `      <GraduationExplosion\n        campaignAddress={campaign?.campaign}\n        active={isTopazTradingActive}\n        transitionAt={\n          unifiedMarket.stageTransition?.to === "TOPAZ_ACTIVE" ? unifiedMarket.stageTransition.at : null\n        }\n      />`,
  `      <GraduationExplosion\n        campaignAddress={campaign?.campaign}\n        active={isSolanaPage ? false : isTopazTradingActive}\n        transitionAt={\n          isSolanaPage\n            ? solanaGraduationTransitionAt\n            : unifiedMarket.stageTransition?.to === "TOPAZ_ACTIVE"\n              ? unifiedMarket.stageTransition.at\n              : null\n        }\n        venueLabel={isSolanaPage ? "Meteora DAMM v2" : "Topaz"}\n      />`,
  "Solana graduation explosion",
);

server = replaceOnce(
  server,
  `      indexerBuild: "solana-v4-trades-2026-08-13",`,
  `      indexerBuild: "solana-v4-graduation-2026-08-13",`,
  "indexer build marker",
);

fs.writeFileSync(indexerPath, indexer);
fs.writeFileSync(statsPath, stats);
fs.writeFileSync(explosionPath, explosion);
fs.writeFileSync(tokenDetailsPath, tokenDetails);
fs.writeFileSync(serverPath, server);
console.log("[graduation-realtime-ui-finalizer] asserted transforms applied");
