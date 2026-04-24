import crypto from "node:crypto";
import type { PoolClient, QueryResult } from "pg";
import { pool } from "../db.js";
import { ENV } from "../env.js";
import { getEpochById, type RewardEpochRecord } from "./epochs.js";
import { bigintToString, computeAirdropWeightTier, parseNumericBigInt } from "./rewardMath.js";

export const AIRDROP_DRAW_PROGRAMS = ["airdrop_trader", "airdrop_creator"] as const;
export type AirdropDrawProgram = (typeof AIRDROP_DRAW_PROGRAMS)[number];
export const AIRDROP_DRAW_STATUSES = ["draft", "published", "superseded", "cancelled"] as const;
export type AirdropDrawStatus = (typeof AIRDROP_DRAW_STATUSES)[number];

export type AirdropDrawRecord = {
  id: number;
  epochId: number;
  chainId: number;
  program: AirdropDrawProgram;
  status: AirdropDrawStatus;
  seed: string;
  poolAmount: string;
  candidateCount: number;
  eligibleCandidateCount: number;
  winnerCount: number;
  configJson: Record<string, unknown>;
  auditJson: Record<string, unknown>;
  createdBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AirdropWinnerRecord = {
  id: number;
  drawId: number;
  epochId: number;
  chainId: number;
  program: AirdropDrawProgram;
  walletAddress: string;
  winnerRank: number;
  weightTier: number;
  weightValue: number;
  activityScore: string;
  payoutAmount: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RunAirdropDrawResult = {
  draw: AirdropDrawRecord;
  winners: AirdropWinnerRecord[];
};

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

type EligibilityCandidate = {
  walletAddress: string;
  score: bigint;
  metadata: Record<string, unknown>;
};

export type AirdropDrawCandidate = EligibilityCandidate;

export type AirdropDrawPlanWinner = {
  walletAddress: string;
  winnerRank: number;
  weightTier: number;
  weightValue: number;
  activityScore: string;
  payoutAmount: string;
  metadataJson: Record<string, unknown>;
};

export type AirdropDrawPlan = {
  poolAmount: string;
  winnerCount: number;
  configJson: Record<string, unknown>;
  auditJson: Record<string, unknown>;
  winners: AirdropDrawPlanWinner[];
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

function normalizeAddress(value: unknown): string {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`Invalid wallet address: ${String(value ?? "")}`);
  }
  return address;
}

function normalizeSeed(seed: string): string {
  const trimmed = seed.trim().toLowerCase();
  if (!trimmed) throw new Error("Draw seed is required");
  return trimmed;
}

function hashToBigInt(seed: string, round: number, walletAddress: string): bigint {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:${round}:${walletAddress.toLowerCase()}`)
    .digest("hex");
  return BigInt(`0x${digest}`);
}

function buildDefaultSeed(epoch: RewardEpochRecord, program: AirdropDrawProgram): string {
  return normalizeSeed(
    crypto
      .createHash("sha256")
      .update(`${epoch.chainId}:${epoch.id}:${program}:${epoch.startAt}:${epoch.endAt}:${ENV.AIRDROP_DRAW_SEED_SALT}`)
      .digest("hex"),
  );
}

function getWinnerCountForPool(poolAmount: bigint): number {
  const perWinnerUnit = BigInt(Math.max(1, ENV.AIRDROP_WINNER_COUNT_PER_BNB)) * (10n ** 18n);
  const base = Math.max(1, ENV.AIRDROP_BASE_WINNER_COUNT);
  const max = Math.max(base, ENV.AIRDROP_MAX_WINNER_COUNT);
  if (poolAmount <= 0n) return 0;
  const scaled = Number(poolAmount / perWinnerUnit);
  const winnerCount = base + (Number.isFinite(scaled) && scaled > 0 ? scaled : 0);
  return Math.max(1, Math.min(max, winnerCount));
}

function mapDrawRow(row: any): AirdropDrawRecord {
  return {
    id: asNumber(row.id),
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    program: String(row.program) as AirdropDrawProgram,
    status: String(row.status) as AirdropDrawStatus,
    seed: String(row.seed),
    poolAmount: String(row.pool_amount ?? "0"),
    candidateCount: asNumber(row.candidate_count),
    eligibleCandidateCount: asNumber(row.eligible_candidate_count),
    winnerCount: asNumber(row.winner_count),
    configJson: asObject(row.config_json),
    auditJson: asObject(row.audit_json),
    createdBy: row.created_by ? String(row.created_by) : null,
    publishedAt: toIso(row.published_at),
    createdAt: mustIso(row.created_at, "airdrop_draws.created_at"),
    updatedAt: mustIso(row.updated_at, "airdrop_draws.updated_at"),
  };
}

function mapWinnerRow(row: any): AirdropWinnerRecord {
  return {
    id: asNumber(row.id),
    drawId: asNumber(row.draw_id),
    epochId: asNumber(row.epoch_id),
    chainId: asNumber(row.chain_id),
    program: String(row.program) as AirdropDrawProgram,
    walletAddress: String(row.wallet_address),
    winnerRank: asNumber(row.winner_rank),
    weightTier: asNumber(row.weight_tier),
    weightValue: asNumber(row.weight_value),
    activityScore: String(row.activity_score ?? "0"),
    payoutAmount: String(row.payout_amount ?? "0"),
    metadataJson: asObject(row.metadata_json),
    createdAt: mustIso(row.created_at, "airdrop_winners.created_at"),
    updatedAt: mustIso(row.updated_at, "airdrop_winners.updated_at"),
  };
}

async function withTransaction<T>(fn: (client: PoolClient & DbLike) => Promise<T>): Promise<T> {
  const client = (await pool.connect()) as PoolClient & DbLike & { query: any };
  const origQuery = client.query.bind(client);

  client.query = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return origQuery({ text: args[0], values: Array.isArray(args[1]) ? args[1] : undefined, simple: true });
    }
    if (args[0] && typeof args[0] === "object" && typeof args[0].text === "string") {
      return origQuery({ ...args[0], simple: true });
    }
    return origQuery.apply(client, args);
  };

  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getEpoch(db: DbLike, epochId: number): Promise<RewardEpochRecord> {
  const epoch = await getEpochById(epochId, db);
  if (!epoch) throw new Error(`Reward epoch ${epochId} not found`);
  return epoch;
}

async function getPoolAmountForProgram(db: DbLike, epochId: number, program: AirdropDrawProgram): Promise<bigint> {
  const r = await db.query(
    `select
       case
         when $2 = 'airdrop_trader' then (coalesce(sum(airdrop_amount), 0)::numeric(78,0) / 2)
         else coalesce(sum(airdrop_amount), 0)::numeric(78,0) - (coalesce(sum(airdrop_amount), 0)::numeric(78,0) / 2)
       end as pool_amount
     from public.reward_events
     where epoch_id = $1`,
    [epochId, program],
  );
  return parseNumericBigInt(r.rows[0]?.pool_amount ?? "0");
}

async function getEligibilityCandidates(db: DbLike, epochId: number, program: AirdropDrawProgram): Promise<EligibilityCandidate[]> {
  const r = await db.query(
    `select wallet_address, score, metadata
       from public.eligibility_results
      where epoch_id = $1
        and program = $2
        and is_eligible = true
        and score > 0
      order by score desc, wallet_address asc`,
    [epochId, program],
  );

  return r.rows.map((row: any) => ({
    walletAddress: normalizeAddress(row.wallet_address),
    score: parseNumericBigInt(row.score),
    metadata: asObject(row.metadata),
  }));
}

function computePayoutSplits(poolAmount: bigint, winnerCount: number): bigint[] {
  if (poolAmount <= 0n || winnerCount <= 0) return [];
  const base = poolAmount / BigInt(winnerCount);
  let remainder = poolAmount - (base * BigInt(winnerCount));
  const payouts: bigint[] = [];
  for (let i = 0; i < winnerCount; i += 1) {
    const extra = remainder > 0n ? 1n : 0n;
    if (extra > 0n) remainder -= 1n;
    payouts.push(base + extra);
  }
  return payouts;
}

function selectWeightedWinners(
  seed: string,
  candidates: EligibilityCandidate[],
  winnerCount: number,
) {
  const remaining = candidates.map((candidate) => {
    const weightTier = computeAirdropWeightTier(candidate.score, BigInt(ENV.AIRDROP_WEIGHT_TIER_STEP_BNB) * (10n ** 18n), ENV.AIRDROP_MAX_WEIGHT_TIER);
    return {
      ...candidate,
      weightTier,
      weightValue: Math.max(1, weightTier),
    };
  });

  const winners: Array<{
    walletAddress: string;
    score: bigint;
    weightTier: number;
    weightValue: number;
    roll: string;
    totalWeightBefore: number;
  }> = [];
  const rounds: Array<Record<string, unknown>> = [];

  for (let round = 0; round < winnerCount && remaining.length > 0; round += 1) {
    remaining.sort((a, b) => a.walletAddress.localeCompare(b.walletAddress));
    const totalWeight = remaining.reduce((acc, candidate) => acc + BigInt(candidate.weightValue), 0n);
    if (totalWeight <= 0n) break;

    const rollBig = hashToBigInt(seed, round, remaining.map((item) => item.walletAddress).join("|")) % totalWeight;
    let cursor = 0n;
    let chosenIndex = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      cursor += BigInt(remaining[i].weightValue);
      if (rollBig < cursor) {
        chosenIndex = i;
        break;
      }
    }

    const chosen = remaining.splice(chosenIndex, 1)[0];
    winners.push({
      walletAddress: chosen.walletAddress,
      score: chosen.score,
      weightTier: chosen.weightTier,
      weightValue: chosen.weightValue,
      roll: rollBig.toString(),
      totalWeightBefore: Number(totalWeight),
    });
    rounds.push({
      round: round + 1,
      winnerWalletAddress: chosen.walletAddress,
      roll: rollBig.toString(),
      totalWeightBefore: totalWeight.toString(),
      candidateCountBefore: remaining.length + 1,
      selectedWeightTier: chosen.weightTier,
      selectedWeightValue: chosen.weightValue,
      selectedScore: chosen.score.toString(),
    });
  }

  return { winners, rounds };
}

export function buildAirdropDrawPlan(input: {
  poolAmount: bigint;
  candidates: AirdropDrawCandidate[];
  seed: string;
  winnerCountOverride?: number | null;
}): AirdropDrawPlan {
  const winnerCount = Math.min(
    input.candidates.length,
    input.winnerCountOverride != null
      ? Math.max(0, Math.trunc(input.winnerCountOverride))
      : getWinnerCountForPool(input.poolAmount),
  );
  const selected = winnerCount > 0 ? selectWeightedWinners(input.seed, input.candidates, winnerCount) : { winners: [], rounds: [] };
  const payouts = computePayoutSplits(input.poolAmount, selected.winners.length);
  return {
    poolAmount: bigintToString(input.poolAmount),
    winnerCount: selected.winners.length,
    configJson: {
      baseWinnerCount: ENV.AIRDROP_BASE_WINNER_COUNT,
      winnerCountPerBnb: ENV.AIRDROP_WINNER_COUNT_PER_BNB,
      maxWinnerCount: ENV.AIRDROP_MAX_WINNER_COUNT,
      weightTierStepBnb: ENV.AIRDROP_WEIGHT_TIER_STEP_BNB,
      maxWeightTier: ENV.AIRDROP_MAX_WEIGHT_TIER,
    },
    auditJson: {
      rounds: selected.rounds,
    },
    winners: selected.winners.map((winner, index) => ({
      walletAddress: winner.walletAddress,
      winnerRank: index + 1,
      weightTier: winner.weightTier,
      weightValue: winner.weightValue,
      activityScore: winner.score.toString(),
      payoutAmount: (payouts[index] ?? 0n).toString(),
      metadataJson: {
        roll: winner.roll,
        totalWeightBefore: winner.totalWeightBefore,
      },
    })),
  };
}

async function insertDraw(
  db: DbLike,
  input: {
    epoch: RewardEpochRecord;
    program: AirdropDrawProgram;
    status: AirdropDrawStatus;
    seed: string;
    poolAmount: bigint;
    candidateCount: number;
    eligibleCandidateCount: number;
    winnerCount: number;
    configJson: Record<string, unknown>;
    auditJson: Record<string, unknown>;
    createdBy?: string | null;
  },
): Promise<AirdropDrawRecord> {
  const r = await db.query(
    `insert into public.airdrop_draws(
       epoch_id, chain_id, program, status, seed, pool_amount, candidate_count,
       eligible_candidate_count, winner_count, config_json, audit_json, created_by,
       published_at, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10::jsonb, $11::jsonb, $12,
       case when $4 = 'published' then now() else null end, now(), now()
     )
     returning *`,
    [
      input.epoch.id,
      input.epoch.chainId,
      input.program,
      input.status,
      input.seed,
      bigintToString(input.poolAmount),
      input.candidateCount,
      input.eligibleCandidateCount,
      input.winnerCount,
      JSON.stringify(input.configJson),
      JSON.stringify(input.auditJson),
      input.createdBy ?? null,
    ],
  );
  return mapDrawRow(r.rows[0]);
}

async function insertWinner(
  db: DbLike,
  input: {
    drawId: number;
    epochId: number;
    chainId: number;
    program: AirdropDrawProgram;
    walletAddress: string;
    winnerRank: number;
    weightTier: number;
    weightValue: number;
    activityScore: bigint;
    payoutAmount: bigint;
    metadataJson: Record<string, unknown>;
  },
): Promise<AirdropWinnerRecord> {
  const r = await db.query(
    `insert into public.airdrop_winners(
       draw_id, epoch_id, chain_id, program, wallet_address, winner_rank, weight_tier,
       weight_value, activity_score, payout_amount, metadata_json, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11::jsonb, now(), now()
     )
     returning *`,
    [
      input.drawId,
      input.epochId,
      input.chainId,
      input.program,
      input.walletAddress,
      input.winnerRank,
      input.weightTier,
      input.weightValue,
      bigintToString(input.activityScore),
      bigintToString(input.payoutAmount),
      JSON.stringify(input.metadataJson),
    ],
  );
  return mapWinnerRow(r.rows[0]);
}

export async function listAirdropDraws(
  filters: {
    epochId?: number | null;
    program?: AirdropDrawProgram | null;
    status?: AirdropDrawStatus | null;
    limit?: number;
  },
  db: DbLike = pool,
): Promise<AirdropDrawRecord[]> {
  const clauses = ["1=1"];
  const values: any[] = [];
  if (filters.epochId != null) {
    values.push(filters.epochId);
    clauses.push(`epoch_id = $${values.length}`);
  }
  if (filters.program) {
    values.push(filters.program);
    clauses.push(`program = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(200, Math.trunc(filters.limit ?? 50) || 50)));
  const r = await db.query(
    `select *
       from public.airdrop_draws
      where ${clauses.join(" and ")}
      order by created_at desc, id desc
      limit $${values.length}`,
    values,
  );
  return r.rows.map(mapDrawRow);
}

export async function listAirdropWinners(
  filters: {
    epochId?: number | null;
    program?: AirdropDrawProgram | null;
    walletAddress?: string | null;
    publishedOnly?: boolean;
    limit?: number;
  },
  db: DbLike = pool,
): Promise<AirdropWinnerRecord[]> {
  const clauses = ["1=1"];
  const values: any[] = [];
  if (filters.epochId != null) {
    values.push(filters.epochId);
    clauses.push(`w.epoch_id = $${values.length}`);
  }
  if (filters.program) {
    values.push(filters.program);
    clauses.push(`w.program = $${values.length}`);
  }
  if (filters.walletAddress) {
    values.push(normalizeAddress(filters.walletAddress));
    clauses.push(`w.wallet_address = $${values.length}`);
  }
  if (filters.publishedOnly) {
    clauses.push(`d.status = 'published'`);
  }
  values.push(Math.max(1, Math.min(500, Math.trunc(filters.limit ?? 100) || 100)));
  const r = await db.query(
    `select w.*
       from public.airdrop_winners w
       join public.airdrop_draws d on d.id = w.draw_id
      where ${clauses.join(" and ")}
      order by w.epoch_id desc, w.program asc, w.winner_rank asc, w.id asc
      limit $${values.length}`,
    values,
  );
  return r.rows.map(mapWinnerRow);
}

export async function getPublishedAirdropDrawForEpoch(
  epochId: number,
  program: AirdropDrawProgram,
  db: DbLike = pool,
): Promise<AirdropDrawRecord | null> {
  const r = await db.query(
    `select *
       from public.airdrop_draws
      where epoch_id = $1
        and program = $2
        and status = 'published'
      order by published_at desc nulls last, id desc
      limit 1`,
    [epochId, program],
  );
  return r.rows[0] ? mapDrawRow(r.rows[0]) : null;
}

export async function runAirdropDrawForEpoch(input: {
  epochId: number;
  program: AirdropDrawProgram;
  seed?: string | null;
  createdBy?: string | null;
  publish?: boolean;
}): Promise<RunAirdropDrawResult> {
  return withTransaction(async (db) => {
    const epoch = await getEpoch(db, input.epochId);
    const poolAmount = await getPoolAmountForProgram(db, input.epochId, input.program);
    const candidates = await getEligibilityCandidates(db, input.epochId, input.program);
    const seed = normalizeSeed(input.seed ?? buildDefaultSeed(epoch, input.program));
    const winnerCount = Math.min(candidates.length, getWinnerCountForPool(poolAmount));
    const configJson = {
      baseWinnerCount: ENV.AIRDROP_BASE_WINNER_COUNT,
      winnerCountPerBnb: ENV.AIRDROP_WINNER_COUNT_PER_BNB,
      maxWinnerCount: ENV.AIRDROP_MAX_WINNER_COUNT,
      weightTierStepBnb: ENV.AIRDROP_WEIGHT_TIER_STEP_BNB,
      maxWeightTier: ENV.AIRDROP_MAX_WEIGHT_TIER,
      payoutSplit: "equal_share_plus_remainder",
    };
    const plan = buildAirdropDrawPlan({
      poolAmount,
      candidates,
      seed,
      winnerCountOverride: winnerCount,
    });

    const draw = await insertDraw(db, {
      epoch,
      program: input.program,
      status: input.publish ? "published" : "draft",
      seed,
      poolAmount,
      candidateCount: candidates.length,
      eligibleCandidateCount: candidates.length,
      winnerCount: plan.winnerCount,
      configJson,
      auditJson: {
        candidateSnapshotHash: crypto
          .createHash("sha256")
          .update(
            JSON.stringify(
              candidates
                .map((candidate) => ({
                  walletAddress: candidate.walletAddress,
                  score: candidate.score.toString(),
                  weightTier: computeAirdropWeightTier(
                    candidate.score,
                    BigInt(ENV.AIRDROP_WEIGHT_TIER_STEP_BNB) * (10n ** 18n),
                    ENV.AIRDROP_MAX_WEIGHT_TIER,
                  ),
                }))
                .sort((a, b) => a.walletAddress.localeCompare(b.walletAddress)),
            ),
          )
          .digest("hex"),
        rounds: plan.auditJson.rounds,
      },
      createdBy: input.createdBy ?? null,
    });

    const winners: AirdropWinnerRecord[] = [];
    for (const winner of plan.winners) {
      winners.push(
        await insertWinner(db, {
          drawId: draw.id,
          epochId: epoch.id,
          chainId: epoch.chainId,
          program: input.program,
          walletAddress: winner.walletAddress,
          winnerRank: winner.winnerRank,
          weightTier: winner.weightTier,
          weightValue: winner.weightValue,
          activityScore: BigInt(winner.activityScore),
          payoutAmount: BigInt(winner.payoutAmount),
          metadataJson: {
            ...winner.metadataJson,
          },
        }),
      );
    }

    if (input.publish) {
      await db.query(
        `update public.airdrop_draws
            set status = 'superseded',
                updated_at = now()
          where epoch_id = $1
            and program = $2
            and status = 'published'
            and id <> $3`,
        [epoch.id, input.program, draw.id],
      );
    }

    return {
      draw,
      winners,
    };
  });
}

export async function publishAirdropDraw(drawId: number, actedBy?: string | null): Promise<AirdropDrawRecord | null> {
  return withTransaction(async (db) => {
    const existing = await db.query(`select * from public.airdrop_draws where id = $1 limit 1`, [drawId]);
    if (!existing.rows[0]) return null;
    const draw = mapDrawRow(existing.rows[0]);

    await db.query(
      `update public.airdrop_draws
          set status = case when id = $3 then 'published' else 'superseded' end,
              published_at = case when id = $3 then coalesce(published_at, now()) else published_at end,
              created_by = case when id = $3 then coalesce(created_by, $4) else created_by end,
              updated_at = now()
        where epoch_id = $1
          and program = $2
          and status in ('draft', 'published')
          and id <> (
            select id
              from public.airdrop_draws
             where epoch_id = $1
               and program = $2
               and status not in ('superseded', 'cancelled')
               and id = $3
          )`,
      [draw.epochId, draw.program, draw.id, actedBy ?? null],
    );

    const updated = await db.query(
      `update public.airdrop_draws
          set status = 'published',
              published_at = coalesce(published_at, now()),
              created_by = coalesce(created_by, $2),
              updated_at = now()
        where id = $1
        returning *`,
      [draw.id, actedBy ?? null],
    );
    return updated.rows[0] ? mapDrawRow(updated.rows[0]) : null;
  });
}

export async function ensurePublishedAirdropDrawForEpoch(
  epochId: number,
  program: AirdropDrawProgram,
  actedBy?: string | null,
): Promise<RunAirdropDrawResult> {
  const existing = await getPublishedAirdropDrawForEpoch(epochId, program);
  if (existing) {
    const winners = await listAirdropWinners({ epochId, program, publishedOnly: true, limit: 200 });
    return { draw: existing, winners };
  }

  const latestDraft = (await listAirdropDraws({ epochId, program, status: "draft", limit: 1 }))[0] ?? null;
  if (latestDraft) {
    const published = await publishAirdropDraw(latestDraft.id, actedBy ?? null);
    const winners = await listAirdropWinners({ epochId, program, publishedOnly: true, limit: 200 });
    if (!published) throw new Error(`Failed to publish airdrop draw ${latestDraft.id}`);
    return { draw: published, winners };
  }

  return runAirdropDrawForEpoch({
    epochId,
    program,
    createdBy: actedBy ?? null,
    publish: true,
  });
}
