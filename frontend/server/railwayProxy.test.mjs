import assert from "node:assert/strict";
import test from "node:test";

import { shouldHandleLocally } from "./railwayProxy.js";

test("keeps Solana draft authentication routes on the frontend API gateway", () => {
  assert.equal(
    shouldHandleLocally("/api/auth/nonce?chainId=101&address=8vJ7JUE8fTr1qM4EwHctKQhWgVKvNSbopNfuVQ3kt1yA"),
    true,
  );
  assert.equal(shouldHandleLocally("/api/drafts"), true);
  assert.equal(shouldHandleLocally("/api/drafts/example/promotion"), true);
});

test("still allows indexer-owned routes to use the Railway proxy", () => {
  assert.equal(shouldHandleLocally("/api/token/97/0x0000000000000000000000000000000000000000"), false);
  assert.equal(shouldHandleLocally("/api/league?chainId=97"), false);
});
