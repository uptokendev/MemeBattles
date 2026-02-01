import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { FeedTabKey, HomeQuery } from "./CampaignGrid";
import { Filter, Flame, Sparkles, Timer, TrendingUp } from "lucide-react";

type DiscoveryControlsProps = {
  className?: string;
  query: HomeQuery;
  onChange: (next: HomeQuery) => void;
};

const TAB_DEFS: Array<{ key: FeedTabKey; label: string; icon: ReactNode }> = [
  { key: "trending", label: "Trending", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "new", label: "New", icon: <Sparkles className="h-4 w-4" /> },
  { key: "ending", label: "Ending Soon", icon: <Timer className="h-4 w-4" /> },
  { key: "dex", label: "Trading on DEX", icon: <Flame className="h-4 w-4" /> },
];

export function DiscoveryControls({ className, query, onChange }: DiscoveryControlsProps) {
  const searchValue = String(query.search ?? "");

  const timeChips = useMemo(() => ["1h", "24h", "7d", "all"] as const, []);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col gap-3 md:gap-2">
        {/* Tabs row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border border-border/50 bg-card/40 p-1">
            {TAB_DEFS.map((t) => {
              const active = query.tab === t.key;
              return (
                <Button
                  key={t.key}
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2 rounded-lg font-retro",
                    active
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => onChange({ ...query, tab: t.key })}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Time chips (optional) */}
          <div className="hidden md:flex items-center gap-2">
            {timeChips.map((k) => {
              const active = (query.timeFilter ?? "24h") === k;
              return (
                <Button
                  key={k}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "h-8 px-3 rounded-lg",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => onChange({ ...query, timeFilter: k })}
                >
                  {k}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Filters + inline search (grid filter) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              Sort
            </Button>
          </div>

          <div className="relative w-full md:w-[320px]">
            <input
              value={searchValue}
              onChange={(e) => onChange({ ...query, search: e.target.value })}
              placeholder="Filter grid…"
              className="w-full h-9 rounded-xl border border-border/50 bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
