/**
 * Central address utilities for EVM (0x lowercase) and Solana (base58 preserved case).
 * Use these instead of ad-hoc .toLowerCase() or 0x regex to support Solana chain 101.
 */

import { isSolanaDraftChainId } from "./draftChains";

/**
 * Check if a string looks like a Solana base58 address (32-44 chars, base58 alphabet).
 */
export function isSolanaAddress(value?: string | null): boolean {
  const s = String(value || "").trim();
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Normalize address:
 * - For Solana (chain 101/102 or looks like base58): return raw (preserve case).
 * - Otherwise (EVM): return lowercase.
 */
export function normalizeAddress(value: string | null | undefined, chainId?: number | string | null): string {
  const raw = String(value || "").trim();
  if (chainId != null && isSolanaDraftChainId(chainId)) {
    return raw;
  }
  if (isSolanaAddress(raw)) {
    return raw;
  }
  return raw.toLowerCase();
}

/**
 * Normalize wallet address for EVM contexts (always lower, or null if not 0x).
 * For Solana-aware contexts, use normalizeAddress instead.
 */
export function normalizeEvmWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return raw.toLowerCase();
  }
  return null;
}

/**
 * Normalize a wallet route parameter while preserving Solana's case-sensitive
 * base58 representation.
 */
export function normalizeRouteWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  const evm = normalizeEvmWallet(raw);
  if (evm) return evm;
  return isSolanaAddress(raw) ? raw : null;
}

/**
 * Check if two addresses match, respecting Solana case-sensitivity.
 */
export function addressesMatch(a?: string | null, b?: string | null, chainId?: number | string | null): boolean {
  const na = normalizeAddress(a, chainId);
  const nb = normalizeAddress(b, chainId);
  return Boolean(na && nb && na === nb);
}
