/**
 * Server equivalent of src/lib/readProvider.ts
 * Provides a read-only ethers JsonRpcProvider for on-chain calls from API routes.
 *
 * Env precedence (same spirit as other api/ files):
 *   BSC_RPC_HTTP_${chainId}
 *   VITE_PUBLIC_RPC_${chainId}
 *   Hardcoded public fallbacks for BSC (97/56)
 */

import { JsonRpcProvider, FallbackProvider } from "ethers";

const DEFAULT_BATCH = { batchMaxCount: 1, batchStallTime: 0 };

function getRpcCandidates(chainId) {
  const id = Number(chainId) || 97;
  const envPrimary = process.env[`BSC_RPC_HTTP_${id}`] || process.env[`VITE_PUBLIC_RPC_${id}`] || "";

  const seeds = [];

  if (envPrimary) seeds.push(envPrimary);

  // Common public / community endpoints as last-resort fallbacks
  if (id === 56) {
    seeds.push("https://bsc-dataseed.binance.org");
    seeds.push("https://bsc-dataseed1.defibit.io");
  } else if (id === 97) {
    seeds.push("https://data-seed-prebsc-1-s1.binance.org:8545");
    seeds.push("https://data-seed-prebsc-2-s1.binance.org:8545");
  }

  // Dedupe while preserving order
  return [...new Set(seeds.filter(Boolean))];
}

export function getServerReadProvider(chainId = 97) {
  const candidates = getRpcCandidates(chainId);
  if (candidates.length === 0) {
    throw new Error(`[getServerReadProvider] No RPC configured for chainId=${chainId}`);
  }

  if (candidates.length === 1) {
    return new JsonRpcProvider(candidates[0], Number(chainId), {
      staticNetwork: true,
      ...DEFAULT_BATCH,
    });
  }

  // Fallback provider for resilience
  const providers = candidates.map((url) =>
    new JsonRpcProvider(url, Number(chainId), { staticNetwork: true, ...DEFAULT_BATCH })
  );

  return new FallbackProvider(providers, Number(chainId));
}

export default getServerReadProvider;
