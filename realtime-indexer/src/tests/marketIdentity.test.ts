import test from "node:test";
import assert from "node:assert/strict";

// Keep pure — do not import marketIdentity.ts (pulls env/db via pool).
function isEvmAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

test("isEvmAddress accepts lowercase 20-byte addresses", () => {
  assert.equal(isEvmAddress("0x4cc837da7ff635c22fb89863014b227b7223e587"), true);
  assert.equal(isEvmAddress("0xef0293606cbdb071b03d32f62bfbdea519c7c51c"), true);
});

test("isEvmAddress rejects invalid values", () => {
  assert.equal(isEvmAddress(""), false);
  assert.equal(isEvmAddress("0x123"), false);
  assert.equal(isEvmAddress("4cc837da7ff635c22fb89863014b227b7223e587"), false);
});
