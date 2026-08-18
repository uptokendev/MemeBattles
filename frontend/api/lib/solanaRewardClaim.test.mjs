import assert from "node:assert/strict";
import test from "node:test";

import { buildSolanaRewardCall } from "./solanaRewardClaim.js";

const PROGRAM_ID = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
const RECIPIENT = "11111111111111111111111111111111";

process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID = PROGRAM_ID;

test("builds native Squad claim from canonical reward ledger metadata", () => {
  const call = buildSolanaRewardCall({
    id: "00000000-0000-0000-0000-000000000001",
    reward_type: "squad",
    chain: "102",
    token_symbol: "SOL",
    amount: "140000",
    wallet_address: RECIPIENT,
    metadata: {
      solanaRewardLane: {
        lane: "squad",
        epochId: "1786924800",
        proof: [],
      },
    },
  });

  assert.equal(call.enabled, true);
  assert.equal(call.mode, "solana_airdrop");
  assert.equal(call.kind, "solana_reward_lane");
  assert.equal(call.lane, "squad");
  assert.equal(call.instruction, "claim_squad");
  assert.equal(call.chainId, 102);
  assert.equal(call.amount, "140000");
  assert.equal(call.epochId, "1786924800");
  assert.equal(call.recipient, RECIPIENT);
  assert.equal(call.programId, PROGRAM_ID);
  assert.ok(call.configAddress);
  assert.ok(call.vaultAddress);
  assert.ok(call.batchAddress);
  assert.ok(call.claimReceiptAddress);
});

test("rejects Squad claim when settlement epoch metadata is missing", () => {
  const call = buildSolanaRewardCall({
    id: "00000000-0000-0000-0000-000000000002",
    reward_type: "squad",
    chain: "102",
    token_symbol: "SOL",
    amount: "140000",
    wallet_address: RECIPIENT,
    metadata: { solanaRewardLane: { lane: "squad", proof: [] } },
  });

  assert.equal(call.enabled, false);
  assert.equal(call.kind, "solana_reward_lane");
  assert.equal(call.reason, "MISSING_SOLANA_EPOCH_ID");
});

test("keeps existing Solana Airdrop claim builder enabled", () => {
  const call = buildSolanaRewardCall({
    id: "00000000-0000-0000-0000-000000000003",
    reward_type: "airdrop",
    chain: "102",
    token_symbol: "SOL",
    amount: "250000",
    wallet_address: RECIPIENT,
    metadata: {
      program: "airdrop_trader",
      programCode: 0,
      solanaEpochId: "1786924800",
      merkleProof: [],
    },
  });

  assert.equal(call.enabled, true);
  assert.equal(call.mode, "solana_airdrop");
  assert.equal(call.kind, "solana_airdrop");
  assert.equal(call.programCode, 0);
  assert.equal(call.amount, "250000");
  assert.equal(call.recipient, RECIPIENT);
});

test("does not silently route unsupported Solana reward types", () => {
  const call = buildSolanaRewardCall({
    id: "00000000-0000-0000-0000-000000000004",
    reward_type: "recruiter",
    chain: "102",
    token_symbol: "SOL",
    amount: "100000",
    wallet_address: RECIPIENT,
    metadata: {},
  });

  assert.equal(call.enabled, false);
  assert.equal(call.mode, "solana_unavailable");
  assert.equal(call.reason, "SOLANA_RECRUITER_CLAIM_NOT_WIRED");
});
