// src/lib/readProvider.ts
// Read-only provider cache (JsonRpcProvider) to avoid MetaMask RPC limits / eth_newFilter throttling.
//
// IMPORTANT:
// - Use this for READS (getLogs, call, balance, etc).
// - Use wallet.signer for WRITES.

import { ethers } from "ethers";
import { getPublicRpcUrl, type SupportedChainId } from "@/lib/chainConfig";

type ProviderCache = Record<string, ethers.JsonRpcProvider>;

const getCache = (): ProviderCache => {
  const g = globalThis as any;
  if (!g.__launchit_read_providers) g.__launchit_read_providers = {};
  return g.__launchit_read_providers as ProviderCache;
};

export function getReadProvider(chainId: SupportedChainId): ethers.JsonRpcProvider {
  const cache = getCache();
  const key = String(chainId);
  if (cache[key]) return cache[key];

  const url = getPublicRpcUrl(chainId);
  const p = new ethers.JsonRpcProvider(url, chainId, {
    // keep defaults; avoid aggressive polling
    staticNetwork: true,
  });
  cache[key] = p;
  return p;
}
