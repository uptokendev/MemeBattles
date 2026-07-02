// src/lib/chainConfig.ts
// Centralized chain + env config for MemeBattles.
// Supports BNB Smart Chain plus Solana mainnet via supported Solana wallets.
//
// Design goal:
// - Reads follow explicit route/feed chain context first, then the wallet's connected chain,
//   otherwise fall back to default chain.
// - No redeploy needed to switch between BNB testnet/mainnet; only switch the wallet network.

export type SupportedChainId = 56 | 97 | 101;

export const BNB_CHAIN_ID: SupportedChainId = 56;
export const BNB_TESTNET_CHAIN_ID: SupportedChainId = 97;
export const SOLANA_CHAIN_ID: SupportedChainId = 101;
export const SUPPORTED_CHAIN_IDS: SupportedChainId[] = [56, 97, 101];

const DEFAULT_ALLOWED: SupportedChainId[] = [56, 97, 101];
const DEFAULT_CHAIN: SupportedChainId = 56;
const LAST_FEATURED_CHAIN_KEY = "mwz:last_featured_chain_id";

const parseCsvNumbers = (raw?: string): number[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
};

export function getAllowedChainIds(): SupportedChainId[] {
  const raw = import.meta.env.VITE_ALLOWED_CHAIN_IDS as string | undefined;
  const parsed = parseCsvNumbers(raw).filter((chainId) => isSupportedChainId(chainId)) as SupportedChainId[];
  return parsed.length ? parsed : DEFAULT_ALLOWED;
}

export function getSupportedChainIds(): SupportedChainId[] {
  return SUPPORTED_CHAIN_IDS;
}

export function getDefaultChainId(): SupportedChainId {
  const raw =
    (import.meta.env.VITE_DEFAULT_CHAIN_ID as string | undefined) ??
    (import.meta.env.VITE_TARGET_CHAIN_ID as string | undefined); // backward-compat
  const n = Number(raw);
  return Number.isFinite(n) && isSupportedChainId(n) ? (n as SupportedChainId) : DEFAULT_CHAIN;
}

export function isSupportedChainId(chainId?: number | null): boolean {
  return chainId === 56 || chainId === 97 || chainId === 101;
}

export function isAllowedChainId(chainId?: number | null): boolean {
  if (!chainId) return false;
  return getAllowedChainIds().includes(chainId as SupportedChainId);
}

export function isSolanaChainId(chainId?: number | null): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

export function isEvmChainId(chainId?: number | null): boolean {
  return chainId === BNB_CHAIN_ID || chainId === BNB_TESTNET_CHAIN_ID;
}

function readBrowserChainContext(): SupportedChainId | null {
  if (typeof window === "undefined") return null;

  try {
    const url = new URL(window.location.href);
    const queryChainId = Number(url.searchParams.get("chainId") || "");
    if (isAllowedChainId(queryChainId)) return queryChainId as SupportedChainId;

    if (/^\/token\/0x[a-fA-F0-9]{40}/.test(url.pathname)) {
      const stored = Number(window.localStorage.getItem(LAST_FEATURED_CHAIN_KEY) || "");
      if (isAllowedChainId(stored)) return stored as SupportedChainId;
    }
  } catch {
    // ignore route-context failures
  }

  return null;
}

export function getActiveChainId(walletChainId?: number | null): SupportedChainId {
  const routeChainId = readBrowserChainContext();
  if (routeChainId) return routeChainId;
  if (walletChainId && isAllowedChainId(walletChainId)) return walletChainId as SupportedChainId;
  return getDefaultChainId();
}

function normalizeRpcUrl(u: string) {
  const s = u.trim();
  // common typo: "https//" (missing colon)
  if (s.startsWith("https//")) return "https:" + s.slice("https".length);
  if (s.startsWith("http//")) return "http:" + s.slice("http".length);
  return s;
}

function firstFromCsv(raw?: string) {
  if (!raw) return "";
  const parts = String(raw)
    .split(",")
    .map((p) => normalizeRpcUrl(p))
    .filter(Boolean);
  return parts[0] ?? "";
}

function fromCsv(raw?: string) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((p) => normalizeRpcUrl(p))
    .filter((p) => Boolean(p));
}

export function getPublicRpcUrl(chainId: SupportedChainId): string {
  // NOTE: In Vite, only VITE_* env vars are exposed to the frontend bundle.
  // We support comma-separated lists for redundancy.

  if (chainId === SOLANA_CHAIN_ID) {
    const solana =
      (import.meta.env.VITE_SOLANA_MAINNET_RPC as string | undefined) ??
      (import.meta.env.VITE_SOLANA_RPC as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_SOLANA as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_101 as string | undefined);
    const solanaFirst = firstFromCsv(solana);
    return solanaFirst || "https://api.mainnet-beta.solana.com";
  }

  const explicit =
    (import.meta.env[`VITE_PUBLIC_RPC_${chainId}`] as string | undefined) ??
    (import.meta.env[`VITE_BSC_RPC_${chainId}`] as string | undefined);

  const explicitFirst = firstFromCsv(explicit);
  if (explicitFirst) return explicitFirst;

  if (chainId === 56) {
    const v =
      (import.meta.env.VITE_BSC_MAINNET_RPC as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_MAINNET as string | undefined);
    const vFirst = firstFromCsv(v);
    if (vFirst) return vFirst;
    return "https://bsc-dataseed.binance.org/";
  }

  const v =
    (import.meta.env.VITE_BSC_TESTNET_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_RPC_TESTNET as string | undefined);
  const vFirst = firstFromCsv(v);
  if (vFirst) return vFirst;
  return "https://data-seed-prebsc-1-s1.binance.org:8545/";
}

// For redundancy: get *all* configured public RPC URLs for a chain.
export function getPublicRpcUrls(chainId: SupportedChainId): string[] {
  if (chainId === SOLANA_CHAIN_ID) {
    const solana =
      (import.meta.env.VITE_SOLANA_MAINNET_RPC as string | undefined) ??
      (import.meta.env.VITE_SOLANA_RPC as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_SOLANA as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_101 as string | undefined);
    const list = fromCsv(solana);
    return list.length ? list : ["https://api.mainnet-beta.solana.com"];
  }

  const explicit =
    (import.meta.env[`VITE_PUBLIC_RPC_${chainId}`] as string | undefined) ??
    (import.meta.env[`VITE_BSC_RPC_${chainId}`] as string | undefined);

  const explicitList = fromCsv(explicit);
  if (explicitList.length) return explicitList;

  if (chainId === 56) {
    const v =
      (import.meta.env.VITE_BSC_MAINNET_RPC as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_MAINNET as string | undefined);
    const list = fromCsv(v);
    return list.length ? list : ["https://bsc-dataseed.binance.org/"];
  }

  const v =
    (import.meta.env.VITE_BSC_TESTNET_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_RPC_TESTNET as string | undefined);
  const list = fromCsv(v);
  return list.length ? list : ["https://data-seed-prebsc-1-s1.binance.org:8545/"];
}

export function getFactoryAddress(chainId: SupportedChainId): string {
  if (isSolanaChainId(chainId)) return "";

  // Preferred per-chain vars
  const perChain = (import.meta.env[`VITE_FACTORY_ADDRESS_${chainId}`] as string | undefined) ?? "";
  if (perChain.trim()) return perChain.trim();

  // Backward-compat single var
  const fallback = (import.meta.env.VITE_FACTORY_ADDRESS as string | undefined) ?? "";
  return fallback.trim();
}

export function getVoteTreasuryAddress(chainId: SupportedChainId): string {
  if (isSolanaChainId(chainId)) return "";

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
  if (isSolanaChainId(chainId)) return "";

  // Preferred per-chain vars
  const perChain = (import.meta.env[`VITE_TREASURY_VAULT_ADDRESS_${chainId}`] as string | undefined) ?? "";
  if (perChain.trim()) return perChain.trim();

  // Backward-compat single var
  const fallback = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS as string | undefined) ?? "";
  return fallback.trim();
}

export function getExplorerTxBase(chainId: SupportedChainId): string {
  if (chainId === SOLANA_CHAIN_ID) return "https://solscan.io/tx/";
  return chainId === 97 ? "https://testnet.bscscan.com/tx/" : "https://bscscan.com/tx/";
}

// Common chains the wallet may be connected to but the app doesn't support.
// Used purely for human-readable labels on settings/diagnostic screens.
const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Smart Chain",
  97: "BNB Smart Chain Testnet",
  101: "Solana mainnet",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  10: "Optimism",
  43114: "Avalanche C-Chain",
};

export function getChainLabel(chainId?: number | null): string {
  if (!chainId) return "Unknown";
  if (chainId === 56) return "BNB";
  if (chainId === 97) return "BNB Testnet";
  if (chainId === 101) return "Solana";
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}
