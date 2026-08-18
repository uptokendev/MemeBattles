import assert from "node:assert/strict";
import test from "node:test";

process.env.SOLANA_REWARDS_RPC_URL_102 = "https://example.invalid";
process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";

const {
  buildExpectedSolanaLeagueClaim,
  verifySolanaLeagueClaimTransaction,
} = await import("./solanaLeagueClaimVerification.js");

const RECIPIENT = "11111111111111111111111111111111";
const TX = "2".repeat(88);
const BASE = {
  chainId: 102,
  period: "weekly",
  epochStart: "2026-08-10T00:00:00.000Z",
  category: "top_earner",
  rank: 1,
  recipient: RECIPIENT,
  amountRaw: "140000",
  txHash: TX,
};

function installRpcMock({ vaultDelta = 140000n, programId, expected }) {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    if (body.method === "getSignatureStatuses") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { value: [{ confirmationStatus: "confirmed", err: null }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (body.method === "getTransaction") {
      const accountKeys = [
        { pubkey: expected.recipient },
        { pubkey: expected.configAddress },
        { pubkey: expected.vaultAddress },
        { pubkey: expected.epochAddress },
        { pubkey: expected.claimReceiptAddress },
        { pubkey: programId || expected.programId },
      ];
      const pre = [1_000_000, 0, 5_000_000, 0, 0, 0];
      const post = [1_135_000, 0, Number(5_000_000n - vaultDelta), 0, 0, 0];
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          slot: 12345,
          transaction: {
            message: {
              accountKeys,
              instructions: [{
                programId: programId || expected.programId,
                accounts: [
                  expected.recipient,
                  expected.configAddress,
                  expected.vaultAddress,
                  expected.epochAddress,
                  expected.claimReceiptAddress,
                ],
              }],
            },
          },
          meta: { err: null, preBalances: pre, postBalances: post },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected RPC method ${body.method}`);
  };
  return () => { globalThis.fetch = original; };
}

test("derives deterministic League settlement accounts", () => {
  const expected = buildExpectedSolanaLeagueClaim(BASE);
  assert.equal(expected.chainId, 102);
  assert.equal(expected.recipient, RECIPIENT);
  assert.equal(expected.amountRaw, "140000");
  assert.equal(expected.epochStartSec, 1786320000);
  assert.ok(expected.configAddress);
  assert.ok(expected.vaultAddress);
  assert.ok(expected.epochAddress);
  assert.ok(expected.claimReceiptAddress);
});

test("accepts only a confirmed League claim with exact vault delta", async () => {
  const expected = buildExpectedSolanaLeagueClaim(BASE);
  const restore = installRpcMock({ expected });
  try {
    const proof = await verifySolanaLeagueClaimTransaction(BASE);
    assert.equal(proof.txHash, TX);
    assert.equal(proof.vaultDeltaLamports, "140000");
    assert.equal(proof.claimReceiptAddress, expected.claimReceiptAddress);
    assert.equal(proof.confirmationStatus, "confirmed");
  } finally {
    restore();
  }
});

test("rejects a confirmed League transaction with the wrong payout amount", async () => {
  const expected = buildExpectedSolanaLeagueClaim(BASE);
  const restore = installRpcMock({ expected, vaultDelta: 139999n });
  try {
    await assert.rejects(
      verifySolanaLeagueClaimTransaction(BASE),
      (error) => error?.code === "SOLANA_LEAGUE_AMOUNT_MISMATCH",
    );
  } finally {
    restore();
  }
});

test("rejects a transaction that invokes a different program", async () => {
  const expected = buildExpectedSolanaLeagueClaim(BASE);
  const restore = installRpcMock({ expected, programId: "11111111111111111111111111111111" });
  try {
    await assert.rejects(
      verifySolanaLeagueClaimTransaction(BASE),
      (error) => error?.code === "SOLANA_LEAGUE_INSTRUCTION_MISMATCH",
    );
  } finally {
    restore();
  }
});
