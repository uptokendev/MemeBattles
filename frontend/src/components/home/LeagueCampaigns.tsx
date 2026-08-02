import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Period = "weekly" | "monthly" | "all_time";

type LeagueBase = {
  campaign_address: string;
  token_address?: string | null;
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
      <Avatar className="h-7 w-7">
        <AvatarImage src={row.logo_uri || undefined} />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          {title} {sym ? <span className="text-muted-foreground">({sym})</span> : null}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{row.campaign_address}</div>
      </div>
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
      <div className="mt-4 md:mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm md:text-base font-semibold tracking-wide">UP Only League</h2>
          <span className="text-xs text-muted-foreground">This week</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 rounded-[1.25rem] border border-border/40 bg-card" />
          ))}
        </div>
      </div>
    );
  }

  // If no data at all, don't render the section.
  if (!straightUp.length && !fastest.length && !largestBuys.length) return null;

  const panelClass =
    "relative rounded-[1.25rem] border border-border/40 bg-card/70 p-4 text-left overflow-hidden hover:bg-card transition-colors";

  return (
    <div className="mt-4 md:mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm md:text-base font-semibold tracking-wide">UP Only League</h2>
        <button
          type="button"
          onClick={() => navigate("/league")}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {/* Straight UP */}
        <div className={panelClass}>
          <GlowingEffect blur={18} spread={36} glow={true} disabled={false} movementDuration={1.6} className="pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Straight UP</div>
            <div className="text-[11px] text-muted-foreground">No sells</div>
          </div>

          <div className="mt-3 space-y-3">
            {straightUp.slice(0, limit).map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.token_address || r.campaign_address}`)}
                className="w-full text-left flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold" style={{ color: "#affe00" }}>
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatDuration(r.duration_seconds)}</div>
                </div>
              </button>
            ))}
            {!straightUp.length ? <div className="text-xs text-muted-foreground">No qualifiers yet.</div> : null}
          </div>
        </div>

        {/* Fastest */}
        <div className={panelClass}>
          <GlowingEffect blur={18} spread={36} glow={true} disabled={false} movementDuration={1.6} className="pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Fastest Graduation</div>
            <div className="text-[11px] text-muted-foreground">≥ 25 buyers</div>
          </div>

          <div className="mt-3 space-y-3">
            {fastest.slice(0, limit).map((r, idx) => (
              <button
                key={r.campaign_address}
                type="button"
                onClick={() => navigate(`/token/${r.token_address || r.campaign_address}`)}
                className="w-full text-left flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold" style={{ color: "#affe00" }}>
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatDuration(r.duration_seconds)}</div>
                </div>
              </button>
            ))}
            {!fastest.length ? <div className="text-xs text-muted-foreground">No graduates yet.</div> : null}
          </div>
        </div>

        {/* Largest buys */}
        <div className={panelClass}>
          <GlowingEffect blur={18} spread={36} glow={true} disabled={false} movementDuration={1.6} className="pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Largest Buy</div>
            <div className="text-[11px] text-muted-foreground">Bonding</div>
          </div>

          <div className="mt-3 space-y-3">
            {largestBuys.slice(0, limit).map((r, idx) => (
              <button
                key={r.tx_hash + ":" + String(r.log_index)}
                type="button"
                onClick={() => navigate(`/token/${r.token_address || r.campaign_address}`)}
                className="w-full text-left flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <TokenLine row={r} />
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Buyer: {isAddress(r.buyer_address) ? shortAddr(r.buyer_address) : "-"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold" style={{ color: "#affe00" }}>
                    {idx + 1}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatBnbFromRaw(r.bnb_amount_raw)} BNB</div>
                </div>
              </button>
            ))}
            {!largestBuys.length ? <div className="text-xs text-muted-foreground">No buys yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
