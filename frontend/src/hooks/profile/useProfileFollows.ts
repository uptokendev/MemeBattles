import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProfileTab } from "@/types/profile";
import type { CampaignSummary } from "@/lib/launchpadClient";
import {
  followUser,
  getFollowedCampaigns,
  getFollowers,
  getFollowersCount,
  getFollowing,
  getFollowingCount,
  isFollowingUser,
  unfollowUser,
} from "@/lib/followApi";
import { formatTimeAgo } from "@/lib/profile/profileFormatters";

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

interface UseProfileFollowsArgs {
  activeTab: ProfileTab;
  viewedAddress: string | null;
  isOwnProfile: boolean;
  chainId?: number;
  account: string | null;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
}

export function useProfileFollows({
  activeTab,
  viewedAddress,
  isOwnProfile,
  chainId,
  account,
  fetchCampaigns,
  fetchCampaignSummary,
}: UseProfileFollowsArgs) {
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followingView, setFollowingView] = useState<"campaigns" | "profiles">("campaigns");
  const [followedCampaigns, setFollowedCampaigns] = useState<string[]>([]);
  const [followedCards, setFollowedCards] = useState<any[]>([]);
  const [loadingFollows, setLoadingFollows] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadFollows = async () => {
      if (!viewedAddress) {
        setFollowersCount(0);
        setFollowingCount(0);
        setIsFollowing(false);
        setFollowersList([]);
        setFollowingList([]);
        setFollowedCampaigns([]);
        setLoadingFollows(false);
        return;
      }

      setLoadingFollows(true);
      try {
        const [fc, fgc, isF] = await Promise.all([
          getFollowersCount(viewedAddress, chainId ?? 0),
          getFollowingCount(viewedAddress, chainId ?? 0),
          isOwnProfile || !account
            ? false
            : isFollowingUser(account, viewedAddress, chainId ?? 0),
        ]);

        if (cancelled) return;
        setFollowersCount(fc);
        setFollowingCount(fgc);
        setIsFollowing(isF);

        if (activeTab === "followers") {
          const fl = await getFollowers(viewedAddress, chainId ?? 0);
          if (!cancelled) setFollowersList(fl);
        } else if (activeTab === "following") {
          const [fl, camps] = await Promise.all([
            getFollowing(viewedAddress, chainId ?? 0),
            getFollowedCampaigns(viewedAddress, chainId ?? 0),
          ]);
          if (!cancelled) {
            setFollowingList(fl);
            setFollowedCampaigns(camps);
          }
        }
      } catch (err) {
        console.error("Follow data load failed", err);
      } finally {
        if (!cancelled) setLoadingFollows(false);
      }
    };

    loadFollows();
    return () => {
      cancelled = true;
    };
  }, [viewedAddress, activeTab, isOwnProfile, chainId, account]);

  useEffect(() => {
    let cancelled = false;

    const loadFollowedCampaignCards = async () => {
      try {
        if (activeTab !== "following") {
          setFollowedCards([]);
          return;
        }
        if (!viewedAddress) {
          setFollowedCards([]);
          return;
        }

        const addrs = (followedCampaigns || [])
          .map((a) => String(a || "").toLowerCase())
          .filter(Boolean);
        if (addrs.length === 0) {
          setFollowedCards([]);
          return;
        }

        const all = (await fetchCampaigns()) ?? [];
        const wanted = all.filter((c) =>
          addrs.includes(String((c as any).campaignAddress ?? (c as any).campaign ?? "").toLowerCase())
        );
        const results = await Promise.allSettled(wanted.map((c) => fetchCampaignSummary(c)));

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

        setFollowedCards(next);
      } catch (e) {
        console.error("[Profile] Failed to load followed campaigns", e);
        if (!cancelled) setFollowedCards([]);
      }
    };

    loadFollowedCampaignCards();
    return () => {
      cancelled = true;
    };
  }, [activeTab, viewedAddress, followedCampaigns, fetchCampaigns, fetchCampaignSummary]);

  const handleToggleFollow = useCallback(async () => {
    if (!viewedAddress || isOwnProfile) return;

    try {
      if (!account) throw new Error("Connect wallet");

      if (isFollowing) {
        await unfollowUser(account, viewedAddress, chainId ?? 0);
        setIsFollowing(false);
        setFollowersCount((c) => Math.max(0, c - 1));
      } else {
        await followUser(account, viewedAddress, chainId ?? 0);
        setIsFollowing(true);
        setFollowersCount((c) => c + 1);
      }
    } catch (err) {
      toast.error("Failed to update follow");
    }
  }, [account, chainId, isFollowing, isOwnProfile, viewedAddress]);

  return {
    followersCount,
    followingCount,
    isFollowing,
    followersList,
    followingList,
    followingView,
    setFollowingView,
    followedCampaigns,
    followedCards,
    loadingFollows,
    handleToggleFollow,
  };
}