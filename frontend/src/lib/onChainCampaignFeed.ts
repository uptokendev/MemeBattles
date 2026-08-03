import type { SupportedChainId } from "@/lib/chainConfig";
import type { CampaignInfo } from "@/lib/launchpadClient";
import {
  fetchOnChainCampaignPage as fetchBaseOnChainCampaignPage,
  type OnChainCampaignPage,
} from "@/lib/onChainCampaignFeedBase";
import {
  fetchPublicCampaignLifecycleDrafts,
  lifecycleByCampaign,
  timestampSeconds,
} from "@/lib/scheduledLaunchApi";

export type { OnChainCampaignPage } from "@/lib/onChainCampaignFeedBase";

export async function fetchOnChainCampaignPage(
  chainId: SupportedChainId,
  options: { limit?: number; cursor?: number; skipLifecycleFilter?: boolean } = {},
): Promise<OnChainCampaignPage> {
  const page = await fetchBaseOnChainCampaignPage(chainId, options);
  if (!page.campaigns.length) return page;

  // Fast path for War Room / inventory: skip another lifecycle×500 round-trip.
  if (options.skipLifecycleFilter) {
    return page;
  }

  let lifecycleAvailable = true;
  let lifecycle = new Map<string, any>();
  try {
    lifecycle = lifecycleByCampaign(
      await fetchPublicCampaignLifecycleDrafts({ chainId: Number(chainId), limit: 120 }),
    );
  } catch {
    lifecycleAvailable = false;
  }

  const now = Math.floor(Date.now() / 1000);
  // Avoid N sequential launchAt RPCs when lifecycle is down — keep the row.
  if (!lifecycleAvailable) {
    return page;
  }

  const resolved = page.campaigns.map((campaign): CampaignInfo | null => {
    const address = String(campaign.campaign || "").toLowerCase();
    const draft = lifecycle.get(address);
    const launchAt = timestampSeconds(draft?.scheduledLaunchAt || draft?.tradingLaunchAt);
    if (launchAt && launchAt > now) return null;
    return launchAt ? { ...campaign, createdAt: launchAt } : campaign;
  });

  return {
    ...page,
    campaigns: resolved.filter((campaign): campaign is CampaignInfo => campaign !== null),
  };
}
