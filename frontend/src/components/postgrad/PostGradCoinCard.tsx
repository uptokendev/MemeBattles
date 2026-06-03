import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { resolveImageUri } from "@/lib/media";

/**
 * PostGradCoinCard
 * 
 * The canonical coin card for PostGrad surfaces.
 * 
 * Goal: Make all coin representations feel like the Featured Campaigns cards.
 * - Left: Image column (with optional rank badge)
 * - Right: Title, symbol, creator, metrics, actions
 * 
 * Different contexts can pass different metrics and buttons.
 * 
 * Exception: Campaign grids (Prepare/Drafts) keep their existing design.
 */

export interface PostGradCoinCardProps {
  imageUrl?: string | null;
  rank?: number | string;
  name: string;
  symbol?: string;
  creatorLabel?: string;
  creatorAvatarUrl?: string;
  onCreatorClick?: () => void;

  // Flexible metrics area (left side of actions)
  metrics?: ReactNode;

  // Primary actions (right side)
  actions?: ReactNode;

  // Optional bottom progress bar (e.g. ATH progress)
  progress?: {
    value: number; // 0-100
    label?: string;
  };

  href?: string;
  className?: string;

  // Visual variants
  borderTone?: "success" | "accent" | "default";
  imageOverlay?: "none" | "gradient";
}

export function PostGradCoinCard({
  imageUrl,
  rank,
  name,
  symbol,
  creatorLabel,
  creatorAvatarUrl,
  onCreatorClick,
  metrics,
  actions,
  progress,
  href,
  className,
  borderTone = "success",
  imageOverlay = "gradient",
}: PostGradCoinCardProps) {
  const borderClass = {
    success: "border-success/30",
    accent: "border-accent/40",
    default: "border-white/10",
  }[borderTone];

  // Rebuilt to match Featured exactly: single card, image flush to borders,
  // 1:1 split (grid-cols-2), no extra wrapper div around image.
  const cardContent = (
    <div className={cn(
      "mwz-hud-frame flex overflow-hidden rounded-none",
      "min-h-[204px]",
      borderClass,
      className
    )}>
      {/* Image side - exactly 50% width for true 1:1 split (matching previous state the user liked) */}
      <div className="relative w-1/2 bg-black border-r border-success/25 flex-shrink-0">
        <div className="absolute inset-0 mwz-stat-grid opacity-25 z-10 pointer-events-none" />
        <img
          src={resolveImageUri(imageUrl) || "/placeholder.svg"}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = "1";
              img.src = "/placeholder.svg";
            }
          }}
        />
        {imageOverlay === "gradient" && (
          <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),transparent_42%,rgba(0,0,0,0.68))]" />
        )}
        {rank != null && (
          <div className="absolute left-2 top-2 z-30 flex h-8 min-w-8 items-center justify-center border border-success/70 bg-black/75 px-2 text-lg text-success shadow-[0_0_14px_rgba(57,255,79,0.18)]">
            {rank}
          </div>
        )}
      </div>

      {/* Data / buttons side - exactly 50% width */}
      <div className="relative w-1/2 flex min-w-0 flex-col p-3 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mwz-section-title truncate text-lg leading-none">{name}</div>
            {symbol && (
              <div className="mt-1 truncate text-sm text-success/70"> ${symbol}</div>
            )}
          </div>

          {creatorLabel && (
            <div
              className="flex items-center gap-1.5 text-xs text-success/65 hover:text-orange-400 cursor-pointer shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onCreatorClick?.();
              }}
            >
              {creatorAvatarUrl && (
                <img
                  src={creatorAvatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full border border-success/35 object-cover"
                />
              )}
              <span className="truncate max-w-[110px]">{creatorLabel}</span>
            </div>
          )}
        </div>

        {metrics && (
          <div className="mt-3">
            {metrics}
          </div>
        )}

        {actions && (
          <div className="mt-auto pt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}

        {progress && (
          <div className="mt-auto pt-4">
            <div className="h-2 border border-success/30 bg-black/70 p-[1px]">
              <div
                className="h-full bg-[linear-gradient(90deg,var(--mwz-orange),var(--mwz-green))] shadow-[0_0_12px_rgba(57,255,79,0.22)] transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress.value))}%` }}
              />
            </div>
            {progress.label && (
              <div className="text-[9px] text-white/50 mt-0.5">{progress.label}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
