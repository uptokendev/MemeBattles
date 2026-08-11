/**
 * Browser polyfills required by @solana/web3.js (and related crypto helpers).
 * Must load before any Solana wallet / web3 import path runs.
 */
import { Buffer } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  process?: { env?: Record<string, string | undefined> };
};

if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}

// Some Solana / bn.js paths still touch `global` or empty process.env.
if (typeof g.global === "undefined") {
  g.global = g;
}
if (typeof g.process === "undefined") {
  g.process = { env: {} };
}
