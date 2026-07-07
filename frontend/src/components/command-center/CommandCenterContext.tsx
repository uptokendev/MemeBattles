import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { getActiveChainId, isSupportedChainId } from "@/lib/chainConfig";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useEditableProfile } from "@/hooks/profile/useEditableProfile";
import { useProfileFollows } from "@/hooks/profile/useProfileFollows";
import { useCreatedCampaigns } from "@/hooks/profile/useCreatedCampaigns";
import { useProfileBalances } from "@/hooks/profile/useProfileBalances";
import { useProfileRank } from "@/hooks/profile/useProfileRank";
import { useLeagueCabinet } from "@/hooks/profile/useLeagueCabinet";
import { fetchWalletAttributionState, type WalletAttributionPublicState } from "@/lib/recruiterApi";
import { fetchOwnerCampaignDrafts } from "@/lib/draftApi";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

type CommandCenterData = {
  walletAddress: string;
  chainId?: number;
  walletChainId?: number;
  isUnsupportedChain: boolean;
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
  attribution: WalletAttributionPublicState | null;
  loadingAttribution: boolean;
  followersCount: number;
  followingCount: number;
  loadingFollows: boolean;
  createdCount: number;
  created: ReturnType<typeof useCreatedCampaigns>;
  draftCount: number;
  loadingDraftCount: boolean;
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
  const evmWallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const anyWallet: any = evmWallet as any;
  const isSol = isSolanaConnected;
  const walletChainId: number | undefined = isSol ? 101 : (anyWallet?.chainId ?? anyWallet?.network?.chainId);
  const chainId: number | undefined = isSol ? 101 : walletChainId ? getActiveChainId(walletChainId) : undefined;
  const isUnsupportedChain = !!(walletChainId && !isSupportedChainId(walletChainId));
  const activeWalletAddress = isSol ? (solanaAccount || walletAddress) : (evmWallet.account || walletAddress);
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const [attribution, setAttribution] = useState<WalletAttributionPublicState | null>(null);
  const [loadingAttribution, setLoadingAttribution] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [loadingDraftCount, setLoadingDraftCount] = useState(false);

  const editableProfile = useEditableProfile({
    chainId,
    account: activeWalletAddress,
    viewedAddress: activeWalletAddress,
    wallet: evmWallet,
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

  useEffect(() => {
    if (isSol || !activeWalletAddress) {
      setAttribution(null);
      setLoadingAttribution(false);
      return;
    }
    let cancelled = false;
    setLoadingAttribution(true);
    void fetchWalletAttributionState(activeWalletAddress)
      .then((state) => {
        if (!cancelled) setAttribution(state ?? null);
      })
      .catch(() => {
        if (!cancelled) setAttribution(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingAttribution(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWalletAddress, isSol]);

  const { followersCount, followingCount, loadingFollows } = useProfileFollows({
    activeTab: "balances",
    viewedAddress: activeWalletAddress,
    isOwnProfile: true,
    chainId,
    account: activeWalletAddress,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const created = useCreatedCampaigns({
    viewedAddress: activeWalletAddress,
    account: activeWalletAddress,
    chainId,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  useEffect(() => {
    if (isUnsupportedChain || !activeWalletAddress) {
      setDraftCount(0);
      setLoadingDraftCount(false);
      return;
    }
    let cancelled = false;
    setLoadingDraftCount(true);

    void fetchOwnerCampaignDrafts(activeWalletAddress, { chainId, limit: 100 })
      .then((items) => {
        if (!cancelled) setDraftCount(Array.isArray(items) ? items.length : 0);
      })
      .catch(() => {
        if (!cancelled) setDraftCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoadingDraftCount(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWalletAddress, chainId, isUnsupportedChain]);

  const { nativeBalance, tokenBalances, loadingBalances } = useProfileBalances({
    viewedAddress: activeWalletAddress,
    account: activeWalletAddress,
    wallet: evmWallet,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const { liveRank } = useProfileRank({
    profile,
    isOwnProfile: true,
    chainId,
    viewedAddress: activeWalletAddress,
  });

  const { leagueCabinet, loadingLeagueCabinet } = useLeagueCabinet(chainId, activeWalletAddress);

  const displayName = useMemo(() => {
    const name = String(profile?.displayName ?? "").trim();
    return name ? `@${name}` : shortenWallet(activeWalletAddress) || "Command Center";
  }, [profile?.displayName, activeWalletAddress]);

  const avatarUrl =
    profile?.avatarUrl ||
    "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=200&h=200&fit=crop";

  const value = useMemo<CommandCenterData>(() => ({
    walletAddress: activeWalletAddress,
    chainId,
    walletChainId,
    isUnsupportedChain,
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
    attribution,
    loadingAttribution,
    followersCount,
    followingCount,
    loadingFollows,
    createdCount: created.length,
    created,
    draftCount: isUnsupportedChain ? 0 : draftCount,
    loadingDraftCount: isUnsupportedChain ? false : loadingDraftCount,
    nativeBalance,
    tokenBalances,
    loadingBalances,
    liveRank,
    leagueCabinet,
    loadingLeagueCabinet,
  }), [
    activeWalletAddress,
    chainId,
    walletChainId,
    isUnsupportedChain,
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
    attribution,
    loadingAttribution,
    followersCount,
    followingCount,
    loadingFollows,
    created,
    draftCount,
    loadingDraftCount,
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
