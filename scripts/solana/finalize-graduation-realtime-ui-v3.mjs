import fs from "node:fs";

const indexerPath = "realtime-indexer/src/solanaIndexer.ts";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

const currentHandler = `async function handleEvent(event: AnchorEvent, signature: string, logIndex: number, slot: number, blockTime: Date) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime, signature, logIndex);
    return;
  }
  await insertTrade(event, signature, logIndex, slot, blockTime);
}`;

const compatibilityHandler = `async function handleEvent(event: AnchorEvent, signature: string, slot: number, blockTime: Date, logIndex: number) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime);
    return;
  }
  await insertTrade(event, signature, slot, blockTime, logIndex);
}`;

let indexer = fs.readFileSync(indexerPath, "utf8");
indexer = replaceOnce(indexer, currentHandler, compatibilityHandler, "current indexer handler compatibility");
fs.writeFileSync(indexerPath, indexer);

await import("./finalize-graduation-realtime-ui-v2.mjs");

const v1GraduationStart = `async function persistGraduation(
  event: CampaignGraduatedEvent,
  signature: string,
  slot: number,
  blockTime: Date,
) {`;
const v1GraduationEnd = `async function handleEvent(event: AnchorEvent, signature: string, slot: number, blockTime: Date, logIndex: number) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime);
    return;
  }
  if (event.kind === "CampaignGraduated") {
    await persistGraduation(event, signature, slot, blockTime);
    return;
  }
  await insertTrade(event, signature, slot, blockTime, logIndex);
}`;

indexer = fs.readFileSync(indexerPath, "utf8");
const start = indexer.indexOf(v1GraduationStart);
const endStart = indexer.indexOf(v1GraduationEnd);
if (start < 0 || endStart < 0 || endStart < start) {
  throw new Error("graduation persistence compatibility: inserted v1 block not found");
}
const end = endStart + v1GraduationEnd.length;

const finalBlock = `async function persistGraduation(
  event: CampaignGraduatedEvent,
  signature: string,
  logIndex: number,
  slot: number,
  blockTime: Date,
) {
  const graduationMeta = {
    dex: "meteora-damm-v2",
    pool: event.meteoraPool,
    position: event.meteoraPosition,
    liquidityTokensRaw: event.liquidityTokens.toString(),
    liquidityLamports: event.liquidityLamports.toString(),
    finalizeFeeLamports: event.finalizeFeeLamports.toString(),
    creatorPayoutLamports: event.creatorPayoutLamports.toString(),
    burnedUnsoldCurveTokens: event.burnedUnsoldCurveTokens.toString(),
    burnedUnusedLiquidityTokens: event.burnedUnusedLiquidityTokens.toString(),
    creatorReserveTokens: event.creatorReserveTokens.toString(),
    finalSpotNanoLamports: event.finalSpotNanoLamports.toString(),
    graduatedAt: event.graduatedAt.toString(),
    transactionSignature: signature,
    slot,
  };

  await pool.query(
    \`insert into public.campaigns(
       chain_id,factory_address,campaign_address,token_address,creator_address,name,symbol,created_block,created_at_chain,is_active,meta
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb)
     on conflict (chain_id,campaign_address) do update set
       token_address=coalesce(excluded.token_address, public.campaigns.token_address),
       creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
       is_active=true,
       meta=coalesce(public.campaigns.meta,'{}'::jsonb) || excluded.meta,
       updated_at=now()\`,
    [
      SOLANA_CHAIN_ID,
      programId(),
      event.campaign,
      event.mint,
      event.creator,
      "Solana Launch",
      "SOL",
      slot,
      blockTime,
      JSON.stringify({ source: "solana-v4-graduation", solanaGraduation: graduationMeta }),
    ],
  );

  await touchCampaignActivity(event.campaign, blockTime);
  await insertActivityEvent({
    eventType: "GRADUATED",
    txHash: signature,
    logIndex,
    blockNumber: slot,
    blockTime,
    actor: event.creator,
    campaign: event.campaign,
    token: event.mint,
    meta: graduationMeta,
  });
  await publishStats(SOLANA_CHAIN_ID, event.campaign, {
    type: "stats_patch",
    graduated: true,
    dex: "meteora-damm-v2",
    dexPool: event.meteoraPool,
    dexPosition: event.meteoraPosition,
    graduationLiquiditySol: toSol(event.liquidityLamports),
    graduationLiquidityTokensRaw: event.liquidityTokens.toString(),
    graduatedAt: blockTime.toISOString(),
    txHash: signature,
  });
}

async function handleEvent(event: AnchorEvent, signature: string, logIndex: number, slot: number, blockTime: Date) {
  if (event.kind === "CampaignCreated") {
    await upsertCampaign(event, slot, blockTime, signature, logIndex);
    return;
  }
  if (event.kind === "CampaignGraduated") {
    await persistGraduation(event, signature, logIndex, slot, blockTime);
    return;
  }
  await insertTrade(event, signature, logIndex, slot, blockTime);
}`;

indexer = indexer.slice(0, start) + finalBlock + indexer.slice(end);
fs.writeFileSync(indexerPath, indexer);
console.log("[graduation-realtime-ui-v3] current indexer event API preserved");
