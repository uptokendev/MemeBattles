import { useEffect, useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import type { CampaignSummary } from "@/lib/launchpadClient";
import type { TokenBalanceRow } from "@/types/profilePage";
import { pickTokenAddressFromSummary } from "@/lib/profile/profileFormatters";

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

interface UseProfileBalancesArgs {
  viewedAddress: string | null;
  account: string | null;
  wallet: any;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
}

export function useProfileBalances({
  viewedAddress,
  account,
  wallet,
  fetchCampaigns,
  fetchCampaignSummary,
}: UseProfileBalancesArgs) {
  const isSolanaAddr = !/^0x[a-fA-F0-9]{40}$/.test(String(account || ""));
  const [nativeBalance, setNativeBalance] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    if (isSolanaAddr) {
      setNativeBalance("");
      setTokenBalances([]);
      setLoadingBalances(false);
      return;
    }
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

        // Native BNB balance.
        const bal = await readProvider.getBalance(account as any);
        const bnb = Number(ethers.formatUnits(bal, 18)).toFixed(4);
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
      } catch (e) {
        console.error("[Profile] Failed to load balances", e);
        if (!cancelled) {
          setNativeBalance("");
          setTokenBalances([]);
        }
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    };

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [viewedAddress, account, fetchCampaigns, fetchCampaignSummary, wallet]);

  return {
    nativeBalance,
    tokenBalances,
    loadingBalances,
  };
}