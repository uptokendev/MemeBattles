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
    const baseTooltipStyles =
      "pointer-events-none absolute z-[120] bottom-[-40px] left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-sm text-white whitespace-nowrap rounded-md opacity-0 invisible shadow-[0_10px_28px_rgba(0,0,0,0.65)] transition-all duration-300 ease-in-out group-hover:opacity-100 group-hover:visible group-hover:bottom-[-50px]";

    const isExternalHref = (href: string) => /^https?:\/\//i.test(href);

    return (
      <ul
        ref={ref}
        className={cn("relative z-[70] flex items-center justify-center gap-3 overflow-visible", className)}
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
            <li key={index} className="relative group z-0 hover:z-[120]">
              {external ? (
                <a
                  href={item.href}
                  aria-label={item.ariaLabel}
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
                  className={cn(baseIconStyles)}
                >
                  {Content}
                </Link>
              )}

              <div className={cn(baseTooltipStyles)} style={{ backgroundColor: item.color }}>
                {item.tooltip}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
);

SocialTooltip.displayName = "SocialTooltip";

export { SocialTooltip };
