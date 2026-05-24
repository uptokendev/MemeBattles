import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Lock, Swords } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { useLaunchpad, type CampaignInfo } from "@/lib/launchpadClient";
import { ArenaSubnav } from "@/components/arena/ArenaSubnav";

function battleStatusForCampaign(campaign: CampaignInfo) {
  if (campaign.createdAt == null) {
    return {
      label: "Unavailable",
      eligibility: "Unavailable",
      reason: "Campaign metadata is still syncing.",
      canOpen: false,
    };
  }

  if (campaign.marketCap === "—") {
    return {
      label: "Syncing",
      eligibility: "Pending",
      reason: "Battle lifecycle is still being connected to the API.",
      canOpen: false,
    };
  }

  return {
    label: "Awaiting battle backend",
    eligibility: "Not yet eligible",
    reason: "Open-for-battle controls will unlock once the battle status endpoint is live.",
    canOpen: false,
  };
}

export default function ArenaBattles() {
  const wallet = useWallet();
  const { fetchCampaigns } = useLaunchpad();
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const next = await fetchCampaigns();
        if (!cancelled) setCampaigns(next ?? []);
      } catch (error) {
        console.error("[ArenaBattles] failed to load campaigns", error);
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns]);

  const creatorCoins = useMemo(() => {
    const account = String(wallet.account || "").toLowerCase();
    if (!account) return [];
    return campaigns.filter((campaign) => String(campaign.creator || "").toLowerCase() === account);
  }, [campaigns, wallet.account]);

  return (
    <div className="min-h-full pt-16 md:pt-16">
      <ArenaSubnav />

      <section className="mb-6 rounded-[28px] border border-border/60 bg-card/45 p-5 backdrop-blur-sm md:p-7">
        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-accent">Arena Battles</div>
        <h1 className="text-2xl font-semibold md:text-4xl">Creator battle controls and public match flow.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          This first pass locks the page and creator inventory into place while the battle runtime is being replaced with API-backed state.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-border/60 bg-card/45 p-4 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <Coins className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold md:text-base">Your Coins</h2>
          </div>

          {!wallet.isConnected ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
              Connect a creator wallet to see your battle-ready coins.
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
              Loading creator coins…
            </div>
          ) : creatorCoins.length ? (
            <div className="space-y-3">
              {creatorCoins.map((campaign) => {
                const status = battleStatusForCampaign(campaign);

                return (
                  <div key={campaign.campaign} className="rounded-2xl border border-border/50 bg-background/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link to={`/token/${campaign.campaign.toLowerCase()}`} className="text-sm font-semibold hover:text-accent">
                          {campaign.symbol || campaign.name}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{campaign.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Battle state</div>
                        <div className="text-sm font-medium">{status.label}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Eligibility</div>
                        <div className="mt-1 text-sm">{status.eligibility}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Reason</div>
                        <div className="mt-1 text-sm text-muted-foreground">{status.reason}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!status.canOpen}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>Set Open for Battle</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
              No creator coins were found for this wallet yet.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border/60 bg-card/45 p-4 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <Swords className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold md:text-base">Public Battle Feed</h2>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-5 text-sm text-muted-foreground">
              Live battles will appear here once the battle feed endpoint is in place.
            </div>
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-5 text-sm text-muted-foreground">
              Open-for-battle listings will land here from the creator status API.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
