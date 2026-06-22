import { ethers } from "ethers";

/**
 * Server equivalent of src/lib/readProvider.ts — keep config choices in sync.
 *
 * IMPORTANT (same as client):
 * - We DISABLE batching (batchMaxCount: 1) because public BSC endpoints
 *   often rate-limit when getLogs requests are batched.
 * - We set staticNetwork to avoid extra "detectNetwork" chatter.
 *
 * RPC selection logic adapted from:
 *   - api/dev-fix/route-auth.js:getRpcUrl
 *   - api/league.js
 *
 * Supports env vars:
 *   BSC_RPC_HTTP_${chainId}
 *   VITE_PUBLIC_RPC_${chainId}
 *   BSC_RPC_HTTP / VITE_BSC_MAINNET_RPC etc. as fallbacks.
 */

const providerCache = new Map();

function networkName(chainId) {
  return chainId === 56 ? "bsc" : "bsc-testnet";
}

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0] || "";
}

function getRpcUrl(chainId) {
  // Primary: per-chain explicit
  const perChain =
    process.env[`BSC_RPC_HTTP_${chainId}`] ||
    process.env[`VITE_PUBLIC_RPC_${chainId}`];

  const perChainFirst = firstCsvValue(perChain);
  if (perChainFirst) return perChainFirst;

  if (chainId === 56) {
    return firstCsvValue(
      process.env.BSC_RPC_HTTP_56 ||
      process.env.VITE_BSC_MAINNET_RPC ||
      process.env.BSC_RPC_HTTP
    );
  }

  if (chainId === 97) {
    return firstCsvValue(
      process.env.BSC_RPC_HTTP_97 ||
      process.env.VITE_BSC_TESTNET_RPC ||
      process.env.BSC_RPC_HTTP
    );
  }

  // Last resort fallback from league.js style
  const fallback = String(process.env.BSC_RPC_HTTP || "").trim();
  if (fallback) return fallback;

  return "";
}

/**
 * Returns a read-only provider for server-side on-chain reads.
 * Uses the exact same configuration decisions as the browser getReadProvider.
 */
export function getServerReadProvider(chainId) {
  const numChainId = Number(chainId);
  if (!Number.isFinite(numChainId)) {
    throw new Error(`Invalid chainId for getServerReadProvider: ${chainId}`);
  }

  const cached = providerCache.get(numChainId);
  if (cached) return cached;

  const url = getRpcUrl(numChainId);
  if (!url) {
    throw new Error(`Missing RPC URL for chainId=${numChainId} (check BSC_RPC_HTTP_${numChainId} or VITE_PUBLIC_RPC_${numChainId})`);
  }

  const network = ethers.Network.from(numChainId);
  network.name = networkName(numChainId);

  const provider = new ethers.JsonRpcProvider(
    url,
    network,
    {
      staticNetwork: network,
      batchMaxCount: 1,
      batchStallTime: 0,
    }
  );

  providerCache.set(numChainId, provider);
  return provider;
}

export { getRpcUrl };
