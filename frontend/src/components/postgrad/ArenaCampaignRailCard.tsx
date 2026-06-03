import { Link } from "react-router-dom";
import { Globe2 } from "lucide-react";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { PostGradCoinCard } from "@/components/postgrad/PostGradCoinCard";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { cn } from "@/lib/utils";

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

function RailFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mwz-hud-frame min-w-[440px] px-4 py-3", className)}>{children}</div>;
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
    <RailFrame>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <TacticalTag key={`${title}-${badge.label}`} label={badge.label} tone={badge.tone ?? "default"} />
        ))}
      </div>
      <div className="font-retro text-lg uppercase tracking-[0.03em] text-foreground">{title}</div>
      <div className="mt-1 font-retro text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{symbol}</div>
      <div className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{detail}</div>
    </RailFrame>
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

function ArenaSponsorSpotCard() {
  return (
    <RailLink href="/sponsorships/apply" className="block shrink-0 text-left">
      <RailFrame>
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Sponsor spot</div>
        <div className="mt-4 font-retro text-2xl uppercase tracking-[0.03em] text-foreground">Want to feature your project here?</div>
        <div className="mt-3 text-sm text-muted-foreground">Apply here.</div>
      </RailFrame>
    </RailLink>
  );
}

function getActionTone(label: string) {
  if (/website/i.test(label)) return "border-emerald-500/35 text-emerald-100 hover:bg-emerald-500/10";
  return "border-white/12 text-white hover:bg-white/8";
}

function RailAction({ action }: { action: ArenaCampaignRailAction }) {
  return (
    <RailLink
      href={action.href}
      className={cn(
        "inline-flex min-w-[144px] items-center justify-center border bg-black/20 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
        getActionTone(action.label),
      )}
    >
      {/website/i.test(action.label) ? <Globe2 className="mr-2 h-3.5 w-3.5" /> : null}
      {action.label}
    </RailLink>
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
      <RailFrame className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TacticalTag label={item.rankLabel} tone="hot" />
              <TacticalTag label={item.statusLabel} tone="sponsored" />
              {item.activeDatesLabel ? <TacticalTag label={item.activeDatesLabel} tone="default" /> : null}
            </div>
            <div className="flex items-start gap-4">
              <img src={item.imageUrl || "/placeholder.svg"} alt={item.title} className="h-20 w-20 shrink-0 border border-accent/30 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="font-retro text-lg uppercase tracking-[0.03em] text-foreground">{item.title}</div>
                <div className="mt-1 font-retro text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{item.symbol}</div>
                {item.summary ? <div className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{item.summary}</div> : null}
              </div>
            </div>
          </div>
          {sponsorWebsiteUrl ? (
            <div className="flex shrink-0 flex-col gap-2 pt-1">
              <RailAction action={{ label: "Website", href: sponsorWebsiteUrl }} />
              {!isExternalHref(item.href) ? <RailAction action={{ label: "Open placement", href: item.href }} /> : null}
            </div>
          ) : null}
        </div>
      </RailFrame>
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

  // Direct use of PostGradCoinCard (no extra RailFrame wrapper)
  // When actions are provided, do NOT pass href to PostGradCoinCard.
  // This prevents nested <a> tags (RailAction links inside the card's own Link).
  // The actions themselves provide the navigation.
  const coinCard = (
    <PostGradCoinCard
      imageUrl={item.imageUrl}
      rank={item.rankLabel}
      name={item.title}
      symbol={item.symbol}
      metrics={
        <div className="text-sm text-muted-foreground">
          {item.summary || item.detail}
        </div>
      }
      actions={
        cardActions.length > 0 ? (
          <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
            {cardActions.map((action) => (
              <RailAction key={`${item.id}-${action.href}-${action.label}`} action={action} />
            ))}
          </div>
        ) : null
      }
      href={cardActions.length > 0 ? undefined : item.href}
      borderTone="success"
      className="w-[420px] flex-shrink-0"
    />
  );

  return coinCard;
}

export function ArenaCampaignRail({
  items,
  rankTone = "success",
  emptyLabel,
  emptyVariant = "default",
  loading = false,
  actionBuilder,
  scrollRef,
}: {
  items: ArenaCampaignRailItem[];
  rankTone?: "default" | "hot" | "sponsored" | "success";
  emptyLabel: string;
  emptyVariant?: "default" | "sponsor";
  loading?: boolean;
  actionBuilder?: (item: ArenaCampaignRailItem) => ArenaCampaignRailAction[];
  scrollRef?: React.RefObject<HTMLDivElement>;
}) {
  const baseClass = scrollRef 
    ? "flex gap-3 pb-2 snap-x snap-mandatory scroll-smooth" 
    : "flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-accent/50 scrollbar-track-muted";

  if (items.length) {
    return (
      <div ref={scrollRef} className={baseClass} style={scrollRef ? { scrollbarWidth: "none" } as React.CSSProperties : undefined}>
        {items.map((item) => (
          <ArenaCampaignRailCard key={item.id} item={item} rankTone={rankTone === "sponsored" ? "hot" : rankTone} actions={actionBuilder?.(item)} />
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div ref={scrollRef} className={baseClass} style={scrollRef ? { scrollbarWidth: "none" } as React.CSSProperties : undefined}>
        {[0, 1].map((index) => (
          <RailFrame key={index} className="shrink-0">
            <div className="h-4 w-24 bg-muted" />
            <div className="mt-4 flex items-start gap-4">
              <div className="h-20 w-20 bg-muted" />
              <div className="flex-1">
                <div className="h-5 w-40 bg-muted" />
                <div className="mt-3 h-3 w-full max-w-[280px] bg-muted" />
                <div className="mt-2 h-3 w-full max-w-[220px] bg-muted" />
              </div>
            </div>
          </RailFrame>
        ))}
      </div>
    );
  }

  if (emptyVariant === "sponsor") {
    return (
      <div ref={scrollRef} className={baseClass} style={scrollRef ? { scrollbarWidth: "none" } as React.CSSProperties : undefined}>
        <ArenaSponsorSpotCard />
      </div>
    );
  }

  return <RailFrame className="w-full min-w-0 p-5 text-sm text-muted-foreground">{emptyLabel}</RailFrame>;
}
