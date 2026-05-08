import type { QueryResult } from "pg";
import { pool } from "../db.js";
import { ENV } from "../env.js";
import { getCurrentWeeklyEpoch } from "./epochs.js";

export type RewardPublicationResource = "airdrop_winners" | "recruiter_leaderboard" | "squad_leaderboard";

export type RewardPublicationStateRecord = {
  id: number | null;
  resourceType: RewardPublicationResource;
  resourceKey: string;
  isPublished: boolean;
  changedBy: string | null;
  reason: string | null;
  metadataJson: Record<string, unknown>;
  publishedAt: string | null;
  unpublishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type RewardAdminActionRecord = {
  id: number;
  actionType: string;
  resourceType: string;
  resourceKey: string;
  actedBy: string | null;
  reason: string | null;
  detailsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RewardRoutingDiagnosticsRecord = {
  chainId: number;
  currentEpochId: number;
  currentEpochStartAt: string;
  currentEpochEndAt: string;
  activeLinkedWalletCount: number;
  lockedWalletCount: number;
  soloWalletCount: number;
  detachedWalletCount: number;
  routedTradeEventCount: number;
  routedFinalizeEventCount: number;
  recruiterRouteAmount: string;
  squadPoolAmount: string;
  airdropPoolAmount: string;
  routeAuthorityConfigured: boolean;
};

export type RewardClaimVaultProgramPosture = {
  program: string;
  pendingAmount: string;
  claimableAmount: string;
  claimedAmount: string;
  expiredAmount: string;
  rolledOverAmount: string;
  claimableEntryCount: number;
};

export type RewardClaimVaultPostureRecord = {
  programs: RewardClaimVaultProgramPosture[];
  totalClaimableAmount: string;
  totalClaimableEntryCount: number;
  carryoverAmount: string;
};

export type RewardEpochProcessorStatusRecord = {
  epochId: number;
  chainId: number;
  startAt: string;
  endAt: string;
  status: string;
  eligibilityResultCount: number;
  drawPublishedCount: number;
  ledgerEntryCount: number;
  claimableEntryCount: number;
};

export type RewardOpsAlertRecord = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
};

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

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

function mapPublicationRow(row: any): RewardPublicationStateRecord {
  return {
    id: row?.id != null ? asNumber(row.id) : null,
    resourceType: String(row?.resource_type ?? "airdrop_winners") as RewardPublicationResource,
    resourceKey: String(row?.resource_key ?? "default"),
    isPublished: row?.is_published != null ? Boolean(row.is_published) : true,
    changedBy: row?.changed_by ? String(row.changed_by) : null,
    reason: row?.reason ? String(row.reason) : null,
    metadataJson: asObject(row?.metadata_json),
    publishedAt: toIso(row?.published_at),
    unpublishedAt: toIso(row?.unpublished_at),
    createdAt: toIso(row?.created_at),
    updatedAt: toIso(row?.updated_at),
  };
}

function mapAdminActionRow(row: any): RewardAdminActionRecord {
  return {
    id: asNumber(row.id),
    actionType: String(row.action_type),
    resourceType: String(row.resource_type),
    resourceKey: String(row.resource_key ?? ""),
    actedBy: row.acted_by ? String(row.acted_by) : null,
    reason: row.reason ? String(row.reason) : null,
    detailsJson: asObject(row.details_json),
    createdAt: mustIso(row.created_at, "reward_admin_actions.created_at"),
    updatedAt: mustIso(row.updated_at, "reward_admin_actions.updated_at"),
  };
}

export async function recordRewardAdminAction(input: {
  actionType: string;
  resourceType: string;
  resourceKey?: string | null;
  actedBy?: string | null;
  reason?: string | null;
  detailsJson?: Record<string, unknown> | null;
}, db: DbLike = pool): Promise<RewardAdminActionRecord> {
  const r = await db.query(
    `insert into public.reward_admin_actions(
       action_type, resource_type, resource_key, acted_by, reason, details_json, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6::jsonb, now(), now()
     )
     returning *`,
    [
      input.actionType,
      input.resourceType,
      input.resourceKey ?? "",
      input.actedBy ?? null,
      input.reason ?? null,
      JSON.stringify(input.detailsJson ?? {}),
    ],
  );
  return mapAdminActionRow(r.rows[0]);
}

export async function listRewardAdminActions(filters: {
  resourceType?: string | null;
  actionType?: string | null;
  limit?: number;
} = {}, db: DbLike = pool): Promise<RewardAdminActionRecord[]> {
  const clauses = ["1=1"];
  const values: any[] = [];
  if (filters.resourceType) {
    values.push(filters.resourceType);
    clauses.push(`resource_type = $${values.length}`);
  }
  if (filters.actionType) {
    values.push(filters.actionType);
    clauses.push(`action_type = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 100) || 100)));
  const r = await db.query(
    `select *
       from public.reward_admin_actions
      where ${clauses.join(" and ")}
      order by created_at desc, id desc
      limit $${values.length}`,
    values,
  );
  return r.rows.map(mapAdminActionRow);
}

export async function getRewardPublicationState(
  resourceType: RewardPublicationResource,
  resourceKey = "default",
  db: DbLike = pool,
): Promise<RewardPublicationStateRecord> {
  const r = await db.query(
    `select *
       from public.reward_publication_states
      where resource_type = $1
        and resource_key = $2
      limit 1`,
    [resourceType, resourceKey],
  );
  if (!r.rows[0]) {
    return {
      id: null,
      resourceType,
      resourceKey,
      isPublished: true,
      changedBy: null,
      reason: null,
      metadataJson: {},
      publishedAt: null,
      unpublishedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return mapPublicationRow(r.rows[0]);
}

export async function setRewardPublicationState(input: {
  resourceType: RewardPublicationResource;
  resourceKey?: string | null;
  isPublished: boolean;
  changedBy?: string | null;
  reason?: string | null;
  metadataJson?: Record<string, unknown> | null;
}, db: DbLike = pool): Promise<RewardPublicationStateRecord> {
  const resourceKey = input.resourceKey ?? "default";
  const r = await db.query(
    `insert into public.reward_publication_states(
       resource_type, resource_key, is_published, changed_by, reason, metadata_json,
       published_at, unpublished_at, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6::jsonb,
       case when $3 then now() else null end,
       case when $3 then null else now() end,
       now(), now()
     )
     on conflict (resource_type, resource_key) do update set
       is_published = excluded.is_published,
       changed_by = excluded.changed_by,
       reason = excluded.reason,
       metadata_json = excluded.metadata_json,
       published_at = case when excluded.is_published then now() else public.reward_publication_states.published_at end,
       unpublished_at = case when excluded.is_published then null else now() end,
       updated_at = now()
     returning *`,
    [
      input.resourceType,
      resourceKey,
      input.isPublished,
      input.changedBy ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadataJson ?? {}),
    ],
  );
  return mapPublicationRow(r.rows[0]);
}

export async function getRewardRoutingDiagnostics(chainId = 97, db: DbLike = pool): Promise<RewardRoutingDiagnosticsRecord> {
  const epoch = await getCurrentWeeklyEpoch(chainId, db);
  const [wallets, events] = await Promise.all([
    db.query(
      `select
         count(*) filter (where recruiter_link_state in ('linked', 'locked'))::int as active_linked_wallet_count,
         count(*) filter (where recruiter_link_state = 'locked')::int as locked_wallet_count,
         count(*) filter (where squad_state like 'solo%')::int as solo_wallet_count,
         count(*) filter (where last_detach_reason is not null or squad_state = 'solo_detached')::int as detached_wallet_count
       from public.wallet_attribution_states`,
    ),
    db.query(
      `select
         count(*) filter (where route_kind = 'trade')::int as routed_trade_event_count,
         count(*) filter (where route_kind = 'finalize')::int as routed_finalize_event_count,
         coalesce(sum(recruiter_amount), 0)::numeric(78,0) as recruiter_route_amount,
         coalesce(sum(squad_amount), 0)::numeric(78,0) as squad_pool_amount,
         coalesce(sum(airdrop_amount), 0)::numeric(78,0) as airdrop_pool_amount
       from public.reward_events
       where epoch_id = $1`,
      [epoch.id],
    ),
  ]);

  const walletRow = wallets.rows[0] ?? {};
  const eventRow = events.rows[0] ?? {};

  return {
    chainId,
    currentEpochId: epoch.id,
    currentEpochStartAt: epoch.startAt,
    currentEpochEndAt: epoch.endAt,
    activeLinkedWalletCount: asNumber(walletRow.active_linked_wallet_count),
    lockedWalletCount: asNumber(walletRow.locked_wallet_count),
    soloWalletCount: asNumber(walletRow.solo_wallet_count),
    detachedWalletCount: asNumber(walletRow.detached_wallet_count),
    routedTradeEventCount: asNumber(eventRow.routed_trade_event_count),
    routedFinalizeEventCount: asNumber(eventRow.routed_finalize_event_count),
    recruiterRouteAmount: String(eventRow.recruiter_route_amount ?? "0"),
    squadPoolAmount: String(eventRow.squad_pool_amount ?? "0"),
    airdropPoolAmount: String(eventRow.airdrop_pool_amount ?? "0"),
    routeAuthorityConfigured: Boolean(String(ENV.ROUTE_AUTHORITY_PRIVATE_KEY || "").trim()),
  };
}

export async function getRewardClaimVaultPosture(db: DbLike = pool): Promise<RewardClaimVaultPostureRecord> {
  const [programs, totals] = await Promise.all([
    db.query(
      `select
         program,
         coalesce(sum(net_amount) filter (where status = 'pending'), 0)::numeric(78,0) as pending_amount,
         coalesce(sum(net_amount) filter (where status = 'claimable'), 0)::numeric(78,0) as claimable_amount,
         coalesce(sum(net_amount) filter (where status = 'claimed'), 0)::numeric(78,0) as claimed_amount,
         coalesce(sum(net_amount) filter (where status = 'expired'), 0)::numeric(78,0) as expired_amount,
         coalesce(sum(net_amount) filter (where status = 'rolled_over'), 0)::numeric(78,0) as rolled_over_amount,
         count(*) filter (where status = 'claimable')::int as claimable_entry_count
       from public.reward_ledger_entries
       group by program
       order by program asc`,
    ),
    db.query(
      `select
         coalesce(sum(net_amount) filter (where status = 'claimable'), 0)::numeric(78,0) as total_claimable_amount,
         count(*) filter (where status = 'claimable')::int as total_claimable_entry_count,
         coalesce((select sum(amount) from public.reward_pool_carryovers), 0)::numeric(78,0) as carryover_amount
       from public.reward_ledger_entries`,
    ),
  ]);

  return {
    programs: programs.rows.map((row: any) => ({
      program: String(row.program),
      pendingAmount: String(row.pending_amount ?? "0"),
      claimableAmount: String(row.claimable_amount ?? "0"),
      claimedAmount: String(row.claimed_amount ?? "0"),
      expiredAmount: String(row.expired_amount ?? "0"),
      rolledOverAmount: String(row.rolled_over_amount ?? "0"),
      claimableEntryCount: asNumber(row.claimable_entry_count),
    })),
    totalClaimableAmount: String(totals.rows[0]?.total_claimable_amount ?? "0"),
    totalClaimableEntryCount: asNumber(totals.rows[0]?.total_claimable_entry_count ?? 0),
    carryoverAmount: String(totals.rows[0]?.carryover_amount ?? "0"),
  };
}

export async function listRewardEpochProcessorStatuses(limit = 20, db: DbLike = pool): Promise<RewardEpochProcessorStatusRecord[]> {
  const r = await db.query(
    `select
       e.id as epoch_id,
       e.chain_id,
       e.start_at,
       e.end_at,
       e.status,
       (
         select count(*)
           from public.eligibility_results er
          where er.epoch_id = e.id
       )::int as eligibility_result_count,
       (
         select count(*)
           from public.airdrop_draws d
          where d.epoch_id = e.id
            and d.status = 'published'
       )::int as draw_published_count,
       (
         select count(*)
           from public.reward_ledger_entries l
          where l.epoch_id = e.id
       )::int as ledger_entry_count,
       (
         select count(*)
           from public.reward_ledger_entries l
          where l.epoch_id = e.id
            and l.status = 'claimable'
       )::int as claimable_entry_count
      from public.epochs e
      order by e.end_at desc, e.id desc
      limit $1`,
    [Math.max(1, Math.min(100, Math.trunc(limit) || 20))],
  );

  return r.rows.map((row: any) => ({
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    startAt: mustIso(row.start_at, "epochs.start_at"),
    endAt: mustIso(row.end_at, "epochs.end_at"),
    status: String(row.status),
    eligibilityResultCount: asNumber(row.eligibility_result_count),
    drawPublishedCount: asNumber(row.draw_published_count),
    ledgerEntryCount: asNumber(row.ledger_entry_count),
    claimableEntryCount: asNumber(row.claimable_entry_count),
  }));
}

export async function listRewardOpsAlerts(db: DbLike = pool): Promise<RewardOpsAlertRecord[]> {
  const alerts: RewardOpsAlertRecord[] = [];
  const [ingestion, epochs, claims, reminders, draws] = await Promise.all([
    db.query(`select max(occurred_at) as last_occurred_at from public.reward_events`),
    db.query(
      `select count(*)::int as backlog_count
         from public.epochs
        where epoch_type = 'weekly'
          and end_at <= now()
          and status in ('open', 'processing', 'finalized')`,
    ),
    db.query(
      `select count(*)::int as due_soon_count
         from public.reward_ledger_entries
        where status = 'claimable'
          and claim_deadline_at is not null
          and claim_deadline_at <= now() + interval '48 hours'`,
    ),
    db.query(
      `select count(*)::int as failed_count
         from public.claim_reminder_states
        where status = 'failed'`,
    ),
    db.query(
      `select count(*)::int as missing_draw_count
         from public.epochs e
        where e.epoch_type = 'weekly'
          and e.end_at <= now()
          and exists (
            select 1 from public.eligibility_results er
             where er.epoch_id = e.id
               and er.program in ('airdrop_trader', 'airdrop_creator')
          )
          and (
            (select count(*) from public.airdrop_draws d where d.epoch_id = e.id and d.program = 'airdrop_trader' and d.status = 'published') = 0
            or
            (select count(*) from public.airdrop_draws d where d.epoch_id = e.id and d.program = 'airdrop_creator' and d.status = 'published') = 0
          )`,
    ),
  ]);

  const lastOccurredAt = toIso(ingestion.rows[0]?.last_occurred_at);
  if (!lastOccurredAt) {
    alerts.push({
      code: "reward_ingestion_empty",
      severity: "warning",
      message: "No reward events have been ingested yet.",
      details: {},
    });
  } else {
    const lagMs = Date.now() - new Date(lastOccurredAt).getTime();
    if (lagMs > 3 * 60 * 60 * 1000) {
      alerts.push({
        code: "reward_ingestion_lag",
        severity: lagMs > 12 * 60 * 60 * 1000 ? "critical" : "warning",
        message: "Reward event ingestion is lagging behind current time.",
        details: { lastOccurredAt, lagMs },
      });
    }
  }

  const epochBacklog = asNumber(epochs.rows[0]?.backlog_count);
  if (epochBacklog > 0) {
    alerts.push({
      code: "reward_epoch_backlog",
      severity: epochBacklog > 2 ? "critical" : "warning",
      message: "Ended reward epochs are waiting to be processed or published.",
      details: { backlogCount: epochBacklog },
    });
  }

  const claimBacklog = asNumber(claims.rows[0]?.due_soon_count);
  if (claimBacklog > 0) {
    alerts.push({
      code: "reward_claim_deadline_backlog",
      severity: claimBacklog > 20 ? "critical" : "warning",
      message: "Claimable rewards are approaching their deadlines.",
      details: { dueSoonCount: claimBacklog },
    });
  }

  const reminderFailures = asNumber(reminders.rows[0]?.failed_count);
  if (reminderFailures > 0) {
    alerts.push({
      code: "reward_reminder_failures",
      severity: reminderFailures > 10 ? "critical" : "warning",
      message: "Claim reminder deliveries have failed and need attention.",
      details: { failedCount: reminderFailures },
    });
  }

  const missingDraws = asNumber(draws.rows[0]?.missing_draw_count);
  if (missingDraws > 0) {
    alerts.push({
      code: "reward_draw_backlog",
      severity: "critical",
      message: "Published airdrop draws are missing for one or more ended epochs.",
      details: { missingDrawCount: missingDraws },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      code: "reward_ops_healthy",
      severity: "info",
      message: "Reward ingestion, draws, claims, and reminders look healthy.",
      details: {},
    });
  }

  return alerts;
}
