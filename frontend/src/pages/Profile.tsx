import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { ProfileTab } from "@/types/profile";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { getActiveChainId, isSolanaChainId, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { isSolanaAddress, normalizeAddress } from "@/lib/address";
import { tokenDetailsPath } from "@/lib/tokenDetailsPath";
import { useLaunchpad } from "@/lib/launchpadClient";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { formatWeiToBnb } from "@/lib/rewardsApi";
import { RankBadgeCard } from "@/components/rank/RankBadgeCard";
import RankUpModal from "@/components/rank/RankUpModal";
import { LeagueCabinetCard } from "@/components/profile/LeagueCabinetCard";
import { ProfileAirdropsPanel } from "@/components/profile/ProfileAirdropsPanel";
import { ProfileSquadPanel } from "@/components/profile/ProfileSquadPanel";
import { ProfileRecruiterPanel } from "@/components/profile/ProfileRecruiterPanel";
import {
  getExplorerBase,
  shorten,
  formatTimeAgo,
  formatNumber,
} from "@/lib/profile/profileFormatters";
import {
  fetchOwnerCampaignDrafts,
  fetchPublicCampaignDrafts,
  type CampaignDraft,
} from "@/lib/draftApi";
import { useProfileTabs } from "@/hooks/profile/useProfileTabs";
import { useProfileNotifications } from "@/hooks/profile/useProfileNotifications";
import { useLeagueCabinet } from "@/hooks/profile/useLeagueCabinet";
import { useProfileRank } from "@/hooks/profile/useProfileRank";
import { useProfileFollows } from "@/hooks/profile/useProfileFollows";
import { useCreatedCampaigns } from "@/hooks/profile/useCreatedCampaigns";
import { useProfileActivity } from "@/hooks/profile/useProfileActivity";
import { useProfileBalances } from "@/hooks/profile/useProfileBalances";
import { useEditableProfile } from "@/hooks/profile/useEditableProfile";
import { useProfileRewards } from "@/hooks/profile/useProfileRewards";

const Profile = () => {
  const navigate = useNavigate();
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();

  const anyWallet: any = wallet as any;

  const solanaAccount = solanaWallet.solanaAccount || null;
  const evmAccount = wallet.account ?? null;
  // Prefer Solana when only Solana is connected; prefer EVM when both (BNB profile path).
  const isSolanaProfile = Boolean(solanaAccount && !evmAccount);
  const isConnected: boolean = Boolean(evmAccount || solanaAccount);

  const account: string | null = isConnected
    ? isSolanaProfile
      ? solanaAccount
      : evmAccount || solanaAccount
    : null;

  const {
    addressParam,
    activeTab,
    setActiveTab,
    activityTab,
    setActivityTab,
    handleTabChange,
  } = useProfileTabs();

  // Route param may arrive lowercased; restore connected Solana casing when possible.
  const viewedAddress: string | null = useMemo(() => {
    const param = addressParam ? String(addressParam).trim() : "";
    if (!param) return account;
    if (
      solanaAccount &&
      isSolanaAddress(param) &&
      param.toLowerCase() === solanaAccount.toLowerCase()
    ) {
      return solanaAccount;
    }
    if (isSolanaAddress(param)) return param;
    return normalizeAddress(param);
  }, [addressParam, account, solanaAccount]);

  const isOwnProfile = Boolean(
    account &&
      viewedAddress &&
      (account === viewedAddress || account.toLowerCase() === viewedAddress.toLowerCase()),
  );

  // Solana wallets must hit chainId=101 — never lowercased base58 with chain 97.
  const walletChainId: number | undefined = anyWallet?.chainId ?? anyWallet?.network?.chainId;
  const chainId: number | undefined = useMemo(() => {
    if (isSolanaProfile || isSolanaAddress(viewedAddress)) return SOLANA_CHAIN_ID;
    if (walletChainId) return getActiveChainId(walletChainId);
    return undefined;
  }, [isSolanaProfile, viewedAddress, walletChainId]);
const [profileDrafts, setProfileDrafts] = useState<CampaignDraft[]>([]);
const [loadingDrafts, setLoadingDrafts] = useState(false);
const [draftsError, setDraftsError] = useState<string | null>(null);
  const {
    profile,
    editOpen,
    setEditOpen,
    savingProfile,
    awaitingWallet,
    savingAvatar,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
  } = useEditableProfile({
    chainId,
    account,
    viewedAddress,
    wallet,
  });

  const { leagueCabinet, loadingLeagueCabinet } = useLeagueCabinet(
    chainId,
    viewedAddress
  );

  const {
    profileNotifications,
    unreadProfileNotifications,
    handleOpenNotification,
    handleMarkAllNotificationsRead,
  } = useProfileNotifications();

  const { liveRank, rankPromotionModal, handleCloseRankPromotionModal } = useProfileRank({
    profile,
    isOwnProfile,
    chainId,
    viewedAddress,
  });

  const {
    followersCount,
    followingCount,
    isFollowing,
    followersList,
    followingList,
    followingView,
    setFollowingView,
    followedCards,
    loadingFollows,
    handleToggleFollow,
  } = useProfileFollows({
    activeTab,
    viewedAddress,
    isOwnProfile,
    chainId,
    account,
    signer: wallet?.signer,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const created = useCreatedCampaigns({
    viewedAddress,
    account,
    chainId,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const { activityTrades, activityLoading, activityError } = useProfileActivity({
    activeTab,
    activityTab,
    viewedAddress,
    chainId,
  });

  const { nativeBalance, tokenBalances, loadingBalances } = useProfileBalances({
    viewedAddress,
    account,
    wallet,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const {
    rewards,
    loadingRewards,
    rewardsError,
    claimingKey,
    handleClaimPrize,
  } = useProfileRewards({
    activeTab,
    chainId,
    account,
    isOwnProfile,
    wallet,
  });

  const walletAddressShort = useMemo(() => shorten(viewedAddress), [viewedAddress]);

  const displayName = useMemo(() => {
    const u = (profile?.displayName ?? "").trim();
    return u ? `@${u}` : walletAddressShort || "Profile";
  }, [profile?.displayName, walletAddressShort]);

  const walletAddressFull = viewedAddress ?? "Not connected";

  const explorerUrl = useMemo(() => {
    if (!viewedAddress) return "#";
    const base = getExplorerBase(chainId);
    if (chainId === SOLANA_CHAIN_ID || isSolanaAddress(viewedAddress)) {
      return `${base}/address/${viewedAddress}?cluster=devnet`;
    }
    return `${base}/address/${viewedAddress}`;
  }, [viewedAddress, chainId]);

  useEffect(() => {
  let cancelled = false;

  const loadProfileDrafts = async () => {
    if (activeTab !== "drafts") return;

    if (!viewedAddress) {
      setProfileDrafts([]);
      return;
    }

    setLoadingDrafts(true);
    setDraftsError(null);

    try {
      // Preserve Solana base58 case for owner queries; case-fold only for loose equality.
      const ownerKey = normalizeAddress(viewedAddress);
      const draftChainId = isSolanaAddress(viewedAddress) ? SOLANA_CHAIN_ID : chainId;

      const drafts = isOwnProfile
        ? await fetchOwnerCampaignDrafts(ownerKey, {
            chainId: draftChainId,
            limit: 50,
          })
        : (await fetchPublicCampaignDrafts({
            chainId: draftChainId,
            limit: 100,
          })).filter((draft) => {
            const creator = String(draft.creatorWallet || "").trim();
            return (
              creator === ownerKey ||
              creator.toLowerCase() === ownerKey.toLowerCase()
            );
          });

      if (cancelled) return;

      setProfileDrafts(drafts);
    } catch (err: any) {
      if (cancelled) return;

      console.error("[Profile] Failed to load profile drafts", err);
      setDraftsError(err?.message || "Failed to load drafts.");
      setProfileDrafts([]);
    } finally {
      if (!cancelled) setLoadingDrafts(false);
    }
  };

  loadProfileDrafts();

  return () => {
    cancelled = true;
  };
}, [activeTab, viewedAddress, isOwnProfile, chainId]);

  const handleCopyAddress = () => {
    if (!viewedAddress) return;
    navigator.clipboard.writeText(viewedAddress);
    toast.success("Address copied!");
  };

  const handleConnect = async () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("memewarzone:openWalletModal"));
        return;
      }
    } catch {}

    if (typeof anyWallet?.connect === "function") return anyWallet.connect();
    if (typeof anyWallet?.openConnectModal === "function") {
      return anyWallet.openConnectModal();
    }

    toast.message("Use the Connect Wallet button in the header to connect.");
  };

  return (
    <div className="w-full h-full overflow-y-auto pt-10 md:pt-8 lg:pt-8 pl-0 lg:pl-0">
      {/* Disconnect Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="bg-card/40 border border-border rounded-2xl p-8 text-center max-w-md w-[92%]">
            <div className="font-retro text-foreground text-xl mb-2">
              Connect your wallet
            </div>
            <div className="font-retro text-muted-foreground text-sm mb-6">
              The Profile page is only available when you’re connected.
            </div>
            <Button
              onClick={handleConnect}
              className="bg-accent hover:bg-accent/80 text-accent-foreground font-retro w-full"
            >
              Connect Wallet
            </Button>
          </div>
        </div>
      )}

      <div
        className={`px-3 md:px-5 pb-5 md:pb-6 pt-6 md:pt-6 ${
          !isConnected ? "blur-md pointer-events-none select-none" : ""
        }`}
      >
        {/* Profile Header */}
        <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border mb-4">
          <div className="flex flex-col md:flex-row items-start justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row gap-4 md:gap-6 w-full md:w-auto">
              {/* Avatar */}
              <div className="flex flex-col items-center sm:items-start gap-2">
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-full bg-accent/20 border-4 border-accent/30 overflow-hidden mx-auto sm:mx-0">
                  <img
                    src={
                      profile?.avatarUrl ||
                      "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=200&h=200&fit=crop"
                    }
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarSelected(file);
                    e.currentTarget.value = "";
                  }}
                />

                <Button
                  onClick={handlePickAvatar}
                  disabled={!isConnected || savingAvatar || savingProfile}
                  className="bg-accent hover:bg-accent/80 text-accent-foreground font-retro w-full sm:w-auto"
                >
                  {savingAvatar
                    ? awaitingWallet
                      ? "confirm in wallet..."
                      : "uploading..."
                    : "change avatar"}
                </Button>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-2xl md:text-3xl font-retro text-foreground mb-3">
                  {displayName}
                </h1>

                <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 sm:gap-3 mb-4">
                  <span className="text-xs md:text-sm font-retro text-muted-foreground">
                    {walletAddressFull}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyAddress}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      disabled={!viewedAddress}
                      title="Copy address"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>

                    <a
                      href={explorerUrl}
                      target={viewedAddress ? "_blank" : undefined}
                      rel="noreferrer"
                      className={`flex items-center gap-1 text-xs md:text-sm font-retro transition-colors ${
                        viewedAddress
                          ? "text-accent hover:text-accent/80"
                          : "text-muted-foreground pointer-events-none"
                      }`}
                    >
                      View on explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {profile?.bio && (
                  <div className="mb-4 max-w-xl">
                    <div className="font-retro text-xs md:text-sm text-muted-foreground whitespace-pre-wrap">
                      {profile.bio}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="flex justify-center sm:justify-start gap-6 md:gap-8">
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {followersCount}
                    </div>
                    <div className="text-xs font-retro text-muted-foreground">
                      Followers
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {followingCount}
                    </div>
                    <div className="text-xs font-retro text-muted-foreground">
                      Following
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {created.length}
                    </div>
                    <div className="text-xs font-retro text-muted-foreground">
                      Created coins
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:w-[280px] md:items-end">
              <RankBadgeCard
                rank={liveRank}
                subtitle={isOwnProfile ? "Your current rank" : "Current rank"}
                className="w-full"
              />

              {isOwnProfile ? (
                <div className="w-full">
                  <Button
                    onClick={handleEdit}
                    className="w-full bg-muted font-retro text-foreground hover:bg-muted/80"
                  >
                    edit
                  </Button>

                  <EditProfileDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    initialUsername={profile?.displayName ?? ""}
                    initialBio={profile?.bio ?? ""}
                    saving={savingProfile}
                    onSave={handleSaveProfile}
                  />
                </div>
              ) : null}

              {!isOwnProfile && viewedAddress && (
                <Button
                  onClick={handleToggleFollow}
                  variant={isFollowing ? "outline" : "default"}
                  className="w-full font-retro"
                >
                  {isFollowing ? "Unfollow" : "Follow"}
                </Button>
              )}
            </div>
          </div>

          <LeagueCabinetCard
            cabinet={leagueCabinet}
            loading={loadingLeagueCabinet}
            displayName={displayName}
          />

          {(!addressParam || isOwnProfile) && (
            <div className="rounded-2xl border border-border bg-card/30 p-4 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <p className="text-xs md:text-sm font-retro text-muted-foreground">
                    Incentive Hub
                  </p>
                  <p className="font-retro text-sm md:text-base text-foreground">
                    Your wallet-specific Airdrops, Squad, and Recruiter tools live inside
                    Profile now.
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    The top bar still keeps public shortcuts, but the personal reward
                    surfaces are here.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="font-retro"
                    onClick={() => handleTabChange("airdrops")}
                  >
                    My Airdrops
                  </Button>
                  <Button
                    variant="outline"
                    className="font-retro"
                    onClick={() => handleTabChange("squad")}
                  >
                    My Squad
                  </Button>
                  <Button
                    variant="outline"
                    className="font-retro"
                    onClick={() => handleTabChange("recruiter")}
                  >
                    Recruiter
                  </Button>
                  <Button
                    className="font-retro"
                    onClick={() => navigate("/recruiter/signup")}
                  >
                    Become a Recruiter
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-3 md:gap-6 border-t border-border pt-4 md:pt-6 overflow-x-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
            {[
              { id: "balances" as ProfileTab, label: "Balances", badge: null },
              { id: "coins" as ProfileTab, label: "Coins", badge: null },
              {
                id: "drafts" as ProfileTab,
                label: "Drafts",
                badge: profileDrafts.length ? profileDrafts.length : null,
              },
              { id: "replies" as ProfileTab, label: "Activity", badge: null },
              {
                id: "rewards" as ProfileTab,
                label: "Rewards",
                badge: rewards.length ? rewards.length : null,
              },
              { id: "airdrops" as ProfileTab, label: "Airdrops", badge: null },
              { id: "squad" as ProfileTab, label: "Squad", badge: null },
              { id: "recruiter" as ProfileTab, label: "Recruiter", badge: null },
              { id: "followers" as ProfileTab, label: "Followers", badge: null },
              { id: "following" as ProfileTab, label: "Following", badge: null },
              {
                id: "notifications" as ProfileTab,
                label: "Notifications",
                badge: unreadProfileNotifications || null,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative font-retro text-xs md:text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "text-accent border-b-2 border-accent pb-2"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="absolute -top-2 -right-6 bg-destructive text-destructive-foreground text-[10px] font-retro px-1.5 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* BALANCES TAB */}
        {activeTab === "balances" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
              <h3 className="text-xs md:text-sm font-retro text-muted-foreground mb-4 md:mb-6">
                Balances
              </h3>

              <div className="flex items-center justify-between p-3 md:p-4 bg-background/50 rounded-xl border border-border mb-3">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent/20 flex items-center justify-center border border-border">
                    <span className="text-foreground text-xs font-bold">BNB</span>
                  </div>
                  <div>
                    <div className="font-retro text-foreground mb-1 text-sm md:text-base">
                      Native balance
                    </div>
                    <div className="text-xs md:text-sm font-retro text-muted-foreground">
                      {nativeBalance || (loadingBalances ? "Loading..." : "—")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
                {loadingBalances && tokenBalances.length === 0 && (
                  <div className="font-retro text-muted-foreground text-sm">
                    Loading token balances…
                  </div>
                )}

                {!loadingBalances && tokenBalances.length === 0 && (
                  <div className="font-retro text-muted-foreground text-sm">
                    No launchpad token balances found for this wallet.
                  </div>
                )}

                {tokenBalances.map((t) => (
                  <div
                    key={`${t.tokenAddress}-${t.campaignAddress}`}
                    className="flex items-center justify-between p-3 md:p-4 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
                    onClick={() =>
                      navigate(
                        tokenDetailsPath(
                          {
                            tokenAddress: t.tokenAddress,
                            campaignAddress: t.campaignAddress,
                            chainId,
                          },
                          { chainId },
                        ),
                      )
                    }
                    title="Open token page"
                  >
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      <img
                        src={t.image}
                        alt={t.name}
                        className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-retro text-foreground mb-1 text-sm md:text-base truncate">
                          {t.name}
                        </div>
                        <div className="text-xs md:text-sm font-retro text-muted-foreground">
                          {t.ticker}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-4">
                      <div className="font-retro text-foreground text-sm md:text-base">
                        {Number(t.balanceFormatted).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}
                      </div>
                      <div className="font-retro text-muted-foreground text-xs">
                        Balance
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-xs md:text-sm font-retro text-foreground">
                  created coins{" "}
                  <span className="text-muted-foreground">({created.length})</span>
                </h3>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
                {created.map((coin) => (
                  <div
                    key={coin.id}
                    className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
                    onClick={() =>
                      navigate(
                        tokenDetailsPath(
                          {
                            tokenAddress: coin.tokenAddress,
                            campaignAddress: coin.campaignAddress,
                            chainId: coin.chainId ?? chainId,
                          },
                          { chainId: coin.chainId ?? chainId },
                        ),
                      )
                    }
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <img
                        src={coin.image}
                        alt={coin.name}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-border object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-retro text-foreground text-xs md:text-sm truncate">
                          {coin.name}
                        </div>
                        <div className="font-retro text-muted-foreground text-xs">
                          {coin.ticker}
                          {coin.chainId === SOLANA_CHAIN_ID || isSolanaChainId(chainId) ? " · SOL" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="font-retro text-foreground text-xs md:text-sm">
                        {coin.marketCap}
                      </div>
                      <div className="font-retro text-muted-foreground text-xs">
                        {coin.timeAgo}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* REWARDS TAB */}
        {activeTab === "rewards" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs md:text-sm font-retro text-foreground">
                rewards
              </h3>
              {isOwnProfile ? (
                <Button
                  onClick={() => {
                    setActiveTab("balances");
                    setTimeout(() => setActiveTab("rewards"), 0);
                  }}
                  variant="outline"
                  className="font-retro"
                >
                  refresh
                </Button>
              ) : null}
            </div>

            {!isOwnProfile && (
              <div className="font-retro text-muted-foreground text-sm">
                Rewards are only visible on your own profile.
              </div>
            )}

            {isOwnProfile && !account && (
              <div className="font-retro text-muted-foreground text-sm">
                Connect your wallet to view and claim rewards.
              </div>
            )}

            {isOwnProfile && account && (
              <>
                {loadingRewards && (
                  <div className="font-retro text-muted-foreground text-sm">
                    Loading rewards…
                  </div>
                )}

                {rewardsError && !loadingRewards && (
                  <div className="font-retro text-destructive text-sm">
                    {rewardsError}
                  </div>
                )}

                {!loadingRewards && !rewardsError && rewards.length === 0 && (
                  <div className="font-retro text-muted-foreground text-sm">
                    No claimable rewards right now.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rewards.map((r) => {
                    const key = `${r.period}:${r.epochStart}:${r.category}:${r.rank}`;
                    const amountBnb = formatWeiToBnb(r.amountRaw);
                    const payload: any = r.payload || {};
                    const name = String(payload.name ?? payload.campaignName ?? "").trim();
                    const symbol = String(
                      payload.symbol ?? payload.campaignSymbol ?? ""
                    ).trim();
                    const logo = String(
                      payload.logo_uri ?? payload.logoUri ?? payload.logoURI ?? ""
                    ).trim();

                    const titleParts = [
                      r.period === "weekly" ? "Weekly" : "Monthly",
                      r.category.replace(/_/g, " "),
                      `#${r.rank}`,
                    ];

                    return (
                      <div
                        key={key}
                        className="p-4 bg-background/50 rounded-xl border border-border"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {logo ? (
                              <img
                                src={logo}
                                alt={name || symbol || "token"}
                                className="w-10 h-10 rounded-full border-2 border-border object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-accent/20 border border-border" />
                            )}
                            <div className="min-w-0">
                              <div className="font-retro text-foreground text-sm truncate">
                                {titleParts.join(" · ")}
                              </div>
                              <div className="font-retro text-muted-foreground text-xs truncate">
                                {name || symbol || "—"}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-retro text-foreground text-sm">
                              {Number(amountBnb).toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}{" "}
                              BNB
                            </div>
                            <div className="font-retro text-muted-foreground text-xs">
                              Prize
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="font-retro text-muted-foreground text-[10px] truncate">
                            {new Date(r.epochStart).toUTCString()} →{" "}
                            {new Date(r.epochEnd).toUTCString()}
                          </div>

                          <Button
                            onClick={() => handleClaimPrize(r)}
                            disabled={!isOwnProfile || claimingKey === key}
                            className="bg-accent hover:bg-accent/80 text-accent-foreground font-retro"
                          >
                            {claimingKey === key ? "claiming…" : "claim"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "airdrops" && (
          <ProfileAirdropsPanel
            account={account}
            isConnected={isConnected}
            isOwnProfile={isOwnProfile}
          />
        )}

        {activeTab === "squad" && (
          <ProfileSquadPanel
            account={account}
            isConnected={isConnected}
            isOwnProfile={isOwnProfile}
          />
        )}

        {activeTab === "recruiter" && (
          <ProfileRecruiterPanel
            account={account}
            isConnected={isConnected}
            isOwnProfile={isOwnProfile}
          />
        )}

        {/* COINS TAB */}
        {activeTab === "coins" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs md:text-sm font-retro text-foreground">
                tokens you invested in{" "}
                <span className="text-muted-foreground">
                  ({tokenBalances.length})
                </span>
              </h3>
            </div>

            {loadingBalances && (
              <div className="font-retro text-muted-foreground text-sm">
                Loading…
              </div>
            )}

            {!loadingBalances && tokenBalances.length === 0 && (
              <div className="font-retro text-muted-foreground text-sm">
                No invested tokens detected yet. Once you buy on a curve, it will show
                here.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tokenBalances.map((t) => (
                <div
                  key={`${t.tokenAddress}-${t.campaignAddress}-coins`}
                  className="p-4 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
                  onClick={() =>
                    navigate(
                      tokenDetailsPath(
                        {
                          tokenAddress: t.tokenAddress,
                          campaignAddress: t.campaignAddress,
                          chainId,
                        },
                        { chainId },
                      ),
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={t.image}
                      alt={t.name}
                      className="w-10 h-10 rounded-full border-2 border-border object-cover"
                    />
                    <div className="min-w-0">
                      <div className="font-retro text-foreground text-sm truncate">
                        {t.name}
                      </div>
                      <div className="font-retro text-muted-foreground text-xs">
                        {t.ticker}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-retro text-muted-foreground text-xs">
                      Your balance
                    </div>
                    <div className="font-retro text-foreground text-sm">
                      {Number(t.balanceFormatted).toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
{/* DRAFTS TAB */}
{activeTab === "drafts" && (
  <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xs md:text-sm font-retro text-foreground">
        {isOwnProfile ? "your drafts" : "public drafts"}{" "}
        <span className="text-muted-foreground">
          ({profileDrafts.length})
        </span>
      </h3>

      {isOwnProfile && (
        <Button
          className="font-retro"
          onClick={() => navigate("/create?mode=draft")}
        >
          New Draft
        </Button>
      )}
    </div>

    {loadingDrafts && (
      <div className="font-retro text-muted-foreground text-sm">
        Loading drafts…
      </div>
    )}

    {!loadingDrafts && draftsError && (
      <div className="font-retro text-destructive text-sm">
        {draftsError}
      </div>
    )}

    {!loadingDrafts && !draftsError && profileDrafts.length === 0 && (
      <div className="font-retro text-muted-foreground text-sm">
        {isOwnProfile
          ? "No drafts yet. Create a Prepare Mode draft to see it here."
          : "No public promotion drafts yet."}
      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {profileDrafts.map((draft) => {
        const href = draft.slug
          ? `/prepare/${draft.slug}`
          : `/drafts/${draft.id}`;

        return (
          <div
            key={draft.id}
            className="p-4 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
            onClick={() => navigate(href)}
            role="button"
          >
            <div className="flex items-center gap-3">
              <img
                src={draft.logoUrl || "/placeholder.svg"}
                alt=""
                className="w-10 h-10 rounded-xl border border-border object-cover"
                loading="lazy"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-retro text-foreground text-sm truncate">
                    {draft.name}
                  </div>

                  <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-retro text-accent">
                    Draft
                  </span>
                </div>

                <div className="font-retro text-muted-foreground text-xs truncate">
                  ${draft.ticker}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="font-retro text-muted-foreground text-xs truncate">
                {draft.visibility} · {draft.status.replace(/_/g, " ")}
              </div>

              <Button
                variant="outline"
                className="font-retro"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(href);
                }}
              >
                {isOwnProfile ? "Open" : "View"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
        {/* REPLIES TAB */}
        {activeTab === "replies" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {[
                { id: "trades", label: "Trades" },
                { id: "comments", label: "Comments" },
                { id: "created", label: "Created" },
                { id: "interactions", label: "Interactions" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActivityTab(tab.id as typeof activityTab)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-retro transition-colors ${
                    activityTab === tab.id
                      ? "bg-accent/20 text-accent border-accent/40"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4 md:p-6">
              <div className="text-[11px] font-retro text-muted-foreground mb-4">
                Powered by indexed events.
              </div>

              {activityTab === "trades" ? (
                <div className="space-y-3">
                  {activityLoading && (
                    <div className="font-retro text-muted-foreground text-sm">
                      Loading trades...
                    </div>
                  )}

                  {!activityLoading && activityError && (
                    <div className="font-retro text-destructive text-sm">
                      {activityError}
                    </div>
                  )}

                  {!activityLoading && !activityError && activityTrades.length === 0 && (
                    <div className="font-retro text-muted-foreground text-sm">
                      No trades yet.
                    </div>
                  )}

                  {!activityLoading && !activityError && activityTrades.length > 0 && (
                    <div className="space-y-2">
                      {activityTrades.map((trade) => {
                        const label =
                          trade.campaignName ||
                          (trade.campaignSymbol ? `$${trade.campaignSymbol}` : "Unknown");
                        const symbol = trade.campaignSymbol
                          ? `$${trade.campaignSymbol}`
                          : "";
                        const timestamp = trade.blockTime
                          ? Math.floor(new Date(trade.blockTime).getTime() / 1000)
                          : undefined;
                        const timeAgo = timestamp ? formatTimeAgo(timestamp) : "";
                        const explorer = getExplorerBase(chainId);
                        const txUrl = trade.txHash
                          ? `${explorer}/tx/${trade.txHash}`
                          : "";

                        return (
                          <div
                            key={trade.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={trade.logoUri || "/placeholder.svg"}
                                alt={label}
                                className="h-9 w-9 rounded-full border border-border/60 object-cover"
                              />
                              <div className="min-w-0">
                                <div className="font-retro text-foreground text-sm truncate">
                                  {label}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {symbol} {timeAgo ? `- ${timeAgo} ago` : ""}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className={`font-retro text-xs ${
                                  trade.side === "buy"
                                    ? "text-emerald-400"
                                    : "text-red-400"
                                }`}
                              >
                                {trade.side === "buy" ? "Buy" : "Sell"}
                              </div>
                              <div className="font-retro text-xs text-muted-foreground">
                                {formatNumber(trade.bnbAmount, 6)} BNB
                              </div>
                              {txUrl ? (
                                <a
                                  href={txUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-muted-foreground hover:text-foreground"
                                >
                                  View tx
                                </a>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-retro text-muted-foreground text-sm md:text-base">
                    Activity will be powered by{" "}
                    <span className="text-foreground">indexed events</span>.
                  </p>
                  <p className="mt-2 font-retro text-muted-foreground text-xs md:text-sm">
                    Showing: <span className="text-foreground">{activityTab}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === "notifications" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-accent" />
                <div>
                  <h3 className="font-retro text-foreground text-sm">
                    Notifications
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Draft follows, comments, heat changes, publish events, and launch
                    updates.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleMarkAllNotificationsRead}
                className="font-retro"
              >
                Mark all read
              </Button>
            </div>

            {profileNotifications.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              <div className="space-y-3">
                {profileNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleOpenNotification(notification)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/40 p-4 text-left hover:border-accent/50"
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.read ? "bg-muted" : "bg-accent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-retro text-sm text-foreground">
                        {notification.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {notification.body}
                      </span>
                    </span>
                    <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:block">
                      {notification.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FOLLOWERS TAB */}
        {activeTab === "followers" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-6 border border-border">
            <h3 className="text-xl font-retro mb-4">
              Followers ({followersCount})
            </h3>

            {loadingFollows ? (
              <p>Loading...</p>
            ) : followersList.length === 0 ? (
              <p className="text-muted-foreground">No followers yet.</p>
            ) : (
              <div className="space-y-3">
                {followersList.map((f: any) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 bg-background/50 rounded-xl"
                  >
                    <img
                      src={f.profile?.avatarUrl || "/placeholder.svg"}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="font-semibold">
                        {f.profile?.displayName || shorten(f.id)}
                      </div>
                    </div>
                    <Button
                      variant="link"
                      onClick={() => navigate(`/profile?address=${f.id}`)}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FOLLOWING TAB */}
        {activeTab === "following" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-6 border border-border">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
              <h3 className="text-xl font-retro">Following</h3>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={followingView === "campaigns" ? "default" : "outline"}
                  onClick={() => setFollowingView("campaigns")}
                  className="rounded-xl"
                >
                  Campaigns
                </Button>
                <Button
                  type="button"
                  variant={followingView === "profiles" ? "default" : "outline"}
                  onClick={() => setFollowingView("profiles")}
                  className="rounded-xl"
                >
                  Profiles
                </Button>
              </div>
            </div>

            {loadingFollows ? (
              <p>Loading...</p>
            ) : followingView === "campaigns" ? (
              followedCards.length === 0 ? (
                <p className="text-muted-foreground">No followed campaigns yet.</p>
              ) : (
                <div className="space-y-3">
                                    {followedCards.map((campaign: any) => {
                    const href =
                      campaign.href ||
                      (campaign.tokenAddress || campaign.campaignAddress
                        ? tokenDetailsPath(
                            {
                              tokenAddress: campaign.tokenAddress,
                              campaignAddress: campaign.campaignAddress,
                              chainId: campaign.chainId ?? chainId,
                            },
                            { chainId: campaign.chainId ?? chainId },
                          )
                        : "");

                    const isDraft = campaign.kind === "draft";

                    return (
                      <div
                        key={
                          campaign.id ||
                          campaign.draftId ||
                          campaign.slug ||
                          campaign.campaignAddress
                        }
                        className="flex items-center gap-3 p-3 bg-background/50 rounded-xl border border-border cursor-pointer hover:border-accent/50 transition-colors"
                        onClick={() => {
                          if (href) navigate(href);
                        }}
                        role="button"
                      >
                        <img
                          src={campaign.image || "/placeholder.svg"}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover border border-border"
                          loading="lazy"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-semibold truncate">
                              {campaign.name}{" "}
                              <span className="text-muted-foreground">·</span>{" "}
                              <span className="text-muted-foreground">
                                ${campaign.ticker}
                              </span>
                            </div>

                            {isDraft && (
                              <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent">
                                Promotion draft
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground truncate">
                            {isDraft
                              ? campaign.status || "Prepare Mode"
                              : String(campaign.campaignAddress || "")}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (href) navigate(href);
                          }}
                        >
                          View
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : followingList.length === 0 ? (
              <p className="text-muted-foreground">No followed profiles yet.</p>
            ) : (
              <div className="space-y-3">
                {followingList.map((f: any) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 bg-background/50 rounded-xl border border-border cursor-pointer hover:border-accent/50 transition-colors"
                    onClick={() =>
                      navigate(`/profile?address=${encodeURIComponent(f.id)}`)
                    }
                    role="button"
                  >
                    <img
                      src={f.profile?.avatarUrl || "/placeholder.svg"}
                      alt=""
                      className="w-10 h-10 rounded-full border border-border object-cover"
                      loading="lazy"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {f.profile?.displayName || shorten(f.id)}
                      </div>

                      <div className="text-xs text-muted-foreground truncate">
                        {shorten(f.id)}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile?address=${encodeURIComponent(f.id)}`);
                      }}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <RankUpModal
        isOpen={rankPromotionModal.isOpen}
        rank={rankPromotionModal.rank}
        onClose={handleCloseRankPromotionModal}
      />
    </div>
  );
};

export default Profile;
