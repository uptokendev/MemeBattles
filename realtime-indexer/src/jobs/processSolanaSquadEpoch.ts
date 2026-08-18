import { pool } from "../db.js";
import { processSolanaSquadEligibilityForEpoch } from "../rewards/solanaSquadEligibility.js";
import { getSquadAllocationPreview } from "../rewards/squads.js";

const SOLANA_CHAIN_IDS = new Set([101, 102]);

function envInt(name: string, fallback = 0): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function envBool(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? (fallback ? "true" : "false")).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function resolveEpochId(chainId: number): Promise<number> {
  const explicit = envInt("SOLANA_SQUAD_EPOCH_ID", 0);
  if (explicit > 0) return explicit;
  const { rows } = await pool.query(
    `select id
       from public.epochs
      where chain_id=$1 and epoch_type='weekly' and end_at <= now()
      order by end_at desc, id desc
      limit 1`,
    [chainId],
  );
  const id = Number(rows[0]?.id || 0);
  if (!id) throw new Error(`No completed weekly epoch found for Solana chain ${chainId}`);
  return id;
}

async function main() {
  const chainId = envInt("SOLANA_SQUAD_CHAIN_ID", 101);
  if (!SOLANA_CHAIN_IDS.has(chainId)) throw new Error("SOLANA_SQUAD_CHAIN_ID must be 101 or 102");
  const dryRun = envBool("SOLANA_SQUAD_DRY_RUN", true);
  const epochId = await resolveEpochId(chainId);

  console.log("[solana-squad-epoch] start", { chainId, dryRun, epochId });

  const eligibility = await processSolanaSquadEligibilityForEpoch(epochId);
  if (eligibility.epoch.chainId !== chainId) {
    throw new Error(`Epoch ${epochId} belongs to chain ${eligibility.epoch.chainId}, expected ${chainId}`);
  }
  if (new Date(eligibility.epoch.endAt).getTime() > Date.now()) {
    throw new Error(`Epoch ${epochId} has not ended yet`);
  }

  console.log("[solana-squad-epoch] eligibility complete", {
    memberCount: eligibility.memberCount,
    eligibleCount: eligibility.eligibleCount,
    reviewCount: eligibility.reviewCount,
    hardFlaggedCount: eligibility.hardFlaggedCount,
  });

  const preview = await getSquadAllocationPreview(epochId, pool, chainId);
  const positiveMembers = preview.members.filter((member) => BigInt(member.estimatedPayoutAmount || "0") > 0n);
  const allocated = positiveMembers.reduce((sum, member) => sum + BigInt(member.estimatedPayoutAmount), 0n);
  const globalPool = BigInt(preview.globalPoolAmount || "0");
  const carryover = BigInt(preview.carryoverAmount || "0");

  console.log("[solana-squad-epoch] preview complete", {
    squadCount: preview.leaderboard.length,
    recipientCount: positiveMembers.length,
    globalPoolLamports: globalPool.toString(),
    allocatedLamports: allocated.toString(),
    carryoverLamports: carryover.toString(),
  });

  if (allocated + carryover !== globalPool) {
    throw new Error(`Squad allocation mismatch: allocated=${allocated} carryover=${carryover} pool=${globalPool}`);
  }

  const summary = {
    dryRun,
    chainId,
    epochId,
    epochStart: preview.epoch.startAt,
    epochEnd: preview.epoch.endAt,
    memberCount: eligibility.memberCount,
    eligibleCount: eligibility.eligibleCount,
    reviewCount: eligibility.reviewCount,
    hardFlaggedCount: eligibility.hardFlaggedCount,
    squadCount: preview.leaderboard.length,
    globalPoolLamports: globalPool.toString(),
    allocatedLamports: allocated.toString(),
    carryoverLamports: carryover.toString(),
    recipientCount: positiveMembers.length,
  };

  if (dryRun || positiveMembers.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`mwz:solana:squad:ledger:${chainId}:${epochId}`]);

    for (const member of positiveMembers) {
      const sourceId = `solana-squad:${chainId}:${epochId}:${member.walletAddress}`;
      await client.query(
        `insert into public.reward_ledger(
           reward_type, source_id, source_label, wallet_address, chain, token_symbol,
           amount, status, metadata, created_at, updated_at
         ) values (
           'squad',$1,$2,$3,$4,'SOL',$5::numeric,'approved',$6::jsonb,now(),now()
         )
         on conflict (reward_type, chain, source_id) where source_id is not null do update set
           source_label=excluded.source_label,
           amount=case when public.reward_ledger.status in ('pending','approved') then excluded.amount else public.reward_ledger.amount end,
           metadata=case when public.reward_ledger.status in ('pending','approved') then excluded.metadata else public.reward_ledger.metadata end,
           updated_at=now()`,
        [
          sourceId,
          `Squad Pool - epoch ${epochId}`,
          member.walletAddress,
          String(chainId),
          member.estimatedPayoutAmount,
          JSON.stringify({
            epochId,
            epochStart: preview.epoch.startAt,
            epochEnd: preview.epoch.endAt,
            recruiterId: member.recruiterId,
            recruiterCode: member.recruiterCode,
            rawScore: member.rawScore,
            memberCapAmount: member.memberCapAmount,
            memberCapApplied: member.memberCapApplied,
            amountLamports: member.estimatedPayoutAmount,
            nativeUnit: "lamports",
          }),
        ],
      );
    }

    await client.query("commit");
    console.log(JSON.stringify({ ...summary, materialized: true }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

await main()
  .catch((error) => {
    console.error("[solana-squad-epoch] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
