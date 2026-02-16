import { useEffect, useMemo, useState } from "react";
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
  const end = formatUtcTiny(epoch.status === "live" ? epoch.rangeEnd : epoch.epochEnd);
  if (!start || !end) return "";
  return `${start} UTC → ${end} UTC`;
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

  // Hourly refresh (dynamic leaderboards / prize boxes).
  useEffect(() => {
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

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

  return (
    // NOTE: TopBar is fixed-position. This page doesn't have a tall header band
    // (like the Showcase) so it needs extra top padding to avoid overlapping the
    // header actions (Create coin / Connect).
    <div className="h-full overflow-y-auto pr-2 pt-16 md:pt-16">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-lg md:text-2xl font-semibold">Battle Leagues</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Objective on‑chain leaderboards. Prize pools are funded from the <span className="font-semibold">league fee</span> inside bonding‑curve trades.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card/30 text-xs md:text-sm">
              <span className="text-muted-foreground">Total prize pool</span>
              <span className="font-semibold">{formatBnbFromRaw(totalPrizePoolRaw)} BNB</span>
              <span className="text-muted-foreground">· {periodLabel(period)}</span>
            </div>
            {typeof campaignsCreated === "number" ? (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card/30 text-xs md:text-sm">
                <span className="text-muted-foreground">Campaigns created</span>
                <span className="font-semibold">{campaignsCreated}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card/30 text-xs md:text-sm">
            <span className="text-muted-foreground">Winners claim in</span>
            <button
              type="button"
              onClick={() => navigate("/profile?tab=rewards")}
              className="text-accent hover:text-accent/80 font-semibold"
            >
              Profile → Rewards
            </button>
            <span className="hidden md:inline text-muted-foreground">· appears after epoch finalizes (hourly)</span>
            <span className="hidden md:inline text-muted-foreground">· claims expire after 90 days — unclaimed rewards roll back into the next pool</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {periodButtons.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={
                  "px-3 py-2 rounded-xl border text-xs md:text-sm transition-colors " +
                  (period === p
                    ? "bg-card border-border text-foreground"
                    : "bg-transparent border-border/50 text-muted-foreground hover:text-foreground")
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
                  {epochInfo.status === "live" ? "Live" : "Finalized"} · {formatEpochRangeUtc(epochInfo)}
                </>
              ) : null}
            </div>
            <div>Chain {activeChainId}</div>
          </div>
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
                <div className="w-full aspect-square bg-black/10 flex items-center justify-center">
                  <img src={l.image} alt={l.title} className="max-w-full max-h-full object-contain" draggable={false} />
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
                        <div className="w-7 text-sm font-semibold" style={{ color: "#affe00" }}>
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
              </div>
            </div>
          );
        })}
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