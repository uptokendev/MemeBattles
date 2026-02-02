import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

const SORT_DEFS: Array<{ value: NonNullable<HomeQuery["sort"]>; label: string }> = [
  { value: "default", label: "Default" },
  { value: "mcap_desc", label: "Market Cap: High → Low" },
  { value: "mcap_asc", label: "Market Cap: Low → High" },
  { value: "votes_desc", label: "Upvotes (24h): High → Low" },
  { value: "progress_desc", label: "Progress: High → Low" },
  { value: "created_desc", label: "Created: New → Old" },
  { value: "created_asc", label: "Created: Old → New" },
];

function numOrUndef(s: string): number | undefined {
  const raw = String(s ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function DiscoveryControls({ className, query, onChange }: DiscoveryControlsProps) {
  const searchValue = String(query.search ?? "");
  const timeChips = useMemo(() => ["1h", "24h", "7d", "all"] as const, []);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const forcedStatus = query.tab === "ending" ? "live" : query.tab === "dex" ? "graduated" : null;

  const statusValue = forcedStatus ?? (query.status ?? "all");
  const sortValue = query.sort ?? "default";

  // local controlled strings for numeric inputs (avoid NaN churn)
  const [mcapMin, setMcapMin] = useState<string>(query.mcapMinUsd != null ? String(query.mcapMinUsd) : "");
  const [mcapMax, setMcapMax] = useState<string>(query.mcapMaxUsd != null ? String(query.mcapMaxUsd) : "");
  const [pMin, setPMin] = useState<string>(query.progressMinPct != null ? String(query.progressMinPct) : "");
  const [pMax, setPMax] = useState<string>(query.progressMaxPct != null ? String(query.progressMaxPct) : "");

  // Keep local strings in sync when query is reset externally.
  useEffect(() => {
    setMcapMin(query.mcapMinUsd != null ? String(query.mcapMinUsd) : "");
    setMcapMax(query.mcapMaxUsd != null ? String(query.mcapMaxUsd) : "");
    setPMin(query.progressMinPct != null ? String(query.progressMinPct) : "");
    setPMax(query.progressMaxPct != null ? String(query.progressMaxPct) : "");
  }, [query.mcapMinUsd, query.mcapMaxUsd, query.progressMinPct, query.progressMaxPct]);

  const applyNumericFilters = () => {
    onChange({
      ...query,
      mcapMinUsd: numOrUndef(mcapMin),
      mcapMaxUsd: numOrUndef(mcapMax),
      progressMinPct: numOrUndef(pMin),
      progressMaxPct: numOrUndef(pMax),
    });
  };

  const resetFilters = () => {
    setMcapMin("");
    setMcapMax("");
    setPMin("");
    setPMax("");
    onChange({
      ...query,
      status: "all",
      mcapMinUsd: undefined,
      mcapMaxUsd: undefined,
      progressMinPct: undefined,
      progressMaxPct: undefined,
      sort: "default",
    });
  };

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
                  onClick={() => {
                    const nextTab = t.key;
                    const nextStatus = nextTab === "ending" ? "live" : nextTab === "dex" ? "graduated" : "all";
                    onChange({ ...query, tab: nextTab, status: nextStatus });
                  }}
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

        {/* Filters + sort + inline grid search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="border-border/60">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>

                <div className="mt-6 grid gap-5">
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={statusValue}
                      disabled={Boolean(forcedStatus)}
                      onValueChange={(v) => onChange({ ...query, status: v as any })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                        <SelectItem value="graduated">Graduated</SelectItem>
                      </SelectContent>
                    </Select>
                    {forcedStatus ? (
                      <div className="text-xs text-muted-foreground">
                        Status is locked to <span className="font-medium">{forcedStatus}</span> for this tab.
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label>Market Cap (USD) range</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={mcapMin}
                        onChange={(e) => setMcapMin(e.target.value)}
                        onBlur={applyNumericFilters}
                        placeholder="Min"
                        inputMode="decimal"
                        className="h-10 rounded-xl border border-border/50 bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <input
                        value={mcapMax}
                        onChange={(e) => setMcapMax(e.target.value)}
                        onBlur={applyNumericFilters}
                        placeholder="Max"
                        inputMode="decimal"
                        className="h-10 rounded-xl border border-border/50 bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Uses best-effort BNB/USD conversion. If price is unavailable, Market Cap filtering may hide unknown values.
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Progress (%) range</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={pMin}
                        onChange={(e) => setPMin(e.target.value)}
                        onBlur={applyNumericFilters}
                        placeholder="Min"
                        inputMode="decimal"
                        className="h-10 rounded-xl border border-border/50 bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <input
                        value={pMax}
                        onChange={(e) => setPMax(e.target.value)}
                        onBlur={applyNumericFilters}
                        placeholder="Max"
                        inputMode="decimal"
                        className="h-10 rounded-xl border border-border/50 bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <Button variant="outline" onClick={resetFilters}>
                      Reset
                    </Button>
                    <Button
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                      onClick={() => {
                        applyNumericFilters();
                        setFiltersOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="hidden sm:block w-[220px]">
              <Select
                value={sortValue}
                onValueChange={(v) => onChange({ ...query, sort: v as any })}
              >
                <SelectTrigger className="h-9 rounded-xl border-border/50 bg-card/40">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_DEFS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

        {/* Mobile sort under controls */}
        <div className="sm:hidden">
          <Select
            value={sortValue}
            onValueChange={(v) => onChange({ ...query, sort: v as any })}
          >
            <SelectTrigger className="h-9 rounded-xl border-border/50 bg-card/40">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_DEFS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}