import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEvmAccounts,
  selectEvmAccount,
} from "./walletAccountSelection.mjs";

const OLD = "0x1111111111111111111111111111111111111111";
const NEXT = "0x2222222222222222222222222222222222222222";

test("accountsChanged payload wins over stale provider state", () => {
  assert.equal(selectEvmAccount([NEXT], OLD, [OLD]), NEXT);
});

test("the first reported account wins when several accounts are authorized", () => {
  assert.equal(selectEvmAccount([NEXT, OLD], OLD, [OLD, NEXT]), NEXT);
});

test("provider-selected address is used only as a fallback", () => {
  assert.equal(selectEvmAccount([], NEXT, [OLD, NEXT]), NEXT);
});

test("invalid EVM account values are discarded", () => {
  assert.deepEqual(normalizeEvmAccounts([NEXT, "not-an-address"]), [NEXT]);
});
