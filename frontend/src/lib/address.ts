/**
 * Central address utilities for EVM (0x lowercase) and Solana (base58 preserved case).
 * Use these instead of ad-hoc .toLowerCase() or 0x regex to support Solana wallets.
 */

/**
 * Check if a string looks like a Solana base58 address (32-44 chars, base58 alphabet).
 */
export function isSolanaAddress(value?: string | null): boolean {
  const s = String(value || "").trim();
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Normalize address:
 * - For Solana/base58: return raw value and preserve case.
 * - For EVM: return lowercase.
 */
export function normalizeAddress(value?: string | null): string {
  const raw = String(value || "").trim();
  if (isSolanaAddress(raw)) {
    return raw;
  }
  return raw.toLowerCase();
}

/**
 * Normalize wallet address for EVM contexts only.
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
 * Check if two addresses match, preserving Solana case sensitivity.
 */
export function addressesMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return Boolean(na && nb && na === nb);
}
