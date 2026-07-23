import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import { getFactoryAddress, type SupportedChainId } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";
import type { CampaignInfo } from "@/lib/launchpadClient";

const FACTORY_ABI = LaunchFactoryArtifact.abi as ethers.InterfaceAbi;
const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset,uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

export type OnChainCampaignPage = {
  campaigns: CampaignInfo[];
  nextCursor: number | null;
  total: number;
};

export async function fetchOnChainCampaignPage(
  chainId: SupportedChainId,
  options: { limit?: number; cursor?: number } = {},
): Promise<OnChainCampaignPage> {
  const limit = Math.max(1, Math.min(100, Number(options.limit ?? 100)));
  const cursor = Math.max(0, Number(options.cursor ?? 0));
  const factoryAddress = getFactoryAddress(chainId);
  if (!factoryAddress || !ethers.isAddress(factoryAddress)) {
    return { campaigns: [], nextCursor: null, total: 0 };
  }

  const provider = getReadProvider(chainId);
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider) as any;
  const total = Number((await factory.campaignsCount()) ?? 0n);
  if (!Number.isFinite(total) || total <= 0 || cursor >= total) {
    return { campaigns: [], nextCursor: null, total: Math.max(0, total || 0) };
  }

  const endExclusive = Math.max(0, total - cursor);
  const offset = Math.max(0, endExclusive - limit);
  const actualLimit = endExclusive - offset;

  let page: any[] = [];
  try {
    page = await factory.getCampaignPage(offset, actualLimit);
  } catch (error) {
    const legacyFactory = new Contract(factoryAddress, LEGACY_FACTORY_ABI, provider) as any;
    page = await legacyFactory.getCampaignPage(offset, actualLimit);
  }

  const campaigns = Array.from(page ?? [])
    .map((row: any, index): CampaignInfo | null => {
      const campaign = String(row?.campaign ?? "").toLowerCase();
      if (!ethers.isAddress(campaign)) return null;
      return {
        id: offset + index,
        campaign,
        token: String(row?.token ?? "").toLowerCase(),
        creator: String(row?.creator ?? "").toLowerCase(),
        name: String(row?.name ?? "Unknown"),
        symbol: String(row?.symbol ?? ""),
        logoURI: String(row?.logoURI ?? ""),
        metadataURI: String(row?.metadataURI ?? ""),
        xAccount: String(row?.xAccount ?? ""),
        website: String(row?.website ?? ""),
        extraLink: String(row?.extraLink ?? ""),
        createdAt: row?.createdAt ? Number(row.createdAt) : undefined,
      };
    })
    .filter((campaign): campaign is CampaignInfo => campaign !== null)
    .reverse();

  return {
    campaigns,
    nextCursor: cursor + actualLimit < total ? cursor + actualLimit : null,
    total,
  };
}
