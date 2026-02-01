import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s ?? "").trim());
const shortAddr = (a: string) => (a && a.length > 12 ? a.slice(0, 6) + "..." + a.slice(-4) : a);

type Period = "weekly" | "monthly" | "all_time";

type LeagueBase = {
  campaign_address: string;
  name?: string | null;
  symbol?: string | null;
  logo_uri?: string | null;
};

type LargestBuyRow = LeagueBase & {
  buyer_address: string;
  bnb_amount_raw: string;
  tx_hash: string;
  block_number: number;
  block_time: string;
  log_index?: number | null;
};

type GraduationRow = LeagueBase & {
  created_at_chain: string;
  graduated_at_chain: string;
  duration_seconds: number;
  unique_buyers: number;
  sells_count: number;
};

type LeagueResponse<T> = {
  chainId: number;
  category: string;
  period: Period;
  items: T[];
};

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
  if (p === "weekly") return "This week";
  if (p === "monthly") return "This month";
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

export default function League({ chainId = 97 }: { chainId?: number }) {
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>("weekly");
  const [loading, setLoading] = useState(true);

  const [straightUp, setStraightUp] = useState<GraduationRow[]>([]);
  const [fastest, setFastest] = useState<GraduationRow[]>([]);
  const [largestBuys, setLargestBuys] = useState<LargestBuyRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const qs = `chainId=${encodeURIComponent(String(chainId))}&period=${encodeURIComponent(period)}&limit=50`;

        const [a, b, c] = await Promise.all([
          fetch(`/api/league?${qs}&category=straight_up`).then((r) => r.json()),
          fetch(`/api/league?${qs}&category=fastest_graduation`).then((r) => r.json()),
          fetch(`/api/league?${qs}&category=largest_buy`).then((r) => r.json()),
        ]);

        if (cancelled) return;
        setStraightUp(Array.isArray(a?.items) ? a.items : []);
        setFastest(Array.isArray(b?.items) ? b.items : []);
        setLargestBuys(Array.isArray(c?.items) ? c.items : []);
      } catch (e) {
        console.error("[League] failed to load /api/league", e);
        if (!cancelled) {
          setStraightUp([]);
          setFastest([]);
          setLargestBuys([]);
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

  const periodButtons = useMemo(() => (["weekly", "monthly", "all_time"] as Period[]), []);

  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-lg md:text-2xl font-semibold">Battle Leagues</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Objective, on-chain leaderboards (bonding only). Weekly & monthly use chain timestamps.
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Straight UP */}
        <div className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <div className="text-sm md:text-base font-semibold">Straight UP (No-Sell Graduation)</div>
            <div className="text-[11px] md:text-xs text-muted-foreground mt-1">
              Qualifies only if the campaign has <span className="font-semibold">ZERO</span> bonding-curve sells from
              start to graduation. Internal finalize mechanics do not count; only on-chain <code>sell()</code> events.
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-muted-foreground border-b border-border/50">
            <div className="col-span-1">#</div>
            <div className="col-span-7">Token</div>
            <div className="col-span-4 text-right">Time to graduate</div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : straightUp.length ? (
            straightUp.map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="grid grid-cols-12 gap-2 px-4 py-3 text-left hover:bg-card transition-colors"
              >
                <div className="col-span-1 text-sm font-semibold" style={{ color: "#affe00" }}>
                  {idx + 1}
                </div>
                <div className="col-span-7 min-w-0">
                  <RowToken logo={r.logo_uri} name={r.name} symbol={r.symbol} address={r.campaign_address} />
                </div>
                <div className="col-span-4 text-right">
                  <div className="text-sm font-semibold">{formatDuration(r.duration_seconds)}</div>
                  <div className="text-[11px] text-muted-foreground">{r.unique_buyers} buyers</div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No qualifying campaigns in this period.</div>
          )}
        </div>

        {/* Fastest Graduation */}
        <div className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <div className="text-sm md:text-base font-semibold">Fastest Graduation</div>
            <div className="text-[11px] md:text-xs text-muted-foreground mt-1">
              Ranked by time from campaign creation to graduation. Requires a minimum of <span className="font-semibold">25</span> unique
              bonding-curve buyers.
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-muted-foreground border-b border-border/50">
            <div className="col-span-1">#</div>
            <div className="col-span-7">Token</div>
            <div className="col-span-4 text-right">Duration</div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : fastest.length ? (
            fastest.map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="grid grid-cols-12 gap-2 px-4 py-3 text-left hover:bg-card transition-colors"
              >
                <div className="col-span-1 text-sm font-semibold" style={{ color: "#affe00" }}>
                  {idx + 1}
                </div>
                <div className="col-span-7 min-w-0">
                  <RowToken logo={r.logo_uri} name={r.name} symbol={r.symbol} address={r.campaign_address} />
                </div>
                <div className="col-span-4 text-right">
                  <div className="text-sm font-semibold">{formatDuration(r.duration_seconds)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.unique_buyers} buyers{r.sells_count ? ` • ${r.sells_count} sells` : ""}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No graduates meeting the buyer threshold yet.</div>
          )}
        </div>

        {/* Largest Buys */}
        <div className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <div className="text-sm md:text-base font-semibold">Largest Buys in Bonding</div>
            <div className="text-[11px] md:text-xs text-muted-foreground mt-1">
              Largest single bonding-curve buy transaction, measured in BNB. Excludes the creator, feeRecipient and the campaign contract.
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-muted-foreground border-b border-border/50">
            <div className="col-span-1">#</div>
            <div className="col-span-6">Token</div>
            <div className="col-span-3 text-right">BNB</div>
            <div className="col-span-2 text-right">Buyer</div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading...</div>
          ) : largestBuys.length ? (
            largestBuys.map((r, idx) => (
              <button
                key={`${r.tx_hash}:${String(r.log_index ?? idx)}`}
                type="button"
                onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="grid grid-cols-12 gap-2 px-4 py-3 text-left hover:bg-card transition-colors"
              >
                <div className="col-span-1 text-sm font-semibold" style={{ color: "#affe00" }}>
                  {idx + 1}
                </div>
                <div className="col-span-6 min-w-0">
                  <RowToken logo={r.logo_uri} name={r.name} symbol={r.symbol} address={r.campaign_address} />
                </div>
                <div className="col-span-3 text-right">
                  <div className="text-sm font-semibold">{formatBnbFromRaw(r.bnb_amount_raw)}</div>
                  <div className="text-[11px] text-muted-foreground">BNB</div>
                </div>
                <div className="col-span-2 text-right">
                  <div className="text-sm font-semibold">{isAddress(r.buyer_address) ? shortAddr(r.buyer_address) : "-"}</div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No buys in this period.</div>
          )}
        </div>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Definitions (enforced by indexer/API)</div>
        <ul className="list-disc ml-5 space-y-1">
          <li>
            <span className="font-semibold">Straight UP</span>: counts only bonding-curve <code>TokensSold</code> events. Any sell disqualifies.
          </li>
          <li>
            <span className="font-semibold">Fastest Graduation</span>: uses on-chain timestamps between factory creation and <code>CampaignFinalized</code>, with ≥= 25 unique buyers.
          </li>
          <li>
            <span className="font-semibold">Largest Buys</span>: ranks single <code>TokensPurchased</code> events by BNB cost, excluding creator / feeRecipient / campaign contract.
          </li>
        </ul>
      </div>
    </div>
  );
}
