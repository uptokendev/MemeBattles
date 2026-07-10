import { pool } from "../../server/db.js";
import {
  DAY_MS, asBigInt, envBool, envInt, envText, epochWindow, requireEnv,
  seedCommitment, splitPool, weightedSample, winnerCount,
} from "./config.mjs";
import {
  assertAirdropSchema, batchComplete, creatorCandidates, exclusionSets, findEpochBatch,
  stageWinners, traderCandidates, writeRewardAlert,
} from "./candidates.mjs";
import {
  configuredVaultAddress, ensureOnChainBatch, keepFundingCheck, markClaimOpen,
  markFundingCheck, publishProgram, resolvePoolWei,
} from "./chain.mjs";

async function audit(client, { batchId, action, oldValue = null, newValue = null, reason, txHash = null, metadata = {} }) {
  await client.query(
    `insert into public.reward_audit_logs
      (batch_id,actor_type,actor_id,action,old_value,new_value,reason,tx_hash,metadata)
     values ($1,'scheduler','weekly_airdrop_runner',$2,$3,$4,$5,$6,$7::jsonb)`,
    [batchId, action, oldValue, newValue, reason, txHash, JSON.stringify(metadata)],
  );
}

async function resumeFunding(client, { batch, chainId, distributorAddress, program, epochId }) {
  if (!batch || batchComplete(batch)) return batch;
  const metadata = batch.metadata || {};
  if (!metadata.contractBatchId || !metadata.merkleRoot || !metadata.merkleTotalAmount) {
    throw new Error(`Existing ${program} batch ${batch.id} is missing Merkle metadata`);
  }
  await markFundingCheck(client, batch.id);
  try {
    const funding = await ensureOnChainBatch({
      batchId: batch.id,
      chainId,
      distributorAddress,
      vaultAddress: configuredVaultAddress(chainId),
      poolSource: metadata.poolSource || "community_rewards_vault",
      batchMetadata: metadata,
    });
    const opened = await markClaimOpen(client, batch.id, funding);
    await audit(client, {
      batchId: batch.id,
      action: "automatic_airdrop_funding_resumed",
      oldValue: batch.status,
      newValue: "claim_open",
      reason: `Automatic funding resumed for ${program}`,
      txHash: funding.txHash,
      metadata: { chainId, epochId, program, funding },
    });
    return opened;
  } catch (error) {
    await keepFundingCheck(client, batch.id, error);
    await writeRewardAlert(client, {
      severity: "critical",
      title: "Airdrop batch funding remains incomplete",
      message: error?.message || String(error),
      metadata: { chainId, epochId, program, batchId: batch.id },
      batchId: batch.id,
    });
    throw error;
  }
}

async function main() {
  const chainId = envInt("AIRDROP_CHAIN_ID", 56, { min: 1, max: 1_000_000 });
  const apiBaseUrl = requireEnv("REWARDS_API_BASE_URL");
  const internalSecret = requireEnv("REWARDS_INTERNAL_SECRET");
  const drawSecret = requireEnv("AIRDROP_DRAW_SEED_SECRET");
  const distributorAddress = requireEnv(`REWARD_DISTRIBUTOR_ADDRESS_${chainId}`);
  const dryRun = envBool("AIRDROP_DRY_RUN", false);
  const { start, end, epochId } = epochWindow();
  const claimDeadline = Math.floor((end.getTime() + envInt("AIRDROP_CLAIM_WINDOW_DAYS", 7, { min: 1, max: 90 }) * DAY_MS) / 1000);
  const commitment = seedCommitment(drawSecret, chainId, epochId);
  const lockKey = `mwz-weekly-airdrop:${chainId}:${epochId}`;
  const client = await pool.connect();
  let locked = false;

  try {
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return console.log(`[weekly-airdrop] another runner owns ${lockKey}`);
    await assertAirdropSchema(client);

    let traderBatch = await findEpochBatch(client, { chainId, epochId, program: "airdrop_trader" });
    let creatorBatch = await findEpochBatch(client, { chainId, epochId, program: "airdrop_creator" });

    if (!dryRun && traderBatch && !batchComplete(traderBatch)) {
      await resumeFunding(client, { batch: traderBatch, chainId, distributorAddress, program: "airdrop_trader", epochId });
      traderBatch = await findEpochBatch(client, { chainId, epochId, program: "airdrop_trader" });
    }
    if (!dryRun && creatorBatch && !batchComplete(creatorBatch)) {
      await resumeFunding(client, { batch: creatorBatch, chainId, distributorAddress, program: "airdrop_creator", epochId });
      creatorBatch = await findEpochBatch(client, { chainId, epochId, program: "airdrop_creator" });
    }
    if (batchComplete(traderBatch) && batchComplete(creatorBatch)) {
      return console.log(`[weekly-airdrop] ${epochId} already claim-open`);
    }

    const anchor = traderBatch?.metadata || creatorBatch?.metadata || null;
    const distributionBps = envInt("AIRDROP_WEEKLY_DISTRIBUTION_BPS", 10000, { min: 1, max: 10000 });
    const pool = anchor?.totalWeeklyPoolWei
      ? {
          availableWei: asBigInt(anchor.availablePoolWei || anchor.totalWeeklyPoolWei),
          source: anchor.poolSource || "community_rewards_vault",
          vaultAddress: configuredVaultAddress(chainId),
        }
      : await resolvePoolWei(chainId);
    const totalPoolWei = anchor?.totalWeeklyPoolWei
      ? asBigInt(anchor.totalWeeklyPoolWei)
      : (pool.availableWei * BigInt(distributionBps)) / 10000n;
    if (totalPoolWei <= 0n) throw new Error("Calculated weekly airdrop pool is zero");

    const traderPoolWei = totalPoolWei / 2n;
    const creatorPoolWei = totalPoolWei - traderPoolWei;
    const exclusions = await exclusionSets(client, { chainId, start, end });
    const [traders, creators] = await Promise.all([
      batchComplete(traderBatch) ? [] : traderCandidates(client, { chainId, start, end, exclusions }),
      batchComplete(creatorBatch) ? [] : creatorCandidates(client, { chainId, start, end, exclusions }),
    ]);
    const programs = [
      { program: "airdrop_trader", poolWei: traderPoolWei, candidates: traders, existing: batchComplete(traderBatch) },
      { program: "airdrop_creator", poolWei: creatorPoolWei, candidates: creators, existing: batchComplete(creatorBatch) },
    ];

    for (const item of programs) {
      if (item.existing) continue;
      if (!item.candidates.length) throw new Error(`No eligible candidates for ${item.program}; refusing to publish`);

      const count = winnerCount(item.poolWei, item.candidates.length, item.program);
      const winners = weightedSample(item.candidates, count, drawSecret, `${chainId}:${epochId}:${item.program}`);
      const payouts = splitPool(item.poolWei, winners.length);
      if (!winners.length || payouts.some((value) => value <= 0n)) {
        throw new Error(`Invalid winners or payouts for ${item.program}`);
      }

      console.log(`[weekly-airdrop] ${item.program}: ${item.candidates.length} candidates -> ${winners.length} winners`);
      if (dryRun) {
        console.log(JSON.stringify({
          dryRun: true,
          chainId,
          epochId,
          program: item.program,
          candidateCount: item.candidates.length,
          winnerCount: winners.length,
          programPoolWei: item.poolWei.toString(),
          winners: winners.map((winner, index) => ({
            walletAddress: winner.walletAddress,
            winnerRank: winner.winnerRank,
            finalWeight: winner.finalWeight,
            payoutAmount: payouts[index].toString(),
          })),
        }, null, 2));
        continue;
      }

      await client.query("begin");
      try {
        await stageWinners(client, {
          chainId,
          epochId,
          program: item.program,
          winners,
          payouts,
          start,
          end,
          poolWei: item.poolWei,
          seedCommitment: commitment,
        });
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }

      const payload = await publishProgram({
        apiBaseUrl,
        internalSecret,
        chainId,
        epochId,
        program: item.program,
        winnerCount: winners.length,
        claimDeadline,
        distributorAddress,
        metadata: {
          automated: true,
          epochStart: start.toISOString(),
          epochEnd: end.toISOString(),
          candidateCount: item.candidates.length,
          winnerCount: winners.length,
          availablePoolWei: pool.availableWei.toString(),
          totalWeeklyPoolWei: totalPoolWei.toString(),
          programPoolWei: item.poolWei.toString(),
          poolSource: pool.source,
          distributionBps,
          drawSeedCommitment: commitment,
          securityExclusionCount: exclusions.totalCount,
        },
      });

      await markFundingCheck(client, payload.batch.id);
      try {
        const funding = await ensureOnChainBatch({
          batchId: payload.batch.id,
          chainId,
          distributorAddress,
          vaultAddress: pool.vaultAddress,
          poolSource: pool.source,
          batchMetadata: payload.batch.metadata,
        });
        await markClaimOpen(client, payload.batch.id, funding);
        await audit(client, {
          batchId: payload.batch.id,
          action: "automatic_airdrop_run_completed",
          newValue: "claim_open",
          reason: `Automatic weekly ${item.program} completed and funded`,
          txHash: funding.txHash,
          metadata: { chainId, epochId, program: item.program, commitment, funding },
        });
      } catch (error) {
        await keepFundingCheck(client, payload.batch.id, error);
        await writeRewardAlert(client, {
          severity: "critical",
          title: "Airdrop batch funding failed",
          message: error?.message || String(error),
          metadata: { chainId, epochId, program: item.program, batchId: payload.batch.id },
          batchId: payload.batch.id,
        });
        throw error;
      }
    }
  } catch (error) {
    console.error("[weekly-airdrop] failed", error);
    await writeRewardAlert(client, {
      severity: "critical",
      title: "Weekly airdrop automation failed",
      message: error?.message || String(error),
      metadata: { chainId, epochId, start: start.toISOString(), end: end.toISOString() },
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
