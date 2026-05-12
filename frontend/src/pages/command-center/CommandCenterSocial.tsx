import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Coins, FileText, UserPlus, Users } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { useWallet } from "@/contexts/WalletContext";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useProfileFollows } from "@/hooks/profile/useProfileFollows";
import type { ProfileTab } from "@/types/profile";

type CommandCenterSocialProps = {
  mode: "followers" | "following";
};

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function resolveWallet(item: any, mode: "followers" | "following") {
  if (mode === "followers") {
    return String(item?.follower ?? item?.followerAddress ?? item?.wallet ?? item?.address ?? "");
  }
  return String(item?.following ?? item?.followingAddress ?? item?.wallet ?? item?.address ?? "");
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function CommandCenterSocial({ mode }: CommandCenterSocialProps) {
  const {
    walletAddress,
    chainId,
    followersCount,
    followingCount,
    loadingFollows: loadingCounts,
    createdCount,
  } = useCommandCenterData();
  const wallet = useWallet();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const activeTab = mode as ProfileTab;

  const {
    followersList,
    followingList,
    followedCards,
    loadingFollows,
  } = useProfileFollows({
    activeTab,
    viewedAddress: walletAddress,
    isOwnProfile: true,
    chainId,
    account: wallet.account ?? walletAddress,
    fetchCampaigns,
    fetchCampaignSummary,
  });

  const followedDraftCards = followedCards.filter((card: any) => card.kind === "draft");
  const followedCoinCards = followedCards.filter((card: any) => card.kind !== "draft");

  const title = mode === "followers" ? "Followers" : "Following";
  const description = mode === "followers"
    ? "Wallets following this profile."
    : "Users, coins, and Prepare drafts followed by this wallet.";

  const statCards = useMemo(
    () => [
      {
        label: "Followers",
        value: loadingCounts ? "..." : followersCount.toLocaleString(),
        href: `/profile/${walletAddress}/command/followers`,
        icon: Users,
        active: mode === "followers",
      },
      {
        label: "Following",
        value: loadingCounts ? "..." : followingCount.toLocaleString(),
        href: `/profile/${walletAddress}/command/following`,
        icon: UserPlus,
        active: mode === "following",
      },
      {
        label: "Coins",
        value: createdCount.toLocaleString(),
        href: `/profile/${walletAddress}/command/coins`,
        icon: Coins,
        active: false,
      },
    ],
    [createdCount, followersCount, followingCount, loadingCounts, mode, walletAddress],
  );

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title={title} description={description} />

      <div className="grid gap-3 md:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.href}
              className={`rounded-2xl border p-4 transition hover:border-accent/50 hover:bg-card/45 ${
                stat.active ? "border-accent/60 bg-accent/10" : "border-border/50 bg-card/25"
              }`}
            >
              <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4 text-accent" />
                <span className="font-retro text-[10px] uppercase tracking-[0.16em]">{stat.label}</span>
              </div>
              <div className="font-retro text-2xl text-foreground">{stat.value}</div>
            </Link>
          );
        })}
      </div>

      {mode === "followers" ? (
        <CommandCenterCard title="Followers" description={`${loadingFollows ? "Loading" : followersCount.toLocaleString()} wallets follow this profile.`}>
          {loadingFollows ? (
            <EmptyState>Loading followers...</EmptyState>
          ) : followersList.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {followersList.map((item: any, index: number) => {
                const rowWallet = resolveWallet(item, mode);
                return (
                  <Link
                    key={`${rowWallet}-${index}`}
                    to={rowWallet ? `/profile/${rowWallet}` : `/profile/${walletAddress}/command/followers`}
                    className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35"
                  >
                    <div className="font-retro text-sm text-foreground">{shortenWallet(rowWallet) || "Unknown wallet"}</div>
                    <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{rowWallet || "No wallet address returned"}</div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState>No followers to show yet.</EmptyState>
          )}
        </CommandCenterCard>
      ) : (
        <div className="space-y-4">
          <CommandCenterCard title="Followed users" description={`${followingList.length.toLocaleString()} user profiles followed.`}>
            {loadingFollows ? (
              <EmptyState>Loading followed users...</EmptyState>
            ) : followingList.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {followingList.map((item: any, index: number) => {
                  const rowWallet = resolveWallet(item, mode);
                  return (
                    <Link
                      key={`${rowWallet}-${index}`}
                      to={rowWallet ? `/profile/${rowWallet}` : `/profile/${walletAddress}/command/following`}
                      className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35"
                    >
                      <div className="font-retro text-sm text-foreground">{shortenWallet(rowWallet) || "Unknown wallet"}</div>
                      <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{rowWallet || "No wallet address returned"}</div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState>No followed users yet.</EmptyState>
            )}
          </CommandCenterCard>

          <CommandCenterCard title="Followed coins" description={`${followedCoinCards.length.toLocaleString()} live campaigns followed.`}>
            {loadingFollows ? (
              <EmptyState>Loading followed coins...</EmptyState>
            ) : followedCoinCards.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {followedCoinCards.map((card: any) => (
                  <Link
                    key={`${card.kind}-${card.id}`}
                    to={card.href || `/profile/${walletAddress}/command/following`}
                    className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35"
                  >
                    <div className="flex items-center gap-3">
                      <img src={card.image || "/placeholder.svg"} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-retro text-sm text-foreground">{card.name}</div>
                        <div className="text-xs text-muted-foreground">${card.ticker}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">Market cap: {card.marketCap || "—"}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>No followed coins yet.</EmptyState>
            )}
          </CommandCenterCard>

          <CommandCenterCard title="Followed drafts" description={`${followedDraftCards.length.toLocaleString()} Prepare Mode drafts followed.`}>
            {loadingFollows ? (
              <EmptyState>Loading followed drafts...</EmptyState>
            ) : followedDraftCards.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {followedDraftCards.map((card: any) => (
                  <Link
                    key={`${card.kind}-${card.id}`}
                    to={card.href || `/profile/${walletAddress}/command/following`}
                    className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35"
                  >
                    <div className="flex items-center gap-3">
                      <img src={card.image || "/placeholder.svg"} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-retro text-sm text-foreground">{card.name}</div>
                        <div className="text-xs text-muted-foreground">${card.ticker}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">Status: {card.status || "Prepare Mode"}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>No followed drafts yet.</EmptyState>
            )}
          </CommandCenterCard>
        </div>
      )}
    </div>
  );
}
