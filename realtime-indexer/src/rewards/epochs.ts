import type { QueryResult } from "pg";
import { pool } from "../db.js";

export type RewardEpochType = "weekly";
export type RewardEpochStatus = "open" | "processing" | "finalized" | "published" | "expired";

export type RewardEpochRecord = {
  id: number;
  chainId: number;
  epochType: RewardEpochType;
  startAt: string;
  endAt: string;
  status: RewardEpochStatus;
  createdAt: string;
  finalizedAt: string | null;
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

function mapEpochRow(row: any): RewardEpochRecord {
  return {
    id: asNumber(row.id),
    chainId: asNumber(row.chain_id),
    epochType: String(row.epoch_type) as RewardEpochType,
    startAt: mustIso(row.start_at, "start_at"),
    endAt: mustIso(row.end_at, "end_at"),
    status: String(row.status) as RewardEpochStatus,
    createdAt: mustIso(row.created_at, "created_at"),
    finalizedAt: toIso(row.finalized_at),
  };
}

export function getWeeklyEpochBounds(input: Date | string): { startAt: Date; endAt: Date } {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(String(input));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid epoch timestamp: ${String(input)}`);

  const utcMidnight = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const weekday = utcMidnight.getUTCDay();
  const offsetFromMonday = (weekday + 6) % 7;

  const startAt = new Date(utcMidnight.getTime() - offsetFromMonday * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { startAt, endAt };
}

function initialEpochStatus(bounds: { startAt: Date; endAt: Date }, now = new Date()): RewardEpochStatus {
  return now < bounds.endAt ? "open" : "processing";
}

export async function ensureWeeklyEpoch(chainId: number, occurredAt: Date | string, db: DbLike = pool): Promise<RewardEpochRecord> {
  const bounds = getWeeklyEpochBounds(occurredAt);
  const status = initialEpochStatus(bounds);

  const r = await db.query(
    `insert into public.epochs(chain_id, epoch_type, start_at, end_at, status)
     values ($1, 'weekly', $2, $3, $4)
     on conflict (chain_id, epoch_type, start_at) do update
       set end_at = excluded.end_at
     returning *`,
    [chainId, bounds.startAt, bounds.endAt, status]
  );

  return mapEpochRow(r.rows[0]);
}

export async function getEpochById(epochId: number, db: DbLike = pool): Promise<RewardEpochRecord | null> {
  const r = await db.query(`select * from public.epochs where id = $1`, [epochId]);
  return r.rows[0] ? mapEpochRow(r.rows[0]) : null;
}

export async function getCurrentWeeklyEpoch(chainId: number, db: DbLike = pool): Promise<RewardEpochRecord> {
  return ensureWeeklyEpoch(chainId, new Date(), db);
}
