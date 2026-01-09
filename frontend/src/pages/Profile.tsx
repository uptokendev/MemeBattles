import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ProfileTab } from "@/types/profile";
import { useWallet } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignSummary } from "@/lib/launchpadClient";
import { BrowserProvider, Contract, ethers } from "ethers";

type TokenBalanceRow = {
  campaignAddress: string;
  tokenAddress: string;
  image: string;
  name: string;
  ticker: string;
  balanceRaw: bigint;
  balanceFormatted: string;
};

type UserProfileRow = {
  address: string;
  chainId: number;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
};

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
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 56) return "https://bscscan.com";
  return "https://bscscan.com";
}

function shorten(addr?: string | null) {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getNonce(chainId: number, address: string): Promise<string> {
  const res = await fetch(
    `/api/auth/nonce?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(
      address.toLowerCase()
    )}`,
    { method: "GET" }
  );

  if (!res.ok) {
    const j = await safeReadJson(res);
    throw new Error(j?.error || `Nonce failed (${res.status})`);
  }

  const j = await res.json();
  if (!j?.nonce) throw new Error("Nonce missing");
  return String(j.nonce);
}

// MUST match backend profile.js buildProfileMessage EXACTLY
function buildProfileMessage(args: {
  chainId: number;
  address: string;
  nonce: string;
  displayName: string;
  avatarUrl: string; // pass "" if null
}) {
  const name = String(args.displayName ?? "").trim().slice(0, 32);
  const avatar = String(args.avatarUrl ?? "").trim().slice(0, 200);

  return [
    "UPMEME Profile",
    "Action: PROFILE_UPSERT",
    `ChainId: ${args.chainId}`,
    `Address: ${String(args.address).toLowerCase()}`,
    `Nonce: ${args.nonce}`,
    "",
    `DisplayName: ${name}`,
    `AvatarUrl: ${avatar}`,
  ].join("\n");
}

async function uploadAvatar(file: File, chainId: number, address: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(
    `/api/upload?kind=avatar&chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(
      address.toLowerCase()
    )}`,
    { method: "POST", body: fd }
  );

  const j = await safeReadJson(res);
  if (!res.ok) throw new Error(j?.error || `Upload failed (${res.status})`);
  if (!j?.url) throw new Error("Upload did not return url");
  return String(j.url);
}

function pickTokenAddressFromSummary(s: CampaignSummary): string | null {
  const anyCampaign: any = s?.campaign as any;
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

  const isConnected: boolean = Boolean(
    anyWallet?.isConnected ?? anyWallet?.connected ?? wallet.account
  );

  const account: string | null = isConnected ? (wallet.account ?? null) : null;
  const chainId: number | undefined = anyWallet?.chainId ?? anyWallet?.network?.chainId;
  const effectiveChainId = Number.isFinite(chainId) ? (chainId as number) : 97;

  const [activeTab, setActiveTab] = useState<ProfileTab>("balances");

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

  const walletAddressShort = useMemo(() => shorten(account), [account]);
  const walletAddressFull = account ?? "Not connected";

  const explorerUrl = useMemo(() => {
    if (!account) return "#";
    const base = getExplorerBase(chainId);
    return `${base}/address/${account}`;
  }, [account, chainId]);

 // Avatar upload
const fileInputRef = useRef<HTMLInputElement | null>(null);
const [profile, setProfile] = useState<UserProfileRow | null>(null);
const [savingProfile, setSavingProfile] = useState(false);
const [awaitingWallet, setAwaitingWallet] = useState(false);

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

  const handleCopyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    toast.success("Address copied!");
  };

  const handleConnect = async () => {
    if (typeof anyWallet?.connect === "function") return anyWallet.connect();
    if (typeof anyWallet?.openConnectModal === "function") return anyWallet.openConnectModal();
    toast.message("Use the Connect Wallet button in the header to connect.");
  };

  const handleEdit = () => {
    toast.message("Edit profile: coming soon (name, bio, notification settings).");
  };

  const handlePickAvatar = () => {
    if (!account) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
        toast.error("Unsupported image type. Use PNG/JPG/WebP.");
        return;
      }
      if (file.size > 500 * 1024) {
        toast.error("Avatar too large. Keep it under 500KB for now.");
        return;
      }

      // Ensure wallet connected + signer exists
      if (!wallet.account) {
        if (typeof anyWallet?.connect === "function") await anyWallet.connect();
        else if (typeof anyWallet?.openConnectModal === "function") await anyWallet.openConnectModal();
      }
      if (!wallet.signer || !wallet.account) {
        toast.error("Connect wallet to update profile.");
        return;
      }

      setSavingProfile(true);

      const address = wallet.account.toLowerCase();

      // 1) upload -> url
      const avatarUrl = await uploadAvatar(file, effectiveChainId, address);

      // 2) nonce
      const nonce = await getNonce(effectiveChainId, address);

      // 3) sign message
const displayName = String(profile?.displayName ?? "").trim();
const bio = profile?.bio ?? null;

const msg = buildProfileMessage({
  chainId: effectiveChainId,
  address,
  nonce,
  displayName,
  avatarUrl,
});

// IMPORTANT UX: wallet confirmation prompt
setAwaitingWallet(true);
const toastId = toast.loading("Confirm the signature in your wallet…");

let signature: string;
try {
  signature = await wallet.signer.signMessage(msg);
} catch (err: any) {
  const code = err?.code ?? err?.info?.error?.code;
  const message = String(err?.message ?? "");

  if (code === 4001 || /rejected|denied|user rejected|ACTION_REJECTED/i.test(message)) {
    toast.error("Signature was rejected in your wallet.");
    return;
  }

  toast.error("Signature failed. Please try again.");
  console.error("[Profile] signMessage failed", err);
  return;
} finally {
  setAwaitingWallet(false);
  toast.dismiss(toastId);
}

      // 4) persist
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: effectiveChainId,
          address,
          displayName,
          avatarUrl,
          bio,
          nonce,
          signature,
        }),
      });

      if (!res.ok) {
        const j = await safeReadJson(res);
        throw new Error(j?.error || `Profile update failed (${res.status})`);
      }

      setProfile((prev) => ({
        ...(prev ?? { address, chainId: effectiveChainId }),
        displayName: displayName || null,
        avatarUrl,
        bio,
      }));

      toast.success("Avatar updated.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to update avatar");
    } finally {
      setSavingProfile(false);
    }
  };

  // Load created campaigns
  useEffect(() => {
    let cancelled = false;

    const loadCreated = async () => {
      try {
        if (!account) {
          setCreated([]);
          return;
        }

        const campaigns = (await fetchCampaigns()) ?? [];
        const mine = campaigns.filter((c) => (c.creator ?? "").toLowerCase() === account.toLowerCase());

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
  }, [account, fetchCampaigns, fetchCampaignSummary]);

  // Load profile from DB
  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        if (!account) {
          setProfile(null);
          return;
        }

        const res = await fetch(
          `/api/profile?chainId=${encodeURIComponent(String(effectiveChainId))}&address=${encodeURIComponent(
            account.toLowerCase()
          )}`,
          { method: "GET" }
        );

        if (!res.ok) {
          const j = await safeReadJson(res);
          throw new Error(j?.error || `Failed to load profile (${res.status})`);
        }

        const j = await res.json();
        if (!cancelled) setProfile((j?.profile as UserProfileRow) ?? null);
      } catch (e) {
        console.error("[Profile] Failed to load profile", e);
        if (!cancelled) setProfile(null);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [account, effectiveChainId]);

  // Load balances
  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      try {
        if (!account) {
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        const injected = (window as any)?.ethereum;
        const readProvider: BrowserProvider | null = anyWallet?.provider
          ? (anyWallet.provider as BrowserProvider)
          : injected
            ? new BrowserProvider(injected.providers?.find?.((p: any) => p.isMetaMask) || injected)
            : null;

        if (!readProvider) {
          setNativeBalance("");
          setTokenBalances([]);
          return;
        }

        setLoadingBalances(true);

        const bal = await readProvider.getBalance(account);
        const bnb = Number(ethers.formatEther(bal)).toFixed(4);
        if (!cancelled) setNativeBalance(`${bnb} BNB`);

        const campaigns = (await fetchCampaigns()) ?? [];
        const summaries = await Promise.allSettled(campaigns.map((c) => fetchCampaignSummary(c)));

        const fulfilled = summaries
          .filter((r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled")
          .map((r) => r.value);

        const rows: TokenBalanceRow[] = [];

        for (const s of fulfilled) {
          const tokenAddr = pickTokenAddressFromSummary(s);
          if (!tokenAddr) continue;

          try {
            const erc20 = new Contract(tokenAddr, ERC20_ABI_MIN as any, readProvider);
            const [rawBal, decimals, symbolMaybe] = await Promise.all([
              erc20.balanceOf(account) as Promise<bigint>,
              erc20.decimals() as Promise<number>,
              Promise.resolve(erc20.symbol() as Promise<string>).catch(() => null),
            ]);

            if (rawBal <= 0n) continue;

            const formatted = ethers.formatUnits(rawBal, decimals);
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
  }, [account, fetchCampaigns, fetchCampaignSummary]);

  const followingCount = 0;
  const followersCount = useMemo(() => {
    const sum = created.reduce((acc, c) => acc + (c.buyersCount ?? 0), 0);
    return sum;
  }, [created]);

  return (
    <div className="h-full w-full relative">
      {!isConnected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
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

      <div className={`h-full p-4 md:p-6 overflow-y-auto ${!isConnected ? "blur-md pointer-events-none select-none" : ""}`}>
        <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border mb-4">
          <div className="flex flex-col md:flex-row items-start justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row gap-4 md:gap-6 w-full md:w-auto">
              <div className="flex flex-col items-center sm:items-start gap-3">
                {/* Avatar */}
                <div
                  className="w-20 h-20 md:w-28 md:h-28 rounded-full bg-accent/20 border-4 border-accent/30 overflow-hidden mx-auto sm:mx-0 cursor-pointer hover:opacity-90 transition"
                  onClick={() => !savingProfile && handlePickAvatar()}
                  title="Change avatar"
                >
                  <img
                    src={profile?.avatarUrl || "/placeholder.svg"}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />

                <Button
                  onClick={handlePickAvatar}
                  disabled={!account || savingProfile}
                  className="bg-muted hover:bg-muted/80 text-foreground font-retro w-full sm:w-auto"
                >
                  {savingProfile ? (awaitingWallet ? "confirm in wallet..." : "uploading...") : "change avatar"}
                </Button>
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-2xl md:text-3xl font-retro text-foreground mb-3">
                  {walletAddressShort || "Profile"}
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
                        account ? "text-accent hover:text-accent/80" : "text-muted-foreground pointer-events-none"
                      }`}
                    >
                      View on explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex justify-center sm:justify-start gap-6 md:gap-8">
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {followersCount}
                    </div>
                    <div className="text-xs font-retro text-muted-foreground">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">
                      {followingCount}
                    </div>
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
            <Button
              onClick={handleEdit}
              className="bg-muted hover:bg-muted/80 text-foreground font-retro w-full md:w-auto"
            >
              edit
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-3 md:gap-6 border-t border-border pt-4 md:pt-6 overflow-x-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
            {[
              { id: "balances" as ProfileTab, label: "Balances", badge: null },
              { id: "coins" as ProfileTab, label: "Coins", badge: null },
              { id: "Replies" as ProfileTab, label: "Replies", badge: null },
              { id: "notifications" as ProfileTab, label: "Notifications", badge: 13 },
              { id: "followers" as ProfileTab, label: "Followers", badge: null },
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
                        {Number(t.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 6 })}
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

        {/* COINS TAB */}
        {activeTab === "coins" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs md:text-sm font-retro text-foreground">
                tokens you invested in <span className="text-muted-foreground">({tokenBalances.length})</span>
              </h3>
            </div>

            {loadingBalances && <div className="font-retro text-muted-foreground text-sm">Loading…</div>}

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

        {/* REPLIES TAB */}
        {activeTab === "replies" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-border text-center">
            <p className="font-retro text-muted-foreground text-sm md:text-base">
              Replies will become your <span className="text-foreground">Activity</span> feed:
              buys/sells, creations, and interactions. To power this we’ll either:
              (1) index events (recommended), or (2) fetch recent trades per campaign (heavier).
            </p>
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
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-border text-center">
            <p className="font-retro text-muted-foreground text-sm md:text-base">
              Followers MVP direction:
              for creators, show investors/holders of your coins (requires event indexing);
              for regular users, this becomes “Creators you follow” and “Coins you watch”.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
