import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { isEvmChainId, type SupportedChainId } from "@/lib/chainConfig";
import { scanContractLogs } from "@/lib/rpcLogScan";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

export type TransferHolderRow = {
  address: string;
  bal: bigint;
};

export function useTokenTransferHolders(args: {
  tokenAddress?: string | null;
  chainId: number;
  enabled?: boolean;
  excludeAddresses?: Array<string | null | undefined>;
}) {
  const [holders, setHolders] = useState<TransferHolderRow[]>([]);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const excludeKey = (args.excludeAddresses || [])
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    const token = String(args.tokenAddress || "").toLowerCase();
    const chainId = Number(args.chainId) as SupportedChainId;
    if (!args.enabled || !isEvmChainId(chainId) || !ethers.isAddress(token)) {
      setHolders([]);
      setComplete(false);
      return;
    }

    const excluded = new Set(
      [token, ...excludeKey.split(",")]
        .map((value) => String(value || "").toLowerCase())
        .filter((value) => ethers.isAddress(value)),
    );

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const logs = await scanContractLogs({
          chainId,
          address: token,
          topics: [TRANSFER_TOPIC],
          lookbackBlocks: 200_000,
          chunkSize: 2_500,
        });
        const balances = new Map<string, bigint>();
        const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
        let sawMint = false;
        for (const log of logs) {
          try {
            const parsed = iface.parseLog(log);
            if (!parsed) continue;
            const from = String(parsed.args.from || "").toLowerCase();
            const to = String(parsed.args.to || "").toLowerCase();
            const value = BigInt(String(parsed.args.value || 0));
            if (from === ethers.ZeroAddress.toLowerCase()) sawMint = true;
            if (from && from !== ethers.ZeroAddress.toLowerCase()) {
              balances.set(from, (balances.get(from) ?? 0n) - value);
            }
            if (to && to !== ethers.ZeroAddress.toLowerCase()) {
              balances.set(to, (balances.get(to) ?? 0n) + value);
            }
          } catch {
            // ignore
          }
        }
        if (cancelled) return;
        setComplete(sawMint);
        setHolders(
          [...balances.entries()]
            .filter(([address, bal]) => bal > 0n && !excluded.has(address))
            .map(([address, bal]) => ({ address, bal }))
            .sort((a, b) => (a.bal === b.bal ? 0 : a.bal > b.bal ? -1 : 1)),
        );
      } catch {
        if (!cancelled) {
          setHolders([]);
          setComplete(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [args.chainId, args.enabled, args.tokenAddress, excludeKey]);

  return { holders, complete, loading };
}
