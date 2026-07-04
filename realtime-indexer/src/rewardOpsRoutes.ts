import type express from "express";
import { pool } from "./db.js";

type QueryResult = { rows: any[] };

async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query("select to_regclass($1) as table_name", [tableName]);
  return Boolean(result.rows?.[0]?.table_name);
}

async function firstExistingTable(names: string[]): Promise<string | null> {
  for (const name of names) {
    if (await tableExists(name)) return name;
  }
  return null;
}

async function safeQuery(sql: string, params: any[] = []): Promise<QueryResult> {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    console.warn("[rewardOpsRoutes] optional query failed", error);
    return { rows: [] };
  }
}

function toInt(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
}

function normalizePublication(row: any) {
  return {
    id: row.id ?? null,
    resourceType: row.resource_type ?? row.resourceType ?? row.type ?? "unknown",
    resourceKey: row.resource_key ?? row.resourceKey ?? row.key ?? "default",
    isPublished: Boolean(row.is_published ?? row.isPublished ?? row.published ?? false),
    reason: row.reason ?? null,
    changedBy: row.changed_by ?? row.changedBy ?? null,
    publishedAt: row.published_at ?? row.publishedAt ?? null,
    unpublishedAt: row.unpublished_at ?? row.unpublishedAt ?? null,
  };
}

function normalizeDraw(row: any) {
  return {
    id: row.id ?? null,
    epochId: row.epoch_id ?? row.epochId ?? null,
    program: row.program ?? row.draw_program ?? row.type ?? "unknown",
    status: row.status ?? "unknown",
    winnerCount: row.winner_count ?? row.winnerCount ?? row.winners_count ?? 0,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function normalizeAction(row: any) {
  return {
    id: row.id ?? null,
    actionType: row.action_type ?? row.actionType ?? row.type ?? "unknown",
    target: row.target ?? row.target_address ?? row.targetAddress ?? null,
    status: row.status ?? "unknown",
    reason: row.reason ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function normalizeAlert(row: any) {
  return {
    id: row.id ?? null,
    type: row.type ?? row.alert_type ?? row.alertType ?? "alert",
    severity: row.severity ?? null,
    message: row.message ?? row.reason ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

async function listPublications() {
  const table = await firstExistingTable([
    "public.reward_publications",
    "public.reward_publication_states",
    "public.reward_program_publications",
  ]);
  if (!table) return [];
  const result = await safeQuery(`select * from ${table} order by coalesce(updated_at, created_at, now()) desc limit 100`);
  return result.rows.map(normalizePublication);
}

async function listDraws() {
  const table = await firstExistingTable([
    "public.airdrop_draws",
    "public.reward_airdrop_draws",
    "public.reward_draws",
  ]);
  if (!table) return [];
  const result = await safeQuery(`select * from ${table} order by coalesce(updated_at, created_at, now()) desc limit 50`);
  return result.rows.map(normalizeDraw);
}

async function listActions() {
  const table = await firstExistingTable([
    "public.reward_admin_actions",
    "public.admin_actions",
    "public.operator_actions",
  ]);
  if (!table) return [];
  const result = await safeQuery(`select * from ${table} order by coalesce(updated_at, created_at, now()) desc limit 50`);
  return result.rows.map(normalizeAction);
}

async function listAlerts() {
  const table = await firstExistingTable([
    "public.reward_alerts",
    "public.ops_alerts",
    "public.admin_alerts",
  ]);
  if (!table) return [];
  const result = await safeQuery(`select * from ${table} order by coalesce(created_at, now()) desc limit 50`);
  return result.rows.map(normalizeAlert);
}

async function loadRouting() {
  const linkedWallets = await safeQuery("select count(*)::int as count from public.wallet_links where coalesce(active, true) = true");
  const lockedWallets = await safeQuery("select count(*)::int as count from public.wallet_links where coalesce(locked, false) = true");
  return {
    activeLinkedWalletCount: Number(linkedWallets.rows?.[0]?.count || 0),
    lockedWalletCount: Number(lockedWallets.rows?.[0]?.count || 0),
    recruiterRouteAmount: "0",
    airdropPoolAmount: "0",
  };
}

async function loadClaimVault() {
  return { programs: [] };
}

async function recordRewardAction(actionType: string, body: any) {
  const table = await firstExistingTable([
    "public.reward_admin_actions",
    "public.admin_actions",
    "public.operator_actions",
  ]);
  if (!table) return null;

  const result = await safeQuery(
    `insert into ${table} (action_type, target, status, reason, metadata_json, created_at, updated_at)
     values ($1, $2, $3, $4, $5::jsonb, now(), now())
     returning *`,
    [
      actionType,
      body.resourceKey ?? body.epochId ?? null,
      "queued",
      body.reason ?? null,
      JSON.stringify(body ?? {}),
    ],
  );
  return result.rows?.[0] ? normalizeAction(result.rows[0]) : null;
}

export function registerRewardOpsRoutes(app: express.Express) {
  app.get("/api/security/rewards/ops", async (_req, res, next) => {
    try {
      const [publications, draws, alerts, actions, routing, claimVault] = await Promise.all([
        listPublications(),
        listDraws(),
        listAlerts(),
        listActions(),
        loadRouting(),
        loadClaimVault(),
      ]);
      res.json({ ok: true, data: { publications, draws, alerts, actions, routing, claimVault } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/security/rewards/publications", async (req, res, next) => {
    try {
      const table = await firstExistingTable([
        "public.reward_publications",
        "public.reward_publication_states",
        "public.reward_program_publications",
      ]);
      const body = req.body || {};
      if (!table) {
        const action = await recordRewardAction("reward_publication", body);
        return res.json({ ok: true, queued: true, action, warning: "Publication table not found; action was recorded only." });
      }

      const resourceType = String(body.resourceType || "").trim();
      const resourceKey = String(body.resourceKey || "default").trim() || "default";
      const isPublished = Boolean(body.isPublished);
      if (!resourceType) return res.status(400).json({ ok: false, error: "resourceType is required" });

      const result = await safeQuery(
        `insert into ${table} (resource_type, resource_key, is_published, reason, changed_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, now(), now())
         on conflict (resource_type, resource_key)
         do update set is_published = excluded.is_published,
                       reason = excluded.reason,
                       changed_by = excluded.changed_by,
                       updated_at = now()
         returning *`,
        [resourceType, resourceKey, isPublished, body.reason ?? null, "web-dashboard"],
      );
      res.json({ ok: true, publication: result.rows?.[0] ? normalizePublication(result.rows[0]) : null });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/security/rewards/airdrops/run-draw", async (req, res, next) => {
    try {
      const body = req.body || {};
      const epochId = toInt(body.epochId, 0);
      const program = String(body.program || "").trim();
      if (epochId <= 0) return res.status(400).json({ ok: false, error: "epochId is required" });
      if (!program) return res.status(400).json({ ok: false, error: "program is required" });

      const action = await recordRewardAction("airdrop_draw", body);
      res.json({ ok: true, queued: true, action, message: "Airdrop draw action queued for operator execution." });
    } catch (error) {
      next(error);
    }
  });
}
