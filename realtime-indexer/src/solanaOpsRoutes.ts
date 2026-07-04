import type express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { QueryResult } from "pg";
import { pool } from "./db.js";
import { ENV } from "./env.js";

const SOLANA_CHAIN_ID = 101;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const ACTION_TYPES = ["global_pause", "campaign_pause", "payout_status", "safety_note"] as const;
const TARGET_KINDS = ["global", "campaign", "payout_intent", "program"] as const;
const ACTION_STATUSES = ["requested", "submitted", "confirmed", "failed", "cancelled"] as const;

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

type ActionType = (typeof ACTION_TYPES)[number];
type TargetKind = (typeof TARGET_KINDS)[number];
type ActionStatus = (typeof ACTION_STATUSES)[number];

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function readBearerToken(req: Request): string {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim();
  return String(req.headers["x-rank-events-token"] || "").trim();
}

function requireInternalAuth(req: Request, res: Response): boolean {
  const expected = String(ENV.RANK_EVENTS_TOKEN || "").trim();
  if (!expected) {
    res.status(503).json({ ok: false, error: "Internal endpoints are disabled: RANK_EVENTS_TOKEN missing" });
    return false;
  }
  if (readBearerToken(req) !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mustIso(value: unknown, label: string): string {
  const iso = toIso(value);
  if (!iso) throw new Error(`Missing ${label}`);
  return iso;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeSolanaAddress(value: unknown, { allowEmpty = false } = {}): string | null {
  const raw = String(value ?? "").trim();
  if (!raw && allowEmpty) return null;
  if (raw.length >= 32 && raw.length <= 88 && SOLANA_ADDRESS_RE.test(raw)) return raw;
  throw new Error(`Invalid Solana address/signature: ${String(value ?? "")}`);
}

function normalizeActionType(value: unknown): ActionType {
  const action = String(value ?? "").trim() as ActionType;
  if (!(ACTION_TYPES as readonly string[]).includes(action)) throw new Error(`Invalid Solana ops actionType: ${String(value ?? "")}`);
  return action;
}

function normalizeTargetKind(value: unknown): TargetKind {
  const target = String(value ?? "global").trim() as TargetKind;
  if (!(TARGET_KINDS as readonly string[]).includes(target)) throw new Error(`Invalid Solana ops targetKind: ${String(value ?? "")}`);
  return target;
}

function normalizeStatus(value: unknown): ActionStatus {
  const status = String(value ?? "requested").trim() as ActionStatus;
  if (!(ACTION_STATUSES as readonly string[]).includes(status)) throw new Error(`Invalid Solana ops status: ${String(value ?? "")}`);
  return status;
}

function mapActionRow(row: any) {
  return {
    id: asNumber(row.id),
    chainId: asNumber(row.chain_id),
    actionType: String(row.action_type),
    targetKind: String(row.target_kind),
    targetAddress: row.target_address ? String(row.target_address) : null,
    status: String(row.status),
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    reason: row.reason ? String(row.reason) : null,
    txSignature: row.tx_signature ? String(row.tx_signature) : null,
    requestedFlags: asObject(row.requested_flags),
    resultJson: asObject(row.result_json),
    requestedAt: mustIso(row.requested_at, "solana_launchpad_admin_actions.requested_at"),
    submittedAt: toIso(row.submitted_at),
    confirmedAt: toIso(row.confirmed_at),
    failedAt: toIso(row.failed_at),
    createdAt: mustIso(row.created_at, "solana_launchpad_admin_actions.created_at"),
    updatedAt: mustIso(row.updated_at, "solana_launchpad_admin_actions.updated_at"),
  };
}

async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[solana-ops] ${label} unavailable`, msg);
    return fallback;
  }
}

async function getIndexerCursor(db: DbLike) {
  return safeQuery("indexer cursor", async () => {
    const result = await db.query(
      `select last_indexed_block, updated_at
         from public.indexer_state
        where chain_id = $1 and cursor = 'solana:program'
        limit 1`,
      [SOLANA_CHAIN_ID],
    );
    const row = result.rows[0];
    return row
      ? { lastIndexedSlot: asNumber(row.last_indexed_block), updatedAt: toIso(row.updated_at) }
      : { lastIndexedSlot: 0, updatedAt: null };
  }, { lastIndexedSlot: 0, updatedAt: null });
}

async function getCampaignPosture(db: DbLike) {
  return safeQuery("campaign posture", async () => {
    const result = await db.query(
      `select
         count(*)::int as total_campaigns,
         count(*) filter (where is_active = true)::int as active_campaigns,
         count(*) filter (where graduated_at_chain is not null)::int as graduated_campaigns,
         max(coalesce(created_at_chain, updated_at, created_at)) as newest_campaign_at
       from public.campaigns
       where chain_id = $1`,
      [SOLANA_CHAIN_ID],
    );
    const row = result.rows[0] ?? {};
    return {
      totalCampaigns: asNumber(row.total_campaigns),
      activeCampaigns: asNumber(row.active_campaigns),
      graduatedCampaigns: asNumber(row.graduated_campaigns),
      newestCampaignAt: toIso(row.newest_campaign_at),
    };
  }, { totalCampaigns: 0, activeCampaigns: 0, graduatedCampaigns: 0, newestCampaignAt: null });
}

async function getPayoutPosture(db: DbLike) {
  return safeQuery("payout posture", async () => {
    const result = await db.query(
      `select
         status,
         count(*)::int as count,
         coalesce(sum(amount_lamports), 0)::numeric(78,0) as amount_lamports
       from public.solana_reward_payout_intents
       group by status
       order by status asc`,
    );
    return result.rows.map((row: any) => ({
      status: String(row.status),
      count: asNumber(row.count),
      amountLamports: String(row.amount_lamports ?? "0"),
    }));
  }, [] as Array<{ status: string; count: number; amountLamports: string }>);
}

async function getVerificationPosture(db: DbLike) {
  return safeQuery("verification posture", async () => {
    const result = await db.query(
      `select
         status,
         count(*)::int as count
       from public.solana_wallet_verifications
       group by status
       order by status asc`,
    );
    return result.rows.map((row: any) => ({ status: String(row.status), count: asNumber(row.count) }));
  }, [] as Array<{ status: string; count: number }>);
}

async function getAdminActionPosture(db: DbLike) {
  return safeQuery("admin action posture", async () => {
    const result = await db.query(
      `select
         status,
         count(*)::int as count,
         max(updated_at) as last_updated_at
       from public.solana_launchpad_admin_actions
       group by status
       order by status asc`,
    );
    return result.rows.map((row: any) => ({
      status: String(row.status),
      count: asNumber(row.count),
      lastUpdatedAt: toIso(row.last_updated_at),
    }));
  }, [] as Array<{ status: string; count: number; lastUpdatedAt: string | null }>);
}

async function getSafetySnapshot(db: DbLike = pool) {
  const [indexer, campaigns, payouts, verifications, adminActions] = await Promise.all([
    getIndexerCursor(db),
    getCampaignPosture(db),
    getPayoutPosture(db),
    getVerificationPosture(db),
    getAdminActionPosture(db),
  ]);

  const pendingActionCount = adminActions
    .filter((item) => item.status === "requested" || item.status === "submitted")
    .reduce((sum, item) => sum + item.count, 0);
  const failedPayoutCount = payouts
    .filter((item) => item.status === "failed")
    .reduce((sum, item) => sum + item.count, 0);
  const queuedPayoutCount = payouts
    .filter((item) => item.status === "queued")
    .reduce((sum, item) => sum + item.count, 0);

  const checks = [
    {
      id: "program_configured",
      status: ENV.SOLANA_LAUNCHPAD_PROGRAM_ID ? "pass" : "warn",
      label: "Solana launchpad program configured",
      detail: ENV.SOLANA_LAUNCHPAD_PROGRAM_ID ? ENV.SOLANA_LAUNCHPAD_PROGRAM_ID : "SOLANA_LAUNCHPAD_PROGRAM_ID is not set",
    },
    {
      id: "rpc_configured",
      status: ENV.SOLANA_RPC_HTTP ? "pass" : "warn",
      label: "Solana RPC configured",
      detail: ENV.SOLANA_RPC_HTTP ? "Configured" : "SOLANA_RPC_HTTP is not set",
    },
    {
      id: "indexer_cursor",
      status: indexer.lastIndexedSlot > 0 ? "pass" : "warn",
      label: "Solana indexer has a cursor",
      detail: indexer.lastIndexedSlot > 0 ? `Last slot ${indexer.lastIndexedSlot}` : "No Solana indexer cursor yet",
    },
    {
      id: "pending_ops",
      status: pendingActionCount === 0 ? "pass" : "warn",
      label: "No pending admin actions",
      detail: pendingActionCount === 0 ? "Clear" : `${pendingActionCount} action(s) awaiting completion`,
    },
    {
      id: "failed_payouts",
      status: failedPayoutCount === 0 ? "pass" : "critical",
      label: "No failed Solana payouts",
      detail: failedPayoutCount === 0 ? "Clear" : `${failedPayoutCount} failed payout(s) need reconciliation`,
    },
  ];

  const overallStatus = checks.some((check) => check.status === "critical")
    ? "critical"
    : checks.some((check) => check.status === "warn")
      ? "warning"
      : "healthy";

  return {
    chainId: SOLANA_CHAIN_ID,
    checkedAt: new Date().toISOString(),
    overallStatus,
    programId: ENV.SOLANA_LAUNCHPAD_PROGRAM_ID || null,
    rpcConfigured: Boolean(ENV.SOLANA_RPC_HTTP),
    indexer,
    campaigns,
    payouts,
    verifications,
    adminActions,
    queuedPayoutCount,
    failedPayoutCount,
    pendingActionCount,
    checks,
  };
}

async function listAdminActions(filters: {
  actionType?: string | null;
  targetKind?: string | null;
  status?: string | null;
  limit?: number;
}, db: DbLike = pool) {
  const clauses = ["chain_id = 101"];
  const values: any[] = [];

  if (filters.actionType) {
    values.push(normalizeActionType(filters.actionType));
    clauses.push(`action_type = $${values.length}`);
  }
  if (filters.targetKind) {
    values.push(normalizeTargetKind(filters.targetKind));
    clauses.push(`target_kind = $${values.length}`);
  }
  if (filters.status) {
    values.push(normalizeStatus(filters.status));
    clauses.push(`status = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 100) || 100)));
  const result = await db.query(
    `select *
       from public.solana_launchpad_admin_actions
      where ${clauses.join(" and ")}
      order by updated_at desc, id desc
      limit $${values.length}`,
    values,
  );
  return result.rows.map(mapActionRow);
}

async function createAdminAction(input: {
  actionType: unknown;
  targetKind?: unknown;
  targetAddress?: unknown;
  requestedBy?: unknown;
  reason?: unknown;
  requestedFlags?: Record<string, unknown> | null;
}, db: DbLike = pool) {
  const actionType = normalizeActionType(input.actionType);
  const targetKind = normalizeTargetKind(input.targetKind ?? (actionType === "campaign_pause" ? "campaign" : "global"));
  const targetAddress = normalizeSolanaAddress(input.targetAddress, { allowEmpty: targetKind === "global" || targetKind === "program" });

  if (targetKind === "campaign" && !targetAddress) throw new Error("targetAddress is required for campaign actions");

  const result = await db.query(
    `insert into public.solana_launchpad_admin_actions(
       chain_id, action_type, target_kind, target_address, status,
       requested_by, reason, requested_flags, result_json,
       requested_at, created_at, updated_at
     ) values (
       101, $1, $2, $3, 'requested',
       $4, $5, $6::jsonb, '{}'::jsonb,
       now(), now(), now()
     )
     returning *`,
    [
      actionType,
      targetKind,
      targetAddress,
      input.requestedBy ? String(input.requestedBy).trim() : null,
      input.reason ? String(input.reason).trim() : null,
      JSON.stringify(input.requestedFlags ?? {}),
    ],
  );
  return mapActionRow(result.rows[0]);
}

async function updateAdminAction(input: {
  actionId: number;
  status: unknown;
  txSignature?: unknown;
  resultJson?: Record<string, unknown> | null;
}, db: DbLike = pool) {
  const actionId = Number(input.actionId);
  if (!Number.isFinite(actionId) || actionId <= 0) throw new Error("Invalid actionId");
  const status = normalizeStatus(input.status);
  const txSignature = normalizeSolanaAddress(input.txSignature, { allowEmpty: true });

  const result = await db.query(
    `update public.solana_launchpad_admin_actions
        set status = $2,
            tx_signature = coalesce($3, tx_signature),
            result_json = result_json || $4::jsonb,
            submitted_at = case when $2 = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
            confirmed_at = case when $2 = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
            failed_at = case when $2 = 'failed' then coalesce(failed_at, now()) else null end,
            updated_at = now()
      where id = $1
      returning *`,
    [actionId, status, txSignature, JSON.stringify(input.resultJson ?? {})],
  );
  if (!result.rowCount) throw new Error("Solana admin action not found");
  return mapActionRow(result.rows[0]);
}

export function registerSolanaOpsRoutes(app: express.Application) {
  app.get("/internal/solana/ops/safety", wrap(async (req, res) => {
    if (!requireInternalAuth(req, res)) return;
    const snapshot = await getSafetySnapshot();
    res.json({ ok: true, snapshot });
  }));

  app.get("/internal/solana/ops/admin-actions", wrap(async (req, res) => {
    if (!requireInternalAuth(req, res)) return;
    const items = await listAdminActions({
      actionType: req.query.actionType ? String(req.query.actionType) : null,
      targetKind: req.query.targetKind ? String(req.query.targetKind) : null,
      status: req.query.status ? String(req.query.status) : null,
      limit: Math.min(Number(req.query.limit || 100), 500),
    });
    res.json({ ok: true, items });
  }));

  app.post("/internal/solana/ops/admin-actions", wrap(async (req, res) => {
    if (!requireInternalAuth(req, res)) return;
    const action = await createAdminAction({
      actionType: req.body?.actionType,
      targetKind: req.body?.targetKind,
      targetAddress: req.body?.targetAddress,
      requestedBy: req.body?.requestedBy ?? req.body?.actedBy ?? null,
      reason: req.body?.reason ?? null,
      requestedFlags: req.body?.requestedFlags ?? req.body?.flags ?? null,
    });
    res.json({ ok: true, action });
  }));

  app.post("/internal/solana/ops/admin-actions/:actionId/status", wrap(async (req, res) => {
    if (!requireInternalAuth(req, res)) return;
    const action = await updateAdminAction({
      actionId: Number(req.params.actionId || 0),
      status: req.body?.status,
      txSignature: req.body?.txSignature ?? req.body?.signature ?? null,
      resultJson: req.body?.resultJson ?? req.body?.result ?? null,
    });
    res.json({ ok: true, action });
  }));
}
