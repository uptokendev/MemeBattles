import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";

export type ArenaCampaignRailAction = {
  label: string;
  href: string;
};

export type ArenaFallbackRailBadge = {
  label: string;
  tone?: "default" | "hot" | "sponsored" | "success";
};

function isExternalHref(href?: string | null) {
  return /^https?:\/\//i.test(String(href ?? ""));
}

function RailLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (isExternalHref(href)) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

export function ArenaFallbackRailCard({
  title,
  symbol,
  detail,
  href,
  badges,
}: {
  title: string;
  symbol: string;
  detail: string;
  href?: string | null;
  badges: ArenaFallbackRailBadge[];
}) {
  const content = (
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <TacticalTag key={`${title}-${badge.label}`} label={badge.label} tone={badge.tone ?? "default"} />
        ))}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">{symbol}</div>
      <div className="mt-3 text-xs text-white/60">{detail}</div>
    </div>
  );

  if (!href) return content;

  return (
    <RailLink href={href} className="block shrink-0">
      {content}
    </RailLink>
  );
}

function dedupeActions(actions: ArenaCampaignRailAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.label}:${action.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emitSponsorSpotIntent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("memebattles:sponsorSpotIntent"));
}

function ArenaSponsorSpotCard() {
  return (
    <button
      type="button"
      onClick={emitSponsorSpotIntent}
      className="min-w-[256px] rounded-2xl border border-dashed border-amber-300/30 bg-amber-300/[0.06] p-5 text-left transition-colors hover:border-amber-200/50 hover:bg-amber-300/[0.1]"
    >
      <div className="text-[10px] uppercase tracking-[0.24em] text-amber-100/70">Sponsor spot</div>
      <div className="mt-3 text-lg font-semibold text-white">Want this sponsor spot?</div>
      <div className="mt-2 text-sm text-white/65">Click here.</div>
    </button>
  );
}

export function ArenaCampaignRailCard({
  item,
  rankTone = "success",
  actions,
}: {
  item: ArenaCampaignRailItem;
  rankTone?: "default" | "hot" | "sponsored" | "success";
  actions?: ArenaCampaignRailAction[];
}) {
  const isSponsored = item.cardVariant === "sponsored";
  const sponsorWebsiteUrl = item.websiteUrl || item.href;

  if (isSponsored) {
    return (
      <div className="min-w-[256px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4 transition-colors hover:bg-white/[0.07]">
        <img src={item.imageUrl || "/placeholder.svg"} alt={item.title} className="h-32 w-full rounded-2xl border border-white/10 object-cover" />
        <div className="mt-4 text-sm font-semibold text-white">{item.title}</div>
        {item.summary ? <div className="mt-2 text-xs leading-relaxed text-white/60">{item.summary}</div> : null}
        {sponsorWebsiteUrl ? (
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <RailLink href={sponsorWebsiteUrl}>Website</RailLink>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const defaultActions = dedupeActions(
    [
      item.websiteUrl && item.websiteUrl !== item.href
        ? { label: item.websiteLabel || "Website", href: item.websiteUrl }
        : null,
      item.href
        ? {
            label: isExternalHref(item.href) ? "Open" : "Token details",
            href: item.href,
          }
        : null,
    ].filter(Boolean) as ArenaCampaignRailAction[],
  );
  const cardActions = actions ?? defaultActions;

  const content = (
    <div className="min-w-[256px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4 transition-colors hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-center gap-2">
        <TacticalTag label={item.rankLabel} tone={rankTone} />
        <TacticalTag label={item.statusLabel} tone={item.statusTone} />
      </div>

      <div className="mt-4 flex items-start gap-3">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{item.title}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">{item.symbol}</div>
          <div className="mt-3 text-xs text-white/60">{item.summary || item.detail}</div>
        </div>
      </div>

      {item.summary && item.detail ? (
        <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/40">{item.detail}</div>
      ) : null}

      {item.activeDatesLabel ? (
        <div className="mt-3 text-xs text-cyan-100/75">Active {item.activeDatesLabel}</div>
      ) : null}

      {cardActions.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {cardActions.map((action) => (
            <Button key={`${item.id}-${action.href}-${action.label}`} asChild size="sm" variant="outline">
              <RailLink href={action.href}>{action.label}</RailLink>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (cardActions.length || !item.href) return content;

  return (
    <RailLink href={item.href} className="block shrink-0">
      {content}
    </RailLink>
  );
}

export function ArenaCampaignRail({
  items,
  rankTone = "success",
  emptyLabel,
  emptyVariant = "default",
  loading = false,
  actionBuilder,
}: {
  items: ArenaCampaignRailItem[];
  rankTone?: "default" | "hot" | "sponsored" | "success";
  emptyLabel: string;
  emptyVariant?: "default" | "sponsor";
  loading?: boolean;
  actionBuilder?: (item: ArenaCampaignRailItem) => ArenaCampaignRailAction[];
}) {
  if (items.length) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <ArenaCampaignRailCard key={item.id} item={item} rankTone={rankTone} actions={actionBuilder?.(item)} />
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="min-w-[256px] rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="h-4 w-24 rounded-full bg-white/10" />
            <div className="mt-4 flex items-start gap-3">
              <div className="h-16 w-16 rounded-2xl bg-white/10" />
              <div className="flex-1">
                <div className="h-5 w-32 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-44 rounded-full bg-white/10" />
                <div className="mt-2 h-3 w-32 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (emptyVariant === "sponsor") {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        <ArenaSponsorSpotCard />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
      {emptyLabel}
    </div>
  );
}
