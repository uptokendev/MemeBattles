import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ProfileTab } from "@/types/profile";
import { useWallet } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignSummary } from "@/lib/launchpadClient";

const Profile = () => {
  const navigate = useNavigate();
  const wallet = useWallet();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const [activeTab, setActiveTab] = useState<ProfileTab>("balances");
  const [created, setCreated] = useState<
    Array<{
      id: number;
      image: string;
      name: string;
      ticker: string;
      marketCap: string;
      timeAgo: string;
    }>
  >([]);

  const walletAddress = wallet.account
    ? wallet.account.length > 10
      ? `${wallet.account.slice(0, 6)}...${wallet.account.slice(-4)}`
      : wallet.account
    : "Not connected";

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
    if (!wallet.account) return;
    navigator.clipboard.writeText(wallet.account);
    toast.success("Address copied!");
  };

  useEffect(() => {
    let cancelled = false;

    const loadCreated = async () => {
      try {
        if (!wallet.account) {
          setCreated([]);
          return;
        }

        const campaigns = (await fetchCampaigns()) ?? [];
        const mine = campaigns.filter(
          (c) => (c.creator ?? "").toLowerCase() === wallet.account!.toLowerCase()
        );

        const results = await Promise.allSettled(
          mine.map((c) => fetchCampaignSummary(c))
        );

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
              marketCap: s.stats.marketCap,
              timeAgo: (s.campaign as any).timeAgo || formatTimeAgo(s.campaign.createdAt),
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
  }, [wallet.account, fetchCampaigns, fetchCampaignSummary]);

  return (
    <div className="fixed inset-0 pt-28 lg:pt-28 pl-0 lg:pl-72">
      <div className="h-full p-4 md:p-6 overflow-y-auto">
        {/* Profile Header */}
        <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border mb-4">
          <div className="flex flex-col md:flex-row items-start justify-between mb-6 gap-4">
            <div className="flex flex-col sm:flex-row gap-4 md:gap-6 w-full md:w-auto">
              {/* Avatar */}
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-full bg-accent/20 border-4 border-accent/30 overflow-hidden mx-auto sm:mx-0">
                <img
                  src="https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=200&h=200&fit=crop"
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Profile Info */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-2xl md:text-3xl font-retro text-foreground mb-3">
                  {wallet.account ? walletAddress : "Profile"}
                </h1>
                
                <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 sm:gap-3 mb-4">
                  <span className="text-xs md:text-sm font-retro text-muted-foreground">{walletAddress}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyAddress}
                      className="p-1 hover:bg-muted rounded transition-colors"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <a
                      href="#"
                      className="flex items-center gap-1 text-xs md:text-sm font-retro text-accent hover:text-accent/80 transition-colors"
                    >
                      View on explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex justify-center sm:justify-start gap-6 md:gap-8">
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">7</div>
                    <div className="text-xs font-retro text-muted-foreground">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">0</div>
                    <div className="text-xs font-retro text-muted-foreground">Following</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl md:text-2xl font-retro text-foreground">{created.length}</div>
                    <div className="text-xs font-retro text-muted-foreground">Created coins</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <Button className="bg-muted hover:bg-muted/80 text-foreground font-retro w-full md:w-auto">
              edit
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-3 md:gap-6 border-t border-border pt-4 md:pt-6 overflow-x-auto scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted">
            {[
              { id: "balances" as ProfileTab, label: "Balances", badge: null },
              { id: "coins" as ProfileTab, label: "Coins", badge: null },
              { id: "replies" as ProfileTab, label: "Replies", badge: null },
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

        {/* Content Area */}
        {activeTab === "balances" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Balances */}
            <div className="bg-card/30 backdrop-blur-md rounded-2xl p-4 md:p-6 border border-border">
              <h3 className="text-xs md:text-sm font-retro text-muted-foreground mb-4 md:mb-6">Coins</h3>
              
              {/* Native tokens like SOL, USDC are not clickable */}
              <div className="flex items-center justify-between p-3 md:p-4 bg-background/50 rounded-xl border border-border">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">SOL</span>
                  </div>
                  <div>
                    <div className="font-retro text-foreground mb-1 text-sm md:text-base">Solana balance</div>
                    <div className="text-xs md:text-sm font-retro text-muted-foreground">0.9798 SOL</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs md:text-sm font-retro text-muted-foreground">MCap</div>
                  <div className="font-retro text-foreground text-sm md:text-base">$161</div>
                </div>
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
                    onClick={() => navigate(`/token/${coin.ticker.toLowerCase()}`)}
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
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="font-retro text-foreground text-xs md:text-sm">{coin.marketCap}</div>
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

        {/* Other tabs content */}
        {activeTab !== "balances" && (
          <div className="bg-card/30 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-border text-center">
            <p className="font-retro text-muted-foreground text-sm md:text-base">
              {activeTab === "coins" && "No coins to display"}
              {activeTab === "replies" && "No replies yet"}
              {activeTab === "notifications" && "No notifications"}
              {activeTab === "followers" && "No followers yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
