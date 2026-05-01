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
  const timeChips = useMemo(() => ["1h", "24h", "7d", "all"] as const, []);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const forcedStatus = query.tab === "ending" ? "live" : query.tab === "dex" ? "graduated" : null;
  const statusValue = forcedStatus ?? (query.status ?? "all");
  const sortValue = query.sort ?? "default";

  const [mcapMin, setMcapMin] = useState<string>(query.mcapMinUsd != null ? String(query.mcapMinUsd) : "");
  const [mcapMax, setMcapMax] = useState<string>(query.mcapMaxUsd != null ? String(query.mcapMaxUsd) : "");
  const [pMin, setPMin] = useState<string>(query.progressMinPct != null ? String(query.progressMinPct) : "");
  const [pMax, setPMax] = useState<string>(query.progressMaxPct != null ? String(query.progressMaxPct) : "");

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
    <div className={cn("mwz-hud-frame w-full px-3 py-3", className)}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TAB_DEFS.map((t) => {
            const active = query.tab === t.key;
            return (
              <Button
                key={t.key}
                variant="ghost"
                size="sm"
                className={cn("mwz-chip gap-2 h-9 px-3 font-retro text-xs", active && "mwz-chip-active")}
                onClick={() => {
                  const nextTab = t.key;
                  const nextStatus = nextTab === "ending" ? "live" : nextTab === "dex" ? "graduated" : "all";
                  onChange({ ...query, tab: nextTab, status: nextStatus });
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </Button>
            );
          })}

          <div className="hidden md:flex items-center gap-2 ml-2">
            {timeChips.map((k) => {
              const active = (query.timeFilter ?? "24h") === k;
              return (
                <Button
                  key={k}
                  size="sm"
                  variant="ghost"
                  className={cn("mwz-chip h-8 px-3 text-xs", active && "mwz-chip-active")}
                  onClick={() => onChange({ ...query, timeFilter: k })}
                >
                  {k.toUpperCase()}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-between md:justify-end">
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="mwz-button gap-2 h-9">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </SheetTrigger>

            <SheetContent side="bottom" className="mwz-panel border-success/40">
              <SheetHeader>
                <SheetTitle className="mwz-section-title">Filters</SheetTitle>
              </SheetHeader>

              <div className="mt-6 grid gap-5">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={statusValue} disabled={Boolean(forcedStatus)} onValueChange={(v) => onChange({ ...query, status: v as any })}>
                    <SelectTrigger className="rounded-none border-success/40 bg-black/40">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="graduated">Graduated</SelectItem>
                    </SelectContent>
                  </Select>
                  {forcedStatus ? <div className="text-xs mwz-muted">Status locked to {forcedStatus} for this command tab.</div> : null}
                </div>

                <div className="grid gap-2">
                  <Label>Market Cap (USD) range</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={mcapMin} onChange={(e) => setMcapMin(e.target.value)} onBlur={applyNumericFilters} placeholder="Min" inputMode="decimal" className="h-10 border border-success/40 bg-black/40 px-3 text-sm outline-none focus:ring-2 focus:ring-success/30" />
                    <input value={mcapMax} onChange={(e) => setMcapMax(e.target.value)} onBlur={applyNumericFilters} placeholder="Max" inputMode="decimal" className="h-10 border border-success/40 bg-black/40 px-3 text-sm outline-none focus:ring-2 focus:ring-success/30" />
                  </div>
                  <div className="text-xs mwz-muted">Uses best-effort BNB/USD conversion.</div>
                </div>

                <div className="grid gap-2">
                  <Label>Progress (%) range</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={pMin} onChange={(e) => setPMin(e.target.value)} onBlur={applyNumericFilters} placeholder="Min" inputMode="decimal" className="h-10 border border-success/40 bg-black/40 px-3 text-sm outline-none focus:ring-2 focus:ring-success/30" />
                    <input value={pMax} onChange={(e) => setPMax(e.target.value)} onBlur={applyNumericFilters} placeholder="Max" inputMode="decimal" className="h-10 border border-success/40 bg-black/40 px-3 text-sm outline-none focus:ring-2 focus:ring-success/30" />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button variant="outline" className="mwz-button" onClick={resetFilters}>Reset</Button>
                  <Button className="mwz-button mwz-button-active" onClick={() => { applyNumericFilters(); setFiltersOpen(false); }}>Apply</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="shrink-0 w-[220px]">
            <Select value={sortValue} onValueChange={(v) => onChange({ ...query, sort: v as any })}>
              <SelectTrigger className="mwz-chip h-9 rounded-none">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_DEFS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
