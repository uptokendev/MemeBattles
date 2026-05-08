import type { QueryResult } from "pg";
import { pool } from "../db.js";
import type { RewardProgram } from "./ledger.js";
import type { EligibilityProgram, EligibilityReasonCode } from "./reasonCodes.js";

export type WalletRewardSummaryRecord = {
  walletAddress: string;
  firstSeenAt: string | null;
  firstActivityAt: string | null;
  hasActivity: boolean;
  createdCampaignCount: number;
  tradeCount: number;
  recruiterLinkState: string | null;
  squadState: string | null;
  lastDetachReason: string | null;
  recruiter: null | {
    id: number;
    walletAddress: string;
    code: string;
    displayName: string | null;
    isOg: boolean;
    status: string | null;
    linkSource: string | null;
    linkedAt: string | null;
    lockedAt: string | null;
  };
  squad: null | {
    recruiterId: number;
    recruiterCode: string;
    recruiterDisplayName: string | null;
    joinedAt: string | null;
  };
  pendingByProgram: Record<string, string>;
  claimableByProgram: Record<string, string>;
  claimedByProgram: Record<string, string>;
  totalClaimableAmount: string;
  claimedLifetimeAmount: string;
  lastClaimedAt: string | null;
  latestEligibilityByProgram: Record<string, unknown>;
  latestReasonCodesByProgram: Record<string, EligibilityReasonCode[]>;
  openHardFlagCount: number;
  openReviewFlagCount: number;
  materializedAt: string | null;
};

export type RecruiterSummaryRecord = {
  recruiterId: number;
  walletAddress: string;
  code: string;
  displayName: string | null;
  isOg: boolean;
  status: string;
  closedAt: string | null;
  linkedWalletCount: number;
  linkedCreatorsCount: number;
  linkedTradersCount: number;
  activeSquadMemberCount: number;
  referredEventCount: number;
  referredVolumeRaw: string;
  recruiterRouteAmountRaw: string;
  lastReferredEventAt: string | null;
  latestLinkedActivityAt: string | null;
  pendingEarningsRaw: string;
  claimableEarningsRaw: string;
  totalEarnedRaw: string;
  claimedLifetimeRaw: string;
  lastClaimedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  materializedAt: string | null;
};

export type SquadSummaryRecord = {
  recruiterId: number;
  recruiterWalletAddress: string;
  recruiterCode: string;
  recruiterDisplayName: string | null;
  recruiterIsOg: boolean;
  recruiterStatus: string;
  activeMemberCount: number;
  eligibleMemberCount: number;
  totalEligibleScore: string;
  routedEventCount: number;
  routedSquadAmountTotal: string;
  currentEpochRoutedSquadAmount: string;
  estimatedPendingPoolAmount: string;
  lastRoutedAt: string | null;
  currentEpochId: number | null;
  currentEpochStartAt: string | null;
  currentEpochEndAt: string | null;
  materializedAt: string | null;
};

export type RewardAdminEpochSummaryRecord = {
  epochId: number;
  chainId: number;
  epochType: string;
  startAt: string;
  endAt: string;
  status: string;
  rewardEventCount: number;
  rawAmountTotal: string;
  leagueAmountTotal: string;
  recruiterAmountTotal: string;
  airdropAmountTotal: string;
  squadAmountTotal: string;
  protocolAmountTotal: string;
  firstRewardEventAt: string | null;
  lastRewardEventAt: string | null;
  ledgerEntryCount: number;
  ledgerPendingCount: number;
  ledgerClaimableCount: number;
  ledgerClaimedCount: number;
  ledgerExpiredCount: number;
  ledgerRolledOverCount: number;
  ledgerClaimableAmount: string;
  ledgerClaimedAmount: string;
  ledgerExpiredAmount: string;
  ledgerRolledOverAmount: string;
  claimRecordCount: number;
  claimRecordedAmount: string;
  eligibilityResultCount: number;
  eligibilityEligibleCount: number;
  eligibilityIneligibleCount: number;
  openHardFlagCount: number;
  openReviewFlagCount: number;
  totalExclusionFlagCount: number;
  finalizedAt: string | null;
  materializedAt: string | null;
};

export type RewardProgramEpochReconciliationRecord = {
  epochId: number;
  chainId: number;
  epochType: string;
  startAt: string;
  endAt: string;
  epochStatus: string;
  program: RewardProgram;
  eventPoolAmount: string;
  ledgerEntryCount: number;
  ledgerGrossAmount: string;
  ledgerNetAmount: string;
  cancelledGrossAmount: string;
  cancelledNetAmount: string;
  pendingNetAmount: string;
  claimableNetAmount: string;
  claimedNetAmount: string;
  expiredNetAmount: string;
  rolledOverNetAmount: string;
  claimCount: number;
  claimRecordedAmount: string;
  rolloverCount: number;
  rolloverAmount: string;
  unallocatedEventAmount: string;
  overallocatedEventAmount: string;
  materializedAt: string;
};

export type RecruiterClosureDiagnosticRecord = {
  recruiterId: number;
  walletAddress: string;
  code: string | null;
  displayName: string | null;
  status: string;
  closedAt: string | null;
  detachedWalletCount: number;
  lastDetachedAt: string | null;
  detachedSquadMemberCount: number;
  lastSquadLeftAt: string | null;
  materializedAt: string;
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

function normalizeAddress(value: unknown): string {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`Invalid wallet address: ${String(value ?? "")}`);
  }
  return address;
}

function normalizeCode(value: unknown): string {
  const code = String(value ?? "").trim();
  if (!code) throw new Error("Recruiter code is required");
  return code;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asReasonCodeMap(value: unknown): Record<string, EligibilityReasonCode[]> {
  const obj = asObject(value);
  const out: Record<string, EligibilityReasonCode[]> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = Array.isArray(val) ? val.map((item) => String(item) as EligibilityReasonCode) : [];
  }
  return out;
}

function mapWalletRewardSummaryRow(row: any): WalletRewardSummaryRecord {
  return {
    walletAddress: String(row.wallet_address),
    firstSeenAt: toIso(row.first_seen_at),
    firstActivityAt: toIso(row.first_activity_at),
    hasActivity: Boolean(row.has_activity),
    createdCampaignCount: asNumber(row.created_campaign_count),
    tradeCount: asNumber(row.trade_count),
    recruiterLinkState: row.recruiter_link_state ? String(row.recruiter_link_state) : null,
    squadState: row.squad_state ? String(row.squad_state) : null,
    lastDetachReason: row.last_detach_reason ? String(row.last_detach_reason) : null,
    recruiter: row.recruiter_id != null
      ? {
          id: asNumber(row.recruiter_id),
          walletAddress: String(row.recruiter_wallet_address),
          code: String(row.recruiter_code),
          displayName: row.recruiter_display_name ? String(row.recruiter_display_name) : null,
          isOg: Boolean(row.recruiter_is_og),
          status: row.recruiter_status ? String(row.recruiter_status) : null,
          linkSource: row.link_source ? String(row.link_source) : null,
          linkedAt: toIso(row.linked_at),
          lockedAt: toIso(row.locked_at),
        }
      : null,
    squad: row.squad_recruiter_id != null
      ? {
          recruiterId: asNumber(row.squad_recruiter_id),
          recruiterCode: String(row.squad_recruiter_code),
          recruiterDisplayName: row.squad_recruiter_display_name ? String(row.squad_recruiter_display_name) : null,
          joinedAt: toIso(row.squad_joined_at),
        }
      : null,
    pendingByProgram: {
      recruiter: String(row.pending_recruiter_amount ?? "0"),
      airdrop_trader: String(row.pending_airdrop_trader_amount ?? "0"),
      airdrop_creator: String(row.pending_airdrop_creator_amount ?? "0"),
      squad: String(row.pending_squad_amount ?? "0"),
    },
    claimableByProgram: {
      recruiter: String(row.claimable_recruiter_amount ?? "0"),
      airdrop_trader: String(row.claimable_airdrop_trader_amount ?? "0"),
      airdrop_creator: String(row.claimable_airdrop_creator_amount ?? "0"),
      squad: String(row.claimable_squad_amount ?? "0"),
    },
    claimedByProgram: {
      recruiter: String(row.claimed_recruiter_amount ?? "0"),
      airdrop_trader: String(row.claimed_airdrop_trader_amount ?? "0"),
      airdrop_creator: String(row.claimed_airdrop_creator_amount ?? "0"),
      squad: String(row.claimed_squad_amount ?? "0"),
    },
    totalClaimableAmount: String(row.total_claimable_amount ?? "0"),
    claimedLifetimeAmount: String(row.claimed_lifetime_amount ?? "0"),
    lastClaimedAt: toIso(row.last_claimed_at),
    latestEligibilityByProgram: asObject(row.latest_eligibility_by_program),
    latestReasonCodesByProgram: asReasonCodeMap(row.latest_reason_codes_by_program),
    openHardFlagCount: asNumber(row.open_hard_flag_count),
    openReviewFlagCount: asNumber(row.open_review_flag_count),
    materializedAt: toIso(row.materialized_at),
  };
}

function mapRecruiterSummaryRow(row: any): RecruiterSummaryRecord {
  return {
    recruiterId: asNumber(row.recruiter_id),
    walletAddress: String(row.wallet_address),
    code: String(row.code),
    displayName: row.display_name ? String(row.display_name) : null,
    isOg: Boolean(row.is_og),
    status: String(row.status),
    closedAt: toIso(row.closed_at),
    linkedWalletCount: asNumber(row.linked_wallet_count),
    linkedCreatorsCount: asNumber(row.linked_creators_count),
    linkedTradersCount: asNumber(row.linked_traders_count),
    activeSquadMemberCount: asNumber(row.active_squad_member_count),
    referredEventCount: asNumber(row.referred_event_count),
    referredVolumeRaw: String(row.referred_volume_raw ?? "0"),
    recruiterRouteAmountRaw: String(row.recruiter_route_amount_raw ?? "0"),
    lastReferredEventAt: toIso(row.last_referred_event_at),
    latestLinkedActivityAt: toIso(row.latest_linked_activity_at),
    pendingEarningsRaw: String(row.pending_earnings_raw ?? "0"),
    claimableEarningsRaw: String(row.claimable_earnings_raw ?? "0"),
    totalEarnedRaw: String(row.total_earned_raw ?? "0"),
    claimedLifetimeRaw: String(row.claimed_lifetime_raw ?? "0"),
    lastClaimedAt: toIso(row.last_claimed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    materializedAt: toIso(row.materialized_at),
  };
}

function mapSquadSummaryRow(row: any): SquadSummaryRecord {
  return {
    recruiterId: asNumber(row.recruiter_id),
    recruiterWalletAddress: String(row.recruiter_wallet_address),
    recruiterCode: String(row.recruiter_code),
    recruiterDisplayName: row.recruiter_display_name ? String(row.recruiter_display_name) : null,
    recruiterIsOg: Boolean(row.recruiter_is_og),
    recruiterStatus: String(row.recruiter_status),
    activeMemberCount: asNumber(row.active_member_count),
    eligibleMemberCount: asNumber(row.eligible_member_count),
    totalEligibleScore: String(row.total_eligible_score ?? "0"),
    routedEventCount: asNumber(row.routed_event_count),
    routedSquadAmountTotal: String(row.routed_squad_amount_total ?? "0"),
    currentEpochRoutedSquadAmount: String(row.current_epoch_routed_squad_amount ?? "0"),
    estimatedPendingPoolAmount: String(row.estimated_pending_pool_amount ?? "0"),
    lastRoutedAt: toIso(row.last_routed_at),
    currentEpochId: row.current_epoch_id != null ? asNumber(row.current_epoch_id) : null,
    currentEpochStartAt: toIso(row.current_epoch_start_at),
    currentEpochEndAt: toIso(row.current_epoch_end_at),
    materializedAt: toIso(row.materialized_at),
  };
}

function mapAdminEpochSummaryRow(row: any): RewardAdminEpochSummaryRecord {
  return {
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type),
    startAt: mustIso(row.start_at, "reward_admin_epoch_summaries.start_at"),
    endAt: mustIso(row.end_at, "reward_admin_epoch_summaries.end_at"),
    status: String(row.status),
    rewardEventCount: asNumber(row.reward_event_count),
    rawAmountTotal: String(row.raw_amount_total ?? "0"),
    leagueAmountTotal: String(row.league_amount_total ?? "0"),
    recruiterAmountTotal: String(row.recruiter_amount_total ?? "0"),
    airdropAmountTotal: String(row.airdrop_amount_total ?? "0"),
    squadAmountTotal: String(row.squad_amount_total ?? "0"),
    protocolAmountTotal: String(row.protocol_amount_total ?? "0"),
    firstRewardEventAt: toIso(row.first_reward_event_at),
    lastRewardEventAt: toIso(row.last_reward_event_at),
    ledgerEntryCount: asNumber(row.ledger_entry_count),
    ledgerPendingCount: asNumber(row.ledger_pending_count),
    ledgerClaimableCount: asNumber(row.ledger_claimable_count),
    ledgerClaimedCount: asNumber(row.ledger_claimed_count),
    ledgerExpiredCount: asNumber(row.ledger_expired_count),
    ledgerRolledOverCount: asNumber(row.ledger_rolled_over_count),
    ledgerClaimableAmount: String(row.ledger_claimable_amount ?? "0"),
    ledgerClaimedAmount: String(row.ledger_claimed_amount ?? "0"),
    ledgerExpiredAmount: String(row.ledger_expired_amount ?? "0"),
    ledgerRolledOverAmount: String(row.ledger_rolled_over_amount ?? "0"),
    claimRecordCount: asNumber(row.claim_record_count),
    claimRecordedAmount: String(row.claim_recorded_amount ?? "0"),
    eligibilityResultCount: asNumber(row.eligibility_result_count),
    eligibilityEligibleCount: asNumber(row.eligibility_eligible_count),
    eligibilityIneligibleCount: asNumber(row.eligibility_ineligible_count),
    openHardFlagCount: asNumber(row.open_hard_flag_count),
    openReviewFlagCount: asNumber(row.open_review_flag_count),
    totalExclusionFlagCount: asNumber(row.total_exclusion_flag_count),
    finalizedAt: toIso(row.finalized_at),
    materializedAt: toIso(row.materialized_at),
  };
}

function mapRewardProgramEpochReconciliationRow(row: any): RewardProgramEpochReconciliationRecord {
  return {
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type),
    startAt: mustIso(row.start_at, "reward_program_epoch_reconciliations.start_at"),
    endAt: mustIso(row.end_at, "reward_program_epoch_reconciliations.end_at"),
    epochStatus: String(row.epoch_status),
    program: String(row.program) as RewardProgram,
    eventPoolAmount: String(row.event_pool_amount ?? "0"),
    ledgerEntryCount: asNumber(row.ledger_entry_count),
    ledgerGrossAmount: String(row.ledger_gross_amount ?? "0"),
    ledgerNetAmount: String(row.ledger_net_amount ?? "0"),
    cancelledGrossAmount: String(row.cancelled_gross_amount ?? "0"),
    cancelledNetAmount: String(row.cancelled_net_amount ?? "0"),
    pendingNetAmount: String(row.pending_net_amount ?? "0"),
    claimableNetAmount: String(row.claimable_net_amount ?? "0"),
    claimedNetAmount: String(row.claimed_net_amount ?? "0"),
    expiredNetAmount: String(row.expired_net_amount ?? "0"),
    rolledOverNetAmount: String(row.rolled_over_net_amount ?? "0"),
    claimCount: asNumber(row.claim_count),
    claimRecordedAmount: String(row.claim_recorded_amount ?? "0"),
    rolloverCount: asNumber(row.rollover_count),
    rolloverAmount: String(row.rollover_amount ?? "0"),
    unallocatedEventAmount: String(row.unallocated_event_amount ?? "0"),
    overallocatedEventAmount: String(row.overallocated_event_amount ?? "0"),
    materializedAt: mustIso(row.materialized_at, "reward_program_epoch_reconciliations.materialized_at"),
  };
}

function mapRecruiterClosureDiagnosticRow(row: any): RecruiterClosureDiagnosticRecord {
  return {
    recruiterId: asNumber(row.recruiter_id),
    walletAddress: String(row.wallet_address),
    code: row.code != null ? String(row.code) : null,
    displayName: row.display_name != null ? String(row.display_name) : null,
    status: String(row.status),
    closedAt: toIso(row.closed_at),
    detachedWalletCount: asNumber(row.detached_wallet_count),
    lastDetachedAt: toIso(row.last_detached_at),
    detachedSquadMemberCount: asNumber(row.detached_squad_member_count),
    lastSquadLeftAt: toIso(row.last_squad_left_at),
    materializedAt: mustIso(row.materialized_at, "recruiter_closure_diagnostics.materialized_at"),
  };
}

export async function getWalletRewardSummary(walletAddress: string, db: DbLike = pool): Promise<WalletRewardSummaryRecord | null> {
  const r = await db.query(
    `select * from public.wallet_reward_summaries where wallet_address = $1 limit 1`,
    [normalizeAddress(walletAddress)]
  );
  return r.rows[0] ? mapWalletRewardSummaryRow(r.rows[0]) : null;
}

export async function listWalletRewardHistory(
  walletAddress: string,
  filters: { limit?: number; program?: RewardProgram | null },
  db: DbLike = pool
): Promise<any[]> {
  const values: any[] = [normalizeAddress(walletAddress)];
  const clauses = [`l.wallet_address = $1`];
  if (filters.program) {
    values.push(filters.program);
    clauses.push(`l.program = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));

  const r = await db.query(
    `select
       l.id,
       l.epoch_id,
       e.chain_id,
       e.epoch_type,
       e.start_at,
       e.end_at,
       l.program,
       l.sub_program,
       l.gross_amount,
       l.net_amount,
       l.status,
       l.claimable_at,
       l.claim_deadline_at,
       l.claimed_at,
       l.expired_at,
       l.cancelled_at,
       l.source_reference,
       c.id as claim_id,
       c.claimed_amount,
       c.claim_tx_hash,
       c.claimed_at as claim_recorded_at,
       c.status as claim_status,
       l.created_at,
       l.updated_at
     from public.reward_ledger_entries l
     join public.epochs e on e.id = l.epoch_id
     left join public.claims c
       on c.wallet_address = l.wallet_address
      and c.epoch_id = l.epoch_id
      and c.program = l.program
      and c.status = 'recorded'
     where ${clauses.join(" and ")}
     order by e.end_at desc, l.program asc, l.id desc
     limit $${values.length}`,
    values
  );

  return r.rows.map((row: any) => ({
    id: asNumber(row.id),
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type),
    startAt: mustIso(row.start_at, "wallet history start_at"),
    endAt: mustIso(row.end_at, "wallet history end_at"),
    program: String(row.program) as RewardProgram,
    subProgram: String(row.sub_program ?? ""),
    grossAmount: String(row.gross_amount ?? "0"),
    netAmount: String(row.net_amount ?? "0"),
    status: String(row.status),
    claimableAt: toIso(row.claimable_at),
    claimDeadlineAt: toIso(row.claim_deadline_at),
    claimedAt: toIso(row.claimed_at),
    expiredAt: toIso(row.expired_at),
    cancelledAt: toIso(row.cancelled_at),
    sourceReference: asObject(row.source_reference),
    claim: row.claim_id != null
      ? {
          id: asNumber(row.claim_id),
          claimedAmount: String(row.claimed_amount ?? "0"),
          claimTxHash: row.claim_tx_hash ? String(row.claim_tx_hash) : null,
          claimedAt: toIso(row.claim_recorded_at),
          status: row.claim_status ? String(row.claim_status) : null,
        }
      : null,
    createdAt: mustIso(row.created_at, "wallet history created_at"),
    updatedAt: mustIso(row.updated_at, "wallet history updated_at"),
  }));
}

export async function listWalletEligibilityHistory(
  walletAddress: string,
  filters: { limit?: number; program?: EligibilityProgram | null },
  db: DbLike = pool
): Promise<any[]> {
  const values: any[] = [normalizeAddress(walletAddress)];
  const clauses = [`er.wallet_address = $1`];
  if (filters.program) {
    values.push(filters.program);
    clauses.push(`er.program = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));

  const r = await db.query(
    `select
       er.id,
       er.epoch_id,
       e.chain_id,
       e.epoch_type,
       e.start_at,
       e.end_at,
       er.program,
       er.is_eligible,
       er.score,
       er.reason_codes,
       er.metadata,
       er.computed_at,
       er.created_at,
       er.updated_at
     from public.eligibility_results er
     join public.epochs e on e.id = er.epoch_id
     where ${clauses.join(" and ")}
     order by e.end_at desc, er.program asc, er.id desc
     limit $${values.length}`,
    values
  );

  return r.rows.map((row: any) => ({
    id: asNumber(row.id),
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type),
    startAt: mustIso(row.start_at, "eligibility history start_at"),
    endAt: mustIso(row.end_at, "eligibility history end_at"),
    program: String(row.program) as EligibilityProgram,
    isEligible: Boolean(row.is_eligible),
    score: String(row.score ?? "0"),
    reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes.map((value: unknown) => String(value) as EligibilityReasonCode) : [],
    metadata: asObject(row.metadata),
    computedAt: mustIso(row.computed_at, "eligibility history computed_at"),
    createdAt: mustIso(row.created_at, "eligibility history created_at"),
    updatedAt: mustIso(row.updated_at, "eligibility history updated_at"),
  }));
}

export async function getRecruiterSummaryByCode(code: string, db: DbLike = pool): Promise<RecruiterSummaryRecord | null> {
  const r = await db.query(
    `select * from public.recruiter_summaries where lower(code) = lower($1) limit 1`,
    [normalizeCode(code)]
  );
  return r.rows[0] ? mapRecruiterSummaryRow(r.rows[0]) : null;
}

export async function getRecruiterSummaryByWalletAddress(walletAddress: string, db: DbLike = pool): Promise<RecruiterSummaryRecord | null> {
  const r = await db.query(
    `select * from public.recruiter_summaries where wallet_address = $1 limit 1`,
    [normalizeAddress(walletAddress)]
  );
  return r.rows[0] ? mapRecruiterSummaryRow(r.rows[0]) : null;
}

export async function listRecruiterSummaries(filters: { status?: string | null; limit?: number }, db: DbLike = pool): Promise<RecruiterSummaryRecord[]> {
  const values: any[] = [];
  const clauses = ["1=1"];
  if (filters.status) {
    values.push(String(filters.status));
    clauses.push(`status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));
  const r = await db.query(
    `select *
       from public.recruiter_summaries
      where ${clauses.join(" and ")}
      order by total_earned_raw::numeric desc, linked_wallet_count desc, recruiter_id asc
      limit $${values.length}`,
    values
  );
  return r.rows.map(mapRecruiterSummaryRow);
}

export async function getSquadSummaryByRecruiterCode(code: string, db: DbLike = pool): Promise<SquadSummaryRecord | null> {
  const r = await db.query(
    `select * from public.squad_summaries where lower(recruiter_code) = lower($1) limit 1`,
    [normalizeCode(code)]
  );
  return r.rows[0] ? mapSquadSummaryRow(r.rows[0]) : null;
}

export async function listSquadSummaries(filters: { status?: string | null; limit?: number }, db: DbLike = pool): Promise<SquadSummaryRecord[]> {
  const values: any[] = [];
  const clauses = ["1=1"];
  if (filters.status) {
    values.push(String(filters.status));
    clauses.push(`recruiter_status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));
  const r = await db.query(
    `select *
       from public.squad_summaries
      where ${clauses.join(" and ")}
      order by estimated_pending_pool_amount::numeric desc, eligible_member_count desc, recruiter_id asc
      limit $${values.length}`,
    values
  );
  return r.rows.map(mapSquadSummaryRow);
}

export async function getRewardAdminEpochSummary(epochId: number, db: DbLike = pool): Promise<RewardAdminEpochSummaryRecord | null> {
  const r = await db.query(`select * from public.reward_admin_epoch_summaries where epoch_id = $1 limit 1`, [epochId]);
  return r.rows[0] ? mapAdminEpochSummaryRow(r.rows[0]) : null;
}

export async function listRewardAdminEpochSummaries(filters: { chainId?: number | null; status?: string | null; limit?: number }, db: DbLike = pool): Promise<RewardAdminEpochSummaryRecord[]> {
  const values: any[] = [];
  const clauses = ["1=1"];
  if (filters.chainId != null) {
    values.push(filters.chainId);
    clauses.push(`chain_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(String(filters.status));
    clauses.push(`status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));
  const r = await db.query(
    `select *
       from public.reward_admin_epoch_summaries
      where ${clauses.join(" and ")}
      order by end_at desc, epoch_id desc
      limit $${values.length}`,
    values
  );
  return r.rows.map(mapAdminEpochSummaryRow);
}

export async function listRewardProgramEpochReconciliations(
  filters: { epochId?: number | null; program?: RewardProgram | null; limit?: number },
  db: DbLike = pool,
): Promise<RewardProgramEpochReconciliationRecord[]> {
  const values: any[] = [];
  const clauses = ["1=1"];
  if (filters.epochId != null) {
    values.push(filters.epochId);
    clauses.push(`epoch_id = $${values.length}`);
  }
  if (filters.program) {
    values.push(filters.program);
    clauses.push(`program = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 100) || 100)));
  const r = await db.query(
    `select *
       from public.reward_program_epoch_reconciliations
      where ${clauses.join(" and ")}
      order by end_at desc, epoch_id desc, program asc
      limit $${values.length}`,
    values
  );
  return r.rows.map(mapRewardProgramEpochReconciliationRow);
}

export async function listRecruiterClosureDiagnostics(
  filters: { status?: string | null; limit?: number },
  db: DbLike = pool,
): Promise<RecruiterClosureDiagnosticRecord[]> {
  const values: any[] = [];
  const clauses = ["1=1"];
  if (filters.status) {
    values.push(String(filters.status));
    clauses.push(`status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 100) || 100)));
  const r = await db.query(
    `select *
       from public.recruiter_closure_diagnostics
      where ${clauses.join(" and ")}
      order by coalesce(closed_at, last_detached_at, last_squad_left_at) desc nulls last, recruiter_id asc
      limit $${values.length}`,
    values
  );
  return r.rows.map(mapRecruiterClosureDiagnosticRow);
}
