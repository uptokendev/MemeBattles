/**
 * Browser polyfills required by @solana/web3.js (and related crypto helpers).
 * Must load before any Solana wallet / web3 import path runs.
 * vite-plugin-node-polyfills also injects Buffer; this is a belt-and-suspenders assign.
 */
import { Buffer as BufferPolyfill } from "buffer";

const g = globalThis as typeof globalThis & {
  Buffer?: typeof BufferPolyfill;
  global?: typeof globalThis;
  process?: { env?: Record<string, string | undefined> };
};

// Always assign — some wallet injectors leave a broken stub.
g.Buffer = BufferPolyfill;
if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof BufferPolyfill }).Buffer = BufferPolyfill;
}

// Some Solana / bn.js paths still touch `global` or empty process.env.
if (typeof g.global === "undefined") {
  g.global = g;
}
if (typeof g.process === "undefined") {
  g.process = { env: {} };
}
