import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { type SupportedChainId } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const WAD = 10n ** 18n;

export type OnChainCampaignStats = {
  marketCapBnb?: number;
  volumeBnb?: number;
  raisedTotalBnb?: number;
  holdersCount?: number;
  athMarketCapBnb?: number;
  isDexTrading?: boolean;
  status?: "live" | "graduated";
};

function toNumberFromWei(value: bigint): number | undefined {
  try {
    const n = Number(ethers.formatEther(value));
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function isAddress(value: unknown) {
  return ethers.isAddress(String(value ?? "").trim());
}

export async function fetchOnChainCampaignStats(input: {
  chainId: SupportedChainId;
  campaignAddress: string;
  tokenAddress?: string | null;
}): Promise<OnChainCampaignStats | null> {
  const campaignAddress = String(input.campaignAddress || "").trim().toLowerCase();
  const tokenAddress = String(input.tokenAddress || "").trim().toLowerCase();
  if (!isAddress(campaignAddress)) return null;

  const provider = getReadProvider(input.chainId) as ethers.Provider;
  const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, provider) as any;

  const [
    buyersCount,
    totalBuyVolumeWei,
    totalSellVolumeWei,
    currentPrice,
    sold,
    launched,
    reserveWei,
  ] = await Promise.all([
    campaign.buyersCount().catch(() => 0n),
    campaign.totalBuyVolumeWei().catch(() => 0n),
    campaign.totalSellVolumeWei().catch(() => 0n),
    campaign.currentPrice().catch(() => 0n),
    campaign.sold().catch(() => 0n),
    campaign.launched().catch(() => false),
    provider.getBalance(campaignAddress).catch(() => 0n),
  ]);

  let circulating = BigInt(String(sold ?? 0n));
  if (launched && isAddress(tokenAddress)) {
    try {
      const token = new Contract(tokenAddress, TOKEN_ABI, provider) as any;
      circulating = BigInt(String(await token.totalSupply()));
    } catch {
      // Sold supply is good enough for bonding and safer than blank metrics.
    }
  }

  const priceWei = BigInt(String(currentPrice ?? 0n));
  const marketCapWei = priceWei > 0n && circulating > 0n ? (priceWei * circulating) / WAD : 0n;
  const volumeWei = BigInt(String(totalBuyVolumeWei ?? 0n)) + BigInt(String(totalSellVolumeWei ?? 0n));

  const marketCapBnb = toNumberFromWei(marketCapWei);
  return {
    marketCapBnb,
    volumeBnb: toNumberFromWei(volumeWei),
    raisedTotalBnb: toNumberFromWei(BigInt(String(reserveWei ?? 0n))),
    holdersCount: Number(buyersCount ?? 0n),
    athMarketCapBnb: marketCapBnb,
    isDexTrading: launched,
    status: launched ? "graduated" : "live",
  };
}
