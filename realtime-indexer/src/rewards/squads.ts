import type { QueryResult } from "pg";
import { pool } from "../db.js";
import { normalizeWalletAddress } from "../walletAddress.js";
import { getCurrentWeeklyEpoch, getEpochById, type RewardEpochRecord } from "./epochs.js";
import { applyCappedRedistribution, bigintToString, computeBpsCap, computeSquadEffectiveScore, parseNumericBigInt } from "./rewardMath.js";

const MEMBER_CAP_BPS = 4000;
const GLOBAL_SQUAD_CAP_BPS = 1500;
const MIN_QUALIFYING_MEMBERS = 3;
const BNB_NATIVE_UNIT_RAW = 10n ** 18n;
const SOLANA_NATIVE_UNIT_RAW = 10n ** 9n;

export type SquadMemberAllocationRecord = {
  walletAddress: string;
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  isEligible: boolean;
  reasonCodes: string[];
  rawScore: string;
  estimatedPayoutAmount: string;
  memberCapAmount: string;
  memberCapApplied: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SquadLeaderboardRecord = {
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  rawScore: string;
  effectiveScore: string;
  estimatedAllocationAmount: string;
  globalCapAmount: string;
  globalCapApplied: boolean;
  activeMemberCount: number;
  eligibleMemberCount: number;
  currentEpochId: number;
  currentEpochStartAt: string;
  currentEpochEndAt: string;
};

export type SquadAllocationPreview = {
  epoch: RewardEpochRecord;
  globalPoolAmount: string;
  carryoverAmount: string;
  leaderboard: SquadLeaderboardRecord[];
  members: SquadMemberAllocationRecord[];
};

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

type RawMemberSnapshot = {
  walletAddress: string;
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  isEligible: boolean;
  reasonCodes: string[];
  score: bigint;
  createdAt: string | null;
  updatedAt: string | null;
};

type ComputedMember = RawMemberSnapshot & {
  estimatedPayoutAmount: bigint;
  memberCapAmount: bigint;
  memberCapApplied: boolean;
};

type ComputedSquad = {
  recruiterId: number;
  recruiterCode: string | null;
  recruiterDisplayName: string | null;
  recruiterStatus: string | null;
  recruiterIsOg: boolean;
  rawScore: bigint;
  effectiveScore: bigint;
  estimatedAllocationAmount: bigint;
  globalCapAmount: bigint;
  globalCapApplied: boolean;
  activeMemberCount: number;
  eligibleMemberCount: number;
  members: ComputedMember[];
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

function nativeUnitRaw(chainId: number): bigint {
  return chainId === 101 || chainId === 102 ? SOLANA_NATIVE_UNIT_RAW : BNB_NATIVE_UNIT_RAW;
}

function asReasonCodes(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

async function getEpochForPreview(epochId: number | null | undefined, chainId: number, db: DbLike): Promise<RewardEpochRecord> {
  if (epochId != null) {
    const epoch = await getEpochById(epochId, db);
    if (!epoch) throw new Error(`Reward epoch ${epochId} not found`);
    if (epoch.chainId !== chainId) throw new Error(`Reward epoch ${epochId} belongs to chain ${epoch.chainId}, not ${chainId}`);
    return epoch;
  }

  const current = await getCurrentWeeklyEpoch(chainId, db).catch(() => null);
  if (current) {
    const hasResults = await db.query(
      `select 1
         from public.eligibility_results
        where epoch_id = $1
          and program = 'squad'
        limit 1`,
      [current.id],
    );
    if ((hasResults.rowCount ?? 0) > 0) return current;
  }

  const r = await db.query(
    `select e.*
       from public.epochs e
      where e.chain_id = $1
        and exists (
          select 1
            from public.eligibility_results er
           where er.epoch_id = e.id
             and er.program = 'squad'
        )
      order by e.end_at desc, e.id desc
      limit 1`,
    [chainId],
  );
  if (!r.rows[0]) throw new Error(`No squad epoch with eligibility results found for chain ${chainId}`);
  const row = r.rows[0];
  return {
    id: asNumber(row.id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type) as RewardEpochRecord["epochType"],
    startAt: mustIso(row.start_at, "epochs.start_at"),
    endAt: mustIso(row.end_at, "epochs.end_at"),
    status: String(row.status) as RewardEpochRecord["status"],
    createdAt: mustIso(row.created_at, "epochs.created_at"),
    finalizedAt: toIso(row.finalized_at),
  };
}

async function loadSquadPoolAmount(epochId: number, db: DbLike): Promise<bigint> {
  const r = await db.query(
    `select
       coalesce(sum(re.squad_amount), 0)::numeric(78,0) + coalesce((
         select sum(c.amount)
           from public.reward_pool_carryovers c
          where c.target_epoch_id = $1
            and c.program = 'squad'
       ), 0)::numeric(78,0) as total_amount
     from public.reward_events re
     where re.epoch_id = $1`,
    [epochId],
  );
  return parseNumericBigInt(r.rows[0]?.total_amount ?? "0");
}

async function loadSquadMemberSnapshots(epochId: number, db: DbLike): Promise<RawMemberSnapshot[]> {
  const r = await db.query(
    `with member_activity as (
       select
         m.wallet_address,
         m.recruiter_id,
         rec.code as recruiter_code,
         rec.display_name as recruiter_display_name,
         rec.status as recruiter_status,
         coalesce(rec.is_og, false) as recruiter_is_og,
         er.is_eligible,
         er.reason_codes,
         er.score,
         er.created_at,
         er.updated_at
       from public.eligibility_results er
       join public.wallet_squad_memberships m
         on m.wallet_address = er.wallet_address
        and m.joined_at < (select end_at from public.epochs where id = $1)
        and (m.left_at is null or m.left_at >= (select start_at from public.epochs where id = $1))
       join public.recruiters rec on rec.id = m.recruiter_id
       where er.epoch_id = $1
         and er.program = 'squad'
     )
     select distinct on (wallet_address)
       wallet_address,
       recruiter_id,
       recruiter_code,
       recruiter_display_name,
       recruiter_status,
       recruiter_is_og,
       is_eligible,
       reason_codes,
       score,
       created_at,
       updated_at
     from member_activity
     order by wallet_address, updated_at desc nulls last, created_at desc nulls last`,
    [epochId],
  );

  return r.rows.map((row: any) => ({
    walletAddress: normalizeWalletAddress(row.wallet_address),
    recruiterId: asNumber(row.recruiter_id),
    recruiterCode: row.recruiter_code ? String(row.recruiter_code) : null,
    recruiterDisplayName: row.recruiter_display_name ? String(row.recruiter_display_name) : null,
    recruiterStatus: row.recruiter_status ? String(row.recruiter_status) : null,
    recruiterIsOg: Boolean(row.recruiter_is_og),
    isEligible: Boolean(row.is_eligible),
    reasonCodes: asReasonCodes(row.reason_codes),
    score: parseNumericBigInt(row.score),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));
}

export function computeSquadAllocationModel(
  globalPoolAmount: bigint,
  members: RawMemberSnapshot[],
  chainId = 97,
): { squads: ComputedSquad[]; carryoverAmount: bigint } {
  const byRecruiter = new Map<number, ComputedSquad>();

  for (const member of members) {
    const current = byRecruiter.get(member.recruiterId) ?? {
      recruiterId: member.recruiterId,
      recruiterCode: member.recruiterCode,
      recruiterDisplayName: member.recruiterDisplayName,
      recruiterStatus: member.recruiterStatus,
      recruiterIsOg: member.recruiterIsOg,
      rawScore: 0n,
      effectiveScore: 0n,
      estimatedAllocationAmount: 0n,
      globalCapAmount: 0n,
      globalCapApplied: false,
      activeMemberCount: 0,
      eligibleMemberCount: 0,
      members: [],
    };
    current.activeMemberCount += 1;
    if (member.isEligible && member.score > 0n) {
      current.rawScore += member.score;
      current.eligibleMemberCount += 1;
    }
    current.members.push({
      ...member,
      estimatedPayoutAmount: 0n,
      memberCapAmount: 0n,
      memberCapApplied: false,
    });
    byRecruiter.set(member.recruiterId, current);
  }

  const unit = nativeUnitRaw(chainId);
  const squads = Array.from(byRecruiter.values())
    .map((squad) => ({
      ...squad,
      effectiveScore:
        squad.eligibleMemberCount >= MIN_QUALIFYING_MEMBERS
          ? computeSquadEffectiveScore(squad.rawScore, unit)
          : 0n,
    }))
    .sort((a, b) => {
      if (a.recruiterId === b.recruiterId) return 0;
      return a.recruiterId < b.recruiterId ? -1 : 1;
    });

  const squadCap = computeBpsCap(globalPoolAmount, GLOBAL_SQUAD_CAP_BPS);
  const squadAllocations = applyCappedRedistribution(
    globalPoolAmount,
    squads
      .filter((squad) => squad.effectiveScore > 0n)
      .map((squad) => ({
        key: String(squad.recruiterId),
        weight: squad.effectiveScore,
        cap: squadCap,
      })),
  );

  let carryoverAmount = squadAllocations.unallocatedAmount;

  for (const squad of squads) {
    const squadAmount = squadAllocations.allocations.get(String(squad.recruiterId)) ?? 0n;
    squad.estimatedAllocationAmount = squadAmount;
    squad.globalCapAmount = squadCap;
    squad.globalCapApplied = squadAmount >= squadCap && squadCap > 0n;

    const eligibleMembers = squad.members.filter((member) => member.isEligible && member.score > 0n);
    if (squadAmount <= 0n || eligibleMembers.length < MIN_QUALIFYING_MEMBERS) {
      carryoverAmount += squadAmount;
      continue;
    }

    const memberCap = computeBpsCap(squadAmount, MEMBER_CAP_BPS);
    const memberAllocations = applyCappedRedistribution(
      squadAmount,
      eligibleMembers.map((member) => ({
        key: member.walletAddress,
        weight: member.score,
        cap: memberCap,
      })),
    );
    carryoverAmount += memberAllocations.unallocatedAmount;

    for (const member of squad.members) {
      member.memberCapAmount = memberCap;
      member.estimatedPayoutAmount = memberAllocations.allocations.get(member.walletAddress) ?? 0n;
      member.memberCapApplied = member.estimatedPayoutAmount >= memberCap && memberCap > 0n;
    }
  }

  return { squads, carryoverAmount };
}

export async function getSquadAllocationPreview(
  epochId?: number | null,
  db: DbLike = pool,
  chainId = 97,
): Promise<SquadAllocationPreview> {
  const startedAt = Date.now();
  console.log("[solana-squad-preview] epoch lookup start", { epochId, chainId });
  const epoch = await getEpochForPreview(epochId, chainId, db);
  console.log("[solana-squad-preview] epoch lookup complete", {
    epochId: epoch.id,
    elapsedMs: Date.now() - startedAt,
  });

  const poolStartedAt = Date.now();
  console.log("[solana-squad-preview] pool amount start", { epochId: epoch.id });
  const globalPoolAmount = await loadSquadPoolAmount(epoch.id, db);
  console.log("[solana-squad-preview] pool amount complete", {
    epochId: epoch.id,
    globalPoolAmount: globalPoolAmount.toString(),
    elapsedMs: Date.now() - poolStartedAt,
  });

  const snapshotsStartedAt = Date.now();
  console.log("[solana-squad-preview] member snapshots start", { epochId: epoch.id });
  const snapshots = await loadSquadMemberSnapshots(epoch.id, db);
  console.log("[solana-squad-preview] member snapshots complete", {
    epochId: epoch.id,
    memberCount: snapshots.length,
    elapsedMs: Date.now() - snapshotsStartedAt,
  });

  const model = computeSquadAllocationModel(globalPoolAmount, snapshots, epoch.chainId);
  console.log("[solana-squad-preview] model complete", {
    epochId: epoch.id,
    squadCount: model.squads.length,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    epoch,
    globalPoolAmount: bigintToString(globalPoolAmount),
    carryoverAmount: bigintToString(model.carryoverAmount),
    leaderboard: model.squads.map((squad) => ({
      recruiterId: squad.recruiterId,
      recruiterCode: squad.recruiterCode,
      recruiterDisplayName: squad.recruiterDisplayName,
      recruiterStatus: squad.recruiterStatus,
      recruiterIsOg: squad.recruiterIsOg,
      rawScore: bigintToString(squad.rawScore),
      effectiveScore: bigintToString(squad.effectiveScore),
      estimatedAllocationAmount: bigintToString(squad.estimatedAllocationAmount),
      globalCapAmount: bigintToString(squad.globalCapAmount),
      globalCapApplied: squad.globalCapApplied,
      activeMemberCount: squad.activeMemberCount,
      eligibleMemberCount: squad.eligibleMemberCount,
      currentEpochId: epoch.id,
      currentEpochStartAt: epoch.startAt,
      currentEpochEndAt: epoch.endAt,
    })),
    members: model.squads
      .flatMap((squad) =>
        squad.members.map((member) => ({
          walletAddress: member.walletAddress,
          recruiterId: squad.recruiterId,
          recruiterCode: squad.recruiterCode,
          recruiterDisplayName: squad.recruiterDisplayName,
          isEligible: member.isEligible,
          reasonCodes: member.reasonCodes,
          rawScore: bigintToString(member.score),
          estimatedPayoutAmount: bigintToString(member.estimatedPayoutAmount),
          memberCapAmount: bigintToString(member.memberCapAmount),
          memberCapApplied: member.memberCapApplied,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
        })),
      )
      .sort((a, b) => {
        if (a.recruiterId !== b.recruiterId) return a.recruiterId - b.recruiterId;
        if (a.rawScore !== b.rawScore) return BigInt(b.rawScore) > BigInt(a.rawScore) ? 1 : -1;
        return a.walletAddress.localeCompare(b.walletAddress);
      }),
  };
}
