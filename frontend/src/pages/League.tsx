import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWallet } from "@/contexts/WalletContext";
import { getDefaultChainId, isAllowedChainId } from "@/lib/chainConfig";
import { LEAGUES, getLimit, periodLabel, type LeagueDef, type Period } from "@/lib/leagues";

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s ?? "").trim());
const shortAddr = (a: string) => (a && a.length > 12 ? a.slice(0, 6) + "..." + a.slice(-4) : a);

type LeagueBase = {
  campaign_address: string;
  name?: string | null;
  symbol?: string | null;
  logo_uri?: string | null;
};

type GraduationRow = LeagueBase & {
  duration_seconds?: number | null;
  unique_buyers?: number | null;
  sells_count?: number | null;
  buy_total_raw?: string | null;
};

type BiggestHitRow = LeagueBase & {
  buyer_address: string;
  bnb_amount_raw: string;
  tx_hash: string;
  block_number: number;
  block_time: string;
  log_index?: number | null;
};

type CrowdFavoriteRow = LeagueBase & {
  votes_count: string | number;
  unique_voters: string | number;
  amount_raw_sum: string;
};

type TopEarnerRow = {
  wallet: string;
  profit_raw: string;
  sells_raw?: string;
  buys_raw?: string;
  trades_count?: number;
};

type PrizeMeta = {
  basis: "league_fee_only";
  period: "weekly" | "monthly";
  cutoff?: string | null;
  rangeEnd?: string | null;
  computedAt: string;
  totalLeagueFeeRaw: string;
  leagueCount: number;
  winners: number;
  splitBps: number[];
  potRaw: string;
  payoutsRaw: [string, string, string, string, string];
};

type EpochMeta = {
  period: "weekly" | "monthly";
  epochOffset: number;
  epochStart: string;
  epochEnd: string;
  rangeEnd: string;
  status: "live" | "finalized";
};

type LeagueResponse<T> = {
  items: T[];
  warning?: string;
  prize?: PrizeMeta;
  epoch?: EpochMeta;
  stats?: { campaignsCreated?: number };
};

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function formatDuration(seconds?: number | null) {
  const s = Math.max(0, Number(seconds ?? 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatBnbFromRaw(raw?: string | null) {
  try {
    const v = BigInt(String(raw ?? "0"));
    const n = Number(ethers.formatUnits(v, 18));
    if (!Number.isFinite(n)) return "0";
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
  } catch {
    return "0";
  }
}

function RowToken({ logo, name, symbol, address }: { logo?: string | null; name?: string | null; symbol?: string | null; address: string }) {
  const title = (name ? String(name) : "") || "Unknown";
  const sym = (symbol ? String(symbol) : "") || "";
  const initial = sym ? sym.slice(0, 1).toUpperCase() : "T";

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="h-8 w-8">
        <AvatarImage src={logo || undefined} />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          {title} {sym ? <span className="text-muted-foreground">({sym})</span> : null}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{address}</div>
      </div>
    </div>
  );
}

function RowWallet({ address }: { address: string }) {
  const initial = address?.slice(2, 3)?.toUpperCase?.() || "W";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="h-8 w-8">
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">Trader</div>
        <div className="text-[11px] text-muted-foreground truncate">{isAddress(address) ? address : String(address ?? "")}</div>
      </div>
    </div>
  );
}

function formatIsoTiny(iso?: string | null) {
  try {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatUtcTiny(iso?: string | null) {
  try {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // Force UTC display regardless of client locale.
    return d.toLocaleString("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatEpochRangeUtc(epoch?: EpochMeta) {
  if (!epoch) return "";
  const start = formatUtcTiny(epoch.epochStart);
  // IMPORTANT:
  // epochEnd = actual period end (used for countdown + display)
  // rangeEnd = data cutoff (often "now") for live queries
  const end = formatUtcTiny(epoch.epochEnd);
  if (!start || !end) return "";
  return `${start} UTC → ${end} UTC`;
}

function formatEndsIn(epoch?: EpochMeta) {
  try {
    if (!epoch) return "";
    // Countdown should always be to the real period end.
    const endIso = epoch.epochEnd;
    if (!endIso) return "";
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(end)) return "";
    const now = Date.now();
    const diff = Math.max(0, end - now);
    const s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  } catch {
    return "";
  }
}

export default function League({ chainId = 97 }: { chainId?: number }) {
  const navigate = useNavigate();

  const wallet = useWallet();
  const defaultChain = getDefaultChainId();
  const activeChainId = wallet.isConnected && isAllowedChainId(wallet.chainId) ? Number(wallet.chainId) : Number(chainId ?? defaultChain);

  const [period, setPeriod] = useState<Period>("weekly");
  const [epochOffset, setEpochOffset] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Automatic refresh: hourly.
  const [refreshTick, setRefreshTick] = useState(0);

  const [data, setData] = useState<Record<string, unknown[]>>({});
  const [warnings, setWarnings] = useState<Record<string, string | undefined>>({});
  const [prizes, setPrizes] = useState<Record<string, PrizeMeta | undefined>>({});
  const [fallbackMonthlyPrize, setFallbackMonthlyPrize] = useState<PrizeMeta | undefined>(undefined);
  const [epochInfo, setEpochInfo] = useState<EpochMeta | undefined>(undefined);
  const [campaignsCreated, setCampaignsCreated] = useState<number | undefined>(undefined);

  // Live bulletin (Option B): polling diff on lightweight top snapshots.
  const [bulletinEvents, setBulletinEvents] = useState<Array<{ id: string; ts: number; text: string }>>([]);
  const prevBulletinRef = useRef<{
    leaders: Record<string, string[]>;
    pots: Record<string, string>;
    lastHashes: string[];
  } | null>(null);


  const periodButtons = useMemo(() => ["weekly", "monthly"] as Period[], []);

  const epochButtons = useMemo(() => {
    if (period === "weekly") {
      return [
        { label: "This week", offset: 0 },
        { label: "Last week", offset: 1 },
        { label: "2 weeks ago", offset: 2 },
      ];
    }
    return [
      { label: "This month", offset: 0 },
      { label: "Last month", offset: 1 },
    ];
  }, [period]);

  // Reset history selection when the user flips between Weekly and Monthly.
  useEffect(() => {
    setEpochOffset(0);
  }, [period]);

  // Hourly refresh (full leaderboards / prize boxes).
  useEffect(() => {
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Live bulletin polling (lightweight) — every 5s.
  useEffect(() => {
    let cancelled = false;
    const intervalMs = 5_000;
    const keepEvents = 12;

    const keyOfRow = (row: any): string => {
      // Prefer campaign address, otherwise wallet.
      if (row && typeof row.campaign_address === "string") return row.campaign_address;
      if (row && typeof row.wallet === "string") return row.wallet;
      if (row && typeof row.buyer_address === "string") return row.buyer_address;
      return "";
    };

    const labelOfRow = (row: any): string => {
      if (row && typeof row.campaign_address === "string") {
        const nm = String(row?.name ?? "Unknown");
        const sym = String(row?.symbol ?? "");
        return `${nm}${sym ? ` (${sym})` : ""}`;
      }
      if (row && typeof row.wallet === "string") return shortAddr(row.wallet);
      if (row && typeof row.buyer_address === "string") return shortAddr(row.buyer_address);
      return "Unknown";
    };

    const pushEvent = (text: string) => {
      const ts = Date.now();
      // Deduplicate bursts: keep a small rolling set of recent hashes.
      const h = `${Math.floor(ts / 5000)}|${text}`; // 5s bucket
      const prev = prevBulletinRef.current;
      const lastHashes = prev?.lastHashes ?? [];
      if (lastHashes.includes(h)) return;
      const nextHashes = [h, ...lastHashes].slice(0, 32);
      prevBulletinRef.current = { leaders: prev?.leaders ?? {}, pots: prev?.pots ?? {}, lastHashes: nextHashes };

      setBulletinEvents((evts) => {
        const id = `${ts}-${Math.random().toString(16).slice(2)}`;
        const next = [{ id, ts, text }, ...evts];
        return next.slice(0, keepEvents);
      });
    };

    const poll = async () => {
      try {
        const targets = LEAGUES.filter((l) => l.supports.includes(period));
        const results = await Promise.all(
          targets.map(async (l) => {
            const limit = 3; // keep lightweight
            const qs = `chainId=${encodeURIComponent(String(activeChainId))}&period=${encodeURIComponent(period)}&epochOffset=${encodeURIComponent(
              String(epochOffset)
            )}&limit=${encodeURIComponent(String(limit))}&category=${encodeURIComponent(l.key)}`;
            const r = (await fetch(`/api/league?${qs}`).then((x) => x.json())) as LeagueResponse<any>;
            return [l.key, r] as const;
          })
        );
        if (cancelled) return;

        const nowLeaders: Record<string, string[]> = {};
        const nowPots: Record<string, string> = {};

        for (const [k, r] of results) {
          const items = Array.isArray(r?.items) ? r.items : [];
          nowLeaders[k] = items.map(keyOfRow).filter(Boolean).slice(0, 3);
          nowPots[k] = String(r?.prize?.potRaw ?? "0");

          const prev = prevBulletinRef.current;
          const prevLeaders = prev?.leaders?.[k] ?? [];
          const prevTop = prevLeaders?.[0];
          const curTop = nowLeaders[k]?.[0];

          // Rank flip: #1 changed.
          if (prevTop && curTop && prevTop !== curTop) {
            const curRow = items.find((x: any) => keyOfRow(x) === curTop) ?? items?.[0];
            const prevRow = items.find((x: any) => keyOfRow(x) === prevTop);
            const leagueTitle = LEAGUES.find((x) => x.key === k)?.title ?? k;
            pushEvent(`${labelOfRow(curRow)} overtook ${labelOfRow(prevRow)} for #1 in ${leagueTitle}.`);
          }

          // Biggest Hit: show a “big buy” style message when a new top appears.
          if (k.startsWith("biggest_hit")) {
            const top = items?.[0];
            const amt = top?.bnb_amount_raw ? formatBnbFromRaw(String(top.bnb_amount_raw)) : "";
            if (amt && prevTop && curTop && prevTop !== curTop) {
              const leagueTitle = LEAGUES.find((x) => x.key === k)?.title ?? k;
              pushEvent(`Big buy: ${labelOfRow(top)} hit ${amt} BNB and took #1 in ${leagueTitle}.`);
            }
          }

          // Pot jump: if pot increased meaningfully.
          try {
            const prevPot = BigInt(String(prev?.pots?.[k] ?? "0"));
            const curPot = BigInt(String(nowPots[k] ?? "0"));
            if (curPot > prevPot) {
              const delta = curPot - prevPot;
              // Threshold: 0.02 BNB to avoid spam
              const threshold = 20_000_000_000_000_000n;
              if (delta >= threshold) {
                const leagueTitle = LEAGUES.find((x) => x.key === k)?.title ?? k;
                pushEvent(`Prize pool +${formatBnbFromRaw(delta.toString())} BNB in ${leagueTitle}.`);
              }
            }
          } catch {
            // ignore
          }
        }

        const prev = prevBulletinRef.current;
        prevBulletinRef.current = {
          leaders: nowLeaders,
          pots: nowPots,
          lastHashes: prev?.lastHashes ?? [],
        };
      } catch {
        // Silent: bulletin should not break the page.
      }
    };

    // Prime immediately.
    poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeChainId, period, epochOffset]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const results = await Promise.all(
          LEAGUES.map(async (l) => {
            const effectivePeriod = l.supports.includes(period) ? period : l.supports[0];
            const limit = getLimit(l, effectivePeriod);
            const qs = `chainId=${encodeURIComponent(String(activeChainId))}&period=${encodeURIComponent(effectivePeriod)}&epochOffset=${encodeURIComponent(
              String(effectivePeriod === "weekly" ? (period === "weekly" ? epochOffset : 0) : period === "monthly" ? epochOffset : 0)
            )}&limit=${encodeURIComponent(
              String(limit)
            )}&category=${encodeURIComponent(l.key)}`;

            const r = (await fetch(`/api/league?${qs}`).then((x) => x.json())) as LeagueResponse<unknown>;
            return [l.key, r] as const;
          })
        );

        if (cancelled) return;
        const nextData: Record<string, unknown[]> = {};
        const nextWarnings: Record<string, string | undefined> = {};
        const nextPrizes: Record<string, PrizeMeta | undefined> = {};

        let nextEpoch: EpochMeta | undefined = undefined;

        let nextCampaignsCreated: number | undefined = undefined;

        for (const [k, r] of results) {
          const items = Array.isArray(r?.items) ? r.items : [];
          nextData[k] = items;
          nextWarnings[k] = r?.warning;
          nextPrizes[k] = r?.prize;
          if (!nextEpoch && r?.epoch) nextEpoch = r.epoch;
          if (typeof r?.stats?.campaignsCreated === "number" && typeof nextCampaignsCreated !== "number") {
            nextCampaignsCreated = r.stats.campaignsCreated;
          }
        }

        setEpochInfo(nextEpoch);
        setCampaignsCreated(nextCampaignsCreated);

        let nextFallbackMonthlyPrize: PrizeMeta | undefined = undefined;

        // Perfect Run is monthly-only, but we still want to show its monthly jackpot even when the user is viewing Weekly.
        // If the API doesn't return a prize for perfect_run, fall back to any monthly prize (monthly league pots are equal by config).
        if (!nextPrizes["perfect_run"]) {
          try {
            const qs2 = `chainId=${encodeURIComponent(String(activeChainId))}&period=${encodeURIComponent("monthly")}&epochOffset=${encodeURIComponent(
              "0"
            )}&limit=${encodeURIComponent("1")}&category=${encodeURIComponent("fastest_finish")}`;
            const rr = (await fetch(`/api/league?${qs2}`).then((x) => x.json())) as LeagueResponse<unknown>;
            nextFallbackMonthlyPrize = rr?.prize;
          } catch (e) {
            console.warn("[League] failed to load monthly prize fallback", e);
          }
        }

        setFallbackMonthlyPrize(nextFallbackMonthlyPrize);

        setData(nextData);
        setWarnings(nextWarnings);
        setPrizes(nextPrizes);
      } catch (e) {
        console.error("[League] failed to load /api/league", e);
        if (!cancelled) {
          setData({});
          setWarnings({});
          setPrizes({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, period, epochOffset, refreshTick]);

  const totalPrizePoolRaw = useMemo(() => {
    try {
      // Sum the per-category pots returned by /api/league for the current view.
      // This correctly accounts for rollovers, since each category carries its own potRaw.
      const eligible = LEAGUES.filter((l) => l.supports.includes(period)).map((l) => l.key);
      let sum = 0n;
      for (const k of eligible) {
        const p = prizes[k];
        if (!p?.potRaw) continue;
        sum += BigInt(String(p.potRaw));
      }
      return sum.toString();
    } catch {
      return "0";
    }
  }, [period, prizes]);

  const endsIn = useMemo(() => formatEndsIn(epochInfo), [epochInfo]);

  const prizeBreakdown = useMemo(() => {
    const rows = LEAGUES.filter((l) => l.supports.includes(period)).map((l) => {
      const p = prizes[l.key];
      return { key: l.key, title: l.title, potRaw: p?.potRaw ?? "0" };
    });
    rows.sort((a, b) => {
      try {
        return Number(BigInt(b.potRaw) - BigInt(a.potRaw));
      } catch {
        return 0;
      }
    });
    return rows;
  }, [period, prizes]);

  const liveBulletin = useMemo(() => {
    const top = bulletinEvents?.[0];
    if (top?.text) return top.text;
    return "Waiting for activity…";
  }, [bulletinEvents]);

  const recentLeaders = useMemo(() => {
    // Phase 1 "Recent Wins": show the current #1 per league (top row) for the selected period.
    const out: Array<{ league: LeagueDef; line1: string; line2?: string }> = [];
    for (const l of LEAGUES) {
      if (!l.supports.includes(period)) continue;
      const items = (data[l.key] ?? []) as any[];
      const top = items?.[0];
      if (!top) continue;
      if (typeof top?.campaign_address === "string") {
        const nm = String(top?.name ?? "Unknown");
        const sym = String(top?.symbol ?? "");
        out.push({ league: l, line1: `${nm}${sym ? ` (${sym})` : ""}`, line2: "Currently #1" });
        continue;
      }
      if (typeof top?.wallet === "string") {
        out.push({ league: l, line1: shortAddr(top.wallet), line2: "Currently #1" });
      }
    }
    return out.slice(0, 8);
  }, [data, period]);

  return (
    // NOTE: TopBar is fixed-position. This page doesn't have a tall header band
    // (like the Showcase) so it needs extra top padding to avoid overlapping the
    // header actions (Create coin / Connect).
    <div className="h-full overflow-y-auto pr-2 pt-16 md:pt-16">
      {/* Hero banner */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/20 mb-6"
        style={{
          // Drop your arena / colosseum image in: public/images/league-arena.jpg
          backgroundImage: "url(/images/league-arena.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-background/65" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/55 to-transparent" />
        <div className="relative p-5 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xl md:text-3xl font-semibold tracking-tight">MemeBattles Leagues</div>
            <div className="text-sm md:text-base text-muted-foreground">Compete. Create. Conquer.</div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border/50 bg-card/40 p-1">
              {periodButtons.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={
                    "px-3 py-2 rounded-xl text-xs md:text-sm transition-colors " +
                    (period === p ? "bg-card border border-border text-foreground" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {periodLabel(p)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {epochButtons.map((b) => (
                <button
                  key={b.offset}
                  type="button"
                  onClick={() => setEpochOffset(b.offset)}
                  className={
                    "px-3 py-1.5 rounded-xl border text-[11px] md:text-xs transition-colors " +
                    (epochOffset === b.offset
                      ? "bg-card border-border text-foreground"
                      : "bg-transparent border-border/50 text-muted-foreground hover:text-foreground")
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-muted-foreground text-right">
              <div>
                {epochInfo ? (
                  <>
                    {epochInfo.status === "live" ? "Live" : "Finalized"}
                    {endsIn ? ` · Ends in ${endsIn}` : ""}
                  </>
                ) : null}
              </div>
              <div className="hidden md:block">{epochInfo ? formatEpochRangeUtc(epochInfo) : ""}</div>
              <div>Chain {activeChainId}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
          <div className="text-xs text-muted-foreground">Total prize pool</div>
          <div className="mt-1 text-2xl font-semibold">{formatBnbFromRaw(totalPrizePoolRaw)} BNB</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{periodLabel(period)} · updated hourly</div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
          <div className="text-xs text-muted-foreground">Campaigns created</div>
          <div className="mt-1 text-2xl font-semibold">{typeof campaignsCreated === "number" ? campaignsCreated : "—"}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{periodLabel(period)} · epoch stats</div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
          <div className="text-xs text-muted-foreground">Live bulletin</div>
          <div className="mt-2 text-sm font-semibold leading-snug">{liveBulletin}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Phase 2: realtime battle feed (rank flips, big buys, pot jumps)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {LEAGUES.map((l) => {
          const effectivePeriod: Period = l.supports.includes(period) ? period : l.supports[0];
          const items = (data[l.key] ?? []) as unknown[];
          const warn = warnings[l.key];
          const prize = prizes[l.key];
          const cardPrize = l.key === "perfect_run" ? (prize ?? fallbackMonthlyPrize) : prize;

          const emptyText = !l.supports.includes(period)
            ? `This league runs ${l.supports.map(periodLabel).join(" / ")}.`
            : "No results yet for this period.";

          return (
            <div
              key={l.key}
              onClick={(e) => {
                // Allow inner interactive elements (row buttons, links) to work without triggering card navigation.
                const el = e.target as Element | null;
                if (el && el.closest && el.closest("button")) return;
                navigate(`/battle-leagues/${l.key}?period=${effectivePeriod}`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/battle-leagues/${l.key}?period=${effectivePeriod}`);
                }
              }}
              role="button"
              tabIndex={0}
              className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden text-left hover:bg-card/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <div className="relative">
                <div className="w-full aspect-[4/3] bg-black/10 flex items-center justify-center">
                  <img src={l.image} alt={l.title} className="w-full h-full object-cover" draggable={false} />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute left-4 right-4 bottom-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base md:text-lg font-semibold truncate">{l.title}</div>
                      <div className="text-[11px] md:text-xs text-muted-foreground truncate">{l.subtitle}</div>
                    </div>
                    <div className="text-[11px] md:text-xs text-muted-foreground">{periodLabel(effectivePeriod)}</div>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Prize box (weekly/monthly only) */}
                {effectivePeriod === "weekly" || effectivePeriod === "monthly" ? (
                  cardPrize ? (
                    <div className="mb-3 rounded-xl border border-border/40 bg-card/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">
                          {l.key === "perfect_run" ? "Jackpot pool (monthly · league fee only)" : "Prize pool (league fee only)"}
                        </div>
                        <div className="text-sm font-semibold">{formatBnbFromRaw(cardPrize.potRaw)} BNB</div>
                      </div>

                      {/* Weekly should show 1 winner; Monthly can show up to top-5 */}
                      <div
                        className={
                          "mt-2 grid gap-x-4 gap-y-1 text-[11px] " +
                          (effectivePeriod === "weekly" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-5")
                        }
                      >
                        {Array.from({ length: effectivePeriod === "weekly" ? 1 : 5 }).map((_, i) => (
                          <div key={i}>
                            <span className="text-muted-foreground">#{i + 1}</span>{" "}
                            <span className="font-semibold">{formatBnbFromRaw(cardPrize.payoutsRaw?.[i] ?? "0")}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 text-[10px] text-muted-foreground">
                        Updated hourly · computed {formatIsoTiny(cardPrize.computedAt)} · total league fees {formatBnbFromRaw(cardPrize.totalLeagueFeeRaw)} BNB
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 rounded-xl border border-border/40 bg-card/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">Prize pool</div>
                        <div className="text-sm font-semibold">—</div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Prize metadata not available yet (indexer/API). Check <span className="font-semibold">Status</span>.
                        <button
                          type="button"
                          onClick={() => navigate("/status")}
                          className="ml-2 text-accent hover:text-accent/80 font-semibold"
                        >
                          Open →
                        </button>
                      </div>
                    </div>
                  )
                ) : null}

                {warn ? <div className="mb-3 text-[11px] text-muted-foreground">{warn}</div> : null}

                {loading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : items.length ? (
                  <div className="space-y-2">
                    {items.map((rowAny, idx) => {
                      const rank = clampInt(idx + 1, 1, 999);
                      const rankEl = (
                        <div className="w-7 text-sm font-semibold text-accent">
                          {rank}
                        </div>
                      );

                      // Per-league row content
                      let leftEl: JSX.Element;
                      let metricTop = "";
                      let metricSub = "";
                      let onClick: (() => void) | undefined;
                      let key = "";

                      if (l.key === "top_earner") {
                        const r = rowAny as TopEarnerRow;
                        const wallet = String(r.wallet ?? "");
                        leftEl = <RowWallet address={wallet} />;
                        metricTop = `${formatBnbFromRaw(String(r.profit_raw ?? "0"))} BNB`;
                        metricSub = `${Number(r.trades_count ?? 0)} trades`;
                        key = `${l.key}:${wallet}:${idx}`;
                        onClick = () => {
                          if (isAddress(wallet)) navigate(`/profile?address=${wallet}`);
                        };
                      } else {
                        const row = rowAny as any;
                        const address = String(row.campaign_address ?? "");
                        leftEl = <RowToken logo={row.logo_uri} name={row.name} symbol={row.symbol} address={address} />;
                        key =
                          l.key === "biggest_hit"
                            ? `${String(row.tx_hash ?? "")}:${String(row.log_index ?? idx)}`
                            : `${l.key}:${address}:${idx}`;
                        onClick = () => {
                          if (isAddress(address)) navigate(`/token/${address}`);
                        };

                        if (l.key === "fastest_finish" || l.key === "perfect_run") {
                          const rr = row as GraduationRow;
                          metricTop = formatDuration(rr.duration_seconds ?? null);
                          metricSub = `${Number(rr.unique_buyers ?? 0)} buyers`;
                        } else if (l.key === "biggest_hit") {
                          const rr = row as BiggestHitRow;
                          metricTop = `${formatBnbFromRaw(rr.bnb_amount_raw)} BNB`;
                          metricSub = `Buyer: ${isAddress(rr.buyer_address) ? shortAddr(rr.buyer_address) : "-"}`;
                        } else if (l.key === "crowd_favorite") {
                          const rr = row as CrowdFavoriteRow;
                          metricTop = `${String(rr.votes_count)} votes`;
                          metricSub = `${String(rr.unique_voters)} voters`;
                        }
                      }

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={onClick}
                          className="w-full rounded-xl px-3 py-2 border border-border/40 hover:bg-card transition-colors text-left flex items-center gap-3"
                        >
                          {rankEl}
                          <div className="min-w-0 flex-1">{leftEl}</div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">{metricTop}</div>
                            <div className="text-[11px] text-muted-foreground">{metricSub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{emptyText}</div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-muted-foreground">
                    {epochInfo && epochInfo.status === "live" && endsIn ? `Ends in ${endsIn}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/battle-leagues/${l.key}?period=${effectivePeriod}`);
                    }}
                    className="px-3 py-2 rounded-xl border border-border/50 bg-card/40 text-xs font-semibold hover:bg-card/60"
                  >
                    View League
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-column block: breakdown + right rail */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 rounded-2xl border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Prize Pool Breakdown</div>
              <div className="text-[11px] text-muted-foreground">Per-league pots for {periodLabel(period)} (sorted by size)</div>
            </div>
            <div className="text-[11px] text-muted-foreground">Total: {formatBnbFromRaw(totalPrizePoolRaw)} BNB</div>
          </div>

          <div className="mt-4 space-y-2">
            {prizeBreakdown.length ? (
              prizeBreakdown.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-card/30 px-3 py-2">
                  <div className="text-sm font-semibold truncate">{r.title}</div>
                  <div className="text-sm font-semibold">{formatBnbFromRaw(r.potRaw)} BNB</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No prize data yet.</div>
            )}
          </div>
        </div>

        <div className="xl:col-span-4 space-y-4 xl:sticky xl:top-20 self-start">
          <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
            <div className="text-sm font-semibold">Recent Wins</div>
            <div className="text-[11px] text-muted-foreground">Phase 1: shows the current #1 per league</div>
            <div className="mt-3 space-y-2">
              {recentLeaders.length ? (
                recentLeaders.map((x) => (
                  <div key={x.league.key} className="rounded-xl border border-border/30 bg-card/30 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{x.league.title}</div>
                    <div className="text-sm font-semibold truncate">{x.line1}</div>
                    {x.line2 ? <div className="text-[11px] text-muted-foreground">{x.line2}</div> : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No results yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/40 p-4">
            <div className="text-sm font-semibold">Campaigns Created</div>
            <div className="text-[11px] text-muted-foreground">Phase 1: total only · Phase 2: newest campaigns feed</div>
            <div className="mt-3 rounded-xl border border-border/30 bg-card/30 px-3 py-3">
              <div className="text-[11px] text-muted-foreground">{periodLabel(period)} total</div>
              <div className="text-2xl font-semibold">{typeof campaignsCreated === "number" ? campaignsCreated : "—"}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">We can wire a live feed here from the indexer (new campaign events).</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border/40 bg-card/20 px-4 py-3 text-[11px] text-muted-foreground">
        Winners claim in{" "}
        <button type="button" onClick={() => navigate("/profile?tab=rewards")} className="text-accent hover:text-accent/80 font-semibold">
          Profile → Rewards
        </button>
        <span className="hidden md:inline"> · appears after epoch finalizes (hourly) · claims expire after 90 days — unclaimed rewards roll back into the next pool</span>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Locked rules (summary)</div>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <span className="font-semibold">Perfect Run</span>: monthly only; campaign must graduate with <span className="font-semibold">zero</span> bonding‑curve sells.
          </li>
          <li>
            <span className="font-semibold">Fastest Finish</span>: time from creation → graduation; creator buys excluded.
          </li>
          <li>
            <span className="font-semibold">Biggest Hit</span>: single largest bonding‑curve buy (BNB).
          </li>
          <li>
            <span className="font-semibold">Top Earner</span>: trader PnL inside bonding curve (net sells − buys in BNB).
          </li>
          <li>
            <span className="font-semibold">Crowd Favorite</span>: most UpVotes (confirmed votes).
          </li>
        </ul>
      </div>
    </div>
  );
}