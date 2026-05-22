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
    <Link to={href} className="block shrink-0">
      {content}
    </Link>
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
  const cardActions = actions ?? [{ label: "Token details", href: item.href }];

  return (
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4 transition-colors hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-center gap-2">
        <TacticalTag label={item.rankLabel} tone={rankTone} />
        <TacticalTag label={item.statusLabel} tone={item.statusTone} />
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{item.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">{item.symbol}</div>
      <div className="mt-3 text-xs text-white/60">{item.detail}</div>
      {cardActions.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {cardActions.map((action) => (
            <Button key={`${item.id}-${action.href}-${action.label}`} asChild size="sm" variant="outline">
              <Link to={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ArenaCampaignRail({
  items,
  rankTone = "success",
  emptyLabel,
  loading = false,
  actionBuilder,
}: {
  items: ArenaCampaignRailItem[];
  rankTone?: "default" | "hot" | "sponsored" | "success";
  emptyLabel: string;
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
          <div key={index} className="min-w-[220px] rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="h-4 w-24 rounded-full bg-white/10" />
            <div className="mt-4 h-5 w-32 rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-44 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
      {emptyLabel}
    </div>
  );
}
