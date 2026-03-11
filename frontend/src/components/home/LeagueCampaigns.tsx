import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Flame, Rocket, Trophy } from "lucide-react";

type Period = "weekly" | "monthly" | "all_time";

type LeagueBase = {
  campaign_address: string;
  name?: string | null;
  symbol?: string | null;
  logo_uri?: string | null;
};

type GraduationRow = LeagueBase & {
  duration_seconds: number;
  unique_buyers: number;
  sells_count: number;
};

type LargestBuyRow = LeagueBase & {
  buyer_address: string;
  bnb_amount_raw: string;
  tx_hash: string;
  log_index: number;
};

type LeagueResponse<T> = {
  chainId: number;
  category: string;
  period: Period;
  items: T[];
};

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s ?? "").trim());
const shortAddr = (a: string) => (a && a.length > 12 ? a.slice(0, 6) + "..." + a.slice(-4) : a);

function formatDuration(seconds?: number | null) {
  const s = Math.max(0, Number(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
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

function TokenLine({ row }: { row: LeagueBase }) {
  const title = (row.name ? String(row.name) : "") || "Unknown";
  const sym = (row.symbol ? String(row.symbol) : "") || "";
  const initial = sym ? sym.slice(0, 1).toUpperCase() : "T";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="h-8 w-8 border border-white/10">
        <AvatarImage src={row.logo_uri || undefined} />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          {title} {sym ? <span className="text-stone-400">({sym})</span> : null}
        </div>
        <div className="text-[11px] text-stone-400 truncate">{row.campaign_address}</div>
      </div>
    </div>
  );
}

function LeaguePanel({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.96),rgba(16,18,22,0.99))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.40),0_18px_40px_rgba(0,0,0,0.28)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#f8cf45_0%,#ff9726_55%,#ff5a0d_100%)]" />
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          {icon}
          <div className="text-sm font-semibold uppercase tracking-[0.05em] text-stone-100">{title}</div>
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-stone-400">{hint}</div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export function LeagueCampaigns({ chainId = 97, limit = 3 }: { chainId?: number; limit?: number }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [straightUp, setStraightUp] = useState<GraduationRow[]>([]);
  const [fastest, setFastest] = useState<GraduationRow[]>([]);
  const [largestBuys, setLargestBuys] = useState<LargestBuyRow[]>([]);

  const qs = useMemo(
    () => `chainId=${encodeURIComponent(String(chainId))}&period=weekly&limit=${encodeURIComponent(String(limit))}`,
    [chainId, limit]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const [a, b, c] = await Promise.all([
          fetch(`/api/league?${qs}&category=straight_up`).then((r) => r.json()),
          fetch(`/api/league?${qs}&category=fastest_graduation`).then((r) => r.json()),
          fetch(`/api/league?${qs}&category=largest_buy`).then((r) => r.json()),
        ]);

        if (cancelled) return;
        setStraightUp((a as LeagueResponse<GraduationRow>)?.items ?? []);
        setFastest((b as LeagueResponse<GraduationRow>)?.items ?? []);
        setLargestBuys((c as LeagueResponse<LargestBuyRow>)?.items ?? []);
      } catch (e) {
        console.error("[LeagueCampaigns] failed to load /api/league", e);
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
  }, [qs]);

  if (loading) {
    return (
      <div className="mt-4 md:mt-6 rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.70),rgba(16,18,22,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_36px_rgba(0,0,0,0.24)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm md:text-base font-semibold uppercase tracking-[0.08em] text-stone-100">UP Only League</h2>
          <span className="text-xs uppercase tracking-[0.08em] text-stone-400">This week</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-[1.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(56,60,68,0.55),rgba(19,21,26,0.9))] animate-pulse" />
           ))}
        </div>
      </div>
    );
  }

  // If no data at all, don't render the section.
  if (!straightUp.length && !fastest.length && !largestBuys.length) return null;

  return (

    <div className="mt-4 md:mt-6 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.72),rgba(15,17,21,0.96))] p-4 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_46px_rgba(0,0,0,0.26)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm md:text-base font-semibold uppercase tracking-[0.08em] text-stone-100">UP Only League</h2>
         <button
          type="button"
          onClick={() => navigate("/battle-leagues")}
          className="text-xs uppercase tracking-[0.08em] text-stone-400 hover:text-white transition-colors"
         >
          View all
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <LeaguePanel title="Straight UP" hint="No sells" icon={<Trophy className="h-4 w-4 text-amber-300" />}>
             {straightUp.slice(0, limit).map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left flex items-start justify-between gap-3 hover:border-amber-400/20 transition-colors"
               >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-300">
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-stone-400">{formatDuration(r.duration_seconds)}</div>
                 </div>
              </button>
            ))}
+            {!straightUp.length ? <div className="text-xs text-stone-400">No qualifiers yet.</div> : null}
+        </LeaguePanel>

+        <LeaguePanel title="Fastest Graduation" hint="≥ 25 buyers" icon={<Rocket className="h-4 w-4 text-amber-300" />}>
            {fastest.slice(0, limit).map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left flex items-start justify-between gap-3 hover:border-amber-400/20 transition-colors"
               >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-300">
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-stone-400">{formatDuration(r.duration_seconds)}</div>
                 </div>
              </button>
            ))}
            {!fastest.length ? <div className="text-xs text-stone-400">No graduates yet.</div> : null}
        </LeaguePanel>

        <LeaguePanel title="Largest Buy" hint="Bonding" icon={<Flame className="h-4 w-4 text-amber-300" />}>
             {largestBuys.slice(0, limit).map((r, idx) => (
               <button
                 key={r.tx_hash + ":" + String(r.log_index)}
                 type="button"
                 onClick={() => navigate(`/token/${r.campaign_address}`)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-left flex items-start justify-between gap-3 hover:border-amber-400/20 transition-colors"
               >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                  <div className="mt-1 text-[11px] text-stone-400">
                    Buyer: {isAddress(r.buyer_address) ? shortAddr(r.buyer_address) : "-"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-300">
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-stone-400">{formatBnbFromRaw(r.bnb_amount_raw)} BNB</div>
                 </div>
              </button>
            ))}
            {!largestBuys.length ? <div className="text-xs text-stone-400">No buys yet.</div> : null}
        </LeaguePanel>
      </div>
    </div>
  );
}
