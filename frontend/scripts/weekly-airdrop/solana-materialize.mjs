import { keccak256 } from "ethers";
import { PublicKey } from "@solana/web3.js";

const LEAF_PREFIX = Buffer.from("MWZ_AIRDROP_LEAF", "utf8");
const PROGRAM_CODES = Object.freeze({ airdrop_trader: 0, airdrop_creator: 1 });

function i64le(value) {
  let n = BigInt(value);
  if (n < -(1n << 63n) || n > (1n << 63n) - 1n) throw new Error("i64 overflow");
  if (n < 0n) n = (1n << 64n) + n;
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function u64le(value) {
  let n = BigInt(value);
  if (n < 0n || n > (1n << 64n) - 1n) throw new Error("u64 overflow");
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function leafFor({ epochId, programCode, walletAddress, amount }) {
  const wallet = new PublicKey(walletAddress).toBuffer();
  return keccak256(Buffer.concat([
    LEAF_PREFIX,
    i64le(epochId),
    Buffer.from([programCode]),
    wallet,
    u64le(amount),
  ]));
}

function hashPair(left, right) {
  const a = Buffer.from(String(left).replace(/^0x/, ""), "hex");
  const b = Buffer.from(String(right).replace(/^0x/, ""), "hex");
  return keccak256(Buffer.concat(Buffer.compare(a, b) <= 0 ? [a, b] : [b, a]));
}

export function solanaAirdropMerklePlan({ epochId, groups }) {
  const entries = [];
  for (const group of groups) {
    const programCode = PROGRAM_CODES[group.program];
    if (programCode == null) throw new Error(`Unsupported Solana airdrop program ${group.program}`);
    if (group.winners.length !== group.payouts.length) throw new Error(`${group.program} winner/payout mismatch`);
    group.winners.forEach((winner, index) => {
      const walletAddress = new PublicKey(winner.walletAddress).toBase58();
      const amount = BigInt(group.payouts[index]);
      if (amount <= 0n) throw new Error(`Invalid ${group.program} payout for ${walletAddress}`);
      entries.push({
        program: group.program,
        programCode,
        winner,
        walletAddress,
        amount: amount.toString(),
      });
    });
  }
  if (!entries.length) throw new Error("Cannot publish an empty Solana airdrop epoch");

  const leaves = entries.map((entry) => leafFor({ epochId, ...entry }));
  const levels = [leaves];
  while (levels.at(-1).length > 1) {
    const current = levels.at(-1);
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : hashPair(current[i], current[i]));
    }
    levels.push(next);
  }
  const proofs = leaves.map((_leaf, leafIndex) => {
    const proof = [];
    let index = leafIndex;
    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const level = levels[levelIndex];
      const pairIndex = index ^ 1;
      proof.push(level[pairIndex] ?? level[index]);
      index = Math.floor(index / 2);
    }
    return proof;
  });

  const totalAmount = entries.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
  return { entries, leaves, proofs, root: levels.at(-1)[0], totalAmount };
}

export async function materializeSolanaAirdropEpoch(client, {
  chainId,
  displayEpochId,
  solanaEpochId,
  start,
  end,
  claimDeadline,
  groups,
  metadata = {},
}) {
  const plan = solanaAirdropMerklePlan({ epochId: solanaEpochId, groups });
  const now = new Date().toISOString();
  const createdBatches = [];

  await client.query("begin");
  try {
    for (const group of groups) {
      const duplicate = await client.query(
        `select id,status from public.reward_batches
          where reward_type='airdrop' and chain::text=$1 and metadata->>'epochId'=$2 and metadata->>'program'=$3
            and status<>'archived' limit 1 for update`,
        [String(chainId), displayEpochId, group.program],
      );
      if (duplicate.rows[0]) throw new Error(`A ${group.program} batch already exists for epoch ${displayEpochId}`);

      const groupEntries = plan.entries.filter((entry) => entry.program === group.program);
      const groupTotal = groupEntries.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
      const batchMetadata = {
        ...metadata,
        automated: true,
        epochId: displayEpochId,
        solanaEpochId: String(solanaEpochId),
        epochStart: start.toISOString(),
        epochEnd: end.toISOString(),
        program: group.program,
        programCode: PROGRAM_CODES[group.program],
        claimMode: "solana_airdrop",
        solanaMerkleRoot: plan.root,
        merkleRoot: plan.root,
        merkleTotalAmount: plan.totalAmount.toString(),
        logicalProgramAmount: groupTotal.toString(),
        claimDeadline,
        merkleRecipientCount: plan.entries.length,
        merkleLeafEncoding: "keccak256(MWZ_AIRDROP_LEAF || i64le(epoch) || u8(program) || pubkey || u64le(amount))",
        merklePairSorting: "lexicographic_keccak",
        fundingCheckStartedAt: now,
      };

      const { rows: batchRows } = await client.query(
        `insert into public.reward_batches
          (reward_type,chain,token_symbol,status,total_amount,recipient_count,claimable_count,claimed_count,failed_count,source,metadata)
         values ('airdrop',$1,'SOL','funding_check',$2::numeric,$3,0,0,0,'weekly_airdrop_solana_scheduler',$4::jsonb)
         returning *`,
        [String(chainId), groupTotal.toString(), groupEntries.length, JSON.stringify(batchMetadata)],
      );
      const batch = batchRows[0];
      createdBatches.push(batch);

      for (const entry of groupEntries) {
        const globalIndex = plan.entries.indexOf(entry);
        const winnerMetadata = {
          ...entry.winner,
          ...batchMetadata,
          batchId: batch.id,
          batchIndex: globalIndex,
          merkleProof: plan.proofs[globalIndex],
          merkleLeaf: plan.leaves[globalIndex],
          claimAmount: entry.amount,
        };

        await client.query(
          `insert into public.reward_calculation_inputs
            (reward_type,program,epoch_id,chain,token_symbol,wallet_address,amount,score,activity_score,source_id,source_label,status,metadata)
           values ('airdrop',$1,$2,$3,'SOL',$4,$5::numeric,$6::numeric,$7::numeric,$8,'weekly_airdrop_solana_scheduler','approved',$9::jsonb)`,
          [
            group.program,
            displayEpochId,
            String(chainId),
            entry.walletAddress,
            entry.amount,
            String(entry.winner.finalWeight || 0),
            String(entry.winner.activityScore || 0),
            `${displayEpochId}:${group.program}:${entry.winner.winnerRank}`,
            JSON.stringify(winnerMetadata),
          ],
        );

        const { rows: ledgerRows } = await client.query(
          `insert into public.reward_ledger
            (reward_type,source_id,source_label,wallet_address,chain,token_symbol,amount,status,metadata)
           values ('airdrop',$1,'weekly_airdrop_solana_scheduler',$2,$3,'SOL',$4::numeric,'approved',$5::jsonb)
           returning *`,
          [
            `${displayEpochId}:${group.program}:${entry.winner.winnerRank}`,
            entry.walletAddress,
            String(chainId),
            entry.amount,
            JSON.stringify(winnerMetadata),
          ],
        );
        const ledger = ledgerRows[0];
        await client.query(
          `insert into public.reward_batch_items
            (batch_id,reward_ledger_id,wallet_address,amount,status,metadata)
           values ($1,$2,$3,$4::numeric,'approved',$5::jsonb)`,
          [batch.id, ledger.id, entry.walletAddress, entry.amount, JSON.stringify(winnerMetadata)],
        );
      }

      await client.query(
        `insert into public.reward_audit_logs
          (batch_id,actor_type,actor_id,action,new_value,reason,metadata)
         values ($1,'scheduler','weekly_airdrop_solana_runner','automatic_airdrop_batch_materialized',$2,$3,$4::jsonb)`,
        [
          batch.id,
          JSON.stringify({ status: "funding_check", recipientCount: groupEntries.length, totalAmount: groupTotal.toString() }),
          `Automatic Solana ${group.program} batch materialized`,
          JSON.stringify({ chainId, displayEpochId, solanaEpochId: String(solanaEpochId), merkleRoot: plan.root }),
        ],
      );
    }
    await client.query("commit");
    return { ...plan, batches: createdBatches };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export { PROGRAM_CODES };
