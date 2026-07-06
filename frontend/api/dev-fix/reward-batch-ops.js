import { pool } from "../../server/db.js";
import { readJson } from "../../server/http.js";

const REWARD_TYPES = new Set(["airdrop", "league", "recruiter", "squad", "battle", "tournament", "campaign", "manual", "future"]);
const BATCH_STATUSES = new Set(["draft", "calculating", "funding_check", "ready", "published", "claim_open", "paused", "failed", "closed", "archived"]);
const LEDGER_STATUSES = new Set(["pending", "approved", "claimable", "claim_pending", "claimed", "failed", "expired", "cancelled"]);

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

function normalizeRewardType(value, fallback = "manual") {
  const raw = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return REWARD_TYPES.has(raw) ? raw : fallback;
}

function normalizeStatus(value, allowed, fallback) {
  const raw = String(value || fallback).trim().toLowerCase();
  return allowed.has(raw) ? raw : fallback;
}

function normalizeWallet(value, chain) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (Number(chain) === 101 || Number(chain) === 102 || String(chain).toLowerCase() === "solana") return raw;
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

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function batchItem(row) {
  return {
    id: String(row.id),
    rewardType: row.reward_type,
    chain: row.chain,
    chainId: Number(row.chain) || null,
    tokenSymbol: row.token_symbol,
    status: row.status,
    totalAmount: String(row.total_amount ?? "0"),
    recipientCount: Number(row.recipient_count || 0),
    claimableCount: Number(row.claimable_count || 0),
    claimedCount: Number(row.claimed_count || 0),
    failedCount: Number(row.failed_count || 0),
    source: row.source || null,
    metadata: readMeta(row),
    createdAt: toIso(row.created_at),
    publishedAt: toIso(row.published_at),
    closedAt: toIso(row.closed_at),
  };
}

function ledgerItem(row) {
  return {
    id: String(row.id),
    rewardType: row.reward_type,
    sourceId: row.source_id || null,
    sourceLabel: row.source_label || null,
    walletAddress: row.wallet_address,
    userId: row.user_id || null,
    chain: row.chain,
    chainId: Number(row.chain) || null,
    tokenSymbol: row.token_symbol,
    amount: String(row.amount ?? "0"),
    amountUsd: row.amount_usd == null ? null : String(row.amount_usd),
    status: row.status,
    claimBatchId: row.claim_batch_id || null,
    claimTxHash: row.claim_tx_hash || null,
    claimError: row.claim_error || null,
    metadata: readMeta(row),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    claimableAt: toIso(row.claimable_at),
    claimedAt: toIso(row.claimed_at),
    expiresAt: toIso(row.expires_at),
  };
}

function actorId(req) {
  return String(req?.headers?.["x-admin-email"] || req?.headers?.["x-user-email"] || "api");
}

async function writeAudit(client, { batchId = null, rewardLedgerId = null, action, oldValue = null, newValue = null, reason = null, req = null, metadata = {} }) {
  await client.query(
    `insert into public.reward_audit_logs (batch_id, reward_ledger_id, actor_type, actor_id, action, old_value, new_value, reason, metadata)
     values ($1, $2, 'api', $3, $4, $5, $6, $7, $8::jsonb)`,
    [batchId, rewardLedgerId, actorId(req), action, oldValue, newValue, reason, JSON.stringify(metadata || {})],
  );
}

function preparedRecipients(body) {
  const raw = Array.isArray(body.recipients) ? body.recipients : Array.isArray(body.items) ? body.items : [];
  return raw
    .map((item) => ({
      walletAddress: String(item.walletAddress || item.wallet_address || item.address || "").trim(),
      amount: String(item.amount ?? item.payoutAmount ?? item.payout_amount ?? "0"),
      amountUsd: item.amountUsd ?? item.amount_usd ?? null,
      status: normalizeStatus(item.status || body.ledgerStatus || body.entryStatus, LEDGER_STATUSES, body.publish ? "claimable" : "approved"),
      sourceId: item.sourceId || item.source_id || body.sourceId || null,
      sourceLabel: item.sourceLabel || item.source_label || body.sourceLabel || null,
      userId: item.userId || item.user_id || null,
      metadata: item.metadata || item.metadataJson || {},
    }))
    .filter((item) => item.walletAddress && Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0);
}

async function insertBatchWithRecipients(client, req, body, overrides = {}) {
  const rewardType = normalizeRewardType(overrides.rewardType || body.rewardType || body.reward_type, "manual");
  const chain = String(overrides.chain || body.chain || body.chainId || body.chain_id || 56);
  const tokenSymbol = String(overrides.tokenSymbol || body.tokenSymbol || body.token_symbol || (Number(chain) === 101 ? "SOL" : "BNB"));
  const recipients = preparedRecipients({ ...body, ...overrides });
  const fallbackStatus = overrides.status || body.status || (body.publish ? "published" : recipients.length ? "ready" : "draft");
  const status = normalizeStatus(fallbackStatus, BATCH_STATUSES, "draft");
  const totalAmount = recipients.reduce((sum, item) => sum + BigInt(String(item.amount || "0")), 0n).toString();
  const claimableCount = recipients.filter((item) => item.status === "claimable").length;
  const claimedCount = recipients.filter((item) => item.status === "claimed").length;
  const failedCount = recipients.filter((item) => item.status === "failed").length;
  const source = String(overrides.source || body.source || "manual_reward_ops");
  const metadata = {
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    ...(overrides.metadata && typeof overrides.metadata === "object" ? overrides.metadata : {}),
  };

  const { rows } = await client.query(
    `insert into public.reward_batches (reward_type, chain, token_symbol, status, total_amount, recipient_count, claimable_count, claimed_count, failed_count, source, metadata, published_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, case when $12 then now() else null end)
     returning *`,
    [rewardType, chain, tokenSymbol, status, totalAmount, recipients.length, claimableCount, claimedCount, failedCount, source, JSON.stringify(metadata), status === "published" || status === "claim_open"],
  );
  const batch = rows[0];
  const ledgerItems = [];

  for (const [index, recipient] of recipients.entries()) {
    const wallet = normalizeWallet(recipient.walletAddress, chain);
    const recipientMetadata = { ...recipient.metadata, batchId: batch.id, batchIndex: index };
    const { rows: ledgerRows } = await client.query(
      `insert into public.reward_ledger (reward_type, source_id, source_label, wallet_address, user_id, chain, token_symbol, amount, amount_usd, status, metadata, claimable_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric, $10, $11::jsonb, case when $10 = 'claimable' then now() else null end)
       returning *`,
      [rewardType, recipient.sourceId, recipient.sourceLabel, wallet, recipient.userId, chain, tokenSymbol, recipient.amount, recipient.amountUsd, recipient.status, JSON.stringify(recipientMetadata)],
    );
    const ledgerRow = ledgerRows[0];
    await client.query(
      `insert into public.reward_batch_items (batch_id, reward_ledger_id, wallet_address, amount, status, metadata)
       values ($1, $2, $3, $4::numeric, $5, $6::jsonb)`,
      [batch.id, ledgerRow.id, wallet, recipient.amount, recipient.status, JSON.stringify(recipientMetadata)],
    );
    ledgerItems.push(ledgerItem(ledgerRow));
  }

  await writeAudit(client, {
    batchId: batch.id,
    action: recipients.length ? "reward_batch_created_with_ledger" : "reward_batch_created",
    newValue: JSON.stringify({ rewardType, status, recipientCount: recipients.length, totalAmount }),
    reason: body.reason || overrides.reason || "Reward batch created",
    req,
    metadata: { source, rewardType },
  });

  return { batch: batchItem(batch), items: ledgerItems };
}

async function updateBatchStatus(req, res, targetStatus, action) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const id = String(req.params?.id || body.batchId || body.id || "").trim();
  if (!id) return json(res, 400, { error: "Missing batch id" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: beforeRows } = await client.query(`select * from public.reward_batches where id = $1::uuid for update`, [id]);
    const before = beforeRows[0];
    if (!before) {
      await client.query("rollback");
      return json(res, 404, { error: "Reward batch not found" });
    }

    const { rows } = await client.query(
      `update public.reward_batches
          set status = $2,
              published_at = case when $2 in ('published', 'claim_open') then coalesce(published_at, now()) else published_at end,
              closed_at = case when $2 in ('closed', 'archived') then coalesce(closed_at, now()) else closed_at end,
              updated_at = now()
        where id = $1::uuid
        returning *`,
      [id, targetStatus],
    );
    await writeAudit(client, { batchId: id, action, oldValue: before.status, newValue: targetStatus, reason: body.reason || action, req });
    await client.query("commit");
    return json(res, 200, { batch: batchItem(rows[0]), materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error(`[${action}]`, error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}

export async function internalRewardBatches(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await insertBatchWithRecipients(client, req, body);
    await client.query("commit");
    return json(res, 201, { ...result, materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error("[internal/reward-batches]", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}

export async function internalRewardBatchPublish(req, res) {
  return updateBatchStatus(req, res, "published", "reward_batch_published");
}

export async function internalRewardBatchPause(req, res) {
  return updateBatchStatus(req, res, "paused", "reward_batch_paused");
}

export async function internalRewardBatchClose(req, res) {
  return updateBatchStatus(req, res, "closed", "reward_batch_closed");
}

export async function internalAirdropsCalculate(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const epochId = Number(body.epochId || body.epoch_id || 0) || null;
  const program = String(body.program || "airdrop_trader");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await insertBatchWithRecipients(client, req, body, {
      rewardType: "airdrop",
      status: body.status || (preparedRecipients(body).length ? "ready" : "calculating"),
      source: body.source || "airdrop_calculate",
      metadata: { epochId, program, calculatedAt: new Date().toISOString() },
      reason: body.reason || "Airdrop calculation recorded",
    });
    await writeAudit(client, { batchId: result.batch.id, action: "airdrop_calculated", reason: body.reason || "Airdrop calculation recorded", req, metadata: { epochId, program } });
    await client.query("commit");
    return json(res, 202, { status: "recorded", ...result, materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error("[internal/airdrops/calculate]", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}

export async function internalAirdropsPublish(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  if (body.batchId || body.id || req.params?.id) {
    return updateBatchStatus({ ...req, body }, res, "published", "airdrop_published");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await insertBatchWithRecipients(client, req, { ...body, publish: true, status: "published" }, {
      rewardType: "airdrop",
      source: body.source || "airdrop_publish",
      metadata: { epochId: body.epochId || body.epoch_id || null, program: body.program || "airdrop_trader", publishedVia: "internal_api" },
      reason: body.reason || "Airdrop published",
    });
    await writeAudit(client, { batchId: result.batch.id, action: "airdrop_published", reason: body.reason || "Airdrop published", req });
    await client.query("commit");
    return json(res, 202, { status: "published", ...result, materializedAt: new Date().toISOString() });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (schemaMissing(error)) return json(res, 503, { error: "Reward ledger schema is not installed.", code: "REWARD_SCHEMA_MISSING" });
    console.error("[internal/airdrops/publish]", error);
    return json(res, 500, { error: "Server error" });
  } finally {
    client.release();
  }
}
