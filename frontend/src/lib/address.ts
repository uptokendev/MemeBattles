/**
 * Central address utilities for EVM (0x lowercase) and Solana (base58 preserved case).
 * Use these instead of ad-hoc .toLowerCase() or 0x regex to support Solana wallets.
 */

/**
 * Check if a string is an EVM address (0x + 40 hex chars).
 */
export function isEvmAddress(value?: string | null): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

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
 * Normalize a value intended for a wallet route parameter.
 * EVM addresses are canonicalized to lowercase, Solana addresses keep exact case.
 */
export function normalizeRouteWallet(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isEvmAddress(raw)) return raw.toLowerCase();
  if (isSolanaAddress(raw)) return raw;
  return null;
}

/**
 * Returns a route-safe wallet address, preferring the connected wallet when it
 * proves a lowercased Solana route param is only a casing-damaged copy.
 */
export function effectiveWalletAddress(
  requestedWallet?: string | null,
  connectedWallet?: string | null,
): string | null {
  const requested = normalizeRouteWallet(requestedWallet);
  const connected = normalizeRouteWallet(connectedWallet);

  if (!requested) return connected;
  if (!connected) return requested;
  if (requested === connected) return requested;
  if (isEvmAddress(requested) && isEvmAddress(connected) && requested.toLowerCase() === connected.toLowerCase()) {
    return connected.toLowerCase();
  }
  if (isSolanaAddress(requested) && isSolanaAddress(connected) && requested.toLowerCase() === connected.toLowerCase()) {
    return connected;
  }
  return requested;
}

/**
 * Route comparison is strict for unrelated wallets, but allows recovery from
 * lowercased Solana URLs when the connected wallet supplies canonical casing.
 */
export function routeWalletsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeRouteWallet(a);
  const nb = normalizeRouteWallet(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (isEvmAddress(na) && isEvmAddress(nb)) return na.toLowerCase() === nb.toLowerCase();
  if (isSolanaAddress(na) && isSolanaAddress(nb)) return na.toLowerCase() === nb.toLowerCase();
  return false;
}

/**
 * Normalize wallet address for EVM contexts only.
 * For Solana-aware contexts, use normalizeAddress instead.
 */
export function normalizeEvmWallet(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (isEvmAddress(raw)) {
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
