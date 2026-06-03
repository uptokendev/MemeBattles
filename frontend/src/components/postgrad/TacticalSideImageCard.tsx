import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * TacticalSideImageCard
 *
 * Enforces a consistent card language across PostGrad surfaces:
 * - Fixed square image column (left by default, or right)
 * - Flexible content column with title, tags, summary, and metrics area
 * - mwz-hud-frame styling + consistent spacing/typography
 *
 * Use this (or a variant of it) for:
 * - Featured / Rail cards
 * - Battle participant cards
 * - League / Event cards
 * - War Room rows
 *
 * The goal: "kinda the same all around" even when the actual metrics differ.
 */

export interface TacticalSideImageCardProps {
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  imagePosition?: "left" | "right";
  href?: string;
  className?: string;
  children?: ReactNode;           // metrics, tags, summary, etc. go here
  footer?: ReactNode;             // actions, secondary info
  imageClassName?: string;
}

export function TacticalSideImageCard({
  imageUrl,
  title,
  subtitle,
  imagePosition = "left",
  href,
  className,
  children,
  footer,
  imageClassName,
}: TacticalSideImageCardProps) {
  const image = (
    <div className={cn(
      "relative h-20 w-20 shrink-0 overflow-hidden border border-accent/30 bg-black/40",
      imageClassName
    )}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = "1";
              img.src = "/placeholder.svg";
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/60">
          NO IMG
        </div>
      )}
    </div>
  );

  const content = (
    <div className="min-w-0 flex-1">
      <div className="font-retro text-base leading-tight text-foreground">{title}</div>
      {subtitle && (
        <div className="mt-0.5 font-retro text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {subtitle}
        </div>
      )}

      <div className="mt-3">
        {children}
      </div>
    </div>
  );

  const inner = (
    <div className={cn(
      "flex items-start gap-4",
      imagePosition === "right" && "flex-row-reverse"
    )}>
      {image}
      {content}
    </div>
  );

  const card = (
    <div className={cn("mwz-hud-frame p-4", className)}>
      {inner}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block transition hover:brightness-105">
        {card}
      </Link>
    );
  }

  return card;
}
