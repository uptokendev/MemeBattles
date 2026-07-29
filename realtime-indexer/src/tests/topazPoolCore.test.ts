import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTopazSwap, priceBnbFromRaw } from "../topazPoolCore.js";

test("normalizes a token0 purchase", () => {
  assert.deepEqual(
    normalizeTopazSwap(true, {
      amount0In: 0n,
      amount1In: 2n * 10n ** 18n,
      amount0Out: 1_000n * 10n ** 18n,
      amount1Out: 0n,
    }),
    {
      side: "buy",
      tokenAmountRaw: 1_000n * 10n ** 18n,
      nativeAmountRaw: 2n * 10n ** 18n,
    },
  );
});

test("normalizes a token1 sale", () => {
  assert.deepEqual(
    normalizeTopazSwap(false, {
      amount0In: 0n,
      amount1In: 500n * 10n ** 18n,
      amount0Out: 1n * 10n ** 18n,
      amount1Out: 0n,
    }),
    {
      side: "sell",
      tokenAmountRaw: 500n * 10n ** 18n,
      nativeAmountRaw: 1n * 10n ** 18n,
    },
  );
});

test("rejects ambiguous or flash-style pool movements", () => {
  assert.equal(
    normalizeTopazSwap(true, {
      amount0In: 10n,
      amount1In: 10n,
      amount0Out: 5n,
      amount1Out: 5n,
    }),
    null,
  );
});

test("calculates BNB per token without floating-point source values", () => {
  assert.equal(
    priceBnbFromRaw(1_000n * 10n ** 18n, 2n * 10n ** 18n),
    "0.002",
  );
});
