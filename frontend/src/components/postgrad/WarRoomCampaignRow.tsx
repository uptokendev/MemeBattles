import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, Globe, Megaphone, ShoppingCart } from "lucide-react";
import type { CampaignInfo } from "@/lib/launchpadClient";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { CurvePriceChart } from "@/components/token/CurvePriceChart";
import { WarRoomTradePanel } from "@/components/postgrad/WarRoomTradePanel";
import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";
import { getWarRoomCampaignMetrics } from "@/features/postgrad/warRoomMetrics";
import { getChainLabel } from "@/lib/chainConfig";

function shortenAddress(value?: string | null) {
  const input = String(value ?? "").trim();
  if (!input) return "—";
  if (input.length <= 10) return input;
  return `${input.slice(0, 6)}…${input.slice(-4)}`;
}

function resolveExternalHref(raw?: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function formatAge(value?: number) {
  const createdAt = Number(value ?? 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return "new";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatStatus(value?: unknown) {
  const raw = String(value || "draft").replace(/_/g, " ").trim();
  return raw ? raw.replace(/^./, (letter) => letter.toUpperCase()) : "Draft";
}

function formatCompactNumber(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.trunc(n));
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-white">{value}</div>
    </div>
  );
}

function DraftInfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white/85">{value}</div>
    </div>
  );
}

function DraftTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">{label}</div>
      <p className="mt-1.5 text-sm leading-6 text-white/68">{value}</p>
    </div>
  );
}

export function WarRoomCampaignRow({ campaign, bnbUsd = 0 }: { campaign: CampaignInfo; bnbUsd?: number }) {
  const [expanded, setExpanded] = useState(false);

  const tokenRoute = getPostGradTokenDetailRoute(campaign.campaign);
  const websiteHref = resolveExternalHref(campaign.website);
  const xHref = campaign.xAccount ? `https://x.com/${campaign.xAccount.replace(/^@/, "")}` : null;
  const extraHref = resolveExternalHref(campaign.extraLink);
  const metrics = getWarRoomCampaignMetrics(campaign, bnbUsd);
  const isDraft = metrics.status === "draft";
  const statusLabel = metrics.status === "graduated" ? "Graduated" : metrics.status === "bonding" ? "Bonding" : "Draft";
  const statusTone = metrics.status === "graduated" ? "success" : metrics.status === "bonding" ? "hot" : "default";
  const chartSourceLabel = metrics.status === "graduated" ? "DEX chart" : metrics.status === "bonding" ? "Bonding chart" : "Chart";
  const rich = campaign as any;
  const promotionHref = String(rich.promotionHref || (rich.draftSlug ? `/prepare/${rich.draftSlug}` : rich.draftId ? `/drafts/${rich.draftId}` : ""));
  const draftDescription = String(rich.draftDescription || "No promotion description has been added yet.");
  const founderNote = String(rich.draftFounderNote || "No founder note has been added yet.");
  const draftStatus = formatStatus(rich.draftStatus);
  const chainLabel = getChainLabel(Number(rich.chainId)) || `Chain ${Number(rich.chainId || 0) || "unknown"}`;
  const draftFollows = formatCompactNumber(rich.draftFollowCount);
  const draftOptIns = formatCompactNumber(rich.draftOptInCount);
  const draftComments = formatCompactNumber(rich.draftCommentCount);

  const createdLabel = useMemo(() => formatAge(campaign.createdAt), [campaign.createdAt]);

  return (
    <div className="border-b border-white/8 last:border-b-0">
      <div className={isDraft
        ? "grid grid-cols-1 gap-2 px-2.5 py-2.5 transition-colors hover:bg-white/[0.025] lg:grid-cols-[minmax(320px,1.55fr)_110px_110px_110px] lg:items-center lg:gap-3 lg:px-4 lg:py-2.5"
        : "grid grid-cols-1 gap-2 px-2.5 py-2.5 transition-colors hover:bg-white/[0.025] lg:grid-cols-[minmax(320px,1.55fr)_110px_110px_110px_90px_130px_28px] lg:items-center lg:gap-3 lg:px-4 lg:py-2.5"}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="min-w-0 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-2.5">
            <img
              src={campaign.logoURI || "/placeholder.svg"}
              alt={campaign.name}
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).src = "/placeholder.svg";
              }}
              className="h-9 w-9 rounded-lg border border-white/10 object-cover lg:h-10 lg:w-10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="truncate text-[13px] font-semibold text-white lg:text-[15px]">{campaign.symbol || campaign.name}</div>
                <div className="truncate text-[11px] font-semibold text-white/45 lg:text-sm">{campaign.name}</div>
                <TacticalTag label={statusLabel} tone={statusTone} />
                {!isDraft && !metrics.hasRichStats ? <TacticalTag label="Syncing" tone="default" /> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/55 lg:text-[11px]">
                <span className="text-orange-300">{createdLabel}</span>
                <span>→</span>
                {isDraft ? <span className="text-yellow-300">Promotion page</span> : <span className="text-yellow-300">ATH {metrics.athLabel}</span>}
                <span>{shortenAddress(campaign.campaign)}</span>
                <span className="hidden sm:inline">Creator {shortenAddress(campaign.creator)}</span>
              </div>
            </div>
          </div>
        </button>

        {isDraft ? (
          <div className="grid grid-cols-3 gap-1.5 text-sm lg:contents">
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Follows" value={draftFollows} /></div>
              <div className="hidden font-semibold text-white lg:block">{draftFollows}</div>
            </div>
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Opt-Ins" value={draftOptIns} /></div>
              <div className="hidden font-semibold text-white lg:block">{draftOptIns}</div>
            </div>
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Comments" value={draftComments} /></div>
              <div className="hidden font-semibold text-white lg:block">{draftComments}</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3 lg:contents">
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="MCap" value={metrics.marketCapLabel} /></div>
              <div className="hidden font-semibold text-white lg:block">{metrics.marketCapLabel}</div>
            </div>
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Liquidity" value={metrics.liquidityLabel} /></div>
              <div className="hidden font-semibold text-white lg:block">{metrics.liquidityLabel}</div>
            </div>
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Volume" value={metrics.volumeLabel} /></div>
              <div className="hidden font-semibold text-white lg:block">{metrics.volumeLabel}</div>
            </div>
            <div className="lg:block">
              <div className="lg:hidden"><MobileMetric label="Holders" value={metrics.holdersLabel} /></div>
              <div className="hidden font-semibold text-white lg:block">{metrics.holdersLabel}</div>
            </div>
            <div className="col-span-2 sm:col-span-2 lg:col-span-1 lg:block">
              <div className="lg:hidden">
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-white/65">
                    <span>ATH {metrics.athLabel}</span>
                    <span>{metrics.athProgressPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#22c55e)]" style={{ width: `${metrics.athProgressPct}%` }} />
                  </div>
                </div>
              </div>
              <div className="hidden space-y-1 lg:block">
                <div className="flex items-center justify-between gap-2 text-xs text-white/65">
                  <span>{metrics.athLabel}</span>
                  <span>{metrics.athProgressPct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#22c55e)]" style={{ width: `${metrics.athProgressPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {!isDraft ? (
          <div className="flex items-center justify-between gap-2 lg:contents">
            {tokenRoute ? (
              <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-[11px] lg:hidden">
                <Link to={tokenRoute}>Token details</Link>
              </Button>
            ) : <div />}
            <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)} className="ml-auto h-8 px-2 lg:ml-0 lg:justify-self-end">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        isDraft ? (
          <div className="mx-2.5 mb-2.5 grid gap-3 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.88),rgba(8,9,12,0.94))] p-2.5 md:mx-3 md:mb-3 md:gap-4 md:p-4 xl:grid-cols-[0.52fr_1.48fr]">
            <div className="overflow-hidden rounded-[16px] border border-white/10 bg-black/35">
              <img
                src={campaign.logoURI || "/placeholder.svg"}
                alt={campaign.name}
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                }}
                className="h-40 w-full object-cover md:h-52 xl:h-full xl:min-h-[260px]"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3 md:rounded-[20px] md:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-2xl font-semibold text-white">{campaign.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <TacticalTag label="Not launched yet" tone="default" />
                      <TacticalTag label={draftStatus} tone="sponsored" />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <DraftInfoTile label="Ticker" value={campaign.symbol || "Draft"} />
                  <DraftInfoTile label="Chain" value={chainLabel} />
                  <DraftInfoTile label="Creator" value={shortenAddress(campaign.creator)} />
                  <DraftInfoTile label="Status" value={draftStatus} />
                </div>

                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  <DraftTextBlock label="Short description" value={draftDescription} />
                  <DraftTextBlock label="Founder note" value={founderNote} />
                </div>
              </div>

              <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3 md:rounded-[20px] md:p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {promotionHref ? (
                    <Button asChild size="sm" className="justify-between text-[11px] md:text-sm sm:col-span-2">
                      <Link to={promotionHref}>
                        Open promotion
                        <Megaphone className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {websiteHref ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm">
                      <a href={websiteHref} target="_blank" rel="noreferrer">
                        Website
                        <Globe className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {xHref ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm">
                      <a href={xHref} target="_blank" rel="noreferrer">
                        X account
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {extraHref ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm">
                      <a href={extraHref} target="_blank" rel="noreferrer">
                        Extra link
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-2.5 mb-2.5 grid gap-3 rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.88),rgba(8,9,12,0.94))] p-2.5 md:mx-3 md:mb-3 md:gap-4 md:p-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="order-2 min-h-[220px] rounded-[16px] border border-white/10 bg-black/30 p-2.5 md:min-h-[360px] md:rounded-[18px] md:p-3 xl:order-1">
              <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Chart</div>
                  <div className="mt-1 text-[13px] font-semibold text-white md:text-sm">Same market view as token details</div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <TacticalTag label={chartSourceLabel} tone="sponsored" />
                  <TacticalTag label={campaign.symbol} tone="default" />
                </div>
              </div>
              <CurvePriceChart campaignAddress={campaign.campaign} />
            </div>

            <div className="order-1 space-y-2.5 md:space-y-3 xl:order-2">
              <WarRoomTradePanel campaign={campaign} />

              <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3 md:rounded-[20px] md:p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Links</div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-4">
                  {tokenRoute ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm sm:col-span-2">
                      <Link to={tokenRoute}>
                        Open token details
                        <ShoppingCart className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {websiteHref ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm">
                      <a href={websiteHref} target="_blank" rel="noreferrer">
                        Website
                        <Globe className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {xHref ? (
                    <Button asChild size="sm" variant="outline" className="justify-between text-[11px] md:text-sm">
                      <a href={xHref} target="_blank" rel="noreferrer">
                        X account
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
