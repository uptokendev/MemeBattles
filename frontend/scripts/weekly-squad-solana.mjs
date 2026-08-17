import { pool } from "../server/db.js";
import { DAY_MS, envBool, envInt } from "./weekly-airdrop/config.mjs";
import {
  buildSolanaLaneMerklePlan,
  publishSolanaRewardLaneBatch,
  solanaLaneAddresses,
} from "../api/lib/solanaRewardLane.js";

const LANE = "squad";

async function resolveEpoch(client, chainId) {
  const explicit = envInt("SQUAD_SOLANA_DB_EPOCH_ID", 0, { min: 0 });
  const { rows } = await client.query(
    explicit > 0
      ? `select * from public.epochs where id=$1 and chain_id=$2 and epoch_type='weekly' limit 1`
      : `select * from public.epochs
          where chain_id=$1 and epoch_type='weekly' and end_at <= now()
          order by end_at desc, id desc limit 1`,
    explicit > 0 ? [explicit, chainId] : [chainId],
  );
  const epoch = rows[0];
  if (!epoch) throw new Error(`No completed Solana weekly epoch found for chain ${chainId}`);
  return epoch;
}

async function loadRecipients(client, chainId, dbEpochId) {
  const { rows } = await client.query(
    `select id, wallet_address, amount::text as amount_lamports, metadata
       from public.reward_ledger
      where reward_type='squad'
        and chain=$1
        and token_symbol='SOL'
        and status='approved'
        and source_id like $2
        and amount > 0
      order by wallet_address asc, id asc`,
    [String(chainId), `solana-squad:${chainId}:${dbEpochId}:%`],
  );
  return rows.map((row) => ({
    rewardLedgerId: String(row.id),
    walletAddress: String(row.wallet_address),
    amountLamports: String(row.amount_lamports),
    metadata: row.metadata || {},
  }));
}

async function existingBatch(client, chainId, onchainEpochId) {
  const { rows } = await client.query(
    `select * from public.solana_reward_lane_batches
      where lane=$1 and chain_id=$2 and epoch_id=$3
      limit 1`,
    [LANE, chainId, String(onchainEpochId)],
  );
  return rows[0] || null;
}

async function openClaimsAfterPublication(client, batch, publication) {
  await client.query("begin");
  try {
    await client.query(
      `update public.solana_reward_lane_batches
          set status='claim_open',
              publish_tx_hash=coalesce(publish_tx_hash,$2),
              claims_enable_tx_hash=coalesce(claims_enable_tx_hash,$3),
              published_at=coalesce(published_at,now()),
              updated_at=now()
        where id=$1`,
      [batch.id, publication.txHash, publication.claimsEnableTxHash],
    );
    await client.query(
      `update public.solana_reward_lane_claims
          set status='claimable', updated_at=now()
        where batch_id=$1 and status='prepared'`,
      [batch.id],
    );
    await client.query(
      `update public.reward_ledger rl
          set status='claimable',
              claim_batch_id=$2,
              claimable_at=coalesce(claimable_at,now()),
              expires_at=to_timestamp($3::bigint),
              claim_error=null,
              updated_at=now()
         from public.solana_reward_lane_claims src
        where src.batch_id=$1
          and src.source_type='reward_ledger'
          and src.source_ref=rl.id::text
          and rl.reward_type='squad'
          and rl.status='approved'`,
      [batch.id, String(batch.id), String(batch.claim_deadline)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function publishPrepared(client, batch) {
  const publication = await publishSolanaRewardLaneBatch({
    lane: LANE,
    chainId: batch.chain_id,
    epochId: batch.epoch_id,
    root: batch.merkle_root,
    totalLamports: batch.total_lamports,
    deadline: batch.claim_deadline,
  });
  await openClaimsAfterPublication(client, batch, publication);
  return publication;
}

async function main() {
  const chainId = envInt("SQUAD_SOLANA_CHAIN_ID", 101, { min: 101, max: 102 });
  if (![101, 102].includes(chainId)) throw new Error("SQUAD_SOLANA_CHAIN_ID must be 101 or 102");
  const dryRun = envBool("SQUAD_SOLANA_DRY_RUN", true);
  const enabled = envBool("SQUAD_SOLANA_AUTOMATION_ENABLED", false);
  if (!dryRun && !enabled) throw new Error("SQUAD_SOLANA_AUTOMATION_ENABLED must be true for live publication");

  const client = await pool.connect();
  let locked = false;
  let lockKey = "";
  try {
    const epoch = await resolveEpoch(client, chainId);
    const dbEpochId = Number(epoch.id);
    const start = new Date(epoch.start_at);
    const end = new Date(epoch.end_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Invalid Squad epoch dates");
    const onchainEpochId = Math.floor(start.getTime() / 1000);
    const deadline = Math.floor((end.getTime() + envInt("SQUAD_CLAIM_WINDOW_DAYS", 7, { min: 1, max: 90 }) * DAY_MS) / 1000);
    lockKey = `mwz-squad-solana:${chainId}:${onchainEpochId}`;

    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return console.log(`[squad-solana] another runner owns ${lockKey}`);

    const prior = await existingBatch(client, chainId, onchainEpochId);
    if (prior) {
      if (prior.status === "claim_open" || prior.status === "closed") {
        return console.log(`[squad-solana] DB epoch ${dbEpochId} already ${prior.status}`);
      }
      if (dryRun) return console.log(JSON.stringify({ dryRun: true, resume: true, dbEpochId, onchainEpochId, batch: prior }, null, 2));
      const publication = await publishPrepared(client, prior);
      return console.log(`[squad-solana] resumed DB epoch ${dbEpochId}: ${publication.batchAddress}`);
    }

    const recipients = await loadRecipients(client, chainId, dbEpochId);
    if (!recipients.length) return console.log(`[squad-solana] no approved Squad SOL rewards for DB epoch ${dbEpochId}`);

    const plan = buildSolanaLaneMerklePlan(LANE, onchainEpochId, recipients);
    const addresses = solanaLaneAddresses(LANE, onchainEpochId);

    if (dryRun) {
      return console.log(JSON.stringify({
        dryRun: true,
        chainId,
        dbEpochId,
        onchainEpochId,
        epochStart: start.toISOString(),
        epochEnd: end.toISOString(),
        deadline,
        root: plan.root,
        totalLamports: plan.totalLamports.toString(),
        recipientCount: plan.recipients.length,
        addresses,
      }, null, 2));
    }

    await client.query("begin");
    let batch;
    try {
      const inserted = await client.query(
        `insert into public.solana_reward_lane_batches
          (lane,chain_id,epoch_id,epoch_start,epoch_end,merkle_root,total_lamports,claim_deadline,
           program_id,vault_address,batch_address,status,metadata)
         values ($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10,$11,'prepared',$12::jsonb)
         returning *`,
        [
          LANE,
          chainId,
          String(onchainEpochId),
          start.toISOString(),
          end.toISOString(),
          plan.root,
          plan.totalLamports.toString(),
          String(deadline),
          addresses.programId,
          addresses.vaultAddress,
          addresses.batchAddress,
          JSON.stringify({ dbEpochId, onchainEpochId, recipientCount: plan.recipients.length, nativeUnit: "lamports" }),
        ],
      );
      batch = inserted.rows[0];

      for (let index = 0; index < plan.recipients.length; index += 1) {
        const recipient = plan.recipients[index];
        const claimAddresses = solanaLaneAddresses(LANE, onchainEpochId, recipient.walletAddress);
        await client.query(
          `insert into public.solana_reward_lane_claims
            (batch_id,lane,source_type,source_ref,wallet_address,amount_lamports,merkle_leaf,merkle_proof,
             claim_receipt_address,status,metadata)
           values ($1,$2,'reward_ledger',$3,$4,$5::numeric,$6,$7::jsonb,$8,'prepared',$9::jsonb)`,
          [
            batch.id,
            LANE,
            recipient.rewardLedgerId,
            recipient.walletAddress,
            recipient.amountLamports,
            plan.leaves[index],
            JSON.stringify(plan.proofs[index]),
            claimAddresses.claimReceiptAddress,
            JSON.stringify({ dbEpochId, onchainEpochId, rewardLedgerId: recipient.rewardLedgerId }),
          ],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const publication = await publishPrepared(client, batch);
    console.log(`[squad-solana] DB epoch ${dbEpochId} published ${plan.recipients.length} claims at ${publication.batchAddress}`);
  } finally {
    if (locked && lockKey) await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }
}

await main().catch((error) => {
  console.error("[squad-solana] failed", error);
  process.exitCode = 1;
});
