import assert from "node:assert/strict";
import test from "node:test";

import { loadFrontendTsModule } from "../../scripts/load-solana-v0-module.mjs";

const {
  LaunchpadSignatureExpiredError,
  LaunchpadSignatureUnconfirmedError,
  confirmLaunchpadSignature,
} = await loadFrontendTsModule("../src/lib/solanaConfirmSignature.ts");

function mockConnection({
  statuses = [],
  heights = [],
  tx = null,
  heightError = false,
} = {}) {
  let statusIndex = 0;
  let heightIndex = 0;
  return {
    getSignatureStatuses: async () => {
      const value = statusIndex < statuses.length ? statuses[statusIndex] : statuses[statuses.length - 1] ?? null;
      statusIndex += 1;
      return { value: [value] };
    },
    getBlockHeight: async () => {
      if (heightError) throw new Error("height rpc down");
      const height = heightIndex < heights.length ? heights[heightIndex] : heights[heights.length - 1];
      heightIndex += 1;
      return height;
    },
    getTransaction: async () => tx,
  };
}

function immediateSleep() {
  return Promise.resolve();
}

test("confirmed status while height is still valid succeeds", async () => {
  const result = await confirmLaunchpadSignature(
    mockConnection({
      statuses: [{ confirmationStatus: "confirmed", err: null }],
      heights: [10],
    }),
    { signature: "sig1", lastValidBlockHeight: 20, sleep: immediateSleep },
  );
  assert.equal(result.err, null);
  assert.equal(result.recovered, undefined);
});

test("missing status while height is still valid keeps polling instead of expiring", async () => {
  const result = await confirmLaunchpadSignature(
    mockConnection({
      statuses: [null, { confirmationStatus: "finalized", err: null }],
      heights: [10, 11],
    }),
    { signature: "sig2", lastValidBlockHeight: 50, sleep: immediateSleep },
  );
  assert.equal(result.err, null);
});

test("height past lastValid with getTransaction found returns that result", async () => {
  const result = await confirmLaunchpadSignature(
    mockConnection({
      statuses: [null],
      heights: [21],
      tx: { meta: { err: null } },
    }),
    { signature: "sig3", lastValidBlockHeight: 20, sleep: immediateSleep },
  );
  assert.equal(result.err, null);
});

test("height past lastValid with no tx and recover true succeeds", async () => {
  const result = await confirmLaunchpadSignature(
    mockConnection({
      statuses: [null],
      heights: [30],
      tx: null,
    }),
    {
      signature: "sig4",
      lastValidBlockHeight: 20,
      sleep: immediateSleep,
      recover: async () => true,
    },
  );
  assert.equal(result.err, null);
  assert.equal(result.recovered, true);
});

test("height past lastValid with no tx and no recover throws expiry", async () => {
  await assert.rejects(
    () =>
      confirmLaunchpadSignature(
        mockConnection({
          statuses: [null],
          heights: [30],
          tx: null,
        }),
        { signature: "sig5", lastValidBlockHeight: 20, sleep: immediateSleep },
      ),
    (error) => {
      assert.equal(error.name, "LaunchpadSignatureExpiredError");
      assert.match(String(error.message), /sig5/);
      return true;
    },
  );
});

test("height RPC throw while still in window continues instead of expiring", async () => {
  const result = await confirmLaunchpadSignature(
    mockConnection({
      statuses: [null, { confirmationStatus: "confirmed", err: null }],
      heightError: true,
    }),
    { signature: "sig6", lastValidBlockHeight: 99, sleep: immediateSleep },
  );
  assert.equal(result.err, null);
});

test("hang timeout is not labeled block height exceeded", async () => {
  let t = 0;
  await assert.rejects(
    () =>
      confirmLaunchpadSignature(
        mockConnection({
          statuses: [null],
          heights: [10],
          tx: null,
        }),
        {
          signature: "sig7",
          lastValidBlockHeight: 99,
          hangTimeoutMs: 5,
          now: () => {
            const current = t;
            t += 10;
            return current;
          },
          sleep: immediateSleep,
        },
      ),
    (error) => {
      assert.equal(error instanceof LaunchpadSignatureUnconfirmedError, true);
      assert.equal(error instanceof LaunchpadSignatureExpiredError, false);
      assert.doesNotMatch(String(error.message), /block height exceeded/i);
      return true;
    },
  );
});
