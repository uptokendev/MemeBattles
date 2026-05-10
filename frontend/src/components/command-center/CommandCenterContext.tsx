import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useWallet } from "@/contexts/WalletContext";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useEditableProfile } from "@/hooks/profile/useEditableProfile";
import { useProfileFollows } from "@/hooks/profile/useProfileFollows";
import { useCreatedCampaigns } from "@/hooks/profile/useCreatedCampaigns";
import { useProfileBalances } from "@/hooks/profile/useProfileBalances";
import { useProfileRank } from "@/hooks/profile/useProfileRank";
import { useLeagueCabinet } from "@/hooks/profile/useLeagueCabinet";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

type CommandCenterData = {
  walletAddress: string;
  chainId?: number;
  profile: ReturnType<typeof useEditableProfile>["profile"];
  loadingProfile: boolean;
  editOpen: boolean;
  setEditOpen: ReturnType<typeof useEditableProfile>["setEditOpen"];
  savingProfile: boolean;
  savingAvatar: boolean;
  awaitingWallet: boolean;
  avatarInputRef: ReturnType<typeof useEditableProfile>["avatarInputRef"];
  handleEdit: ReturnType<typeof useEditableProfile>["handleEdit"];
  handlePickAvatar: ReturnType<typeof useEditableProfile>["handlePickAvatar"];
  handleAvatarSelected: ReturnType<typeof useEditableProfile>["handleAvatarSelected"];
  handleSaveProfile: ReturnType<typeof useEditableProfile>["handleSaveProfile"];
  displayName: string;
  avatarUrl: string;
  followersCount: number;
  followingCount: number;
  loadingFollows: boolean;
  createdCount: number;
  created: ReturnType<typeof useCreatedCampaigns>;
  nativeBalance: string;
  tokenBalances: ReturnType<typeof useProfileBalances>["tokenBalances"];
  loadingBalances: boolean;
  liveRank: ReturnType<typeof useProfileRank>["liveRank"];
  leagueCabinet: ReturnType<typeof useLeagueCabinet>["leagueCabinet"];
  loadingLeagueCabinet: boolean;
};

const CommandCenterContext = createContext<CommandCenterData | null>(null);

export function CommandCenterDataProvider({
  walletAddress,
  children,
}: {
  walletAddress: string;
  children: ReactNode;
}) {
  const wallet = useWallet();
  const anyWallet: any = wallet as any;
  const chainId: number | undefined = anyWallet?.chainId ?? anyWallet?.network?.chainId;
  const account = wallet.account || walletAddress;
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();

  const editableProfile = useEditableProfile({
    chainId,
    account,
    viewedAddress: walletAddress,
    wallet,
  });

  const {
    profile,
    loadingProfile,
    editOpen,
    setEditOpen,
    savingProfile,
    savingAvatar,
    awaitingWallet,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
  } = editableProfile;

  const {
    followersCount,
    followingCount,
    loadingFollows,
  } = useProfileFollows({
    activeTab: "balances",
    viewedAddress: walletAddress,
    isOwnProfile: true,
    chainId,
    account,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const created = useCreatedCampaigns({
    viewedAddress: walletAddress,
    account,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const { nativeBalance, tokenBalances, loadingBalances } = useProfileBalances({
    viewedAddress: walletAddress,
    account,
    wallet,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const { liveRank } = useProfileRank({
    profile,
    isOwnProfile: true,
    chainId,
    viewedAddress: walletAddress,
  });

  const { leagueCabinet, loadingLeagueCabinet } = useLeagueCabinet(chainId, walletAddress);

  const displayName = useMemo(() => {
    const name = String(profile?.displayName ?? "").trim();
    return name ? `@${name}` : shortenWallet(walletAddress) || "Command Center";
  }, [profile?.displayName, walletAddress]);

  const avatarUrl =
    profile?.avatarUrl ||
    "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=200&h=200&fit=crop";

  const value = useMemo<CommandCenterData>(() => ({
    walletAddress,
    chainId,
    profile,
    loadingProfile,
    editOpen,
    setEditOpen,
    savingProfile,
    savingAvatar,
    awaitingWallet,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
    displayName,
    avatarUrl,
    followersCount,
    followingCount,
    loadingFollows,
    createdCount: created.length,
    created,
    nativeBalance,
    tokenBalances,
    loadingBalances,
    liveRank,
    leagueCabinet,
    loadingLeagueCabinet,
  }), [
    walletAddress,
    chainId,
    profile,
    loadingProfile,
    editOpen,
    setEditOpen,
    savingProfile,
    savingAvatar,
    awaitingWallet,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
    displayName,
    avatarUrl,
    followersCount,
    followingCount,
    loadingFollows,
    created,
    nativeBalance,
    tokenBalances,
    loadingBalances,
    liveRank,
    leagueCabinet,
    loadingLeagueCabinet,
  ]);

  return <CommandCenterContext.Provider value={value}>{children}</CommandCenterContext.Provider>;
}

export function useCommandCenterData() {
  const ctx = useContext(CommandCenterContext);
  if (!ctx) {
    throw new Error("useCommandCenterData must be used inside CommandCenterDataProvider");
  }
  return ctx;
}
