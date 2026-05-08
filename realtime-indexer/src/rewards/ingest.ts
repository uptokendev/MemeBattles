import type { QueryResult } from "pg";
import { pool } from "../db.js";
import { ensureWeeklyEpoch, type RewardEpochRecord } from "./epochs.js";

export type RewardRouteKind = "trade" | "finalize";
export type RewardRouteProfile = "standard_linked" | "standard_unlinked" | "og_linked";

export type RewardEventContext = {
  walletAddress: string | null;
  campaignAddress: string | null;
  matchedActivitySource: "curve_trade" | "campaign_finalize" | null;
  metadata: Record<string, unknown> | null;
};

export type UpsertRewardEventInput = {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  occurredAt: Date;
  routeKind: RewardRouteKind;
  routeProfile: RewardRouteProfile;
  leagueAmount: bigint;
  recruiterAmount: bigint;
  airdropAmount: bigint;
  squadAmount: bigint;
  protocolAmount: bigint;
  rawAmount: bigint;
  sourceContract: string;
  sourceEvent?: string;
};

export type RewardEventRecord = {
  id: number;
  epochId: number;
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  occurredAt: string;
  walletAddress: string | null;
  campaignAddress: string | null;
  routeKind: RewardRouteKind;
  routeProfile: RewardRouteProfile;
  leagueAmount: string;
  recruiterAmount: string;
  airdropAmount: string;
  squadAmount: string;
  protocolAmount: string;
  rawAmount: string;
  sourceContract: string;
  sourceEvent: string;
  matchedActivitySource: string | null;
  metadata: Record<string, unknown>;
};

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAddress(value: unknown): string {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${String(value ?? "")}`);
  }
  return address;
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

function bigintString(value: bigint): string {
  return value.toString();
}

function mapRewardEventRow(row: any): RewardEventRecord {
  return {
    id: asNumber(row.id),
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    txHash: String(row.tx_hash),
    logIndex: asNumber(row.log_index),
    blockNumber: asNumber(row.block_number),
    occurredAt: mustIso(row.occurred_at, "occurred_at"),
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    campaignAddress: row.campaign_address ? String(row.campaign_address) : null,
    routeKind: String(row.route_kind) as RewardRouteKind,
    routeProfile: String(row.route_profile) as RewardRouteProfile,
    leagueAmount: String(row.league_amount ?? "0"),
    recruiterAmount: String(row.recruiter_amount ?? "0"),
    airdropAmount: String(row.airdrop_amount ?? "0"),
    squadAmount: String(row.squad_amount ?? "0"),
    protocolAmount: String(row.protocol_amount ?? "0"),
    rawAmount: String(row.raw_amount ?? "0"),
    sourceContract: String(row.source_contract),
    sourceEvent: String(row.source_event),
    matchedActivitySource: row.matched_activity_source ? String(row.matched_activity_source) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

async function resolveRewardEventContext(
  db: DbLike,
  chainId: number,
  txHash: string,
  routeKind: RewardRouteKind
): Promise<RewardEventContext> {
  const normalizedHash = String(txHash).trim().toLowerCase();

  if (routeKind === "trade") {
    const trade = await db.query(
      `select wallet, campaign_address, side, token_amount_raw, bnb_amount_raw
         from public.curve_trades
        where chain_id = $1 and tx_hash = $2
        order by log_index asc
        limit 1`,
      [chainId, normalizedHash]
    );

    const row = trade.rows[0];
    if (row) {
      return {
        walletAddress: row.wallet ? String(row.wallet) : null,
        campaignAddress: row.campaign_address ? String(row.campaign_address) : null,
        matchedActivitySource: "curve_trade",
        metadata: {
          tradeSide: row.side ? String(row.side) : null,
          tokenAmountRaw: row.token_amount_raw != null ? String(row.token_amount_raw) : null,
          bnbAmountRaw: row.bnb_amount_raw != null ? String(row.bnb_amount_raw) : null,
        },
      };
    }
  }

  const finalized = await db.query(
    `select campaign_address
       from public.campaigns
      where chain_id = $1
        and lower(coalesce(meta ->> 'graduatedTx', '')) = $2
      order by graduated_block desc nulls last, updated_at desc nulls last
      limit 1`,
    [chainId, normalizedHash]
  );

  const campaignAddress = finalized.rows[0]?.campaign_address ? String(finalized.rows[0].campaign_address) : null;
  if (campaignAddress) {
    return {
      walletAddress: null,
      campaignAddress,
      matchedActivitySource: "campaign_finalize",
      metadata: { matchedFrom: "campaigns.meta.graduatedTx" },
    };
  }

  return {
    walletAddress: null,
    campaignAddress: null,
    matchedActivitySource: null,
    metadata: null,
  };
}

export async function upsertRewardEvent(input: UpsertRewardEventInput, db: DbLike = pool): Promise<RewardEventRecord> {
  const epoch: RewardEpochRecord = await ensureWeeklyEpoch(input.chainId, input.occurredAt, db);
  const context = await resolveRewardEventContext(db, input.chainId, input.txHash, input.routeKind);

  const metadata = {
    ...(context.metadata ?? {}),
  };

  const r = await db.query(
    `insert into public.reward_events(
       chain_id, tx_hash, log_index, block_number, occurred_at, epoch_id,
       wallet_address, campaign_address, route_kind, route_profile,
       league_amount, recruiter_amount, airdrop_amount, squad_amount, protocol_amount, raw_amount,
       source_contract, source_event, matched_activity_source, metadata, created_at, updated_at
     ) values (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,$10,
       $11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,now(),now()
     )
     on conflict (chain_id, tx_hash, log_index) do update set
       block_number = excluded.block_number,
       occurred_at = excluded.occurred_at,
       epoch_id = excluded.epoch_id,
       wallet_address = coalesce(excluded.wallet_address, public.reward_events.wallet_address),
       campaign_address = coalesce(excluded.campaign_address, public.reward_events.campaign_address),
       route_kind = excluded.route_kind,
       route_profile = excluded.route_profile,
       league_amount = excluded.league_amount,
       recruiter_amount = excluded.recruiter_amount,
       airdrop_amount = excluded.airdrop_amount,
       squad_amount = excluded.squad_amount,
       protocol_amount = excluded.protocol_amount,
       raw_amount = excluded.raw_amount,
       source_contract = excluded.source_contract,
       source_event = excluded.source_event,
       matched_activity_source = coalesce(excluded.matched_activity_source, public.reward_events.matched_activity_source),
       metadata = coalesce(public.reward_events.metadata, '{}'::jsonb) || excluded.metadata,
       updated_at = now()
     returning *`,
    [
      input.chainId,
      String(input.txHash).trim().toLowerCase(),
      input.logIndex,
      input.blockNumber,
      input.occurredAt,
      epoch.id,
      context.walletAddress,
      context.campaignAddress,
      input.routeKind,
      input.routeProfile,
      bigintString(input.leagueAmount),
      bigintString(input.recruiterAmount),
      bigintString(input.airdropAmount),
      bigintString(input.squadAmount),
      bigintString(input.protocolAmount),
      bigintString(input.rawAmount),
      normalizeAddress(input.sourceContract),
      String(input.sourceEvent || "RouteExecuted"),
      context.matchedActivitySource,
      JSON.stringify(metadata),
    ]
  );

  return mapRewardEventRow(r.rows[0]);
}

export async function getCurrentWeeklyRewardEpoch(chainId: number, db: DbLike = pool): Promise<RewardEpochRecord> {
  return ensureWeeklyEpoch(chainId, new Date(), db);
}

export async function listRewardEpochs(chainId: number, limit = 20, db: DbLike = pool): Promise<RewardEpochRecord[]> {
  const r = await db.query(
    `select *
       from public.epochs
      where chain_id = $1 and epoch_type = 'weekly'
      order by start_at desc
      limit $2`,
    [chainId, Math.max(1, Math.min(200, Math.trunc(limit) || 20))]
  );

  return r.rows.map(mapEpochRowFromEpoch);
}

function mapEpochRowFromEpoch(row: any): RewardEpochRecord {
  return {
    id: asNumber(row.id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type) as RewardEpochRecord["epochType"],
    startAt: mustIso(row.start_at, "start_at"),
    endAt: mustIso(row.end_at, "end_at"),
    status: String(row.status) as RewardEpochRecord["status"],
    createdAt: mustIso(row.created_at, "created_at"),
    finalizedAt: toIso(row.finalized_at),
  };
}

export async function listRewardEvents(filters: {
  chainId: number;
  epochId?: number | null;
  campaignAddress?: string | null;
  walletAddress?: string | null;
  txHash?: string | null;
  limit?: number;
}, db: DbLike = pool): Promise<RewardEventRecord[]> {
  const clauses = ["chain_id = $1"];
  const values: any[] = [filters.chainId];

  if (filters.epochId != null) {
    values.push(filters.epochId);
    clauses.push(`epoch_id = $${values.length}`);
  }
  if (filters.campaignAddress) {
    values.push(normalizeAddress(filters.campaignAddress));
    clauses.push(`campaign_address = $${values.length}`);
  }
  if (filters.walletAddress) {
    values.push(normalizeAddress(filters.walletAddress));
    clauses.push(`wallet_address = $${values.length}`);
  }
  if (filters.txHash) {
    values.push(String(filters.txHash).trim().toLowerCase());
    clauses.push(`tx_hash = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 50) || 50)));

  const r = await db.query(
    `select *
       from public.reward_events
      where ${clauses.join(" and ")}
      order by occurred_at desc, block_number desc, log_index desc
      limit $${values.length}`,
    values
  );

  return r.rows.map(mapRewardEventRow);
}
