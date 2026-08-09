/**
 * Presentational Launchpad card previews for the Create wizard.
 * No navigation, follow, or upvote side effects.
 */
import { Flame, Radio, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";

function shortAddr(addr?: string) {
  if (!addr) return "—";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

export function CreateDraftCardPreview({
  name,
  ticker,
  logoUrl,
  mission,
  creatorWallet,
  className,
}: {
  name: string;
  ticker: string;
  logoUrl?: string;
  mission?: string;
  creatorWallet?: string;
  className?: string;
}) {
  const logo = logoUrl?.trim() || "/placeholder.svg";
  const displayName = name.trim() || "Your coin name";
  const displayTicker = ticker.trim() ? `$${ticker.trim().replace(/^\$/, "")}` : "$TICKER";
  const blurb = mission?.trim() || "Your short description will appear here once you write it.";

  return (
    <article
      className={cn(
        "mwz-hud-frame relative flex w-full max-w-[240px] flex-col overflow-hidden border-success/30",
        "min-h-[300px]",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-success/25 bg-black/40">
        <img src={logo} alt={displayName} className="h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(56,58,58,0.05),transparent_42%,rgba(56,58,58,0.72))]" />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 border border-success/55 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-orange-400">
          <ShieldCheck className="h-3 w-3" />
          Prepare Mode
        </div>
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 border border-orange-400/50 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-orange-300">
          <Flame className="h-3 w-3" />
          Cold
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3 text-success">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mwz-section-title truncate text-lg leading-none">{displayName}</div>
            <div className="mt-1 truncate text-sm text-success/70">{displayTicker}</div>
          </div>
          <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-success/50">now</div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-y border-success/20 py-2 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Creator</div>
            <div className="truncate text-success/75" title={creatorWallet}>
              {shortAddr(creatorWallet)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Readiness</div>
            <div className="text-success">Draft</div>
          </div>
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-success/70">{blurb}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-success/20 bg-black/40 p-2">
            <div className="flex items-center gap-1 text-success/50">
              <Star className="h-3 w-3" /> Watchlist
            </div>
            <div className="mt-1 text-sm text-success">0</div>
          </div>
          <div className="border border-success/20 bg-black/40 p-2">
            <div className="flex items-center gap-1 text-success/50">
              <Radio className="h-3 w-3" /> Popularity
            </div>
            <div className="mt-1 text-sm text-success">0%</div>
          </div>
        </div>

        <div className="mwz-button mwz-button-active mt-3 inline-flex h-9 items-center justify-center px-3 text-[10px] uppercase tracking-[0.16em] opacity-80">
          View Promotion Page
        </div>
      </div>
    </article>
  );
}

export function CreateLiveCardPreview({
  name,
  symbol,
  logoUrl,
  creator,
  className,
}: {
  name: string;
  symbol: string;
  logoUrl?: string;
  creator?: string;
  className?: string;
}) {
  const logo = logoUrl?.trim() || "/placeholder.svg";
  const displayName = name.trim() || "Your coin name";
  const displaySymbol = symbol.trim() ? `$${symbol.trim().replace(/^\$/, "")}` : "$TICKER";

  return (
    <article className={cn("mwz-card flex w-full max-w-[240px] flex-col overflow-hidden", "min-h-[300px]", className)}>
      <div className="relative aspect-square overflow-hidden border-b border-border/40 bg-black/50">
        <img src={logo} alt={displayName} className="h-full w-full object-cover" draggable={false} />
        <div className="absolute left-2 top-2 border border-green-400/50 bg-black/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-green-300">
          LIVE
        </div>
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 border border-orange-400/40 bg-black/80 px-2 py-0.5 text-[10px] text-orange-200">
          <Flame className="h-3 w-3" /> 0
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{displayName}</div>
          <div className="truncate text-sm text-muted-foreground">
            {displaySymbol} · just now
          </div>
        </div>
        <div className="text-xs text-muted-foreground">Creator {shortAddr(creator)}</div>
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">MCap</div>
            <div className="font-semibold text-foreground">—</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Curve</div>
            <div className="font-semibold text-foreground">0%</div>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-0 rounded-full bg-[linear-gradient(90deg,#fb923c,#22c55e)]" />
        </div>
      </div>
    </article>
  );
}
