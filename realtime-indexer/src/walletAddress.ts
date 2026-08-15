/**
 * Wallet address helpers shared by rewards + activity APIs.
 * EVM addresses are canonicalized to lowercase; Solana pubkeys keep exact case.
 */

export function isEvmAddress(value?: string | null): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

export function isSolanaAddress(value?: string | null): boolean {
  const s = String(value || "").trim();
  return s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

export function parseWalletAddressOrNull(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (isSolanaAddress(raw)) return raw;
  if (isEvmAddress(raw)) return raw.toLowerCase();
  return null;
}

export function normalizeWalletAddress(value: unknown): string {
  const parsed = parseWalletAddressOrNull(value);
  if (!parsed) throw new Error(`Invalid wallet address: ${String(value ?? "")}`);
  return parsed;
}

/** Case-insensitive SQL match that still finds exact Solana pubkeys. */
export function walletEqualsSql(column: string, paramIndex: number): string {
  return `(${column} = $${paramIndex} OR lower(${column}) = lower($${paramIndex}))`;
}
