import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, MessageSquare, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenComments } from "@/components/token/TokenComments";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { AthBar } from "@/components/token/AthBar";
import { useWallet } from "@/contexts/WalletContext";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useTokenStatsRealtime } from "@/hooks/useTokenStatsRealtime";
import { apiFetch } from "@/lib/apiBase";
import { getActiveChainId } from "@/lib/chainConfig";
import { resolveImageUri } from "@/lib/media";

type CampaignApiItem = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoUri?: string | null;
  createdAtChain?: string | null;
  graduatedAtChain?: string | null;
  isDexTrading?: boolean | null;
  marketcapBnb?: string | number | null;
  progressPct?: number | null;
  votes24h?: number | null;
};

type TradeItem = {
  id: string;
  txHash: string;
  blockTime: string | null;
  side: "buy" | "sell";
  wallet: string;
  tokenAmount: number | null;
  bnbAmount: number | null;
  priceBnb: number | null;
};

function isAddress(value?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function shortAddr(value?: string | null) {
  const a = String(value ?? "").trim();
  if (!a) return "—";
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function formatCompactUsd(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBnb(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1) return `${n.toFixed(3)} BNB`;
  if (n >= 0.01) return `${n.toFixed(5)} BNB`;
  return `${n.toFixed(8)} BNB`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function loadCampaign(chainId: number, address: string): Promise<CampaignApiItem | null> {
  const res = await apiFetch(`/api/campaigns?chainId=${chainId}&limit=250&tab=trending&sort=default&status=all`, {
    cache: "no-store" as RequestCache,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(json?.error || `Failed to load campaign (${res.status})`));
  const items = Array.isArray(json?.items) ? json.items : [];
  const needle = address.toLowerCase();
  return items.find((item: CampaignApiItem) => String(item.campaignAddress || "").toLowerCase() === needle) ?? null;
}

async function loadTrades(chainId: number, address: string): Promise<TradeItem[]> {
  const res = await apiFetch(`/api/activity/trades?chainId=${chainId}&address=${encodeURIComponent(address)}&limit=25`, {
    cache: "no-store" as RequestCache,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return [];
  return Array.isArray(json?.items) ? json.items : [];
}

export default function HybridTokenDetails() {
  const { campaignAddress } = useParams<{ campaignAddress: string }>();
  const wallet = useWallet();
  const chainId = useMemo(() => getActiveChainId(wallet.chainId), [wallet.chainId]);
  const address = String(campaignAddress || "").trim().toLowerCase();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const { stats } = useTokenStatsRealtime(address, chainId);

  const [campaign, setCampaign] = useState<CampaignApiItem | null>(null);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        if (!isAddress(address)) throw new Error("Invalid campaign address");
        const found = await loadCampaign(chainId, address);
        if (!alive) return;
        if (!found) {
          setCampaign(null);
          setTrades([]);
          setError("Token not found");
          return;
        }
        setCampaign(found);
        setTrades(await loadTrades(chainId, address));
      } catch (err: any) {
        if (!alive) return;
        setError(String(err?.message || "Failed to load token"));
        setCampaign(null);
        setTrades([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [address, chainId]);

  const marketCapBnb = Number(stats?.marketcapBnb ?? campaign?.marketcapBnb ?? NaN);
  const marketCapUsd = Number.isFinite(marketCapBnb) && bnbUsd ? marketCapBnb * bnbUsd : NaN;
  const image = resolveImageUri(campaign?.logoUri || null) || "/placeholder.svg";
  const progress = Math.max(0, Math.min(100, Number(campaign?.progressPct ?? 0)));

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">Loading token...</div>;
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card className="mwz-card p-6 text-center">
          <div className="mwz-section-title text-xl">{error || "Token not found"}</div>
          <p className="mt-2 text-sm text-muted-foreground">This campaign is not available in the indexed campaign feed yet.</p>
          <Button asChild className="mt-4">
            <Link to="/">Back to campaigns</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-2 py-4 md:px-4">
      <Card className="mwz-card overflow-hidden rounded-none p-0">
        <div className="grid gap-4 p-4 md:grid-cols-[220px_minmax(0,1fr)_260px] md:p-5">
          <div className="relative aspect-square overflow-hidden border border-success/25 bg-black">
            <img src={image} alt={campaign.name || "Token"} className="h-full w-full object-cover" />
          </div>

          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-success/55">Campaign</div>
            <h1 className="mwz-section-title mt-1 truncate text-3xl md:text-4xl">{campaign.name || "Unknown"}</h1>
            <div className="mt-1 text-lg text-success/75">{campaign.symbol ? `$${campaign.symbol}` : ""}</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border border-success/20 bg-black/35 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">Market Cap</div>
                <div className="mt-1 text-sm text-success">{Number.isFinite(marketCapUsd) ? formatCompactUsd(marketCapUsd) : formatBnb(marketCapBnb)}</div>
              </div>
              <div className="border border-success/20 bg-black/35 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">Price</div>
                <div className="mt-1 text-sm text-success">{formatBnb(stats?.lastPriceBnb)}</div>
              </div>
              <div className="border border-success/20 bg-black/35 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">24h Upvotes</div>
                <div className="mt-1 text-sm text-success">{Number(campaign.votes24h ?? 0)}</div>
              </div>
              <div className="border border-success/20 bg-black/35 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">Status</div>
                <div className="mt-1 text-sm text-success">{campaign.isDexTrading ? "DEX" : "LIVE"}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.16em] text-success/50">
                <span>Curve Progress</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <div className="h-2 border border-success/30 bg-black/70 p-[1px]">
                <div className="h-full bg-[linear-gradient(90deg,var(--mwz-orange),var(--mwz-green))]" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="mt-4">
              <AthBar currentLabel={Number.isFinite(marketCapUsd) ? formatCompactUsd(marketCapUsd) : null} storageKey={`ath:${chainId}:${address}`} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <UpvoteDialog campaignAddress={address} className="mwz-button mwz-button-active w-full" buttonVariant="ghost" buttonSize="sm" />
            <Button asChild variant="outline" className="mwz-button w-full">
              <a href={`https://testnet.bscscan.com/address/${address}`} target="_blank" rel="noreferrer">
                View Contract <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <div className="mt-2 border border-success/20 bg-black/35 p-3 text-xs text-success/65">
              <div>Campaign: {shortAddr(campaign.campaignAddress)}</div>
              <div>Token: {shortAddr(campaign.tokenAddress)}</div>
              <div>Creator: {shortAddr(campaign.creatorAddress)}</div>
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="trades" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-black/40">
          <TabsTrigger value="trades"><TrendingUp className="mr-2 h-4 w-4" />Trades</TabsTrigger>
          <TabsTrigger value="comments"><MessageSquare className="mr-2 h-4 w-4" />Comments</TabsTrigger>
        </TabsList>
        <TabsContent value="trades" className="mt-4">
          <Card className="mwz-card p-4">
            {trades.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No indexed trades yet.</div>
            ) : (
              <div className="space-y-2">
                {trades.map((trade) => (
                  <div key={trade.id} className="grid grid-cols-[80px_minmax(0,1fr)_120px] gap-3 border border-success/15 bg-black/30 p-3 text-sm">
                    <div className={trade.side === "buy" ? "text-green-400" : "text-orange-400"}>{trade.side.toUpperCase()}</div>
                    <div className="min-w-0 truncate text-success/70">{shortAddr(trade.wallet)} · {timeAgo(trade.blockTime)}</div>
                    <div className="text-right text-success">{formatBnb(trade.bnbAmount)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <Card className="mwz-card h-[520px] p-4">
            <TokenComments chainId={chainId} campaignAddress={address} tokenAddress={campaign.tokenAddress || undefined} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
