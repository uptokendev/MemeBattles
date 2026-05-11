import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiBase";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { getActiveChainId } from "@/lib/chainConfig";
import { useWallet } from "@/contexts/WalletContext";

type CampaignTickerItem = {
  campaignAddress: string;
  symbol: string;
  name: string;
  marketcapBnb: number | null;
  votes24h: number;
};

type CampaignFeedItemApi = {
  campaignAddress?: string | null;
  campaign_address?: string | null;
  symbol?: string | null;
  name?: string | null;
  marketcapBnb?: string | number | null;
  marketcap_bnb?: string | number | null;
  votes24h?: number | null;
  votes_24h?: number | null;
};

function normalizeAddress(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatMc(value: number | null, bnbUsd: number | null) {
  if (value == null || !Number.isFinite(value)) return "MC —";

  if (bnbUsd && Number.isFinite(bnbUsd)) {
    const usd = value * bnbUsd;
    return `MC ${new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(usd)}`;
  }

  return `MC ${value >= 1 ? value.toFixed(2) : value.toFixed(4)} BNB`;
}

function normalizeItem(raw: CampaignFeedItemApi): CampaignTickerItem | null {
  const campaignAddress = normalizeAddress(raw.campaignAddress ?? raw.campaign_address);
  if (!/^0x[a-f0-9]{40}$/.test(campaignAddress)) return null;

  const symbol = String(raw.symbol ?? "").trim();
  const name = String(raw.name ?? "").trim();
  const marketcapRaw = raw.marketcapBnb ?? raw.marketcap_bnb;
  const marketcapBnb = Number.isFinite(Number(marketcapRaw)) ? Number(marketcapRaw) : null;

  return {
    campaignAddress,
    symbol: symbol || "???",
    name: name || "Unknown",
    marketcapBnb,
    votes24h: Number(raw.votes24h ?? raw.votes_24h ?? 0),
  };
}

export function CampaignTickerBar({ className }: { className?: string }) {
  const wallet = useWallet();
  const chainId = getActiveChainId((wallet as any)?.chainId ?? (wallet as any)?.network?.chainId);
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [items, setItems] = useState<CampaignTickerItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const qs = new URLSearchParams({
          chainId: String(chainId),
          limit: "30",
          tab: "trending",
          sort: "default",
          status: "all",
        });

        const res = await apiFetch(`/api/campaigns?${qs.toString()}`, { cache: "no-store" as RequestCache });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Ticker campaigns failed (${res.status})`);

        const rows = Array.isArray(json?.items) ? json.items : [];
        const normalized = rows.map(normalizeItem).filter(Boolean) as CampaignTickerItem[];
        if (!cancelled) setItems(normalized.slice(0, 24));
      } catch {
        if (!cancelled) setItems([]);
      }
    }

    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [chainId]);

  const loopItems = useMemo(() => {
    if (!items.length) return [];
    return [...items, ...items];
  }, [items]);

  if (!loopItems.length) return null;

  return (
    <div className={cn("mwz-hud-frame overflow-hidden border-success/25 bg-black/65 py-2", className)} aria-label="Live campaign ticker">
      <div className="mwz-campaign-ticker-track flex w-max items-center gap-3 px-3">
        {loopItems.map((item, index) => (
          <Link
            key={`${item.campaignAddress}-${index}`}
            to={`/token/${item.campaignAddress}`}
            className="inline-flex shrink-0 items-center gap-2 border border-success/25 bg-black/45 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-success/80 transition hover:border-orange-400/60 hover:text-orange-300"
          >
            <span className="font-retro text-success">${item.symbol}</span>
            <span className="hidden max-w-[140px] truncate text-success/45 sm:inline">{item.name}</span>
            <span className="text-orange-300/90">{formatMc(item.marketcapBnb, bnbUsd)}</span>
            <span className="text-success/40">▲ {item.votes24h || 0}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
