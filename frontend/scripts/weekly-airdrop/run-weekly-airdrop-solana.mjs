import { pool } from "../../server/db.js";
import {
  DAY_MS,
  asBigInt,
  envBool,
  envInt,
  envText,
  epochWindow,
  requireEnv,
  seedCommitment,
  splitPool,
  weightedSample,
  winnerCount,
} from "./config.mjs";
import {
  assertAirdropSchema,
  creatorCandidates,
  exclusionSets,
  findEpochBatch,
  traderCandidates,
  writeRewardAlert,
} from "./candidates.mjs";
import { materializeSolanaAirdropEpoch } from "./solana-materialize.mjs";
import { publishSolanaAirdropEpoch, resolveSolanaAirdropPool } from "./solana-chain.mjs";

const SOLANA_CHAINS = new Set([101, 102]);
const PROGRAMS = ["airdrop_trader", "airdrop_creator"];

async function audit(client, { batchId = null, action, oldValue = null, newValue = null, reason, txHash = null, metadata = {} }) {
  await client.query(
    `insert into public.reward_audit_logs
      (batch_id,actor_type,actor_id,action,old_value,new_value,reason,tx_hash,metadata)
     values ($1,'scheduler','weekly_airdrop_solana_runner',$2,$3,$4,$5,$6,$7::jsonb)`,
    [batchId, action, oldValue, newValue, reason, txHash, JSON.stringify(metadata)],
  );
}

function complete(batch) {
  return Boolean(batch && ["claim_open", "closed"].includes(String(batch.status)));
}

async function markEpochClaimOpen(client, batches, publication) {
  await client.query("begin");
  try {
    for (const batch of batches) {
      const ids = await client.query(
        `update public.reward_ledger
            set status='claimable',claimable_at=coalesce(claimable_at,now()),claim_error=null,updated_at=now(),
                metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb
          where id in (select reward_ledger_id from public.reward_batch_items where batch_id=$1::uuid)
            and status='approved'
          returning id`,
        [batch.id, JSON.stringify({
          solanaProgramId: publication.programId,
          solanaConfigAddress: publication.configAddress,
          solanaVaultAddress: publication.vaultAddress,
          solanaBatchAddress: publication.batchAddress,
          solanaPublishTxHash: publication.txHash,
          solanaClaimsEnableTxHash: publication.claimsEnableTxHash,
          solanaOnChainVerifiedAt: new Date().toISOString(),
        })],
      );
      await client.query(
        `update public.reward_batch_items
            set status='claimable',metadata=coalesce(metadata,'{}'::jsonb)||$2::jsonb
          where batch_id=$1::uuid and status='approved'`,
        [batch.id, JSON.stringify({
          solanaProgramId: publication.programId,
          solanaConfigAddress: publication.configAddress,
          solanaVaultAddress: publication.vaultAddress,
          solanaBatchAddress: publication.batchAddress,
          solanaPublishTxHash: publication.txHash,
        })],
      );
      await client.query(
        `update public.reward_batches
            set status='claim_open',claimable_count=$2,published_at=coalesce(published_at,now()),
                metadata=coalesce(metadata,'{}'::jsonb)||$3::jsonb,updated_at=now()
          where id=$1::uuid`,
        [batch.id, ids.rows.length, JSON.stringify({
          onChainBatchCreated: true,
          onChainBatchTxHash: publication.txHash,
          solanaProgramId: publication.programId,
          solanaConfigAddress: publication.configAddress,
          solanaVaultAddress: publication.vaultAddress,
          solanaBatchAddress: publication.batchAddress,
          solanaClaimsEnableTxHash: publication.claimsEnableTxHash,
          onChainBatchVerifiedAt: new Date().toISOString(),
        })],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function assertResumeMetadata(batches) {
  if (batches.length !== 2) throw new Error("Solana airdrop epoch is partially materialized; expected both trader and creator batches");
  const first = batches[0].metadata || {};
  for (const batch of batches.slice(1)) {
    const meta = batch.metadata || {};
    for (const key of ["solanaEpochId", "merkleRoot", "merkleTotalAmount", "claimDeadline"]) {
      if (String(meta[key] ?? "") !== String(first[key] ?? "")) {
        throw new Error(`Solana airdrop resume metadata mismatch for ${key}`);
      }
    }
  }
  if (!first.solanaEpochId || !first.merkleRoot || !first.merkleTotalAmount || !first.claimDeadline) {
    throw new Error("Solana airdrop resume metadata is incomplete");
  }
  return first;
}

async function resumeExisting(client, batches, chainId, displayEpochId) {
  if (batches.every(complete)) return true;
  if (batches.some(complete)) throw new Error("Solana airdrop epoch is partially claim-open; manual reconciliation required");
  const meta = assertResumeMetadata(batches);
  const publication = await publishSolanaAirdropEpoch({
    epochId: meta.solanaEpochId,
    root: meta.merkleRoot,
    totalLamports: meta.merkleTotalAmount,
    deadline: meta.claimDeadline,
  });
  await markEpochClaimOpen(client, batches, publication);
  for (const batch of batches) {
    await audit(client, {
      batchId: batch.id,
      action: "automatic_solana_airdrop_funding_resumed",
      oldValue: batch.status,
      newValue: "claim_open",
      reason: `Solana weekly airdrop publication resumed for ${batch.metadata?.program || "airdrop"}`,
      txHash: publication.txHash,
      metadata: { chainId, displayEpochId, publication },
    });
  }
  return true;
}

async function main() {
  const chainId = envInt("AIRDROP_CHAIN_ID", 101, { min: 1, max: 1_000_000 });
  if (!SOLANA_CHAINS.has(chainId)) throw new Error("Solana weekly airdrop runner only supports chain IDs 101/102");
  const drawSecret = requireEnv("AIRDROP_DRAW_SEED_SECRET");
  const dryRun = envBool("AIRDROP_DRY_RUN", false);
  const enabled = envBool("AIRDROP_AUTOMATION_ENABLED", false);
  if (!dryRun && !enabled) throw new Error("AIRDROP_AUTOMATION_ENABLED must be true for non-dry Solana runs");

  const configuredDistributionBps = envText("AIRDROP_WEEKLY_DISTRIBUTION_BPS");
  if (!dryRun && !/^\d+$/.test(configuredDistributionBps)) {
    throw new Error("AIRDROP_WEEKLY_DISTRIBUTION_BPS must be explicitly configured for live Solana runs");
  }
  const distributionBps = envInt("AIRDROP_WEEKLY_DISTRIBUTION_BPS", dryRun ? 1000 : 0, { min: 1, max: 10_000 });
  if (!dryRun && distributionBps === 10_000 && !envBool("AIRDROP_ALLOW_FULL_VAULT_DISTRIBUTION", false)) {
    throw new Error("100% Solana AirdropVault distribution requires AIRDROP_ALLOW_FULL_VAULT_DISTRIBUTION=true");
  }

  const { start, end, epochId: displayEpochId } = epochWindow();
  const solanaEpochId = Math.floor(start.getTime() / 1000);
  const claimDeadline = Math.floor((end.getTime() + envInt("AIRDROP_CLAIM_WINDOW_DAYS", 7, { min: 1, max: 90 }) * DAY_MS) / 1000);
  const commitment = seedCommitment(drawSecret, chainId, displayEpochId);
  const lockKey = `mwz-weekly-airdrop-solana:${chainId}:${displayEpochId}`;
  const client = await pool.connect();
  let locked = false;

  try {
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return console.log(`[weekly-airdrop-solana] another runner owns ${lockKey}`);
    await assertAirdropSchema(client);

    const existing = [];
    for (const program of PROGRAMS) {
      const batch = await findEpochBatch(client, { chainId, epochId: displayEpochId, program });
      if (batch) existing.push(batch);
    }
    if (existing.length) {
      if (existing.length !== PROGRAMS.length) throw new Error("Solana weekly airdrop is partially materialized; refusing to create a second root");
      await resumeExisting(client, existing, chainId, displayEpochId);
      return console.log(`[weekly-airdrop-solana] ${displayEpochId} already materialized/published`);
    }

    const poolInfo = await resolveSolanaAirdropPool();
    const totalPoolLamports = (poolInfo.availableLamports * BigInt(distributionBps)) / 10_000n;
    if (totalPoolLamports <= 0n) throw new Error("Calculated Solana weekly airdrop pool is zero");
    const traderPool = totalPoolLamports / 2n;
    const creatorPool = totalPoolLamports - traderPool;

    const exclusions = await exclusionSets(client, { chainId, start, end });
    const [traders, creators] = await Promise.all([
      traderCandidates(client, { chainId, start, end, exclusions }),
      creatorCandidates(client, { chainId, start, end, exclusions }),
    ]);
    const allowCrossProgramWinners = envBool("AIRDROP_ALLOW_CROSS_PROGRAM_WINNERS", false);
    const reserved = new Set();
    const selectedGroups = [];

    for (const item of [
      { program: "airdrop_trader", poolLamports: traderPool, candidates: traders },
      { program: "airdrop_creator", poolLamports: creatorPool, candidates: creators },
    ]) {
      const candidates = allowCrossProgramWinners
        ? item.candidates
        : item.candidates.filter((candidate) => !reserved.has(candidate.walletAddress));
      if (!candidates.length) throw new Error(`No eligible Solana candidates remain for ${item.program}`);
      const count = winnerCount(item.poolLamports, candidates.length, item.program);
      const winners = weightedSample(candidates, count, drawSecret, `${chainId}:${displayEpochId}:${item.program}`);
      const payouts = splitPool(item.poolLamports, winners.length);
      if (!winners.length || payouts.some((value) => value <= 0n)) throw new Error(`Invalid Solana winners/payouts for ${item.program}`);
      if (!allowCrossProgramWinners) for (const winner of winners) reserved.add(winner.walletAddress);
      selectedGroups.push({ program: item.program, winners, payouts, candidates });
    }

    if (dryRun) {
      console.log(JSON.stringify({
        dryRun: true,
        chainId,
        displayEpochId,
        solanaEpochId,
        claimDeadline,
        availableLamports: poolInfo.availableLamports.toString(),
        totalPoolLamports: totalPoolLamports.toString(),
        groups: selectedGroups.map((group) => ({
          program: group.program,
          candidateCount: group.candidates.length,
          winnerCount: group.winners.length,
          winners: group.winners.map((winner, index) => ({
            walletAddress: winner.walletAddress,
            winnerRank: winner.winnerRank,
            payoutLamports: group.payouts[index].toString(),
          })),
        })),
      }, null, 2));
      return;
    }

    const materialized = await materializeSolanaAirdropEpoch(client, {
      chainId,
      displayEpochId,
      solanaEpochId,
      start,
      end,
      claimDeadline,
      groups: selectedGroups,
      metadata: {
        availablePoolLamports: poolInfo.availableLamports.toString(),
        vaultBalanceLamports: poolInfo.vaultBalanceLamports,
        rentMinimumLamports: poolInfo.rentMinimumLamports,
        totalWeeklyPoolLamports: totalPoolLamports.toString(),
        poolSource: poolInfo.source,
        distributionBps,
        drawSeedCommitment: commitment,
        securityExclusionCount: exclusions.totalCount,
        allowCrossProgramWinners,
      },
    });

    const publication = await publishSolanaAirdropEpoch({
      epochId: solanaEpochId,
      root: materialized.root,
      totalLamports: materialized.totalAmount,
      deadline: claimDeadline,
    });
    await markEpochClaimOpen(client, materialized.batches, publication);

    for (const batch of materialized.batches) {
      await audit(client, {
        batchId: batch.id,
        action: "automatic_solana_airdrop_run_completed",
        newValue: "claim_open",
        reason: `Automatic Solana weekly ${batch.metadata?.program || "airdrop"} completed and published`,
        txHash: publication.txHash,
        metadata: { chainId, displayEpochId, solanaEpochId, commitment, publication, allowCrossProgramWinners },
      });
    }
    console.log(`[weekly-airdrop-solana] ${displayEpochId} published ${materialized.entries.length} winners at ${publication.batchAddress}`);
  } catch (error) {
    console.error("[weekly-airdrop-solana] failed", error);
    await writeRewardAlert(client, {
      severity: "critical",
      title: "Solana weekly airdrop automation failed",
      message: error?.message || String(error),
      metadata: { chainId, displayEpochId, solanaEpochId, start: start.toISOString(), end: end.toISOString() },
      batchId: null,
    });
    process.exitCode = 1;
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }
}

await main();
