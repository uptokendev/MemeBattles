import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Radio, ShieldCheck, Star } from "lucide-react";

import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";
import {
  fetchCampaignDraft,
  fetchPublicCampaignDrafts,
  type DraftPopularity,
} from "@/lib/draftApi";
import { resolveImageUri } from "@/lib/media";
import { timestampSeconds, type CampaignDraftLifecycle } from "@/lib/scheduledLaunchApi";
import { cn } from "@/lib/utils";
import type { HomeQuery } from "./CampaignGrid";

type DraftCampaignVM = {
  draft: CampaignDraftLifecycle;
  mission: string;
  popularity: DraftPopularity | null;
};

const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled"]);

function shortAddr(value?: string | null) {
  const address = String(value || "");
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address || "—";
}

function ageLabel(value?: string | null) {
  const created = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(created)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function readiness(status: string) {
  if (status === "scheduled") return "Scheduled";
  if (status === "ready_to_launch") return "Ready to launch";
  return "Promotion live";
}

function scheduledLaunchSeconds(draft: CampaignDraftLifecycle) {
  return timestampSeconds(draft.scheduledLaunchAt);
}

function isFutureScheduledDraft(draft: CampaignDraftLifecycle, nowMs = Date.now()) {
  const launchAt = scheduledLaunchSeconds(draft);
  return Boolean(
    String(draft.status) === "scheduled" &&
      draft.campaignAddress &&
      launchAt &&
      launchAt > Math.floor(nowMs / 1000),
  );
}

function formatLaunchDate(value?: string | number | null) {
  const seconds = timestampSeconds(value);
  if (!seconds) return "Launch time unavailable";
  return "Launch " + new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

function matchesSearch(item: DraftCampaignVM, search?: string) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  return [
    item.draft.name,
    item.draft.ticker,
    item.draft.description,
    item.draft.creatorWallet,
    item.mission,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function sortDrafts(items: DraftCampaignVM[], sort: HomeQuery["sort"] | undefined, nowMs: number) {
  const created = (item: DraftCampaignVM) => String(item.draft.draftCreatedAt || item.draft.createdAt || "");
  const active = items.filter((item) => {
    if (String(item.draft.status) !== "scheduled") return String(item.draft.status) !== "deployed";
    return isFutureScheduledDraft(item.draft, nowMs);
  });

  if (sort === "progress_desc") {
    return active
      .filter((item) => isFutureScheduledDraft(item.draft, nowMs))
      .sort((a, b) => {
        const launchDiff = Number(scheduledLaunchSeconds(a.draft) || Number.MAX_SAFE_INTEGER)
          - Number(scheduledLaunchSeconds(b.draft) || Number.MAX_SAFE_INTEGER);
        return launchDiff || created(b).localeCompare(created(a));
      });
  }

  if (sort === "created_asc") return active.slice().sort((a, b) => created(a).localeCompare(created(b)));
  return active.slice().sort((a, b) => created(b).localeCompare(created(a)));
}

function isDiscoverableDraft(draft: CampaignDraftLifecycle, nowMs = Date.now()) {
  const status = String(draft.status);
  if (!PUBLIC_DRAFT_STATUSES.has(status)) return false;
  if (status === "scheduled") return isFutureScheduledDraft(draft, nowMs);
  return !draft.campaignAddress;
}

export function DraftCampaignGrid({ className, query }: { className?: string; query: HomeQuery & { tab?: string } }) {
  const [chainId] = useSelectedFeedChainId();
  const [items, setItems] = useState<DraftCampaignVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const eventChainId = Number(detail.chainId ?? NaN);
      if (Number.isFinite(eventChainId) && eventChainId !== Number(chainId)) return;
      setRefreshNonce((value) => value + 1);
    };
    window.addEventListener("memebattles:scheduledLaunchReached", refresh as EventListener);
    return () => window.removeEventListener("memebattles:scheduledLaunchReached", refresh as EventListener);
  }, [chainId]);

  useEffect(() => {
    if (!items.some((item) => String(item.draft.status) === "scheduled")) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const drafts = (await fetchPublicCampaignDrafts({ chainId, limit: 50 })) as CampaignDraftLifecycle[];
        const candidates = drafts
          .filter((draft) => Number(draft.chainId) === Number(chainId))
          .filter((draft) => draft.visibility === "public")
          .filter((draft) => isDiscoverableDraft(draft, Date.now()))
          .slice(0, 24);

        const hydrated = await Promise.all(
          candidates.map(async (draft): Promise<DraftCampaignVM> => {
            try {
              const bundle = await fetchCampaignDraft(draft.id);
              const hydratedDraft = bundle.draft as CampaignDraftLifecycle;
              return {
                draft: hydratedDraft,
                mission:
                  bundle.promotion?.missionStatement ||
                  bundle.promotion?.creatorNote ||
                  hydratedDraft.description ||
                  "Creator is preparing the campaign before the battlefield opens.",
                popularity: bundle.popularity || null,
              };
            } catch {
              return {
                draft,
                mission: draft.description || "Creator is preparing the campaign before the battlefield opens.",
                popularity: null,
              };
            }
          }),
        );

        if (!cancelled) setItems(hydrated);
      } catch (reason: any) {
        if (!cancelled) setError(reason?.message || "Failed to load draft campaigns.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, refreshNonce]);

  const visible = useMemo(
    () => sortDrafts(items.filter((item) => matchesSearch(item, query.search)), query.sort, nowMs),
    [items, query.search, query.sort, nowMs],
  );

  const gridClass = "flex flex-wrap items-start justify-start gap-3 sm:gap-4";
  const cardClass = "w-[calc(50%-0.375rem)] min-w-0 sm:w-[220px] lg:w-[230px]";

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 text-xs text-muted-foreground">Showing {visible.length} draft campaigns</div>

      {loading && !visible.length ? (
        <div className={gridClass}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className={cn("min-h-[322px] animate-pulse border border-success/25 bg-black/60", cardClass)} />
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>
      ) : !visible.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No public draft campaigns yet. Published Prepare Pages and timed on-chain launches appear here.
        </div>
      ) : (
        <div className={gridClass}>
          {visible.map(({ draft, mission, popularity }) => {
            const logo = resolveImageUri(draft.logoUrl) || "/placeholder.svg";
            const heat = popularity?.heatLabel || "Cold";
            const follows = Number(popularity?.follows || 0);
            const popularityPct = Number(popularity?.popularityPercentage || 0);
            const scheduled = isFutureScheduledDraft(draft, nowMs);
            const launchDate = scheduled ? formatLaunchDate(draft.scheduledLaunchAt) : "";

            return (
              <article key={draft.id} className={cn("mwz-hud-frame group relative flex min-h-[322px] flex-col overflow-hidden border-success/30", cardClass)}>
                <Link to={`/prepare/${encodeURIComponent(draft.slug)}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-success/25 bg-black/40">
                    <img src={logo} alt={draft.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} loading="lazy" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(56,58,58,0.05),transparent_42%,rgba(56,58,58,0.72))]" />
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 border border-success/55 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-orange-400">
                      <ShieldCheck className="h-3 w-3" />
                      {scheduled ? "Scheduled" : "Prepare Mode"}
                    </div>
                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 border border-orange-400/50 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-orange-300">
                      <Flame className="h-3 w-3" />
                      {heat}
                    </div>
                    {scheduled ? (
                      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-orange-400/35 bg-black/85 px-3 py-2 text-center text-[10px] uppercase tracking-[0.12em] text-orange-200 backdrop-blur-sm">
                        {launchDate}
                      </div>
                    ) : null}
                  </div>
                </Link>

                <div className="flex flex-1 flex-col p-3 text-success">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/prepare/${encodeURIComponent(draft.slug)}`} className="mwz-section-title block truncate text-lg leading-none hover:text-accent">
                        {draft.name}
                      </Link>
                      <div className="mt-1 truncate text-sm text-success/70">{draft.ticker ? `$${draft.ticker}` : ""}</div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-success/50">
                      {ageLabel(draft.draftCreatedAt || draft.createdAt)}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-y border-success/20 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Creator</div>
                       <Link
                         to={`/profile/${encodeURIComponent(draft.creatorWallet)}`}
                         className="block truncate text-success/75 hover:text-orange-300"
                         title={draft.creatorWallet}
                       >
                         {shortAddr(draft.creatorWallet)}
                       </Link>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Readiness</div>
                      <div className="max-w-[112px] text-success">{readiness(String(draft.status))}</div>
                    </div>
                  </div>


                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-success/70">{mission}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-success/20 bg-black/40 p-2">
                      <div className="flex items-center gap-1 text-success/50"><Star className="h-3 w-3" /> Watchlist</div>
                      <div className="mt-1 text-sm text-success">{follows}</div>
                    </div>
                    <div className="border border-success/20 bg-black/40 p-2">
                      <div className="flex items-center gap-1 text-success/50"><Radio className="h-3 w-3" /> Popularity</div>
                      <div className="mt-1 text-sm text-success">{Number.isFinite(popularityPct) ? `${popularityPct}%` : "0%"}</div>
                    </div>
                  </div>

                  <Link to={`/prepare/${encodeURIComponent(draft.slug)}`} className="mwz-button mwz-button-active mt-3 inline-flex h-9 items-center justify-center px-3 text-[10px] uppercase tracking-[0.16em]">
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
