import type { SupportedChainId } from "@/lib/chainConfig";
import type { CampaignInfo } from "@/lib/launchpadClient";
import {
  fetchOnChainCampaignPage as fetchBaseOnChainCampaignPage,
  type OnChainCampaignPage,
} from "@/lib/onChainCampaignFeedBase";
import {
  fetchPublicCampaignLifecycleDrafts,
  lifecycleByCampaign,
  readCampaignLaunchAt,
  timestampSeconds,
} from "@/lib/scheduledLaunchApi";

export type { OnChainCampaignPage } from "@/lib/onChainCampaignFeedBase";

const launchAtCache = new Map<string, number | null>();

async function cachedOnChainLaunchAt(chainId: number, campaignAddress: string) {
  const key = `${chainId}:${campaignAddress.toLowerCase()}`;
  if (launchAtCache.has(key)) return launchAtCache.get(key) ?? null;
  const value = await readCampaignLaunchAt(chainId, campaignAddress);
  launchAtCache.set(key, value);
  return value;
}

export async function fetchOnChainCampaignPage(
  chainId: SupportedChainId,
  options: { limit?: number; cursor?: number } = {},
): Promise<OnChainCampaignPage> {
  const page = await fetchBaseOnChainCampaignPage(chainId, options);
  if (!page.campaigns.length) return page;

  let lifecycleAvailable = true;
  let lifecycle = new Map<string, any>();
  try {
    lifecycle = lifecycleByCampaign(
      await fetchPublicCampaignLifecycleDrafts({ chainId: Number(chainId), limit: 500 }),
    );
  } catch {
    lifecycleAvailable = false;
  }

  const now = Math.floor(Date.now() / 1000);
  const resolved = await Promise.all(
    page.campaigns.map(async (campaign): Promise<CampaignInfo | null> => {
      const address = String(campaign.campaign || "").toLowerCase();
      const draft = lifecycle.get(address);
      let launchAt = timestampSeconds(draft?.scheduledLaunchAt || draft?.tradingLaunchAt);

      if (!lifecycleAvailable) {
        launchAt = await cachedOnChainLaunchAt(Number(chainId), address);
      }

      if (launchAt && launchAt > now) return null;
      return launchAt ? { ...campaign, createdAt: launchAt } : campaign;
    }),
  );

  return {
    ...page,
    campaigns: resolved.filter((campaign): campaign is CampaignInfo => campaign !== null),
  };
}
