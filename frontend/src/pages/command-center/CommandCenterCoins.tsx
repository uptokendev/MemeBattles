import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, FileText, Rocket } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { fetchOwnerCampaignDrafts, type CampaignDraft } from "@/lib/draftApi";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function draftHref(draft: CampaignDraft) {
  return draft.slug ? `/prepare/${draft.slug}` : `/drafts/${draft.id}`;
}

export default function CommandCenterCoins() {
  const { walletAddress, chainId, created } = useCommandCenterData();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDrafts(true);
    setDraftsError(null);

    void fetchOwnerCampaignDrafts(walletAddress, { chainId, limit: 100 })
      .then((items) => {
        if (!cancelled) setDrafts(Array.isArray(items) ? items : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setDrafts([]);
          setDraftsError(String(err?.message || "Failed to load owned drafts."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDrafts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, chainId]);

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Coins & Drafts"
        description="Coins you launched and Prepare Mode drafts owned by this wallet."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card/25 p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Launched coins</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{created.length.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/25 p-4">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Prepare drafts</span>
          </div>
          <div className="font-retro text-2xl text-foreground">{loadingDrafts ? "..." : drafts.length.toLocaleString()}</div>
        </div>
        <Link to="/create" className="rounded-2xl border border-border/50 bg-card/25 p-4 transition hover:border-accent/50 hover:bg-card/45">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Create</span>
          </div>
          <div className="font-retro text-2xl text-foreground">New coin</div>
        </Link>
      </div>

      <CommandCenterCard title="Launched coins" description="Campaigns created by this wallet.">
        {created.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {created.map((coin: any) => {
              const campaignAddress = String(coin?.campaignAddress || coin?.campaign?.campaign || coin?.campaign || "");
              const name = String(coin?.name || coin?.campaign?.name || "Unnamed coin");
              const ticker = String(coin?.ticker || coin?.symbol || coin?.campaign?.symbol || "???");
              const image = String(coin?.image || coin?.logoURI || coin?.campaign?.logoURI || "/placeholder.svg");
              const marketCap = String(coin?.marketCap || coin?.stats?.marketCap || "—");
              const href = campaignAddress ? `/token/${campaignAddress}` : "/command/coins";

              return (
                <Link key={`${campaignAddress}-${name}`} to={href} className="rounded-2xl border border-border/50 bg-background/25 p-4 transition hover:border-accent/50 hover:bg-card/35">
                  <div className="flex items-center gap-3">
                    <img src={image} alt={name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{name}</div>
                      <div className="text-xs text-muted-foreground">${ticker}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Market cap</div>
                      <div className="text-foreground">{marketCap}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Status</div>
                      <div className="capitalize text-foreground">{String(coin?.status || "live")}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
            No launched coins yet.
          </div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Prepare drafts" description="Drafts owned by this wallet.">
        {loadingDrafts ? (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">Loading drafts...</div>
        ) : draftsError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">{draftsError}</div>
        ) : drafts.length > 0 ? (
          <div className="grid gap-0 overflow-hidden rounded-2xl border border-border/50 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                to={draftHref(draft)}
                className="rounded-none border-0 border-b border-r border-border/50 bg-background/25 p-4 transition hover:bg-card/35"
              >
                <div className="flex items-center gap-3">
                  <img src={draft.logoUrl || "/placeholder.svg"} alt={draft.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                  <div className="min-w-0">
                    <div className="truncate font-retro text-sm text-foreground">{draft.name}</div>
                    <div className="text-xs text-muted-foreground">${draft.ticker}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="capitalize text-foreground">{draft.status.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Visibility</div>
                    <div className="capitalize text-foreground">{draft.visibility}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Updated</div>
                    <div className="text-foreground">{formatDate(draft.updatedAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Category</div>
                    <div className="capitalize text-foreground">{draft.category || "—"}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4 text-sm text-muted-foreground">
            No Prepare drafts yet.
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
