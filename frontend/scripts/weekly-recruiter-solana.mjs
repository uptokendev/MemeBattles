import { pool } from "../server/db.js";
import { DAY_MS, epochWindow, envBool, envInt } from "./weekly-airdrop/config.mjs";
import {
  buildSolanaLaneMerklePlan,
  publishSolanaRewardLaneBatch,
  solanaLaneAddresses,
} from "../api/lib/solanaRewardLane.js";

const LANE = "recruiter";

async function loadRecipients(client) {
  const { rows } = await client.query(
    `with claimable as (
       select recruiter_id,
              array_agg(id order by id) as ledger_ids,
              sum(amount_raw)::numeric(78,0) as amount_raw
         from public.recruiter_reward_ledger
        where chain = 'solana'
          and token = 'SOL'
          and status in ('claimable','retriable')
          and claim_id is null
        group by recruiter_id
     ), wallet as (
       select distinct on (recruiter_id)
              recruiter_id, wallet_address
         from public.recruiter_payout_wallets
        where chain = 'solana' and verified_at is not null
        order by recruiter_id, verified_at desc
     )
     select c.recruiter_id,
            c.ledger_ids,
            c.amount_raw::text as amount_raw,
            w.wallet_address
       from claimable c
       join wallet w using (recruiter_id)
      where c.amount_raw > 0
      order by c.recruiter_id`,
  );
  return rows.map((row) => ({
    recruiterId: String(row.recruiter_id),
    ledgerIds: row.ledger_ids,
    walletAddress: String(row.wallet_address),
    amountLamports: String(row.amount_raw),
  }));
}

async function existingBatch(client, chainId, epochId) {
  const { rows } = await client.query(
    `select * from public.solana_reward_lane_batches
      where lane=$1 and chain_id=$2 and epoch_id=$3
      limit 1`,
    [LANE, chainId, String(epochId)],
  );
  return rows[0] || null;
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
  await client.query("begin");
  try {
    await client.query(
      `update public.solana_reward_lane_batches
          set status='claim_open', publish_tx_hash=coalesce(publish_tx_hash,$2),
              claims_enable_tx_hash=coalesce(claims_enable_tx_hash,$3),
              published_at=coalesce(published_at,now()), updated_at=now()
        where id=$1`,
      [batch.id, publication.txHash, publication.claimsEnableTxHash],
    );
    await client.query(
      `update public.solana_reward_lane_claims set status='claimable', updated_at=now()
        where batch_id=$1 and status='prepared'`,
      [batch.id],
    );
    await client.query("commit");
    return publication;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const chainId = envInt("RECRUITER_SOLANA_CHAIN_ID", 101, { min: 101, max: 102 });
  if (![101, 102].includes(chainId)) throw new Error("RECRUITER_SOLANA_CHAIN_ID must be 101 or 102");
  const dryRun = envBool("RECRUITER_SOLANA_DRY_RUN", false);
  const enabled = envBool("RECRUITER_SOLANA_AUTOMATION_ENABLED", false);
  if (!dryRun && !enabled) throw new Error("RECRUITER_SOLANA_AUTOMATION_ENABLED must be true for live publication");

  const { start, end, epochId: displayEpochId } = epochWindow();
  const epochId = Math.floor(start.getTime() / 1000);
  const deadline = Math.floor((end.getTime() + envInt("RECRUITER_CLAIM_WINDOW_DAYS", 7, { min: 1, max: 90 }) * DAY_MS) / 1000);
  const lockKey = `mwz-recruiter-solana:${chainId}:${epochId}`;
  const client = await pool.connect();
  let locked = false;

  try {
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return console.log(`[recruiter-solana] another runner owns ${lockKey}`);

    const prior = await existingBatch(client, chainId, epochId);
    if (prior) {
      if (prior.status === "claim_open" || prior.status === "closed") {
        return console.log(`[recruiter-solana] epoch ${displayEpochId} already ${prior.status}`);
      }
      if (dryRun) return console.log(JSON.stringify({ dryRun: true, resume: true, batch: prior }, null, 2));
      const publication = await publishPrepared(client, prior);
      return console.log(`[recruiter-solana] resumed ${displayEpochId}: ${publication.batchAddress}`);
    }

    const recipients = await loadRecipients(client);
    if (!recipients.length) return console.log(`[recruiter-solana] no claimable SOL recruiter rewards for ${displayEpochId}`);
    const plan = buildSolanaLaneMerklePlan(LANE, epochId, recipients);
    const addresses = solanaLaneAddresses(LANE, epochId);

    if (dryRun) {
      return console.log(JSON.stringify({
        dryRun: true,
        chainId,
        displayEpochId,
        epochId,
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
      const insertedBatch = await client.query(
        `insert into public.solana_reward_lane_batches
          (lane,chain_id,epoch_id,epoch_start,epoch_end,merkle_root,total_lamports,claim_deadline,program_id,vault_address,batch_address,status,metadata)
         values ($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10,$11,'prepared',$12::jsonb)
         returning *`,
        [LANE, chainId, String(epochId), start.toISOString(), end.toISOString(), plan.root, plan.totalLamports.toString(), String(deadline), addresses.programId, addresses.vaultAddress, addresses.batchAddress, JSON.stringify({ displayEpochId, recipientCount: plan.recipients.length })],
      );
      batch = insertedBatch.rows[0];

      for (let index = 0; index < plan.recipients.length; index += 1) {
        const recipient = plan.recipients[index];
        const claimResult = await client.query(
          `insert into public.recruiter_reward_claims
             (recruiter_id,chain,token,amount_raw,payout_wallet,status)
           values ($1,'solana','SOL',$2::numeric(78,0),$3,'created')
           returning id`,
          [recipient.recruiterId, recipient.amountLamports, recipient.walletAddress],
        );
        const recruiterClaimId = claimResult.rows[0].id;
        await client.query(
          `update public.recruiter_reward_ledger
              set status='created', claim_id=$2, updated_at=now()
            where id = any($1) and claim_id is null and status in ('claimable','retriable')`,
          [recipient.ledgerIds, recruiterClaimId],
        );
        const claimAddresses = solanaLaneAddresses(LANE, epochId, recipient.walletAddress);
        await client.query(
          `insert into public.solana_reward_lane_claims
            (batch_id,lane,source_type,source_ref,wallet_address,amount_lamports,merkle_leaf,merkle_proof,claim_receipt_address,status,metadata)
           values ($1,$2,'recruiter_reward_claim',$3,$4,$5::numeric,$6,$7::jsonb,$8,'prepared',$9::jsonb)`,
          [batch.id, LANE, String(recruiterClaimId), recipient.walletAddress, recipient.amountLamports, plan.leaves[index], JSON.stringify(plan.proofs[index]), claimAddresses.claimReceiptAddress, JSON.stringify({ recruiterId: recipient.recruiterId, ledgerIds: recipient.ledgerIds, displayEpochId })],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const publication = await publishPrepared(client, batch);
    console.log(`[recruiter-solana] ${displayEpochId} published ${plan.recipients.length} claims at ${publication.batchAddress}`);
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }
}

await main().catch((error) => {
  console.error("[recruiter-solana] failed", error);
  process.exitCode = 1;
});
