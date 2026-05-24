import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Coins, LineChart, Radar } from "lucide-react";
import { Link } from "react-router-dom";
import { useLaunchpad, type CampaignInfo, type CampaignSummary } from "@/lib/launchpadClient";

type WarRoomRow = {
  campaign: CampaignInfo;
  summary: CampaignSummary | null;
};

function formatStat(label: string, value: string) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

export default function WarRoom() {
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const [rows, setRows] = useState<WarRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const campaigns = (await fetchCampaigns()).slice(0, 12);
        const summaries = await Promise.all(
          campaigns.map(async (campaign) => {
            try {
              const summary = await fetchCampaignSummary(campaign);
              return { campaign, summary };
            } catch (error) {
              console.error("[WarRoom] summary failed", error);
              return { campaign, summary: null };
            }
          }),
        );

        if (!cancelled) setRows(summaries);
      } catch (error) {
        console.error("[WarRoom] failed to load", error);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignSummary]);

  const grouped = useMemo(() => {
    const live: WarRoomRow[] = [];
    const graduated: WarRoomRow[] = [];

    for (const row of rows) {
      if (row.summary?.metrics?.launched) graduated.push(row);
      else live.push(row);
    }

    return { live, graduated };
  }, [rows]);

  return (
    <div className="min-h-full pt-16 md:pt-16">
      <section className="mb-6 rounded-[28px] border border-border/60 bg-card/45 p-5 backdrop-blur-sm md:p-7">
        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-accent">War Room</div>
        <h1 className="text-2xl font-semibold md:text-4xl">Trader rows with inline expansion and one canonical deep link.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          War Room stays separate from Arena and sends deep token work back to the canonical token page instead of creating a second detail surface.
        </p>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-border/50 bg-card/35 px-4 py-8 text-sm text-muted-foreground">Loading War Room…</div>
      ) : (
        <div className="space-y-6">
          {[
            { title: "Graduated Coins", rows: grouped.graduated },
            { title: "Non-Graduated Coins", rows: grouped.live },
          ].map((group) => (
            <section key={group.title} className="space-y-3">
              <h2 className="text-sm font-semibold md:text-base">{group.title}</h2>

              {group.rows.length ? (
                <div className="space-y-3">
                  {group.rows.map((row) => {
                    const open = !!expanded[row.campaign.campaign];

                    return (
                      <div key={row.campaign.campaign} className="rounded-3xl border border-border/60 bg-card/45 backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [row.campaign.campaign]: !current[row.campaign.campaign],
                            }))
                          }
                          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <img
                              src={row.campaign.logoURI || "/placeholder.svg"}
                              alt={row.campaign.symbol}
                              className="h-11 w-11 rounded-full border border-border/50 object-cover"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{row.campaign.symbol || row.campaign.name}</div>
                              <div className="truncate text-xs text-muted-foreground">{row.campaign.name}</div>
                            </div>
                          </div>

                          <div className="hidden items-center gap-6 md:flex">
                            {formatStat("Market Cap", row.summary?.stats.marketCap || "—")}
                            {formatStat("Volume", row.summary?.stats.volume || "—")}
                            {formatStat("Holders", row.summary?.stats.holders || "—")}
                          </div>

                          <div className="shrink-0 text-muted-foreground">
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>

                        {open ? (
                          <div className="grid gap-4 border-t border-border/50 px-4 py-4 lg:grid-cols-3">
                            <div className="rounded-2xl border border-border/50 bg-background/20 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <LineChart className="h-4 w-4 text-accent" />
                                <span>Chart</span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                The canonical token page remains the chart source of truth for this coin.
                              </p>
                              <Link to={`/token/${row.campaign.campaign.toLowerCase()}`} className="mt-3 inline-block text-sm font-medium text-accent">
                                Open token chart →
                              </Link>
                            </div>

                            <div className="rounded-2xl border border-border/50 bg-background/20 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Coins className="h-4 w-4 text-accent" />
                                <span>Quick Trade</span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Buy and sell modules still live on the canonical token page while War Room rows stay compact.
                              </p>
                              <Link to={`/token/${row.campaign.campaign.toLowerCase()}`} className="mt-3 inline-block text-sm font-medium text-accent">
                                Open trade module →
                              </Link>
                            </div>

                            <div className="rounded-2xl border border-border/50 bg-background/20 p-4">
                              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                                <Radar className="h-4 w-4 text-accent" />
                                <span>Battle Intel</span>
                              </div>
                              <div className="space-y-2 text-sm text-muted-foreground">
                                <div>Holder count: {row.summary?.stats.holders || "—"}</div>
                                <div>Market cap: {row.summary?.stats.marketCap || "—"}</div>
                                <div>Status: {row.summary?.metrics?.launched ? "Graduated" : "Live on curve"}</div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
                  No coins are available in this section yet.
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
