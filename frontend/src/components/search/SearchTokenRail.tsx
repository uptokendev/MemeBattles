import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SearchOverlayCard, formatSearchMcapUsd } from "@/components/search/SearchOverlayCard";
import type { SearchRailToken } from "@/hooks/useSearchDiscovery";

export function SearchTokenRail({
  title,
  tokens,
  usdPrice,
  onSelect,
}: {
  title: string;
  tokens: SearchRailToken[];
  usdPrice: number | null;
  onSelect: (token: SearchRailToken) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  if (!tokens.length) return null;

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="grid h-7 w-7 place-items-center border border-border/60 text-muted-foreground hover:text-orange-200"
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="grid h-7 w-7 place-items-center border border-border/60 text-muted-foreground hover:text-orange-200"
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tokens.map((token) => {
          const native = Number(token.marketcapBnb);
          return (
            <SearchOverlayCard
              key={token.href}
              name={token.name}
              symbol={token.symbol}
              logoURI={token.logoURI}
              mcapLabel={formatSearchMcapUsd(Number.isFinite(native) ? native : null, usdPrice)}
              onClick={() => onSelect(token)}
            />
          );
        })}
      </div>
    </section>
  );
}
