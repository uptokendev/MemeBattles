import { ethers } from "ethers";

/**
 * Server equivalent of src/lib/readProvider.ts — keep config choices in sync.
 *
 * IMPORTANT (same as client):
 * - We DISABLE batching (batchMaxCount: 1) because public BSC endpoints
 *   often rate-limit when getLogs requests are batched.
 * - We set staticNetwork to avoid extra "detectNetwork" chatter.
 * - Primary env RPCs are tried first; built-in public fallbacks are used when
 *   the configured endpoint returns 5xx/timeouts (common on free public RPCs).
 *
 * Supports env vars:
 *   BSC_RPC_HTTP_${chainId}  (CSV allowed)
 *   VITE_PUBLIC_RPC_${chainId}
 *   BSC_RPC_HTTP / VITE_BSC_MAINNET_RPC / VITE_BSC_TESTNET_RPC
 */

const providerCache = new Map();

const PUBLIC_FALLBACKS = {
  56: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed2.binance.org",
  ],
  97: [
    "https://data-seed-prebsc-1-s1.binance.org:8545",
    "https://data-seed-prebsc-2-s1.binance.org:8545",
    "https://bsc-testnet.bnbchain.org",
  ],
};

function networkName(chainId) {
  return Number(chainId) === 56 ? "bsc" : "bsc-testnet";
}

function csvValues(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstCsvValue(value) {
  return csvValues(value)[0] || "";
}

function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Ordered RPC candidates for a chain: configured env first, then public fallbacks.
 */
export function getRpcUrls(chainId) {
  const id = Number(chainId);
  const configured = [
    ...csvValues(process.env[`BSC_RPC_HTTP_${id}`]),
    ...csvValues(process.env[`VITE_PUBLIC_RPC_${id}`]),
  ];

  if (id === 56) {
    configured.push(
      ...csvValues(process.env.BSC_RPC_HTTP_56),
      ...csvValues(process.env.VITE_BSC_MAINNET_RPC),
      ...csvValues(process.env.BSC_RPC_HTTP),
    );
  } else if (id === 97) {
    configured.push(
      ...csvValues(process.env.BSC_RPC_HTTP_97),
      ...csvValues(process.env.VITE_BSC_TESTNET_RPC),
      ...csvValues(process.env.BSC_RPC_HTTP),
    );
  } else {
    configured.push(...csvValues(process.env.BSC_RPC_HTTP));
  }

  return uniqueUrls([...configured, ...(PUBLIC_FALLBACKS[id] || [])]);
}

/** @deprecated Prefer getRpcUrls / getServerReadProvider with failover. */
export function getRpcUrl(chainId) {
  return getRpcUrls(chainId)[0] || "";
}

function makeProvider(url, chainId) {
  const network = ethers.Network.from(Number(chainId));
  network.name = networkName(chainId);
  return new ethers.JsonRpcProvider(url, network, {
    staticNetwork: network,
    batchMaxCount: 1,
    batchStallTime: 0,
  });
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "").slice(0, 48);
  }
}

/**
 * Returns a read-only provider for server-side on-chain reads.
 * Probes candidates until one answers eth_blockNumber successfully.
 */
export async function getServerReadProvider(chainId) {
  const numChainId = Number(chainId);
  if (!Number.isFinite(numChainId)) {
    throw new Error(`Invalid chainId for getServerReadProvider: ${chainId}`);
  }

  const cached = providerCache.get(numChainId);
  if (cached) {
    try {
      await cached.provider.getBlockNumber();
      return cached.provider;
    } catch {
      providerCache.delete(numChainId);
    }
  }

  const urls = getRpcUrls(numChainId);
  if (!urls.length) {
    throw new Error(
      `Missing RPC URL for chainId=${numChainId} (set BSC_RPC_HTTP_${numChainId} or VITE_PUBLIC_RPC_${numChainId})`,
    );
  }

  const errors = [];
  for (const url of urls) {
    const provider = makeProvider(url, numChainId);
    try {
      await provider.getBlockNumber();
      providerCache.set(numChainId, { provider, url });
      return provider;
    } catch (error) {
      errors.push(`${hostOf(url)}: ${String(error?.shortMessage || error?.message || error)}`);
      try {
        provider.destroy?.();
      } catch {
        // ignore
      }
    }
  }

  throw new Error(
    `All RPC endpoints failed for chainId=${numChainId}. Tried: ${errors.join(" | ")}`,
  );
}

/**
 * Sync helper for call sites that already hold a URL string.
 * Prefer getServerReadProvider for create/deploy eligibility.
 */
export function getServerReadProviderForUrl(chainId, url) {
  if (!url) {
    throw new Error(`Missing RPC URL for chainId=${chainId}`);
  }
  return makeProvider(url, Number(chainId));
}

export { firstCsvValue };
