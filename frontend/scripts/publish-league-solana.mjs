import { pool } from "../server/db.js";
import {
  base58Decode,
  buildMerkleRoot,
  leagueLeaf,
} from "../api/solanaLeagueMerkle.js";
import { publishSolanaLeagueRoot } from "../api/lib/solanaLeagueRootPublisher.js";

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function envBool(name, fallback = false) {
  const raw = env(name);
  return raw ? ["1", "true", "yes", "on"].includes(raw.toLowerCase()) : fallback;
}

function fail(message) {
  throw new Error(`[league-solana] ${message}`);
}

function normalizeEpochStart(raw) {
  const value = String(raw || "").trim();
  if (!value) fail("LEAGUE_SOLANA_EPOCH_START is required");
  const numeric = /^\d{10}$/.test(value) ? new Date(Number(value) * 1000) : new Date(value);
  if (Number.isNaN(numeric.getTime())) fail("LEAGUE_SOLANA_EPOCH_START must be an ISO timestamp or Unix seconds");
  return numeric;
}

function validateWinner(row) {
  const category = String(row.category || "").toLowerCase().trim();
  const rank = Number(row.rank);
  const recipient = String(row.recipient_address || "").trim();
  const amountRaw = BigInt(String(row.amount_raw || "0"));
  if (!category) fail("winner category is missing");
  if (!Number.isInteger(rank) || rank < 1 || rank > 5) fail(`invalid rank ${row.rank} for ${category}`);
  if (base58Decode(recipient).length !== 32) fail(`invalid Solana recipient ${recipient}`);
  if (amountRaw <= 0n || amountRaw > (1n << 64n) - 1n) fail(`invalid amount for ${category} rank ${rank}`);
  return { category, rank, recipient, amountRaw: amountRaw.toString() };
}

async function main() {
  const chainId = Number(env("LEAGUE_SOLANA_CHAIN_ID", "102"));
  const period = env("LEAGUE_SOLANA_PERIOD", "weekly").toLowerCase();
  const epochStart = normalizeEpochStart(env("LEAGUE_SOLANA_EPOCH_START"));
  const dryRun = envBool("LEAGUE_SOLANA_DRY_RUN", true);
  const enabled = envBool("LEAGUE_SOLANA_AUTOMATION_ENABLED", false);

  if (chainId !== 101 && chainId !== 102) fail("chain ID must be 101 or 102");
  if (period !== "weekly" && period !== "monthly") fail("period must be weekly or monthly");
  if (!dryRun && !enabled) fail("LEAGUE_SOLANA_AUTOMATION_ENABLED must be true for live publication");
  if (!pool) fail("DATABASE_URL is required");

  const epochStartIso = epochStart.toISOString();
  const client = await pool.connect();
  const lockKey = `mwz-league-solana:${chainId}:${period}:${epochStartIso}`;
  let locked = false;

  try {
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) fail(`another publisher owns ${lockKey}`);

    const { rows } = await client.query(
      `select category, rank, recipient_address, amount_raw::text as amount_raw,
              epoch_start, epoch_end, expires_at
         from public.league_epoch_winners
        where chain_id=$1
          and period=$2
          and epoch_start=$3::timestamptz
        order by category asc, rank asc, recipient_address asc`,
      [chainId, period, epochStartIso],
    );
    if (!rows.length) fail(`no finalized League winners found for ${chainId}/${period}/${epochStartIso}`);

    const now = Date.now();
    const slots = new Set();
    const winners = [];
    let epochEndIso = null;
    let expiresAtIso = null;
    for (const row of rows) {
      const rowStart = new Date(row.epoch_start);
      const rowEnd = new Date(row.epoch_end);
      const rowExpiry = row.expires_at ? new Date(row.expires_at) : null;
      if (Number.isNaN(rowStart.getTime()) || rowStart.getTime() !== epochStart.getTime()) {
        fail("winner set contains a mismatched epoch_start");
      }
      if (Number.isNaN(rowEnd.getTime()) || rowEnd.getTime() > now) {
        fail(`epoch is not finalized; epoch_end=${row.epoch_end}`);
      }
      if (rowExpiry && (Number.isNaN(rowExpiry.getTime()) || rowExpiry.getTime() <= now)) {
        fail(`League claim window is already expired for ${row.category} rank ${row.rank}`);
      }
      if (epochEndIso && epochEndIso !== rowEnd.toISOString()) fail("winner set contains multiple epoch_end values");
      epochEndIso = rowEnd.toISOString();
      if (rowExpiry) {
        if (expiresAtIso && expiresAtIso !== rowExpiry.toISOString()) fail("winner set contains multiple expires_at values");
        expiresAtIso = rowExpiry.toISOString();
      }

      const winner = validateWinner(row);
      const slot = `${winner.category}:${winner.rank}`;
      if (slots.has(slot)) fail(`duplicate League winner slot ${slot}`);
      slots.add(slot);
      winners.push(winner);
    }

    const epochStartSec = Math.floor(epochStart.getTime() / 1000);
    const leaves = winners.map((winner) => leagueLeaf({
      epochStartSec,
      period,
      category: winner.category,
      rank: winner.rank,
      recipient: winner.recipient,
      amountRaw: winner.amountRaw,
    }));
    const root = buildMerkleRoot(leaves);
    const totalLamports = winners.reduce((sum, winner) => sum + BigInt(winner.amountRaw), 0n);
    const plan = {
      dryRun,
      chainId,
      period,
      epochStart: epochStartIso,
      epochEnd: epochEndIso,
      expiresAt: expiresAtIso,
      winnerCount: winners.length,
      root,
      totalLamports: totalLamports.toString(),
      winners,
    };

    if (dryRun) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    const publication = await publishSolanaLeagueRoot({
      chainId,
      period,
      epochStart: epochStartIso,
      winners,
    });
    console.log(JSON.stringify({ ...plan, dryRun: false, publication }, null, 2));
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => {});
    client.release();
    await pool.end().catch(() => {});
  }
}

await main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
