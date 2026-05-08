import { useEffect, useState } from "react";
import type { CampaignSummary } from "@/lib/launchpadClient";
import { formatTimeAgo } from "@/lib/profile/profileFormatters";

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

export interface CreatedCampaignCard {
  id: number;
  image: string;
  name: string;
  ticker: string;
  campaignAddress: string;
  marketCap: string;
  timeAgo: string;
  buyersCount?: number;
}

interface UseCreatedCampaignsArgs {
  viewedAddress: string | null;
  account: string | null;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
}

export function useCreatedCampaigns({
  viewedAddress,
  account,
  fetchCampaigns,
  fetchCampaignSummary,
}: UseCreatedCampaignsArgs) {
  const [created, setCreated] = useState<CreatedCampaignCard[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadCreated = async () => {
      try {
        if (!viewedAddress || !account) {
          setCreated([]);
          return;
        }

        const campaigns = (await fetchCampaigns()) ?? [];
        const mine = campaigns.filter(
          (c) => (c.creator ?? "").toLowerCase() === account.toLowerCase()
        );

        const results = await Promise.allSettled(mine.map((c) => fetchCampaignSummary(c)));

        if (cancelled) return;

        const next = results
          .filter((r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled")
          .map((r, idx) => {
            const s = r.value;
            return {
              id: typeof s.campaign.id === "number" ? s.campaign.id : idx + 1,
              image: s.campaign.logoURI || "/placeholder.svg",
              name: s.campaign.name,
              ticker: s.campaign.symbol,
              campaignAddress: s.campaign.campaign,
              marketCap: s.stats.marketCap,
              timeAgo: (s.campaign as any).timeAgo || formatTimeAgo(s.campaign.createdAt),
              buyersCount: (s.stats as any)?.buyersCount ?? undefined,
            };
          });

        setCreated(next);
      } catch (e) {
        console.error("[Profile] Failed to load created campaigns", e);
        if (!cancelled) setCreated([]);
      }
    };

    loadCreated();
    return () => {
      cancelled = true;
    };
  }, [viewedAddress, account, fetchCampaigns, fetchCampaignSummary]);

  return created;
}