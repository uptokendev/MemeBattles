import type { ReactNode } from "react";

type ContentContainerProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shared content width container.
 * Provides the consistent max-w-7xl reading width used by Command Center,
 * War Room, and other focused/tool surfaces.
 *
 * Usage:
 *   <ContentContainer className="space-y-3 px-1 pb-10">
 *     ...page content...
 *   </ContentContainer>
 *
 * Experiential/wide pages (homepage, Arena, TokenDetails, Prepare, etc.)
 * intentionally do NOT use this so they can remain full-bleed or multi-column spacious.
 */
export function ContentContainer({ children, className = "" }: ContentContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-[1480px] ${className}`}>
      {children}
    </div>
  );
}
