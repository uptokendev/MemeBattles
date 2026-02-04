import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s ?? "").trim());
const shortAddr = (a: string) => (a && a.length > 12 ? a.slice(0, 6) + "..." + a.slice(-4) : a);

// We keep "all_time" for browsing history, but prizes are only weekly/monthly.
type Period = "weekly" | "monthly" | "all_time";

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
  computedAt: string;
  totalLeagueFeeRaw: string;
  leagueCount: number;
  winners: number;
  splitBps: number[];
  potRaw: string;
  payoutsRaw: [string, string, string, string, string];
};

type LeagueResponse<T> = {
  items: T[];
  warning?: string;
  prize?: PrizeMeta;
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

function periodLabel(p: Period) {
  if (p === "weekly") return "Weekly";
  if (p === "monthly") return "Monthly";
  return "All-time";
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

type LeagueDef = {
  key: "perfect_run" | "fastest_finish" | "biggest_hit" | "top_earner" | "crowd_favorite";
  title: string;
  subtitle: string;
  image: string;
  supports: Period[];
  weeklyLimit?: number;
  monthlyLimit?: number;
  allTimeLimit?: number;
};

const LEAGUES: LeagueDef[] = [
  {
    key: "perfect_run",
    title: "Perfect Run",
    subtitle: "Monthly only · No sells in bonding · Jackpot rolls over if not hit",
    image: "/assets/perfectrun.png",
    supports: ["monthly"],
    monthlyLimit: 5,
  },
  {
    key: "fastest_finish",
    title: "Fastest Finish",
    subtitle: "Fastest graduation (creator buys excluded)",
    image: "/assets/fastestfinish.png",
    supports: ["weekly", "monthly", "all_time"],
    weeklyLimit: 5,
    monthlyLimit: 5,
    allTimeLimit: 10,
  },
  {
    key: "biggest_hit",
    title: "Biggest Hit",
    subtitle: "Biggest single buy in bonding",
    image: "/assets/biggesthit.png",
    supports: ["weekly", "monthly", "all_time"],
    weeklyLimit: 5,
    monthlyLimit: 5,
    allTimeLimit: 10,
  },
  {
    key: "top_earner",
    title: "Top Earner",
    subtitle: "Highest trader earnings inside the bonding curve · Paid weekly/monthly",
    image: "/assets/topearner.png",
    supports: ["weekly", "monthly"],
    weeklyLimit: 5,
    monthlyLimit: 5,
  },
  {
    key: "crowd_favorite",
    title: "Crowd Favorite",
    subtitle: "Most UpVotes (community‑driven)",
    image: "/assets/crowdfavorite.png",
    supports: ["weekly", "monthly", "all_time"],
    weeklyLimit: 5,
    monthlyLimit: 5,
    allTimeLimit: 10,
  },
];

function getLimit(def: LeagueDef, period: Period) {
  if (period === "weekly") return def.weeklyLimit ?? 10;
  if (period === "monthly") return def.monthlyLimit ?? 10;
  return def.allTimeLimit ?? 10;
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

export default function League({ chainId = 97 }: { chainId?: number }) {
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>("weekly");
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState<Record<string, unknown[]>>({});
  const [warnings, setWarnings] = useState<Record<string, string | undefined>>({});
  const [prizes, setPrizes] = useState<Record<string, PrizeMeta | undefined>>({});

  const periodButtons = useMemo(() => ["weekly", "monthly", "all_time"] as Period[], []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const results = await Promise.all(
          LEAGUES.map(async (l) => {
            const effectivePeriod = l.supports.includes(period) ? period : l.supports[0];
            const limit = getLimit(l, effectivePeriod);
            const qs = `chainId=${encodeURIComponent(String(chainId))}&period=${encodeURIComponent(effectivePeriod)}&limit=${encodeURIComponent(
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

        for (const [k, r] of results) {
          const items = Array.isArray(r?.items) ? r.items : [];
          nextData[k] = items;
          nextWarnings[k] = r?.warning;
          nextPrizes[k] = r?.prize;
        }

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
  }, [chainId, period]);

  return (
    <div className="h-full overflow-y-auto pr-2 pt-6 md:pt-8">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-lg md:text-2xl font-semibold">Battle Leagues</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Objective on‑chain leaderboards. Prize pools are funded from the <span className="font-semibold">league fee</span> inside bonding‑curve trades.
          </p>
        </div>

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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {LEAGUES.map((l) => {
          const effectivePeriod: Period = l.supports.includes(period) ? period : l.supports[0];
          const items = (data[l.key] ?? []) as unknown[];
          const warn = warnings[l.key];
          const prize = prizes[l.key];

          const emptyText = !l.supports.includes(period)
            ? `This league runs ${l.supports.map(periodLabel).join(" / ")}.`
            : "No results yet for this period.";

          return (
            <div key={l.key} className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
              <div className="relative">
                <img src={l.image} alt={l.title} className="w-full h-[140px] md:h-[170px] object-cover" draggable={false} />
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
                {prize && (effectivePeriod === "weekly" || effectivePeriod === "monthly") ? (
                  <div className="mb-3 rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] text-muted-foreground">Prize pool (league fee only)</div>
                      <div className="text-sm font-semibold">{formatBnbFromRaw(prize.potRaw)} BNB</div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">#1</span> <span className="font-semibold">{formatBnbFromRaw(prize.payoutsRaw[0])}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">#2</span> <span className="font-semibold">{formatBnbFromRaw(prize.payoutsRaw[1])}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">#3</span> <span className="font-semibold">{formatBnbFromRaw(prize.payoutsRaw[2])}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">#4</span> <span className="font-semibold">{formatBnbFromRaw(prize.payoutsRaw[3])}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">#5</span> <span className="font-semibold">{formatBnbFromRaw(prize.payoutsRaw[4])}</span>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-muted-foreground">
                      Updated daily · computed {formatIsoTiny(prize.computedAt)} · total league fees {formatBnbFromRaw(prize.totalLeagueFeeRaw)} BNB
                    </div>
                  </div>
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
