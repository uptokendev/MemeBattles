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
import {
  fetchFollowedCampaignDrafts,
  type CampaignDraft,
} from "@/lib/draftApi";
import { formatTimeAgo } from "@/lib/profile/profileFormatters";

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

interface UseProfileFollowsArgs {
  activeTab: ProfileTab;
  viewedAddress: string | null;
  isOwnProfile: boolean;
  chainId?: number;
  account: string | null;
  /** Optional ethers signer for signed follow mutations */
  signer?: any;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
}

export function useProfileFollows({
  activeTab,
  viewedAddress,
  isOwnProfile,
  chainId,
  account,
  signer,
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
  const [followedDrafts, setFollowedDrafts] = useState<CampaignDraft[]>([]);
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
      setFollowedDrafts([]);
      setLoadingFollows(false);
      return;
    }

    setLoadingFollows(true);

    try {
      const [fc, profileFollowingCount, isF] = await Promise.all([
        getFollowersCount(viewedAddress, chainId ?? 0),
        getFollowingCount(viewedAddress, chainId ?? 0),
        isOwnProfile || !account
          ? Promise.resolve(false)
          : isFollowingUser(account, viewedAddress, chainId ?? 0),
      ]);

      const followedCampaignAddresses: string[] = await getFollowedCampaigns(
        viewedAddress,
        chainId ?? 0
      ).catch((): string[] => []);

      const draftItems: CampaignDraft[] = await fetchFollowedCampaignDrafts({
        walletAddress: viewedAddress,
        chainId: chainId ?? 0,
      }).catch((): CampaignDraft[] => []);

      if (cancelled) return;

      setFollowersCount(fc);

      setFollowingCount(
        Number(profileFollowingCount || 0) +
          followedCampaignAddresses.length +
          draftItems.length
      );

      setIsFollowing(isF);
      setFollowedCampaigns(followedCampaignAddresses);
      setFollowedDrafts(draftItems);

      if (activeTab === "followers") {
        const fl = await getFollowers(viewedAddress, chainId ?? 0);
        if (!cancelled) setFollowersList(fl);
      } else if (activeTab === "following") {
        const fl = await getFollowing(viewedAddress, chainId ?? 0);
        if (!cancelled) setFollowingList(fl);
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

      const all = addrs.length > 0 ? (await fetchCampaigns()) ?? [] : [];

      const wanted = all.filter((c) =>
        addrs.includes(
          String((c as any).campaignAddress ?? (c as any).campaign ?? "").toLowerCase()
        )
      );

      const results = await Promise.allSettled(
        wanted.map((c) => fetchCampaignSummary(c))
      );

      if (cancelled) return;

      const liveCards = results
        .filter((r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled")
        .map((r, idx) => {
          const s = r.value;

          return {
            kind: "campaign",
            id: typeof s.campaign.id === "number" ? s.campaign.id : idx + 1,
            image: s.campaign.logoURI || "/placeholder.svg",
            name: s.campaign.name,
            ticker: s.campaign.symbol,
            campaignAddress: s.campaign.campaign,
            href: `/token/${String(s.campaign.token || s.campaign.campaign).toLowerCase()}`,
            marketCap: s.stats.marketCap,
            timeAgo: (s.campaign as any).timeAgo || formatTimeAgo(s.campaign.createdAt),
            buyersCount: (s.stats as any)?.buyersCount ?? undefined,
          };
        });

      const draftCards = (followedDrafts || []).map((draft) => ({
        kind: "draft",
        id: `draft-${draft.id}`,
        image: draft.logoUrl || "/placeholder.svg",
        name: draft.name,
        ticker: draft.ticker,
        draftId: draft.id,
        slug: draft.slug,
        campaignAddress: draft.campaignAddress || "",
        href: `/prepare/${draft.slug}`,
        marketCap: "Prepare Mode",
        status: draft.status,
        timeAgo: draft.createdAt
          ? formatTimeAgo(Math.floor(new Date(draft.createdAt).getTime() / 1000))
          : "",
      }));

      setFollowedCards([...draftCards, ...liveCards]);
    } catch (e) {
      console.error("[Profile] Failed to load followed campaigns", e);
      if (!cancelled) setFollowedCards([]);
    }
  };

  loadFollowedCampaignCards();

  return () => {
    cancelled = true;
  };
}, [
  activeTab,
  viewedAddress,
  followedCampaigns,
  followedDrafts,
  fetchCampaigns,
  fetchCampaignSummary,
]);

  const handleToggleFollow = useCallback(async () => {
    if (!viewedAddress || isOwnProfile) return;

    try {
      if (!account) throw new Error("Connect wallet");

      const signOpts = signer ? { signer } : undefined;
      if (isFollowing) {
        await unfollowUser(account, viewedAddress, chainId ?? 0, signOpts);
        setIsFollowing(false);
        setFollowersCount((c) => Math.max(0, c - 1));
      } else {
        await followUser(account, viewedAddress, chainId ?? 0, signOpts);
        setIsFollowing(true);
        setFollowersCount((c) => c + 1);
      }
    } catch (err) {
      toast.error("Failed to update follow");
    }
  }, [account, chainId, isFollowing, isOwnProfile, viewedAddress, signer]);

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
