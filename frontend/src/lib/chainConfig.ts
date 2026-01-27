// src/lib/chainConfig.ts
// Centralized chain + env config for UPMEME (BSC mainnet + testnet).
//
// Design goal:
// - Reads follow the wallet's connected chain (if allowed), otherwise fall back to default chain.
// - No redeploy needed to switch between testnet/mainnet; only switch the wallet network.

export type SupportedChainId = 56 | 97;

const DEFAULT_ALLOWED: SupportedChainId[] = [56, 97];
const DEFAULT_CHAIN: SupportedChainId = 97;

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

export function getDefaultChainId(): SupportedChainId {
  const raw =
    (import.meta.env.VITE_DEFAULT_CHAIN_ID as string | undefined) ??
    (import.meta.env.VITE_TARGET_CHAIN_ID as string | undefined); // backward-compat
  const n = Number(raw);
  return (Number.isFinite(n) ? (n as SupportedChainId) : DEFAULT_CHAIN) ?? DEFAULT_CHAIN;
}

export function isAllowedChainId(chainId?: number | null): boolean {
  if (!chainId) return false;
  return getAllowedChainIds().includes(chainId as SupportedChainId);
}

export function getActiveChainId(walletChainId?: number | null): SupportedChainId {
  if (walletChainId && isAllowedChainId(walletChainId)) return walletChainId as SupportedChainId;
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
  if (chainId === 56) {
    const v =
      (import.meta.env.VITE_BSC_MAINNET_RPC as string | undefined) ??
      (import.meta.env.VITE_PUBLIC_RPC_MAINNET as string | undefined);
    const vFirst = firstFromCsv(v);
    if (vFirst) return vFirst;
    return "https://bsc-dataseed.binance.org/";
  }

  // 97
  const v =
    (import.meta.env.VITE_BSC_TESTNET_RPC as string | undefined) ??
    (import.meta.env.VITE_PUBLIC_RPC_TESTNET as string | undefined);
  const vFirst = firstFromCsv(v);
  if (vFirst) return vFirst;
  return "https://data-seed-prebsc-1-s1.binance.org:8545/";
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

export function getExplorerTxBase(chainId: SupportedChainId): string {
  return chainId === 97 ? "https://testnet.bscscan.com/tx/" : "https://bscscan.com/tx/";
}

export function getChainParams(chainId: SupportedChainId) {
  if (chainId === 56) {
    return {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: [getPublicRpcUrl(56)],
      blockExplorerUrls: ["https://bscscan.com/"],
    };
  }
  return {
    chainId: "0x61",
    chainName: "BNB Smart Chain Testnet",
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
    rpcUrls: [getPublicRpcUrl(97)],
    blockExplorerUrls: ["https://testnet.bscscan.com/"],
  };
}
