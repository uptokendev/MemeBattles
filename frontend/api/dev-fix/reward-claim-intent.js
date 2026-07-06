import { pool } from "../../server/db.js";
import { readJson } from "../../server/http.js";

const EVM_CHAINS = new Set([56, 97]);
const SOLANA_CHAINS = new Set([101, 102]);
const BYTES32_RE = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;

function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

function json(res, status, payload) {
  return res.status(status).json({ ok: status < 400, ...payload });
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function normalizeWallet(value, chainId) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (SOLANA_CHAINS.has(Number(chainId))) return raw;
  return raw.toLowerCase();
}

function readMeta(row) {
  const meta = row?.metadata;
  if (!meta) return {};
  if (typeof meta === "object") return meta;
  try {
    const parsed = JSON.parse(String(meta));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function cleanAddress(value) {
  const address = String(value || "").trim();
  return ADDRESS_RE.test(address) ? address : "";
}

function envDistributorAddress(chainId) {
  const chain = Number(chainId);
  const candidates = [
    process.env[`REWARD_DISTRIBUTOR_ADDRESS_${chain}`],
    process.env[`VITE_REWARD_DISTRIBUTOR_ADDRESS_${chain}`],
    chain === 97 ? process.env.BNB_TESTNET_REWARD_DISTRIBUTOR_ADDRESS : null,
    chain === 56 ? process.env.BNB_REWARD_DISTRIBUTOR_ADDRESS : null,
    chain === 56 ? process.env.REWARD_DISTRIBUTOR_ADDRESS_BNB : null,
    process.env.REWARD_DISTRIBUTOR_ADDRESS,
    process.env.VITE_REWARD_DISTRIBUTOR_ADDRESS,
  ];
  return cleanAddress(candidates.find(Boolean));
}

function chainClaimConfig(chainId) {
  const chain = Number(chainId) || 56;
  if (SOLANA_CHAINS.has(chain)) {
    return {
      chainId: chain,
      tokenSymbol: "SOL",
      enabled: false,
      mode: "disabled",
      reason: "SOLANA_CLAIMS_DISABLED",
      distributorAddress: "",
    };
  }

  const distributorAddress = EVM_CHAINS.has(chain) ? envDistributorAddress(chain) : "";
  return {
    chainId: chain,
    tokenSymbol: "BNB",
    enabled: Boolean(distributorAddress),
    mode: distributorAddress ? "reward_distributor_merkle" : "disabled",
    reason: distributorAddress ? null : "MISSING_DISTRIBUTOR_ADDRESS",
    distributorAddress,
  };
}

function readProof(metadata) {
  const candidate = Array.isArray(metadata.merkleProof)
    ? metadata.merkleProof
    : Array.isArray(metadata.proof)
      ? metadata.proof
      : Array.isArray(metadata.claimProof)
        ? metadata.claimProof
        : null;

  if (!candidate) return { proof: [], hasProofMetadata: false, valid: false };
  const proof = candidate.map((value) => String(value || "").trim()).filter(Boolean);
  return { proof, hasProofMetadata: true, valid: proof.every((value) => BYTES32_RE.test(value)) };
}

function batchIdFromMetadata(metadata) {
  const raw = firstString(metadata, [
    "contractBatchId",
    "merkleBatchId",
    "batchIdBytes32",
    "rewardBatchBytes32",
    "claimBatchBytes32",
  ]);
  return BYTES32_RE.test(raw) ? raw : "";
}

function distributorFromMetadata(metadata, chainId) {
  const raw = firstString(metadata, [
    "distributorAddress",
    "rewardDistributorAddress",
    "claimContractAddress",
    "contractAddress",
  ]);
  return cleanAddress(raw) || envDistributorAddress(chainId);
}

function claimCallForRow(row) {
  const metadata = readMeta(row);
  const chainId = Number(row.chain) || Number(metadata.chainId) || 56;
  const amount = String(row.amount ?? "0");
  const base = chainClaimConfig(chainId);

  if (SOLANA_CHAINS.has(chainId)) {
    return { ...base, rewardLedgerId: String(row.id), amount, enabled: false };
  }

  const distributorAddress = distributorFromMetadata(metadata, chainId);
  const contractBatchId = batchIdFromMetadata(metadata);
  const { proof, hasProofMetadata, valid } = readProof(metadata);
  const amountOk = /^\d+$/.test(amount) && BigInt(amount) > 0n;

  let reason = null;
  if (!distributorAddress) reason = "MISSING_DISTRIBUTOR_ADDRESS";
  else if (!contractBatchId) reason = "MISSING_CONTRACT_BATCH_ID";
  else if (!hasProofMetadata) reason = "MISSING_MERKLE_PROOF";
  else if (!valid) reason = "INVALID_MERKLE_PROOF";
  else if (!amountOk) reason = "AMOUNT_ZERO";

  return {
    rewardLedgerId: String(row.id),
    chainId,
    tokenSymbol: row.token_symbol || base.tokenSymbol,
    mode: "reward_distributor_merkle",
    enabled: !reason,
    reason,
    distributorAddress,
    contractAddress: distributorAddress,
    contractName: "RewardDistributor",
    functionName: "claim",
    functionSignature: "claim(bytes32,uint256,bytes32[])",
    contractBatchId,
    batchId: contractBatchId,
    amount,
    proof,
    args: contractBatchId ? [contractBatchId, amount, proof] : [],
    explorerTxBase: chainId === 97 ? "https://testnet.bscscan.com/tx/" : "https://bscscan.com/tx/",
  };
}

async function writeAudit(client, { batchId = null, rewardLedgerId = null, action, oldValue = null, newValue = null, reason = null, req = null, txHash = null, metadata = {} }) {
  const actorId = String(req?.headers?.["x-admin-email"] || req?.headers?.["x-user-email"] || "api");
  await client.query(
    `insert into public.reward_audit_logs (batch_id, reward_ledger_id, actor_type, actor_id, action, old_value, new_value, reason, tx_hash, metadata)
     values ($1, $2, 'api', $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [batchId, rewardLedgerId, actorId, action, oldValue, newValue, reason, txHash, JSON.stringify(metadata || {})],
  );
}

async function refreshBatchCounts(client, rewardLedgerIds) {
  const { rows } = await client.query(
    `select distinct batch_id
       from public.reward_batch_items
      where reward_ledger_id = any($1::uuid[])
        and batch_id is not null`,
    [rewardLedgerIds],
  );

  for (const row of rows) {
    await client.query(
      `update public.reward_batches rb
          set recipient_count = stats.recipient_count,
              claimable_count = stats.claimable_count,
              claimed_count = stats.claimed_count,
              failed_count = stats.failed_count,
              updated_at = now()
         from (
           select count(*)::int as recipient_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'claimable')::int as claimable_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'claimed')::int as claimed_count,
                  count(*) filter (where coalesce(rl.status, rbi.status) = 'failed')::int as failed_count
             from public.reward_batch_items rbi
             left join public.reward_ledger rl on rl.id = rbi.reward_ledger_id
            where rbi.batch_id = $1::uuid
         ) stats
        where rb.id = $1::uuid`,
      [row.batch_id],
    );
  }
}

function ledgerItem(row) {
  return {
    id: String(row.id),
    rewardType: row.reward_type,
    walletAddress: row.wallet_address,
    chain: row.chain,
    chainId: Number(row.chain) || null,
    tokenSymbol: row.token_symbol,
    amount: String(row.amount || "0"),
    status: row.status,
    claimBatchId: row.claim_batch_id || null,
    claimTxHash: row.claim_tx_hash || null,
    claimError: row.claim_error || null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function rewardClaimConfig(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const chainId = Number(req.query?.chainId || req.query?.chain || 56);
  return json(res, 200, {
    config: chainClaimConfig(chainId),
    supportedChains: [56, 97],
    disabledChains: [101],
    contract: {
      name: "RewardDistributor",
      claimFunction: "claim(bytes32,uint256,bytes32[])",
      nativeTokenOnly: true,
    },
    materializedAt: new Date().toISOString(),
  });
}

export async function rewardClaimIntent(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const address = String(body.address || body.walletAddress || "").trim();
  const wallet = normalizeWallet(address, chainId);

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: existing } = await client.query(
      `select *
         from public.reward_ledger
        where id = any($1::uuid[])
          and wallet_address = $2
          and status in ('claimable', 'claim_pending', 'failed')
        order by created_at asc
        for update`,
      [ids, wallet],
    );

    if (existing.length !== ids.length) {
      await client.query("rollback");
      return json(res, 404, { error: "One or more rewards are not claimable for this wallet." });
    }

    const solana = existing.find((row) => SOLANA_CHAINS.has(Number(row.chain)) || String(row.chain).toLowerCase() === "solana");
    if (solana) {
      await client.query("rollback");
      return json(res, 409, { error: "Solana reward claiming is not enabled yet.", code: "SOLANA_CLAIMS_DISABLED" });
    }

    const calls = existing.map(claimCallForRow);
    const invalid = calls.find((call) => !call.enabled);
    if (invalid) {
      await client.query("rollback");
      return json(res, 409, {
        error: "Reward is not ready for on-chain claiming.",
        code: invalid.reason || "CLAIM_NOT_READY",
        claim: invalid,
      });
    }

    const intentId = `claim-${Date.now()}`;
    const { rows } = await client.query(
      `update public.reward_ledger
          set status = 'claim_pending',
              claim_batch_id = coalesce(claim_batch_id, $3),
              claim_error = null,
              updated_at = now()
        where id = any($1::uuid[])
          and wallet_address = $2
          and status in ('claimable', 'claim_pending', 'failed')
        returning id, status, chain, token_symbol, amount, claim_batch_id`,
      [ids, wallet, intentId],
    );

    await client.query(`update public.reward_batch_items set status = 'claim_pending' where reward_ledger_id = any($1::uuid[])`, [ids]);
    await refreshBatchCounts(client, ids);

    for (const row of rows) {
      await writeAudit(client, {
        rewardLedgerId: row.id,
        action: "claim_intent_created",
        oldValue: "claimable_or_pending",
        newValue: "claim_pending",
        reason: body.reason || "User claim intent created",
        req,
        metadata: { intentId, callCount: calls.length },
      });
    }

    await client.query("commit");
    return json(res, 202, {
      claimIntent: {
        id: intentId,
        walletAddress: wallet,
        chainId: calls[0]?.chainId || chainId || 56,
        mode: "reward_distributor_merkle",
        requiresWalletTransaction: true,
        calls,
      },
      items: rows.map((row) => ({
        id: String(row.id),
        status: row.status,
        chain: row.chain,
        chainId: Number(row.chain) || null,
        tokenSymbol: row.token_symbol,
        amount: String(row.amount || "0"),
        claimBatchId: row.claim_batch_id || intentId,
      })),
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error("[rewards/claim-intent]", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}

export async function rewardClaimRecord(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const ids = Array.isArray(body.rewardLedgerIds) ? body.rewardLedgerIds : [body.rewardLedgerId || body.id].filter(Boolean);
  const chainId = body.chainId ? Number(body.chainId) : null;
  const wallet = normalizeWallet(body.address || body.walletAddress, chainId);
  const txHash = String(body.txHash || body.claimTxHash || "").trim();
  const failed = String(body.status || "claimed").toLowerCase() === "failed";
  const claimError = String(body.claimError || body.error || "").trim();

  if (!ids.length || !wallet) return json(res, 400, { error: "Missing rewardLedgerIds or walletAddress" });
  if (!failed && !TX_RE.test(txHash)) return json(res, 400, { error: "Missing or invalid txHash" });
  if (failed && !claimError) return json(res, 400, { error: "Missing claimError for failed claim" });

  const targetStatus = failed ? "failed" : "claimed";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: beforeRows } = await client.query(
      `select *
         from public.reward_ledger
        where id = any($1::uuid[])
          and wallet_address = $2
          and status in ('claim_pending', 'claimable', 'failed')
        for update`,
      [ids, wallet],
    );

    if (beforeRows.length !== ids.length) {
      await client.query("rollback");
      return json(res, 404, { error: "One or more rewards could not be recorded for this wallet." });
    }

    const solana = beforeRows.find((row) => SOLANA_CHAINS.has(Number(row.chain)) || String(row.chain).toLowerCase() === "solana");
    if (solana) {
      await client.query("rollback");
      return json(res, 409, { error: "Solana reward claiming is not enabled yet.", code: "SOLANA_CLAIMS_DISABLED" });
    }

    const { rows } = await client.query(
      `update public.reward_ledger
          set status = $3,
              claim_tx_hash = case when $3 = 'claimed' then $4 else claim_tx_hash end,
              claim_error = case when $3 = 'failed' then $5 else null end,
              claimed_at = case when $3 = 'claimed' then coalesce(claimed_at, now()) else claimed_at end,
              updated_at = now()
        where id = any($1::uuid[])
          and wallet_address = $2
        returning *`,
      [ids, wallet, targetStatus, txHash || null, claimError || null],
    );

    await client.query(`update public.reward_batch_items set status = $2 where reward_ledger_id = any($1::uuid[])`, [ids, targetStatus]);
    await refreshBatchCounts(client, ids);

    for (const row of rows) {
      await writeAudit(client, {
        rewardLedgerId: row.id,
        action: targetStatus === "claimed" ? "claim_recorded" : "claim_failed",
        oldValue: "claim_pending",
        newValue: targetStatus,
        reason: body.reason || (targetStatus === "claimed" ? "Wallet claim transaction confirmed" : "Wallet claim transaction failed"),
        txHash: txHash || null,
        req,
        metadata: { claimError: claimError || null, claimIntentId: body.claimIntentId || null },
      });
    }

    await client.query("commit");
    return json(res, 200, { items: rows.map(ledgerItem), materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error("[rewards/claim-record]", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}
