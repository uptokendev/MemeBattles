import { useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
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
import { getReadProvider } from "@/lib/readProvider";
import { getActiveChainId, isEvmChainId } from "@/lib/chainConfig";

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

const MAX_BALANCE_SCAN_CAMPAIGNS = 120;
const MAX_VALUED_HOLDINGS = 24;

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

interface UseProfileBalancesArgs {
  viewedAddress: string | null;
  account: string | null;
  wallet: any;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
  /** Wallet-age timestamp from the profile service. */
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
  const walletChainId = wallet?.chainId ?? wallet?.network?.chainId;

  useEffect(() => {
    let cancelled = false;

    const resolveReadProvider = (): ethers.Provider | null => {
      const chainId = getActiveChainId(walletChainId);
      return isEvmChainId(chainId) ? getReadProvider(chainId) as ethers.Provider : null;
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

        // Launchpad token balances. Keep this lightweight: first read balances
        // from campaign token addresses, then summarize only tokens the wallet owns.
        const campaigns = ((await fetchCampaigns()) ?? [])
          .filter((campaign) => ethers.isAddress(String(campaign?.token ?? "")))
          .slice(0, MAX_BALANCE_SCAN_CAMPAIGNS);
        const rows: TokenBalanceRow[] = [];
        const ownedCampaigns: any[] = [];

        for (const campaign of campaigns) {
          const tokenAddr = String(campaign?.token ?? "").trim().toLowerCase();
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
              campaignAddress: campaign.campaign,
              tokenAddress: tokenAddr,
              image: campaign.logoURI || "/placeholder.svg",
              name: campaign.name,
              ticker: campaign.symbol || symbolMaybe || "",
              balanceRaw: rawBal,
              balanceFormatted: formatted,
            });
            ownedCampaigns.push(campaign);
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
          const valuedSummaries = await Promise.allSettled(
            ownedCampaigns.slice(0, MAX_VALUED_HOLDINGS).map((campaign) => fetchCampaignSummary(campaign))
          );
          const fulfilled = valuedSummaries
            .filter(
              (r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled"
            )
            .map((r) => r.value);

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

          // Avoid browser-side chain-history scans. They previously issued
          // dozens of wide eth_getLogs requests and could freeze MetaMask.
          const effectiveTimestamp = profileCreatedAt
            ? Math.floor(new Date(profileCreatedAt).getTime() / 1000)
            : null;

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
  }, [viewedAddress, account, fetchCampaigns, fetchCampaignSummary, walletChainId, profileCreatedAt, bnbUsd]);

  return {
    nativeBalance,
    tokenBalances,
    loadingBalances,
    // Additive Phase 2 fields (non-breaking). loadingPortfolioMetrics reuses the balances loading flag.
    portfolioMetrics,
    loadingPortfolioMetrics: loadingBalances || loadingPortfolioMetrics,
  };
}
