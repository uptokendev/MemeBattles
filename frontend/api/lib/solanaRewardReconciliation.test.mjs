import assert from "node:assert/strict";
import test from "node:test";

import { discoverVerifiedReceiptTransaction } from "./solanaRewardReconciliation.js";

const claimCall = {
  enabled: true,
  chainId: 101,
  claimReceiptAddress: "Receipt111111111111111111111111111111111",
};

test("receipt missing means no completed on-chain claim to reconcile", async () => {
  const methods = [];
  const result = await discoverVerifiedReceiptTransaction({
    claimCall,
    rpcCall: async (_chainId, method) => {
      methods.push(method);
      if (method === "getAccountInfo") return { value: null };
      throw new Error(`Unexpected RPC ${method}`);
    },
    verifyCandidate: async () => {
      throw new Error("verification should not run");
    },
  });

  assert.equal(result, null);
  assert.deepEqual(methods, ["getAccountInfo"]);
});

test("failed receipt signatures are skipped and the strict-valid settlement is recovered", async () => {
  const verified = [];
  const result = await discoverVerifiedReceiptTransaction({
    claimCall,
    rpcCall: async (_chainId, method) => {
      if (method === "getAccountInfo") return { value: { data: ["AA==", "base64"] } };
      if (method === "getSignaturesForAddress") {
        return [
          { signature: "failed-signature", err: { InstructionError: [0, "Custom"] } },
          { signature: "strict-valid-signature", err: null },
        ];
      }
      throw new Error(`Unexpected RPC ${method}`);
    },
    verifyCandidate: async (signature) => {
      verified.push(signature);
      return { txHash: signature, amount: "140000" };
    },
  });

  assert.deepEqual(verified, ["strict-valid-signature"]);
  assert.equal(result.txHash, "strict-valid-signature");
  assert.equal(result.amount, "140000");
});

test("receipt existence alone never repairs state when strict transaction verification fails", async () => {
  await assert.rejects(
    discoverVerifiedReceiptTransaction({
      claimCall,
      rpcCall: async (_chainId, method) => {
        if (method === "getAccountInfo") return { value: { data: ["AA==", "base64"] } };
        if (method === "getSignaturesForAddress") {
          return [
            { signature: "wrong-amount", err: null },
            { signature: "wrong-program", err: null },
          ];
        }
        throw new Error(`Unexpected RPC ${method}`);
      },
      verifyCandidate: async (signature) => {
        const error = new Error(`strict verification rejected ${signature}`);
        error.code = signature === "wrong-amount" ? "SOLANA_CLAIM_AMOUNT_MISMATCH" : "SOLANA_CLAIM_INSTRUCTION_MISMATCH";
        throw error;
      },
    }),
    (error) => {
      assert.equal(error.code, "SOLANA_CLAIM_RECEIPT_TX_UNVERIFIED");
      assert.equal(error.status, 409);
      assert.equal(error.details.attemptedSignatures, 2);
      assert.equal(error.details.lastVerificationCode, "SOLANA_CLAIM_INSTRUCTION_MISMATCH");
      return true;
    },
  );
});

test("signature scan is bounded before RPC execution", async () => {
  let requestedLimit = null;
  await assert.rejects(
    discoverVerifiedReceiptTransaction({
      claimCall,
      signatureLimit: 999,
      rpcCall: async (_chainId, method, params) => {
        if (method === "getAccountInfo") return { value: { data: ["AA==", "base64"] } };
        if (method === "getSignaturesForAddress") {
          requestedLimit = params[1].limit;
          return [];
        }
        throw new Error(`Unexpected RPC ${method}`);
      },
      verifyCandidate: async () => ({ ok: true }),
    }),
    (error) => error.code === "SOLANA_CLAIM_RECEIPT_TX_UNVERIFIED",
  );

  assert.equal(requestedLimit, 20);
});
