// src/lib/chainConfig.ts
// Centralized chain + env config for MemeWarzone.
// ONLY BNB Smart Chain mainnet (56) and Solana mainnet (101 via Phantom) are supported.
// No other chains (Ethereum, Polygon, Arbitrum, testnets, etc.) are allowed anywhere in the app.
// Frontend-wide guards prevent seeing broken UIs when a wallet is connected to an unsupported chain.

export type SupportedChainId = 56 | 101;

export const SUPPORTED_CHAIN_IDS: SupportedChainId[] = [56, 101];
export const BNB_CHAIN_ID: SupportedChainId = 56;
export const SOLANA_CHAIN_ID: SupportedChainId = 101;

const DEFAULT_ALLOWED: SupportedChainId[] = [56];
const DEFAULT_CHAIN: SupportedChainId = 56;

const parseCsvNumbers = (raw?: string): number[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
};

export function getAllowedChainIds(): SupportedChainId[] {
  const raw = import.meta.env.VITE_ALLOWED_CHAIN_IDS as string | undefined;
  const parsed = parseCsvNumbers(raw) as SupportedChainId[];
  return parsed.length ? parsed : DEFAULT_ALLOWED;
}

/** Returns the full list of chains the app supports (BNB 56 + Solana 101). */
export function getSupportedChainIds(): SupportedChainId[] {
  return SUPPORTED_CHAIN_IDS;
}

export function getDefaultChainId(): SupportedChainId {
  const raw =
    (import.meta.env.VITE_DEFAULT_CHAIN_ID as string | undefined) ??
    (import.meta.env.VITE_TARGET_CHAIN_ID as string | undefined); // backward-compat
  const n = Number(raw);
  return (Number.isFinite(n) ? (n as SupportedChainId) : DEFAULT_CHAIN) ?? DEFAULT_CHAIN;
}

/** True only for exactly the chains we support (56 or 101). */
export function isSupportedChainId(chainId?: number | null): boolean {
  if (!chainId) return false;
  return (chainId === 56 || chainId === 101);
}

/** Legacy alias kept for compatibility with existing call sites. Prefers supported check. */
export function isAllowedChainId(chainId?: number | null): boolean {
  return isSupportedChainId(chainId);
}

export function isSolanaChainId(chainId?: number | null): boolean {
  return chainId === 101;
}

export function isEvmChainId(chainId?: number | null): boolean {
  return chainId === 56;
}

/**
 * Returns the chain to use for data/queries for this wallet session.
 * IMPORTANT: Callers that have a connected wallet MUST first check isSupportedChainId(reportedChain).
 * If the wallet is connected on an unsupported chain we do NOT want silent fallback that hides the problem.
 * This function only falls back for unauthenticated/public views or when no wallet chain is reported.
 */
export function getActiveChainId(walletChainId?: number | null): SupportedChainId {
  if (walletChainId && isSupportedChainId(walletChainId)) return walletChainId as SupportedChainId;
  return getDefaultChainId();
}

export function getPublicRpcUrl(chainId: SupportedChainId): string {
  // NOTE: In Vite, only VITE_* env vars are exposed to the frontend bundle.
  // We support comma-separated lists for redundancy.

  const normalize = (u: string) => {
    const s = u.trim();
    // common typo: "https//" (missing colon)
    if (s.startsWith("https//")) return "https:" + s.slice("https".length);
    if (s.startsWith("http//")) return "http:" + s.slice("http".length);
    return s;
  };

  const firstFromCsv = (raw?: string) => {
    if (!raw) return "";
    const parts = String(raw)
      .split(",")
      .map((p) => normalize(p))
      .filter(Boolean);
    return parts[0] ?? "";
  };

  // Preferred env keys (explicit per-chain)
  const explicit =
    (import.meta.env[`VITE_PUBLIC_RPC_${chainId}`] as string | undefined) ??
    (import.meta.env[`VITE_BSC_RPC_${chainId}`] as string | undefined);

  const explicitFirst = firstFromCsv(explicit);
  if (explicitFirst) return explicitFirst;

  // Secondary env keys (common naming)
  // Only mainnet BNB (56) is supported. Testnet (97) removed per requirements.
  const v =
    (import.meta.env.VITE_BSC_MAINNET_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_RPC_MAINNET as string | undefined);
  const vFirst = firstFromCsv(v);
  if (vFirst) return vFirst;
  return "https://bsc-dataseed.binance.org/";
}

// For redundancy: get *all* configured public RPC URLs for a chain.
export function getPublicRpcUrls(chainId: SupportedChainId): string[] {
  const normalize = (u: string) => {
    const s = u.trim();
    if (s.startsWith("https//")) return "https:" + s.slice("https".length);
    if (s.startsWith("http//")) return "http:" + s.slice("http".length);
    return s;
  };

  const fromCsv = (raw?: string) => {
    if (!raw) return [];
    return String(raw)
      .split(",")
      .map((p) => normalize(p))
      .filter((p) => Boolean(p));
  };

  const explicit =
    (import.meta.env[`VITE_PUBLIC_RPC_${chainId}`] as string | undefined) ??
    (import.meta.env[`VITE_BSC_RPC_${chainId}`] as string | undefined);

  const explicitList = fromCsv(explicit);
  if (explicitList.length) return explicitList;

  // Only mainnet BNB (56) supported. (Legacy 97 branches removed.)
  const v =
    (import.meta.env.VITE_BSC_MAINNET_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_RPC_MAINNET as string | undefined);
  const list = fromCsv(v);
  return list.length ? list : ["https://bsc-dataseed.binance.org/"];
}

export function getFactoryAddress(chainId: SupportedChainId): string {
  // Preferred per-chain vars
  const perChain = (import.meta.env[`VITE_FACTORY_ADDRESS_${chainId}`] as string | undefined) ?? "";
  if (perChain.trim()) return perChain.trim();

  // Backward-compat single var
  const fallback = (import.meta.env.VITE_FACTORY_ADDRESS as string | undefined) ?? "";
  return fallback.trim();
}

export function getVoteTreasuryAddress(chainId: SupportedChainId): string {
  // Preferred per-chain vars
  const perChain = (import.meta.env[`VITE_VOTE_TREASURY_ADDRESS_${chainId}`] as string | undefined) ?? "";
  if (perChain.trim()) return perChain.trim();

  // Backward-compat single var
  const fallback = (import.meta.env.VITE_VOTE_TREASURY_ADDRESS as string | undefined) ?? "";
  return fallback.trim();
}

/**
 * TreasuryVault holds the accumulated League Treasury fees (native BNB).
 * This address is chain-specific.
 */
export function getTreasuryVaultAddress(chainId: SupportedChainId): string {
  // Preferred per-chain vars
  const perChain = (import.meta.env[`VITE_TREASURY_VAULT_ADDRESS_${chainId}`] as string | undefined) ?? "";
  if (perChain.trim()) return perChain.trim();

  // Backward-compat single var
  const fallback = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS as string | undefined) ?? "";
  return fallback.trim();
}

export function getExplorerTxBase(chainId: SupportedChainId): string {
  // Only mainnet (56) supported. Legacy testnet explorer kept for old data display only.
  return "https://bscscan.com/tx/";
}

// Common chains the wallet may be connected to but the app doesn't support.
// Used for clear error messages and diagnostics.
const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Smart Chain",
  97: "BNB Smart Chain Testnet (legacy - no longer supported)",
  101: "Solana",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  10: "Optimism",
  43114: "Avalanche C-Chain",
};

export function getChainLabel(chainId?: number | null): string | null {
  if (!chainId) return null;
  return CHAIN_LABELS[chainId] || `Chain ${chainId}`;
}

/** Human-friendly list for error messages and guards. */
export function getSupportedChainsLabel(): string {
  return "BNB Smart Chain (56) or Solana mainnet (101 via Phantom)";
}

/** Returns a clear message for the unsupported chain UI. */
export function getUnsupportedChainMessage(walletName?: string, chainId?: number | null): string {
  const wallet = walletName || "your wallet";
  const chain = chainId ? `${getChainLabel(chainId) || "Chain " + chainId} (${chainId})` : "an unsupported network";
  return `${wallet} is connected on ${chain}. MemeWarzone only supports ${getSupportedChainsLabel()}.`;
}

export function getChainParams(chainId: SupportedChainId) {
  // Only BNB mainnet (56) supported for EVM. Testnet removed.
  return {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: [getPublicRpcUrl(56)],
    blockExplorerUrls: ["https://bscscan.com/"],
  };
}