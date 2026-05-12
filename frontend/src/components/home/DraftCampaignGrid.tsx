import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Radio, ShieldCheck, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveImageUri } from "@/lib/media";
import { useLaunchpad } from "@/lib/launchpadClient";
import {
  fetchCampaignDraft,
  fetchPublicCampaignDrafts,
  type CampaignDraft,
  type DraftPopularity,
} from "@/lib/draftApi";
import type { HomeQuery } from "./CampaignGrid";

type DraftCampaignVM = {
  draft: CampaignDraft;
  mission: string;
  popularity: DraftPopularity | null;
};

const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled"]);

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function readinessLabel(status: string) {
  if (status === "ready_to_launch") return "Ready to launch";
  if (status === "scheduled") return "Scheduled";
  if (status === "promotion_published") return "Promotion live";
  return "Preparing";
}

function formatCreatedAt(value?: string | null) {
  if (!value) return "—";

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";

  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function heatClass(label?: string) {
  if (label === "On Fire") return "border-accent/70 text-accent";
  if (label === "Hot") return "border-accent/60 text-accent/85";
  if (label === "Warming") return "border-success/55 text-success";
  return "border-success/30 text-success/65";
}

function matchesSearch(item: DraftCampaignVM, search?: string) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;

  const draft = item.draft;
  return [
    draft.name,
    draft.ticker,
    draft.description,
    draft.creatorWallet,
    item.mission,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function sortDrafts(items: DraftCampaignVM[], sort: HomeQuery["sort"] | undefined) {
  const byCreatedDesc = (a: DraftCampaignVM, b: DraftCampaignVM) =>
    String(b.draft.createdAt).localeCompare(String(a.draft.createdAt));

  if (sort === "created_asc") {
    return items.slice().sort((a, b) => String(a.draft.createdAt).localeCompare(String(b.draft.createdAt)));
  }

  if (sort === "created_desc") {
    return items.slice().sort(byCreatedDesc);
  }

  return items.slice().sort((a, b) => {
    const ar = Number(a.popularity?.rankingScore ?? 0);
    const br = Number(b.popularity?.rankingScore ?? 0);

    if (br !== ar) return br - ar;
    return byCreatedDesc(a, b);
  });
}

export function DraftCampaignGrid({ className, query }: { className?: string; query: HomeQuery & { tab?: string } }) {
  const { activeChainId } = useLaunchpad();
  const [items, setItems] = useState<DraftCampaignVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadDrafts() {
      setLoading(true);
      setErr(null);

      try {
        const drafts = await fetchPublicCampaignDrafts({
          chainId: activeChainId,
          limit: 50,
        });

        const candidates = drafts
          .filter((draft) => Number(draft.chainId) === Number(activeChainId))
          .filter((draft) => draft.visibility === "public")
          .filter((draft) => PUBLIC_DRAFT_STATUSES.has(String(draft.status)))
          .filter((draft) => !draft.campaignAddress && String(draft.status) !== "deployed")
          .slice(0, 24);

        const hydrated = await Promise.all(
          candidates.map(async (draft) => {
            try {
              const bundle = await fetchCampaignDraft(draft.id);

              return {
                draft: bundle.draft,
                mission:
                  bundle.promotion?.missionStatement ||
                  bundle.promotion?.creatorNote ||
                  bundle.draft.description ||
                  "Creator is preparing the campaign before the battlefield opens.",
                popularity: bundle.popularity ?? null,
              };
            } catch {
              return {
                draft,
                mission:
                  draft.description ||
                  "Creator is preparing the campaign before the battlefield opens.",
                popularity: null,
              };
            }
          })
        );

        if (alive) setItems(hydrated);
      } catch (e: any) {
        if (alive) setErr(e?.message || "Failed to load draft campaigns.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadDrafts();

    return () => {
      alive = false;
    };
  }, [activeChainId]);

  const visibleItems = useMemo(() => {
    return sortDrafts(
      items.filter((item) => matchesSearch(item, query.search)),
      query.sort
    );
  }, [items, query.search, query.sort]);

  const resultsMeta = `Showing ${visibleItems.length} draft campaigns`;
  const gridClass = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">{resultsMeta}</div>
      </div>

      {loading && visibleItems.length === 0 ? (
        <div className={gridClass}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[322px] w-full animate-pulse border border-success/25 bg-black/60"
            />
          ))}
        </div>
      ) : err ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{err}</div>
      ) : visibleItems.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No public draft campaigns yet. Published Prepare Pages will appear in this row before trading goes live.
        </div>
      ) : (
        <div className={gridClass}>
          {visibleItems.map(({ draft, mission, popularity }) => {
            const heat = popularity?.heatLabel || "Cold";
            const follows = Number(popularity?.follows ?? 0);
            const popularityPct = Number(popularity?.popularityPercentage ?? 0);
            const logo = resolveImageUri(draft.logoUrl) || "/placeholder.svg";

            return (
              <article
                key={draft.id}
                className="mwz-card group relative flex min-h-[322px] w-full flex-col overflow-hidden rounded-none border-success/30 bg-black/70"
              >
                <Link to={`/prepare/${encodeURIComponent(draft.slug)}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-success/25 bg-black">
                    <div className="absolute inset-0 z-10 mwz-stat-grid opacity-25 pointer-events-none" />

                    <img
                      src={logo}
                      alt={draft.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      draggable={false}
                      loading="lazy"
                    />

                    <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),transparent_42%,rgba(0,0,0,0.72))]" />

                    <div className="absolute left-2 top-2 z-30 inline-flex items-center gap-1 border border-success/55 bg-black/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-success">
                      <ShieldCheck className="h-3 w-3" />
                      Prepare Mode
                    </div>

                    <div
                      className={cn(
                        "absolute right-2 top-2 z-30 inline-flex items-center gap-1 border bg-black/80 px-2 py-1 text-[10px] uppercase tracking-[0.12em]",
                        heatClass(heat)
                      )}
                    >
                      <Flame className="h-3 w-3" />
                      {heat}
                    </div>
                  </div>
                </Link>

                <div className="flex flex-1 flex-col p-3 text-success">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/prepare/${encodeURIComponent(draft.slug)}`} className="block">
                        <div className="mwz-section-title truncate text-lg leading-none hover:text-accent">
                          {draft.name}
                        </div>
                      </Link>

                      <div className="mt-1 truncate text-sm text-success/70">
                        {draft.ticker ? `$${draft.ticker}` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-success/50">
                      {formatCreatedAt(draft.createdAt)}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-y border-success/20 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">
                        Creator
                      </div>
                      <div className="truncate text-success/75">
                        {shortAddr(draft.creatorWallet)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">
                        Readiness
                      </div>
                      <div className="text-success">{readinessLabel(String(draft.status))}</div>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-success/70">
                    {mission}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-success/20 bg-black/45 p-2">
                      <div className="flex items-center gap-1 text-success/50">
                        <Star className="h-3 w-3" />
                        Watchlist
                      </div>
                      <div className="mt-1 text-sm text-success">{follows}</div>
                    </div>

                    <div className="border border-success/20 bg-black/45 p-2">
                      <div className="flex items-center gap-1 text-success/50">
                        <Radio className="h-3 w-3" />
                        Popularity
                      </div>
                      <div className="mt-1 text-sm text-success">
                        {Number.isFinite(popularityPct) ? `${popularityPct}%` : "0%"}
                      </div>
                    </div>
                  </div>

                  <Link
                    to={`/prepare/${encodeURIComponent(draft.slug)}`}
                    className="mwz-button mwz-button-active mt-auto inline-flex h-9 items-center justify-center px-3 text-[10px] uppercase tracking-[0.16em]"
                  >
                    View Promotion Page
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
