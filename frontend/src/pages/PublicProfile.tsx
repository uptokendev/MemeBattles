import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignSummary } from "@/lib/launchpadClient";
import { getActiveChainId } from "@/lib/chainConfig";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";
import { fetchPublicCampaignDrafts, type CampaignDraft } from "@/lib/draftApi";
import { RankBadgeCard } from "@/components/rank/RankBadgeCard";
import { normalizeRank, type RankName } from "@/lib/ranks";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type PublicCoin = {
  id: number;
  image: string;
  name: string;
  ticker: string;
  campaignAddress: string;
  marketCap: string;
  progress?: string | null;
  status?: string | null;
  timeAgo?: string | null;
};

function shorten(addr?: string | null) {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getExplorerBase(chainId?: number): string {
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 56) return "https://bscscan.com";
  return "https://bscscan.com";
}

function formatTimeAgo(createdAt?: number | string | null): string {
  if (!createdAt) return "";
  const seconds = typeof createdAt === "number" ? createdAt : Math.floor(new Date(createdAt).getTime() / 1000);
  if (!Number.isFinite(seconds)) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - seconds);
  if (diff < 60) return "now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function safeRank(profile: UserProfile | null): RankName {
  const raw = (profile as any)?.rank;
  return raw ? normalizeRank(raw) : "Recruit";
}

function coinFromSummary(summary: CampaignSummary, index: number): PublicCoin {
  const stats: any = summary.stats as any;
  const campaign: any = summary.campaign as any;
  const progress = stats?.progressPct ?? stats?.progress ?? campaign?.progressPct ?? null;
  const graduated = Boolean(campaign?.graduated || campaign?.isDexTrading || campaign?.graduatedAt);

  return {
    id: typeof summary.campaign.id === "number" ? summary.campaign.id : index + 1,
    image: summary.campaign.logoURI || "/placeholder.svg",
    name: summary.campaign.name || "Unnamed coin",
    ticker: summary.campaign.symbol || "???",
    campaignAddress: summary.campaign.campaign,
    marketCap: summary.stats.marketCap || "—",
    progress: progress == null ? null : `${Number(progress).toFixed(0)}%`,
    status: graduated ? "graduated" : "live",
    timeAgo: campaign?.timeAgo || formatTimeAgo(summary.campaign.createdAt),
  };
}

function isDraftVisibleOnPublicProfile(draft: CampaignDraft) {
  if (draft.visibility !== "public") return false;
  if (draft.status === "archived") return false;
  return true;
}

function draftHref(draft: CampaignDraft) {
  return draft.slug ? `/prepare/${draft.slug}` : `/drafts/${draft.id}`;
}

export default function PublicProfile({
  profileWallet,
  isOwnProfile,
}: {
  profileWallet: string;
  isOwnProfile: boolean;
}) {
  const navigate = useNavigate();
  const wallet = useWallet();
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const anyWallet: any = wallet as any;
  const activeChainId = getActiveChainId(anyWallet?.chainId ?? null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [createdCoins, setCreatedCoins] = useState<PublicCoin[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(false);
  const [visibleDrafts, setVisibleDrafts] = useState<CampaignDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    const name = (profile?.displayName ?? "").trim();
    return name ? `@${name}` : shorten(profileWallet);
  }, [profile?.displayName, profileWallet]);

  const explorerUrl = useMemo(() => `${getExplorerBase(activeChainId)}/address/${profileWallet}`, [activeChainId, profileWallet]);
  const rank = useMemo(() => safeRank(profile), [profile]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingProfile(true);
      try {
        const p = await fetchUserProfile(activeChainId, profileWallet);
        if (!cancelled) setProfile(p);
      } catch (e) {
        console.warn("Failed to load public profile", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, profileWallet]);

  useEffect(() => {
    let cancelled = false;

    const loadCoins = async () => {
      setLoadingCoins(true);
      try {
        const campaigns = (await fetchCampaigns()) ?? [];
        const mine = campaigns.filter((campaign: any) => {
          const creator = String(campaign?.creator ?? campaign?.creatorAddress ?? "").toLowerCase();
          return creator === profileWallet.toLowerCase();
        });

        const settled = await Promise.allSettled(mine.map((campaign) => fetchCampaignSummary(campaign)));
        if (cancelled) return;

        const coins = settled
          .filter((item): item is PromiseFulfilledResult<CampaignSummary> => item.status === "fulfilled")
          .map((item, index) => coinFromSummary(item.value, index));

        setCreatedCoins(coins);
      } catch (e) {
        console.warn("Failed to load public created coins", e);
        if (!cancelled) setCreatedCoins([]);
      } finally {
        if (!cancelled) setLoadingCoins(false);
      }
    };

    loadCoins();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignSummary, profileWallet]);

  useEffect(() => {
    let cancelled = false;

    const loadDrafts = async () => {
      setLoadingDrafts(true);
      setDraftsError(null);
      try {
        const drafts = await fetchPublicCampaignDrafts({ chainId: activeChainId, limit: 100 });
        if (cancelled) return;

        setVisibleDrafts(
          drafts
            .filter((draft) => String(draft.creatorWallet || "").toLowerCase() === profileWallet.toLowerCase())
            .filter(isDraftVisibleOnPublicProfile)
        );
      } catch (e: any) {
        console.warn("Failed to load public profile drafts", e);
        if (!cancelled) {
          setDraftsError(String(e?.message || "Failed to load visible drafts."));
          setVisibleDrafts([]);
        }
      } finally {
        if (!cancelled) setLoadingDrafts(false);
      }
    };

    loadDrafts();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, profileWallet]);

  const copyAddress = () => {
    navigator.clipboard.writeText(profileWallet);
    toast.success("Address copied!");
  };

  return (
    <div className="w-full pb-10 pt-4 md:pt-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-border/50 bg-card/35 p-5 shadow-2xl backdrop-blur-md md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-accent/30 bg-accent/10">
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-retro text-3xl text-accent">
                    {profileWallet.slice(2, 4).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="mb-2 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-retro text-[10px] uppercase tracking-[0.18em] text-accent">
                  Public Profile
                </div>
                <h1 className="truncate font-retro text-2xl text-foreground md:text-4xl">
                  {loadingProfile ? "Loading profile..." : displayName}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{profileWallet}</span>
                  <button onClick={copyAddress} className="rounded p-1 hover:bg-muted" title="Copy address">
                    <Copy className="h-4 w-4" />
                  </button>
                  <a href={explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {profile?.bio ? (
                  <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">{profile.bio}</p>
                ) : (
                  <p className="mt-4 max-w-2xl text-sm text-muted-foreground">No public bio yet.</p>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:w-[280px]">
              <RankBadgeCard rank={rank} subtitle="Public rank" className="w-full" />
              {isOwnProfile ? (
                <Button onClick={() => navigate("/profile")} className="w-full font-retro">
                  Open Command Center
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-card/35 p-5 backdrop-blur-md">
            <h2 className="font-retro text-lg text-foreground">Badges</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/40 bg-background/30 p-4">
                <div className="font-retro text-sm text-foreground">Recruiter</div>
                <div className="mt-1 text-xs text-muted-foreground">Coming soon — recruiter status will appear here when enabled.</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/30 p-4">
                <div className="font-retro text-sm text-foreground">Squad</div>
                <div className="mt-1 text-xs text-muted-foreground">Coming soon — squad membership and public rank will appear here.</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/35 p-5 backdrop-blur-md">
            <h2 className="font-retro text-lg text-foreground">Reputation</h2>
            <p className="mt-4 text-sm text-muted-foreground">
              Coming soon — reputation will reflect creator history, battle activity, squad contribution, and platform trust signals.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border/50 bg-card/35 p-5 backdrop-blur-md">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-retro text-lg text-foreground">Created Coins</h2>
              <p className="text-xs text-muted-foreground">Public coins created by this wallet.</p>
            </div>
            <div className="text-xs text-muted-foreground">{createdCoins.length} visible</div>
          </div>

          {loadingCoins ? (
            <div className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">Loading created coins...</div>
          ) : createdCoins.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {createdCoins.map((coin) => (
                <button
                  key={coin.campaignAddress}
                  onClick={() => navigate(`/token/${coin.campaignAddress}`)}
                  className="rounded-xl border border-border/40 bg-background/30 p-4 text-left transition hover:border-accent/50 hover:bg-background/50"
                >
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="h-11 w-11 rounded-full object-cover" />
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{coin.name}</div>
                      <div className="text-xs text-muted-foreground">${coin.ticker}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div className="capitalize text-foreground">{coin.status ?? "live"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Market cap</div>
                      <div className="text-foreground">{coin.marketCap}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Progress</div>
                      <div className="text-foreground">{coin.progress ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Created</div>
                      <div className="text-foreground">{coin.timeAgo ?? "—"}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">No public created coins yet.</div>
          )}
        </section>

        <section className="rounded-2xl border border-border/50 bg-card/35 p-5 backdrop-blur-md">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-retro text-lg text-foreground">Visible Drafts</h2>
              <p className="text-xs text-muted-foreground">Only public Prepare Mode drafts are shown here.</p>
            </div>
            <div className="text-xs text-muted-foreground">{visibleDrafts.length} visible</div>
          </div>

          {loadingDrafts ? (
            <div className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">Loading visible drafts...</div>
          ) : draftsError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{draftsError}</div>
          ) : visibleDrafts.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDrafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => navigate(draftHref(draft))}
                  className="rounded-xl border border-border/40 bg-background/30 p-4 text-left transition hover:border-accent/50 hover:bg-background/50"
                >
                  <div className="flex items-center gap-3">
                    <img src={draft.logoUrl || "/placeholder.svg"} alt={draft.name} className="h-11 w-11 rounded-full object-cover" />
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{draft.name}</div>
                      <div className="text-xs text-muted-foreground">${draft.ticker}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Visibility</div>
                      <div className="capitalize text-foreground">{draft.visibility}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div className="capitalize text-foreground">{draft.status.replace(/_/g, " ")}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Category</div>
                      <div className="capitalize text-foreground">{draft.category || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Updated</div>
                      <div className="text-foreground">{formatTimeAgo(draft.updatedAt) || "—"}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
              No public drafts yet. Private and unlisted drafts stay out of the public profile.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/50 bg-card/35 p-5 backdrop-blur-md">
          <h2 className="font-retro text-lg text-foreground">Public Activity</h2>
          <p className="mt-3 text-sm text-muted-foreground">Coming soon — public activity will show visible platform actions without exposing private balances, claims, or notifications.</p>
        </section>
      </div>
    </div>
  );
}
