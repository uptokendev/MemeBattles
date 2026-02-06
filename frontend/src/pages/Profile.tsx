import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ProfileTab } from "@/types/profile";
import { useWallet } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignSummary } from "@/lib/launchpadClient";
import { BrowserProvider, Contract, ethers } from "ethers";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import {
  buildProfileMessage,
  fetchUserProfile,
  requestNonce,
  saveUserProfile,
  type UserProfile,
} from "@/lib/profileApi";
import {
  buildLeagueClaimMessage,
  fetchClaimableRewards,
  formatWeiToBnb,
  submitLeagueClaim,
  type RewardItem,
} from "@/lib/rewardsApi";
import { 
  followUser, unfollowUser, isFollowingUser, getFollowersCount, getFollowingCount, 
  getFollowers, getFollowing, getFollowedCampaigns 
} from '@/lib/followApi';

type ProfileTabEx = ProfileTab | "followers" | "following";


type TokenBalanceRow = {
  campaignAddress: string;
  tokenAddress: string;
  image: string;
  name: string;
  ticker: string;
  balanceRaw: bigint;
  balanceFormatted: string;
};

type ActivityTradeRow = {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTime: string;
  side: "buy" | "sell";
  wallet: string;
  tokenAmount: number | null;
  bnbAmount: number | null;
  priceBnb: number | null;
  campaignAddress: string;
  campaignName: string | null;
  campaignSymbol: string | null;
  logoUri: string | null;
};

const REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").replace(/\/$/, "");

const ERC20_ABI_MIN = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }],
  },
] as const;

function getExplorerBase(chainId?: number): string {
  // BSC
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 56) return "https://bscscan.com";

  // Fallback (keeps link valid-ish)
  return "https://bscscan.com";
}

function shorten(addr?: string | null) {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function pickTokenAddressFromSummary(s: CampaignSummary): string | null {
  const anyCampaign: any = s?.campaign as any;
  // Try common fields (adjust once you confirm your schema)
  return (
    anyCampaign?.token ||
    anyCampaign?.tokenAddress ||
    anyCampaign?.tokenContract ||
    anyCampaign?.tokenAddr ||
    null
  );
}

const Profile = () => {
  const navigate = useNavigate();
  const wallet = useWallet();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();

  const anyWallet: any = wallet as any;

  // Prefer an explicit isConnected flag if your hook provides it.
  const isConnected: boolean = Boolean(
    anyWallet?.isConnected ?? anyWallet?.connected ?? wallet.account
  );

  const account: string | null = isConnected ? (wallet.account ?? null) : null;
  const [searchParams] = useSearchParams();
  const addressParam = searchParams.get("address");
  const tabParam = searchParams.get("tab");
  const viewedAddress: string | null = addressParam ? addressParam : account;
  const isOwnProfile = Boolean(account && viewedAddress && account.toLowerCase() === viewedAddress.toLowerCase());
  const chainId: number | undefined = anyWallet?.chainId ?? anyWallet?.network?.chainId;

  const [activeTab, setActiveTab] = useState<ProfileTabEx>("balances");
  const [activityTab, setActivityTab] = useState<"trades" | "comments" | "created" | "interactions">("trades");

  // Rewards (league winnings)
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [rewardsError, setRewardsError] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  const [activityTrades, setActivityTrades] = useState<ActivityTradeRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [created, setCreated] = useState<
    Array<{
      id: number;
      image: string;
      name: string;
      ticker: string;
      campaignAddress: string;
      marketCap: string;
      timeAgo: string;
      buyersCount?: number;
    }>
  >([]);

  const [nativeBalance, setNativeBalance] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Profile (username / bio)
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followedCampaigns, setFollowedCampaigns] = useState<string[]>([]);
  const [loadingFollows, setLoadingFollows] = useState(true);

  // Optional: allow deep-linking to a tab (e.g. /profile?tab=rewards)
  useEffect(() => {
    const t = String(tabParam ?? "").toLowerCase().trim();
    if (!t) return;
    if (t === "rewards") setActiveTab("rewards");
    if (t === "balances") setActiveTab("balances");
    if (t === "coins") setActiveTab("coins");
    if (t === "activity" || t === "replies") setActiveTab("replies");
    if (t === "followers") setActiveTab("followers");
    if (t === "notifications") setActiveTab("notifications");
  }, [tabParam]);

  // Allow deep-linking: /profile?tab=rewards
  useEffect(() => {
    const t = String(tabParam ?? "").toLowerCase().trim();
    if (t === "rewards") setActiveTab("rewards");
  }, [tabParam]);

  useEffect(() => {
  if (!viewedAddress) return;
  const loadFollows = async () => {
    setLoadingFollows(true);
    try {
      const [fc, fgc, isF] = await Promise.all([
        getFollowersCount(viewedAddress, chainId ?? 0),
        getFollowingCount(viewedAddress, chainId ?? 0),
        isOwnProfile || !wallet?.account
          ? false
          : isFollowingUser(wallet.account, viewedAddress, chainId ?? 0),
      ]);
      setFollowersCount(fc);
      setFollowingCount(fgc);
      setIsFollowing(isF);

      if (activeTab === 'followers') {
        const fl = await getFollowers(viewedAddress, chainId ?? 0);
        setFollowersList(fl);
      } else if (activeTab === 'following') {
        const [fl, camps] = await Promise.all([
          getFollowing(viewedAddress, chainId ?? 0),
          getFollowedCampaigns(viewedAddress, chainId ?? 0),
        ]);
        setFollowingList(fl);
        setFollowedCampaigns(camps);
      }
    } catch (err) {
      console.error('Follow data load failed', err);
    } finally {
      setLoadingFollows(false);
    }
  };
  loadFollows();
}, [viewedAddress, activeTab, isOwnProfile]);

  const walletAddressShort = useMemo(() => shorten(viewedAddress), [viewedAddress]);

  const displayName = useMemo(() => {
    const u = (profile?.displayName ?? "").trim();
    return u ? `@${u}` : walletAddressShort || "Profile";
  }, [profile?.displayName, walletAddressShort]);

  const walletAddressFull = viewedAddress ?? "Not connected";

  const explorerUrl = useMemo(() => {
    if (!viewedAddress) return "#";
    const base = getExplorerBase(chainId);
    return `${base}/address/${viewedAddress}`;
  }, [viewedAddress, chainId]);

  // Optional deep-linking: /profile?tab=rewards
  useEffect(() => {
    const t = String(tabParam ?? "").toLowerCase().trim();
    if (!t) return;
    const allowed: ProfileTabEx[] = ["balances", "coins", "replies", "rewards", "notifications", "followers"];
    if (allowed.includes(t as ProfileTab)) setActiveTab(t as ProfileTab);
  }, [tabParam]);

  // Load profile from backend (username/bio/avatar) if configured
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!viewedAddress) {
        setProfile(null);
        return;
      }

      setLoadingProfile(true);
      try {
        if (!chainId) {
          setProfile(null);
          return;
        }
        const p = await fetchUserProfile(chainId, viewedAddress);
        if (!cancelled) setProfile(p);
      } catch (e: any) {
        // Fail gracefully if the backend is not configured or the endpoint is missing.
        console.warn("Failed to load profile", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [viewedAddress, chainId]);

  // Load claimable league rewards (suppresses already-claimed)
  useEffect(() => {
    let cancelled = false;
    const loadRewards = async () => {
      if (activeTab !== "rewards") return;
      if (!chainId || !account || !isOwnProfile) {
        setRewards([]);
        return;
      }
      setLoadingRewards(true);
      setRewardsError(null);
      try {
        const items = await fetchClaimableRewards(chainId, account);
        if (!cancelled) setRewards(items);
      } catch (e: any) {
        const msg = String(e?.message ?? "Failed to load rewards");
        console.warn("Failed to load rewards", e);
        if (!cancelled) setRewardsError(msg);
        if (!cancelled) setRewards([]);
      } finally {
        if (!cancelled) setLoadingRewards(false);
      }
    };
    loadRewards();
    return () => {
      cancelled = true;
    };
  }, [activeTab, chainId, account, isOwnProfile]);


  const formatTimeAgo = (createdAt?: number): string => {
    if (!createdAt) return "";
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - createdAt);
    if (diff < 60) return "now";
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  };

  const formatNumber = (value?: number | null, maxDecimals = 4): string => {
    if (value == null || !Number.isFinite(value)) return "â€”";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
  };

  const handleCopyAddress = () => {
    if (!viewedAddress) return;
    navigator.clipboard.writeText(viewedAddress);
    toast.success("Address copied!");
  };

  const handleConnect = async () => {
    // Try common hook patterns
    if (typeof anyWallet?.connect === "function") return anyWallet.connect();
    if (typeof anyWallet?.openConnectModal === "function") return anyWallet.openConnectModal();

    toast.message("Use the Connect Wallet button in the header to connect.");
  };

  const handleEdit = () => {
    if (!account) {
      handleConnect();
      return;
    }
    setEditOpen(true);
  };

  const uploadAvatarFile = async (file: File): Promise<string> => {
    if (!chainId) throw new Error("ChainId is not available.");
    if (!account) throw new Error("Wallet not connected.");

    const maxBytes = 500 * 1024;
    if (file.size > maxBytes) throw new Error("Avatar must be <= 500 KB.");

    const typeOk = /^(image\/png|image\/jpeg|image\/jpg|image\/webp)$/.test(file.type);
    if (!typeOk) throw new Error("Unsupported image type. Use png/jpg/webp.");

    const fd = new FormData();
    fd.append("file", file);

    const url = `/api/upload?kind=avatar&chainId=${encodeURIComponent(
      String(chainId)
    )}&address=${encodeURIComponent(account.toLowerCase())}`;

    const res = await fetch(url, { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || `Upload failed (${res.status})`);
    if (!j?.url) throw new Error("Upload did not return a URL.");
    return String(j.url);
  };

  const handlePickAvatar = () => {
    if (!account) {
      handleConnect();
      return;
    }
    avatarInputRef.current?.click();
  };

  const handleAvatarSelected = async (file: File) => {
    if (!account) {
      toast.error("Connect your wallet to change your avatar.");
      return;
    }
    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }
    if (!wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }

    setSavingAvatar(true);
    const toastId = toast.loading("Uploading…");
    try {
      const uploadedUrl = await uploadAvatarFile(file);

      // Sign and persist the new avatar url
      const addr = account.toLowerCase();
      const nonce = await requestNonce(chainId, addr);
      const displayName = (profile?.displayName ?? "").trim() || null;
      const bio = (profile?.bio ?? "").trim() || null;

      setAwaitingWallet(true);
      toast.dismiss(toastId);
      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";
      try {
        const msg = buildProfileMessage({
          chainId,
          address: addr,
          nonce,
          displayName,
          avatarUrl: uploadedUrl,
        });
        signature = await wallet.signer.signMessage(msg);
      } finally {
        setAwaitingWallet(false);
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Saving profile…");
      try {
        await saveUserProfile({
          chainId,
          address: addr,
          displayName,
          bio,
          avatarUrl: uploadedUrl,
          nonce,
          signature,
        });
      } finally {
        toast.dismiss(toastId3);
      }

      const refreshed = await fetchUserProfile(chainId, addr);
      setProfile(refreshed);
      toast.success("Avatar updated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update avatar.");
    } finally {
      setSavingAvatar(false);
      toast.dismiss(toastId);
    }
  };

  const handleSaveProfile = async (values: { username: string; bio: string }) => {
    if (!account) {
      toast.error("Connect your wallet to edit your profile.");
      return;
    }
    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }
    if (!wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }

    setSavingProfile(true);

    const toastId = toast.loading("Preparing signature…");
    try {
      const addr = account.toLowerCase();
      const nonce = await requestNonce(chainId, addr);
      const displayName = values.username.trim();
      const avatarUrl = profile?.avatarUrl ?? null;

      setAwaitingWallet(true);
      toast.dismiss(toastId);
      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";
      try {
        const msg = buildProfileMessage({
          chainId,
          address: addr,
          nonce,
          displayName: displayName || null,
          avatarUrl: avatarUrl ?? null,
        });
        signature = await wallet.signer.signMessage(msg);
      } finally {
        setAwaitingWallet(false);
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Saving profile…");
      try {
        await saveUserProfile({
          chainId,
          address: addr,
          displayName: displayName || null,
          bio: values.bio.trim() || null,
          avatarUrl,
          nonce,
          signature,
        });
      } finally {
        toast.dismiss(toastId3);
      }

      const refreshed = await fetchUserProfile(chainId, addr);
      setProfile(refreshed);
      setEditOpen(false);
      toast.success("Profile updated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update profile.");
    } finally {
      setSavingProfile(false);
      toast.dismiss(toastId);
    }
  };

  const handleClaimPrize = async (item: RewardItem) => {
    if (!account) {
      toast.error("Connect your wallet to claim.");
      handleConnect();
      return;
    }
    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }
    if (!wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }
    if (!isOwnProfile) {
      toast.error("You can only claim from your own profile.");
      return;
    }

    const key = `${item.period}:${item.epochStart}:${item.category}:${item.rank}`;
    setClaimingKey(key);

    const toastId = toast.loading("Preparing claim…");
    try {
      const recipient = account.toLowerCase();
      const nonce = await requestNonce(chainId, recipient);

      toast.dismiss(toastId);
      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";
      try {
        const msg = buildLeagueClaimMessage({
          chainId,
          recipient,
          period: item.period,
          epochStart: item.epochStart,
          category: item.category,
          rank: item.rank,
          nonce,
        });
        signature = await wallet.signer.signMessage(msg);
      } finally {
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Submitting claim…");
      try {
        await submitLeagueClaim({
          chainId,
          period: item.period,
          epochStart: item.epochStart,
          category: item.category,
          rank: item.rank,
          recipient,
          nonce,
          signature,
        });
      } finally {
        toast.dismiss(toastId3);
      }

      // Remove from list (claimed prizes are suppressed)
      setRewards((prev) => prev.filter((r) => `${r.period}:${r.epochStart}:${r.category}:${r.rank}` !== key));
      toast.success("Claim recorded.");
    } catch (e: any) {
      toast.error(e?.message ?? "Claim failed.");
    } finally {
      setClaimingKey(null);
      toast.dismiss(toastId);
    }
  };

  // Load created campaigns (creator view)
  useEffect(() => {
    let cancelled = false;

    const loadCreated = async () => {
      try {
        if (!viewedAddress) {
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
          .filter(
            (r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled"
          )
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
  }, [account, fetchCampaigns, fetchCampaignSummary]);

  // Load balances (native + launchpad token balances)
  useEffect(() => {
    let cancelled = false;

    const resolveReadProvider = (): ethers.Provider | null => {
      // 1) If the wallet hook already gives us an ethers provider, use it directly.
      //    (Do NOT wrap it in BrowserProvider again.)
      const p = (wallet as any)?.provider;
      if (p && typeof p.getBalance === "function") return p as ethers.Provider;

      // 2) Fallback to injected provider if it's a real EIP-1193 provider
      const injected = (window as any)?.ethereum;
      if (injected && typeof injected.request === "function") {
        return new BrowserProvider(injected);
      }

      return null;
    };

    const loadBalances = async () => {
      try {
        if (!viewedAddress) {
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        const readProvider = resolveReadProvider();
        if (!readProvider) {
          // No usable provider in the browser right now; skip quietly.
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        setLoadingBalances(true);

        // Native (BNB) balance
        const bal = await readProvider.getBalance(account as any);
        const bnb = Number(ethers.formatUnits(bal, 18)).toFixed(4);
        if (!cancelled) setNativeBalance(`${bnb} BNB`);

        // Launchpad token balances:
        const campaigns = (await fetchCampaigns()) ?? [];
        const summaries = await Promise.allSettled(
          campaigns.map((c) => fetchCampaignSummary(c))
        );

        const fulfilled = summaries
          .filter(
            (r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled"
          )
          .map((r) => r.value);

        const rows: TokenBalanceRow[] = [];

        for (const s of fulfilled) {
          const tokenAddr = pickTokenAddressFromSummary(s);
          if (!tokenAddr) continue;

          try {
            const erc20 = new Contract(tokenAddr as any, ERC20_ABI_MIN as any, readProvider);

            const [rawBal, decimalsAny, symbolMaybe] = await Promise.all([
              erc20.balanceOf(account) as Promise<bigint>,
              (erc20.decimals() as Promise<any>).catch(() => 18),
              (erc20.symbol() as Promise<string>).catch(() => null) as Promise<string | null>,
            ]);

            if (typeof rawBal !== "bigint" || rawBal <= 0n) continue;

            const decimals = Number(decimalsAny);
            const formatted = ethers.formatUnits(
              rawBal,
              Number.isFinite(decimals) ? decimals : 18
            );

            rows.push({
              campaignAddress: s.campaign.campaign,
              tokenAddress: tokenAddr,
              image: s.campaign.logoURI || "/placeholder.svg",
              name: s.campaign.name,
              ticker: s.campaign.symbol || symbolMaybe || "",
              balanceRaw: rawBal,
              balanceFormatted: formatted,
            });
          } catch {
            continue;
          }
        }

        if (!cancelled) {
          setTokenBalances(rows.sort((a, b) => (a.balanceRaw > b.balanceRaw ? -1 : 1)));
        }
      } catch (e) {
        console.error("[Profile] Failed to load balances", e);
        if (!cancelled) {
          setNativeBalance("");
          setTokenBalances([]);
        }
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    };

    loadBalances();
    return () => {
      cancelled = true;
    };
    // IMPORTANT: include wallet.provider as a dependency so it reruns once provider is ready.
  }, [account, fetchCampaigns, fetchCampaignSummary, wallet]);

  // Activity: Trades (profile feed)
  useEffect(() => {
    let cancelled = false;

    if (activeTab !== "replies" || activityTab !== "trades") return;

    if (!viewedAddress) {
      setActivityTrades([]);
      setActivityError(null);
      setActivityLoading(false);
      return;
    }

    if (!REALTIME_API_BASE) {
      setActivityTrades([]);
      setActivityError("Missing VITE_REALTIME_API_BASE");
      setActivityLoading(false);
      return;
    }

    const ac = new AbortController();
    const addr = viewedAddress.toLowerCase();
    const cid = Number(chainId ?? 97);

    setActivityLoading(true);
    setActivityError(null);

    (async () => {
      try {
        const qs = new URLSearchParams({
          chainId: String(cid),
          address: addr,
          limit: "50",
        });
        const url = `${REALTIME_API_BASE}/api/activity/trades?${qs.toString()}`;
        const r = await fetch(url, { method: "GET", signal: ac.signal });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const rows = Array.isArray(j?.items) ? j.items : [];
        const next: ActivityTradeRow[] = rows.map((it: any) => ({
          id: String(it?.id ?? `${it?.txHash ?? ""}:${it?.logIndex ?? 0}`),
          txHash: String(it?.txHash ?? ""),
          logIndex: Number(it?.logIndex ?? 0),
          blockNumber: Number(it?.blockNumber ?? 0),
          blockTime: String(it?.blockTime ?? ""),
          side: (String(it?.side ?? "buy") === "sell" ? "sell" : "buy"),
          wallet: String(it?.wallet ?? ""),
          tokenAmount: it?.tokenAmount == null ? null : Number(it.tokenAmount),
          bnbAmount: it?.bnbAmount == null ? null : Number(it.bnbAmount),
          priceBnb: it?.priceBnb == null ? null : Number(it.priceBnb),
          campaignAddress: String(it?.campaignAddress ?? ""),
          campaignName: it?.campaignName ?? null,
          campaignSymbol: it?.campaignSymbol ?? null,
          logoUri: it?.logoUri ?? null,
        }));
        if (cancelled) return;
        setActivityTrades(next);
      } catch (e: any) {
        if (cancelled || ac.signal.aborted) return;
        setActivityError(String(e?.message || "Failed to load trades"));
        setActivityTrades([]);
      } finally {
        if (cancelled) return;
        setActivityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeTab, activityTab, viewedAddress, chainId]);

  return (
        <div className="w-full h-full overflow-y-auto pt-10 md:pt-8 lg:pt-8 pl-0 lg:pl-0">
      {/* Disconnect Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="bg-card/40 border border-border rounded-2xl p-8 text-center max-w-md w-[92%]">
            <div className="font-retro text-foreground text-xl mb-2">Connect your wallet</div>
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
                    src={profile?.avatarUrl || "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=200&h=200&fit=crop"}
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
                    const f = e.target.files?.[0];
                    if (f) handleAvatarSelected(f);
                    e.currentTarget.value = "";
                  }}
                />

                <Button
                  onClick={handlePickAvatar}
                  disabled={!isConnected || savingAvatar || savingProfile}
                  className="bg-accent hover:bg-accent/80 text-accent-foreground font-retro w-full sm:w-auto"
                >
                  {savingAvatar ? (awaitingWallet ? "confirm in wallet..." : "uploading...") : "change avatar"}
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
                      disabled={!account}
                      title="Copy address"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>

                    <a
                      href={explorerUrl}
                      target={account ? "_blank" : undefined}
                      rel="noreferrer"
                      className={`flex items-center gap-1 text-xs md:text-sm font-retro transition-colors ${
                        account
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
  <div className="text-xl md:text-2xl font-retro text-foreground">{followersCount}</div>
  <div className="text-xs font-retro text-muted-foreground">Followers</div>
</div>
<div className="text-center">
  <div className="text-xl md:text-2xl font-retro text-foreground">{followingCount}</div>
  <div className="text-xs font-retro text-muted-foreground">Following</div>
</div>
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {created.length}
                    </div>
                    <div className="text-xs font-retro text-muted-foreground">Created coins</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Button */}
            {isOwnProfile ? (
              <div className="flex items-start justify-end w-full md:w-auto">
                <Button
                  onClick={handleEdit}
                  className="bg-muted hover:bg-muted/80 text-foreground font-retro w-full md:w-auto"
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
    onClick={async () => {
      try {
        if (isFollowing) {
          if (!wallet?.account) throw new Error('Connect wallet');
          await unfollowUser(wallet.account, viewedAddress, chainId ?? 0);
          setIsFollowing(false);
          setFollowersCount(c => c - 1);
        } else {
          if (!wallet?.account) throw new Error('Connect wallet');
          await followUser(wallet.account, viewedAddress, chainId ?? 0);
          setIsFollowing(true);
          setFollowersCount(c => c + 1);
        }
      } catch (err) {
        toast.error('Failed to update follow');
      }
    }}
    variant={isFollowing ? 'outline' : 'default'}
    className="font-retro ml-2"
  >
    {isFollowing ? 'Unfollow' : 'Follow'}
  </Button>
)}
          </div>


          {/* Tabs */}
          <div className="flex gap-3 md:gap-6 border-t border-border pt-4 md:pt-6 overflow-x-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
            {[
              { id: "balances" as ProfileTab, label: "Balances", badge: null },
              { id: "coins" as ProfileTab, label: "Coins", badge: null },
              { id: "replies" as ProfileTab, label: "Activity", badge: null },
              { id: "rewards" as ProfileTab, label: "Rewards", badge: rewards.length ? rewards.length : null },
              { id: "notifications" as ProfileTab, label: "Notifications", badge: 13 },
              { id: "followers" as ProfileTab, label: "Followers", badge: null },
              { id: "following" as ProfileTab, label: "Following", badge: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
            {/* Left: Balances */}
            <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
              <h3 className="text-xs md:text-sm font-retro text-muted-foreground mb-4 md:mb-6">
                Balances
              </h3>

              {/* Native balance */}
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

              {/* Launchpad token balances */}
              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
                {loadingBalances && tokenBalances.length === 0 && (
                  <div className="font-retro text-muted-foreground text-sm">Loading token balances…</div>
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
                    onClick={() => navigate(`/token/${t.campaignAddress.toLowerCase()}`)}
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
                      <div className="font-retro text-muted-foreground text-xs">Balance</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Created Coins */}
            <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-xs md:text-sm font-retro text-foreground">
                  created coins <span className="text-muted-foreground">({created.length})</span>
                </h3>
                <button className="text-xs md:text-sm font-retro text-accent hover:text-accent/80 transition-colors">
                  see all
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
                {created.map((coin) => (
                  <div
                    key={coin.id}
                    className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/token/${coin.campaignAddress.toLowerCase()}`)}
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
                        <div className="font-retro text-muted-foreground text-xs">{coin.ticker}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="font-retro text-foreground text-xs md:text-sm">{coin.marketCap}</div>
                      <div className="font-retro text-muted-foreground text-xs">{coin.timeAgo}</div>
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
              <h3 className="text-xs md:text-sm font-retro text-foreground">rewards</h3>
              {isOwnProfile ? (
                <Button
                  onClick={() => {
                    // force reload
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
                  <div className="font-retro text-muted-foreground text-sm">Loading rewards…</div>
                )}
                {rewardsError && !loadingRewards && (
                  <div className="font-retro text-destructive text-sm">{rewardsError}</div>
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
                    const p: any = r.payload || {};
                    const name = String(p.name ?? p.campaignName ?? "").trim();
                    const symbol = String(p.symbol ?? p.campaignSymbol ?? "").trim();
                    const logo = String(p.logo_uri ?? p.logoUri ?? p.logoURI ?? "").trim();

                    const titleParts = [
                      r.period === "weekly" ? "Weekly" : "Monthly",
                      r.category.replace(/_/g, " "),
                      `#${r.rank}`,
                    ];

                    return (
                      <div key={key} className="p-4 bg-background/50 rounded-xl border border-border">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {logo ? (
                              <img src={logo} alt={name || symbol || "token"} className="w-10 h-10 rounded-full border-2 border-border object-cover" />
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
                              {Number(amountBnb).toLocaleString(undefined, { maximumFractionDigits: 6 })} BNB
                            </div>
                            <div className="font-retro text-muted-foreground text-xs">Prize</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="font-retro text-muted-foreground text-[10px] truncate">
                            {new Date(r.epochStart).toUTCString()} → {new Date(r.epochEnd).toUTCString()}
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

        {/* COINS TAB: Tokens you invested in */}
        {activeTab === "coins" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs md:text-sm font-retro text-foreground">
                tokens you invested in <span className="text-muted-foreground">({tokenBalances.length})</span>
              </h3>
            </div>

            {loadingBalances && (
              <div className="font-retro text-muted-foreground text-sm">Loading…</div>
            )}

            {!loadingBalances && tokenBalances.length === 0 && (
              <div className="font-retro text-muted-foreground text-sm">
                No invested tokens detected yet. Once you buy on a curve (or hold after DEX listing), it will show here.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tokenBalances.map((t) => (
                <div
                  key={`${t.tokenAddress}-${t.campaignAddress}-coins`}
                  className="p-4 bg-background/50 rounded-xl border border-border hover:border-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/token/${t.campaignAddress.toLowerCase()}`)}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={t.image}
                      alt={t.name}
                      className="w-10 h-10 rounded-full border-2 border-border object-cover"
                    />
                    <div className="min-w-0">
                      <div className="font-retro text-foreground text-sm truncate">{t.name}</div>
                      <div className="font-retro text-muted-foreground text-xs">{t.ticker}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-retro text-muted-foreground text-xs">Your balance</div>
                    <div className="font-retro text-foreground text-sm">
                      {Number(t.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPLIES TAB: Activity feed */}
        {activeTab === "replies" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {[
                { id: "trades", label: "Trades" },
                { id: "comments", label: "Comments" },
                { id: "created", label: "Created" },
                { id: "interactions", label: "Interactions" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActivityTab(t.id as typeof activityTab)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-retro transition-colors ${
                    activityTab === t.id
                      ? "bg-accent/20 text-accent border-accent/40"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-background/40 p-4 md:p-6">
              <div className="text-[11px] font-retro text-muted-foreground mb-4">
                Powered by indexed events (no per-campaign polling).
              </div>

              {activityTab === "trades" ? (
                <div className="space-y-3">
                  {activityLoading && (
                    <div className="font-retro text-muted-foreground text-sm">Loading trades...</div>
                  )}

                  {!activityLoading && activityError && (
                    <div className="font-retro text-destructive text-sm">{activityError}</div>
                  )}

                  {!activityLoading && !activityError && activityTrades.length === 0 && (
                    <div className="font-retro text-muted-foreground text-sm">No trades yet.</div>
                  )}

                  {!activityLoading && !activityError && activityTrades.length > 0 && (
                    <div className="space-y-2">
                      {activityTrades.map((t) => {
                        const label = t.campaignName || (t.campaignSymbol ? `$${t.campaignSymbol}` : "Unknown");
                        const symbol = t.campaignSymbol ? `$${t.campaignSymbol}` : "";
                        const ts = t.blockTime ? Math.floor(new Date(t.blockTime).getTime() / 1000) : undefined;
                        const timeAgo = ts ? formatTimeAgo(ts) : "";
                        const explorer = getExplorerBase(chainId);
                        const txUrl = t.txHash ? `${explorer}/tx/${t.txHash}` : "";

                        return (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={t.logoUri || "/placeholder.svg"}
                                alt={label}
                                className="h-9 w-9 rounded-full border border-border/60 object-cover"
                              />
                              <div className="min-w-0">
                                <div className="font-retro text-foreground text-sm truncate">{label}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {symbol} {timeAgo ? `- ${timeAgo} ago` : ""}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className={`font-retro text-xs ${t.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                                {t.side === "buy" ? "Buy" : "Sell"}
                              </div>
                              <div className="font-retro text-xs text-muted-foreground">
                                {formatNumber(t.bnbAmount, 6)} BNB
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
                    Activity will be powered by <span className="text-foreground">indexed events</span> (recommended).
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
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-border text-center">
            <p className="font-retro text-muted-foreground text-sm md:text-base">
              Notifications MVP ideas:
              curve at 80/90/95%, graduation, large buy alerts, your created coin milestones,
              and “watched coins” updates. This needs either an indexer or a lightweight polling service.
            </p>
          </div>
        )}

        {/* FOLLOWERS TAB */}
        {activeTab === "followers" && (
        <div className="bg-card/30 backdrop-blur-md rounded-2xl p-6 border border-border">
          <h3 className="text-xl font-retro mb-4">Followers ({followersCount})</h3>
            {loadingFollows ? <p>Loading...</p> : followersList.length === 0 ? (
              <p className="text-muted-foreground">No followers yet.</p>
                ) : (
                <div className="space-y-3">
                  {followersList.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-background/50 rounded-xl">
                      <img src={f.profile?.avatarUrl || '/placeholder.svg'} className="w-10 h-10 rounded-full" />
                    <div>
                    <div className="font-semibold">{f.profile?.displayName || shorten(f.id)}</div>
                </div>
                  <Button variant="link" onClick={() => navigate(`/profile?address=${f.id}`)}>View</Button>
        </div>
        ))}
      </div>
    )}
  </div>
)}

      </div>
    </div>
  );
};

export default Profile;