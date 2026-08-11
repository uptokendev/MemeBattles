/**
 * Bundled Solana web3/spl-token loaders.
 *
 * Never load these from esm.sh or any CDN — Netlify CSP is script-src 'self'.
 * Dynamic import keeps the chunk out of the main bundle until Push Live / Solana runtime.
 */
import "@/polyfills";

export type SolanaWeb3Module = typeof import("@solana/web3.js");
export type SolanaSplTokenModule = typeof import("@solana/spl-token");

let web3Promise: Promise<SolanaWeb3Module> | null = null;
let splTokenPromise: Promise<SolanaSplTokenModule> | null = null;

export function loadSolanaWeb3(): Promise<SolanaWeb3Module> {
  if (!web3Promise) {
    web3Promise = import("@/polyfills").then(() => import("@solana/web3.js"));
  }
  return web3Promise;
}

export function loadSolanaSplToken(): Promise<SolanaSplTokenModule> {
  if (!splTokenPromise) {
    splTokenPromise = import("@solana/spl-token");
  }
  return splTokenPromise;
}
