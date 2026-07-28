import assert from "node:assert/strict";
import test from "node:test";

import {
  TICKER_RESERVATION_STATUS,
  TickerReservationError,
  canonicalClusterForChain,
  isBlockingReservationStatus,
  mapTickerReservationRow,
  normalizeTicker,
  sha256Hex,
  withTickerReservationTransaction,
} from "./ticker-reservation-service.js";

test("normalizes ticker input to the canonical chain-scoped value", () => {
  assert.equal(normalizeTicker("  $$meme-war_zone!!  "), "MEMEWARZONE");
  assert.equal(normalizeTicker("abcdefghijklmnop"), "ABCDEFGHIJKL");
  assert.equal(normalizeTicker("$"), "");
});

test("produces deterministic lowercase SHA-256 hashes", () => {
  assert.equal(
    sha256Hex("MEME"),
    "e2736dd76db8c92a02192027e0cc62853405127dbeee668183220e3a39ed82de",
  );
  assert.match(sha256Hex("reservation-id"), /^[0-9a-f]{64}$/);
});

test("maps supported chain identifiers to canonical clusters", () => {
  assert.equal(canonicalClusterForChain(56), "bsc-mainnet");
  assert.equal(canonicalClusterForChain(97), "bsc-testnet");
  assert.equal(canonicalClusterForChain(8453), "chain-8453");
  assert.equal(canonicalClusterForChain(101, "solana-devnet"), "solana-devnet");
  assert.equal(canonicalClusterForChain(101, "devnet"), "solana-devnet");
  assert.equal(canonicalClusterForChain(101, "mainnet-beta"), "solana-mainnet-beta");
  assert.throws(
    () => canonicalClusterForChain(101, "bad cluster with spaces"),
    (error) => error instanceof TickerReservationError && error.code === "INVALID_RESERVATION_CLUSTER",
  );
});

test("treats every non-released lifecycle state as blocking", () => {
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.SOFT_RESERVED), true);
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.EXPIRED_GRACE), true);
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.ARMED_ONCHAIN), true);
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.LIVE), true);
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.RELEASED), false);
  assert.equal(isBlockingReservationStatus(TICKER_RESERVATION_STATUS.DRAFT_UNRESERVED), false);
});

test("maps database rows into API-safe reservation objects", () => {
  const mapped = mapTickerReservationRow({
    id: "00000000-0000-0000-0000-000000000001",
    draft_id: "00000000-0000-0000-0000-000000000002",
    creator_wallet: "CreatorWallet",
    chain_id: "101",
    cluster: "solana-devnet",
    original_ticker: "$meme",
    normalized_ticker: "MEME",
    ticker_hash: "a".repeat(64),
    reservation_id_hash: "b".repeat(64),
    status: "PREPARE_MODE_RESERVED",
    renewal_count: "1",
    reservation_version: "3",
    metadata: { source: "test" },
  });

  assert.equal(mapped.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(mapped.chainId, 101);
  assert.equal(mapped.normalizedTicker, "MEME");
  assert.equal(mapped.renewalCount, 1);
  assert.equal(mapped.reservationVersion, "3");
  assert.deepEqual(mapped.metadata, { source: "test" });
});

test("commits and releases a successful database transaction", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql) {
      calls.push(String(sql));
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const pool = { async connect() { return client; } };

  const value = await withTickerReservationTransaction(pool, async (db) => {
    assert.equal(db, client);
    calls.push("work");
    return 42;
  });

  assert.equal(value, 42);
  assert.deepEqual(calls, ["begin", "work", "commit"]);
  assert.equal(released, true);
});

test("rolls back and releases a failed database transaction", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql) {
      calls.push(String(sql));
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const pool = { async connect() { return client; } };

  await assert.rejects(
    withTickerReservationTransaction(pool, async () => {
      calls.push("work");
      throw new Error("boom");
    }),
    /boom/,
  );

  assert.deepEqual(calls, ["begin", "work", "rollback"]);
  assert.equal(released, true);
});
