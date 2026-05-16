import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Define the type for a single social media item
export interface SocialItem {
  href: string;
  ariaLabel: string;
  tooltip: string;
  svgUrl: string;
  color: string;
}

// Define the props for the SocialTooltip component
export interface SocialTooltipProps extends React.HTMLAttributes<HTMLUListElement> {
  items: SocialItem[];
}

const SocialTooltip = React.forwardRef<HTMLUListElement, SocialTooltipProps>(
  ({ className, items, ...props }, ref) => {
    const baseIconStyles =
      "relative flex items-center justify-center w-10 h-10 rounded-full bg-transparent overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg";
    const baseSvgStyles =
      "relative z-10 w-5 h-5 grayscale brightness-75 transition-all duration-300 ease-in-out group-hover:grayscale-0 group-hover:brightness-100";
    const baseFilledStyles =
      "absolute bottom-0 left-0 w-full h-0 transition-all duration-300 ease-in-out group-hover:h-full";

    const isExternalHref = (href: string) => /^https?:\/\//i.test(href);

    return (
      <ul
        ref={ref}
        className={cn("flex items-center justify-center gap-3", className)}
        {...props}
      >
        {items.map((item, index) => {
          const external = isExternalHref(item.href);

          const Content = (
            <>
              <div className={cn(baseFilledStyles)} style={{ backgroundColor: item.color }} />
              <img src={item.svgUrl} alt={item.ariaLabel} className={cn(baseSvgStyles)} />
            </>
          );

          return (
            <li key={index} className="relative group">
              {external ? (
                <a
                  href={item.href}
                  aria-label={item.ariaLabel}
                  title={item.tooltip}
                  className={cn(baseIconStyles)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {Content}
                </a>
              ) : (
                <Link
                  to={item.href}
                  aria-label={item.ariaLabel}
                  title={item.tooltip}
                  className={cn(baseIconStyles)}
                >
                  {Content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
);

SocialTooltip.displayName = "SocialTooltip";

export { SocialTooltip };
