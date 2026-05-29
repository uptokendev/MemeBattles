import { useEffect, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import type { CampaignSummary } from "@/lib/launchpadClient";
import type { TokenBalanceRow } from "@/types/profilePage";
import { pickTokenAddressFromSummary } from "@/lib/profile/profileFormatters";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import {
  derivePortfolioMetrics,
  parseNativeBalanceBnb,
  calculateHoldingValueUsd,
  type PortfolioMetrics,
} from "@/lib/profile/portfolioCalculations";

const ERC20_ABI_MIN = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }],
  },
] as const;

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

/**
 * Finds the approximate timestamp of the first on-chain activity for an address.
 * Uses binary search + getLogs (Transfer events) + balance checks.
 * This is the preferred source for real "Wallet Age".
 */
async function getFirstOnChainActivityTimestamp(
  address: string,
  provider: ethers.Provider,
  latestBlock: number
): Promise<number | null> {
  if (!address || !provider) return null;

  let low = 0;
  let high = latestBlock;
  let firstBlock: number | null = null;

  const addrTopic = ethers.zeroPadValue(address.toLowerCase(), 32);

  // Limit search depth to avoid excessive RPC calls on public endpoints
  const MAX_ITERATIONS = 40;

  for (let i = 0; i < MAX_ITERATIONS && low <= high; i++) {
    const mid = Math.floor((low + high) / 2);

    try {
      // Check for Transfer events involving this address
      const logs = await provider.getLogs({
        fromBlock: Math.max(0, mid - 3000),
        toBlock: Math.min(latestBlock, mid + 3000),
        topics: [null, [addrTopic, addrTopic]],
      });

      if (logs.length > 0) {
        firstBlock = Math.min(firstBlock ?? mid, mid);
        high = mid - 1;
        continue;
      }

      // Fallback: check balance at this block (archive support varies)
      try {
        const bal = await provider.getBalance(address, mid);
        if (bal > 0n) {
          firstBlock = Math.min(firstBlock ?? mid, mid);
          high = mid - 1;
          continue;
        }
      } catch {
        // Archive node may not support historical balance on this RPC
      }

      low = mid + 1;
    } catch {
      // Rate limit or error → search higher
      low = mid + 1;
    }
  }

  if (firstBlock !== null) {
    try {
      const block = await provider.getBlock(firstBlock);
      return block?.timestamp ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

interface UseProfileBalancesArgs {
  viewedAddress: string | null;
  account: string | null;
  wallet: any;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
  /** Optional fallback: createdAt from user_profiles. Prefer on-chain first activity. */
  profileCreatedAt?: string | null;
}

export function useProfileBalances({
  viewedAddress,
  account,
  wallet,
  fetchCampaigns,
  fetchCampaignSummary,
  profileCreatedAt,
}: UseProfileBalancesArgs) {
  const [nativeBalance, setNativeBalance] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // BNB/USD price for USD conversions (pre-existing external hook; called at top per React rules).
  // Enabled only when we have a target address to avoid unnecessary polling.
  const { price: bnbUsd } = useBnbUsdPrice(!!viewedAddress);

  // New additive state for portfolio metrics (reuses loadingBalances for simplicity).
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [loadingPortfolioMetrics, setLoadingPortfolioMetrics] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveReadProvider = (): ethers.Provider | null => {
      // 1) If the wallet hook already gives us an ethers provider, use it directly.
      //    Do not wrap it in BrowserProvider again.
      const p = wallet?.provider;
      if (p && typeof p.getBalance === "function") return p as ethers.Provider;

      // 2) Fallback to injected provider if it's a real EIP-1193 provider.
      const injected = (window as any)?.ethereum;
      if (injected && typeof injected.request === "function") {
        return new BrowserProvider(injected);
      }

      return null;
    };

    const loadBalances = async () => {
      try {
        if (!viewedAddress || !account) {
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        const readProvider = resolveReadProvider();
        if (!readProvider) {
          // No usable provider in the browser right now; skip quietly.
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        setLoadingBalances(true);
        setLoadingPortfolioMetrics(true);

        // Native BNB balance.
        const bal = await readProvider.getBalance(account as any);
        const bnb = Number(ethers.formatUnits(bal, 18)).toFixed(4);
        const nativeBnbForMetrics = Number.parseFloat(bnb) || 0;
        if (!cancelled) setNativeBalance(`${bnb} BNB`);

        // Launchpad token balances.
        const campaigns = (await fetchCampaigns()) ?? [];
        const summaries = await Promise.allSettled(
          campaigns.map((c) => fetchCampaignSummary(c))
        );

        const fulfilled = summaries
          .filter(
            (r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled"
          )
          .map((r) => r.value);

        const rows: TokenBalanceRow[] = [];

        for (const s of fulfilled) {
          const tokenAddr = pickTokenAddressFromSummary(s);
          if (!tokenAddr) continue;

          try {
            const erc20 = new Contract(tokenAddr as any, ERC20_ABI_MIN as any, readProvider);

            const [rawBal, decimalsAny, symbolMaybe] = await Promise.all([
              erc20.balanceOf(account) as Promise<bigint>,
              (erc20.decimals() as Promise<any>).catch(() => 18),
              (erc20.symbol() as Promise<string>).catch(() => null) as Promise<string | null>,
            ]);

            if (typeof rawBal !== "bigint" || rawBal <= 0n) continue;

            const decimals = Number(decimalsAny);
            const formatted = ethers.formatUnits(
              rawBal,
              Number.isFinite(decimals) ? decimals : 18
            );

            rows.push({
              campaignAddress: s.campaign.campaign,
              tokenAddress: tokenAddr,
              image: s.campaign.logoURI || "/placeholder.svg",
              name: s.campaign.name,
              ticker: s.campaign.symbol || symbolMaybe || "",
              balanceRaw: rawBal,
              balanceFormatted: formatted,
            });
          } catch {
            continue;
          }
        }

        if (!cancelled) {
          setTokenBalances(rows.sort((a, b) => (a.balanceRaw > b.balanceRaw ? -1 : 1)));
        }

        // === Portfolio metrics derivation (additive) ===
        // Now prefers real on-chain first activity over profile createdAt.
        try {
          const tokenHoldingsWithValues = rows.map((row) => {
            const matchingSummary = fulfilled.find(
              (s) => pickTokenAddressFromSummary(s) === row.tokenAddress
            );
            const marketCapBnb = matchingSummary?.stats?.marketCapBnb;

            const valueUsd = calculateHoldingValueUsd(
              row.balanceFormatted,
              marketCapBnb,
              bnbUsd ?? 0
            );

            return {
              ticker: row.ticker || row.name || "???",
              valueUsd,
            };
          });

          // Real on-chain first activity for wallet age (preferred over profile createdAt)
          let firstActivityTs: number | null = null;
          try {
            const latest = await readProvider.getBlockNumber();
            firstActivityTs = await getFirstOnChainActivityTimestamp(account, readProvider, latest);
          } catch (e) {
            console.warn("[Profile] On-chain first activity lookup failed, falling back to profileCreatedAt", e);
          }

          const effectiveTimestamp = firstActivityTs ?? (profileCreatedAt ? Math.floor(new Date(profileCreatedAt).getTime() / 1000) : null);

          const metrics = derivePortfolioMetrics({
            nativeBnb: nativeBnbForMetrics,
            tokenHoldingsWithValues,
            bnbUsd: bnbUsd ?? 0,
            firstActivityTimestamp: effectiveTimestamp,
          });

          if (!cancelled) {
            setPortfolioMetrics(metrics);
          }
        } catch (calcErr) {
          console.warn("[Profile] Portfolio metrics derivation failed (non-fatal)", calcErr);
          if (!cancelled) setPortfolioMetrics(null);
        }
      } catch (e) {
        console.error("[Profile] Failed to load balances", e);
        if (!cancelled) {
          setNativeBalance("");
          setTokenBalances([]);
          setPortfolioMetrics(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingBalances(false);
          setLoadingPortfolioMetrics(false);
        }
      }
    };

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [viewedAddress, account, fetchCampaigns, fetchCampaignSummary, wallet, profileCreatedAt]);

  return {
    nativeBalance,
    tokenBalances,
    loadingBalances,
    // Additive Phase 2 fields (non-breaking). loadingPortfolioMetrics reuses the balances loading flag.
    portfolioMetrics,
    loadingPortfolioMetrics: loadingBalances || loadingPortfolioMetrics,
  };
}
