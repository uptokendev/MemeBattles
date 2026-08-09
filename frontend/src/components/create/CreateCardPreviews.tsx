/**
 * Presentational Launchpad card previews for the Create wizard.
 * Live preview mirrors CampaignCard layout (no follow/upvote side effects).
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
        "mwz-hud-frame relative flex w-full max-w-[200px] flex-col overflow-hidden border-success/30",
        "min-h-0",
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

      <div className="flex flex-1 flex-col p-2.5 text-success">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mwz-section-title truncate text-base leading-none">{displayName}</div>
            <div className="mt-1 truncate text-sm text-success/70">{displayTicker}</div>
          </div>
          <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-success/50">now</div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-y border-success/20 py-1.5 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Creator</div>
            <div className="truncate text-success/75">{shortAddr(creatorWallet)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/45">Readiness</div>
            <div className="text-success">Draft</div>
          </div>
        </div>

        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-success/70">{blurb}</p>

        <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
          <div className="border border-success/20 bg-black/40 p-1.5">
            <div className="flex items-center gap-1 text-success/50">
              <Star className="h-3 w-3" /> Watchlist
            </div>
            <div className="mt-0.5 text-sm text-success">0</div>
          </div>
          <div className="border border-success/20 bg-black/40 p-1.5">
            <div className="flex items-center gap-1 text-success/50">
              <Radio className="h-3 w-3" /> Popularity
            </div>
            <div className="mt-0.5 text-sm text-success">0%</div>
          </div>
        </div>

        <div className="mwz-button mwz-button-active mt-2 inline-flex h-8 items-center justify-center px-3 text-[10px] uppercase tracking-[0.16em] opacity-80">
          View Promotion Page
        </div>
      </div>
    </article>
  );
}

/** Exact Showcase CampaignCard chrome — decorative only (no nav / follow / upvote). */
export function CreateLiveCardPreview({
  name,
  symbol,
  logoUrl,
  creator,
  description,
  className,
}: {
  name: string;
  symbol: string;
  logoUrl?: string;
  creator?: string;
  description?: string;
  className?: string;
}) {
  const logo = logoUrl?.trim() || "/placeholder.svg";
  const displayName = name.trim() || "Your coin name";
  const displaySymbol = symbol.trim() ? `$${symbol.trim().replace(/^\$/, "")}` : "$TICKER";
  const blurb = description?.trim();

  return (
    <article
      className={cn(
        "mwz-card group relative flex w-full max-w-[200px] flex-col overflow-hidden rounded-none",
        "min-h-0 border-success/35 bg-black/70",
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden border-b border-success/25 bg-black">
        <div className="mwz-stat-grid pointer-events-none absolute inset-0 z-10 opacity-30" />
        <img src={logo} alt={displayName} className="h-full w-full bg-black object-cover" draggable={false} />
        <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),transparent_45%,rgba(0,0,0,0.62))]" />
        <div className="absolute left-2 top-2 z-30 border border-success/55 bg-black/75 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-success shadow-[0_0_12px_rgba(57,255,79,0.14)]">
          LIVE
        </div>
        <div className="absolute right-2 top-2 z-30 inline-flex items-center gap-1 border border-accent/60 bg-black/75 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-accent">
          <Flame className="h-3 w-3" />
          0/24h
        </div>
      </div>

      <div className="flex flex-1 flex-col p-2.5 text-success">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mwz-section-title truncate text-base leading-none">{displayName}</div>
            <div className="mt-1 truncate text-sm text-success/70">{displaySymbol}</div>
          </div>
          <div className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-success/55">now</div>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <img
            src="/assets/profile_placeholder.png"
            alt="Creator"
            className="h-6 w-6 rounded-full border border-success/35 object-cover"
            draggable={false}
          />
          <div className="truncate text-xs text-success/65">{shortAddr(creator)}</div>
        </div>

        {blurb ? (
          <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-success/65">{blurb}</p>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-2 border-y border-success/20 py-1.5">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">MCap</div>
            <div className="truncate text-sm text-success">—</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">Curve</div>
            <div className="truncate text-sm text-success">0%</div>
          </div>
        </div>

        <div className="mt-2">
          <div className="h-2 border border-success/30 bg-black/70 p-[1px] shadow-[inset_0_0_12px_rgba(57,255,79,0.08)]">
            <div className="h-full w-0 bg-[linear-gradient(90deg,var(--mwz-orange),var(--mwz-green))]" />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-success/70">
          <span>ATH —</span>
          <span>0%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden border border-success/25 bg-black/60">
          <div className="h-full w-0 bg-[linear-gradient(90deg,#fb923c,#22c55e)]" />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            disabled
            aria-label="Follow (preview)"
            title="Follow (preview only)"
            className="mwz-button flex h-8 w-8 cursor-default items-center justify-center opacity-90"
          >
            <Star className="h-4 w-4 text-success/75" />
          </button>
          <button
            type="button"
            disabled
            className="mwz-button mwz-button-active h-8 cursor-default px-3 text-[10px] opacity-90"
          >
            UP VOTE
          </button>
        </div>
      </div>
    </article>
  );
}
