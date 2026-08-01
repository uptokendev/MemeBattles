import { ethers } from "ethers";
import { getPublicRpcUrls, type SupportedChainId } from "@/lib/chainConfig";

function isRateLimitError(error: unknown): boolean {
  const message = String((error as any)?.shortMessage || (error as any)?.message || error || "").toLowerCase();
  const code = String((error as any)?.error?.code ?? (error as any)?.info?.error?.code ?? (error as any)?.code ?? "");
  return (
    code === "-32005" ||
    code === "BAD_DATA" ||
    message.includes("limit exceeded") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("missing response") ||
    message.includes("could not coalesce")
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function makeProvider(url: string, chainId: number): ethers.JsonRpcProvider {
  const network = ethers.Network.from(chainId);
  return new ethers.JsonRpcProvider(url, network, {
    staticNetwork: network,
    batchMaxCount: 1,
    batchStallTime: 0,
  } as any);
}

/**
 * Scan event logs with multi-RPC failover and small sequential windows.
 * Public BSC testnet RPCs frequently return -32005 / missing response for getLogs.
 */
export async function scanContractLogs(input: {
  chainId: SupportedChainId;
  address: string;
  topics: (string | null)[];
  lookbackBlocks?: number;
  chunkSize?: number;
  signal?: AbortSignal;
}): Promise<ethers.Log[]> {
  const address = String(input.address || "").toLowerCase();
  if (!ethers.isAddress(address)) return [];

  const urls = getPublicRpcUrls(input.chainId);
  if (!urls.length) return [];

  const lookback = Math.max(100, Math.min(input.lookbackBlocks ?? 2_500, 8_000));
  const chunkSize = Math.max(20, Math.min(input.chunkSize ?? 80, 200));

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex += 1) {
    if (input.signal?.aborted) return [];
    const provider = makeProvider(urls[urlIndex], input.chainId);
    try {
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - lookback);
      const logs: ethers.Log[] = [];
      let rateLimited = false;

      for (let start = fromBlock; start <= latest; start += chunkSize) {
        if (input.signal?.aborted) break;
        const end = Math.min(latest, start + chunkSize - 1);
        try {
          const chunk = await provider.getLogs({
            address,
            topics: input.topics as any,
            fromBlock: start,
            toBlock: end,
          });
          logs.push(...chunk);
        } catch (error) {
          if (isRateLimitError(error)) {
            rateLimited = true;
            await sleep(200);
            break;
          }
          // Try next RPC endpoint for hard failures.
          rateLimited = true;
          break;
        }
        await sleep(30);
      }

      // Accept partial success from this endpoint.
      if (logs.length > 0 || !rateLimited) return logs;
    } catch {
      // try next url
    }
  }

  return [];
}

export async function getBlockTimestamps(
  chainId: SupportedChainId,
  blockNumbers: number[],
  signal?: AbortSignal,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unique = Array.from(new Set(blockNumbers.filter((n) => Number.isFinite(n) && n > 0))).slice(-60);
  if (!unique.length) return out;

  const urls = getPublicRpcUrls(chainId);
  if (!urls.length) return out;
  const provider = makeProvider(urls[0], chainId);

  for (const blockNumber of unique) {
    if (signal?.aborted) break;
    try {
      const block = await provider.getBlock(blockNumber);
      if (block?.timestamp) out.set(blockNumber, Number(block.timestamp));
    } catch {
      // ignore
    }
    await sleep(20);
  }
  return out;
}
