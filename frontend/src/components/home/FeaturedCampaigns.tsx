import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AthBar } from "@/components/token/AthBar";
import { useLaunchpad, type CampaignInfo } from "@/lib/launchpadClient";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";

type FeaturedRow = {
  chainId: number;
  campaignAddress: string;
  votes24h?: number;
  votes7d?: number;
  votesAllTime?: number;
  trendingScore?: string | number;
};

type FeaturedCard = {
  campaign: CampaignInfo;
  marketCapLabel: string;
  marketCapUsdLabel: string | null;
  creatorProfile?: { displayName?: string | null; avatarUrl?: string | null } | null;
};

const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test((s ?? "").trim());
const shortAddr = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function parseCompactNumber(input: string): number | null {
  const raw = String(input ?? "").trim();
  if (!raw || raw === "—") return null;

  const first = raw.split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[,$]/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/i);
  if (!m) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] ?? "").toUpperCase();
  const mult = suf === "K" ? 1e3 : suf === "M" ? 1e6 : suf === "B" ? 1e9 : suf === "T" ? 1e12 : 1;
  return n * mult;
}

function formatCompactUsd(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (v: number, suffix: string) => `${sign}$${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}${suffix}`;
  if (abs >= 1e12) return fmt(abs / 1e12, "T");
  if (abs >= 1e9) return fmt(abs / 1e9, "B");
  if (abs >= 1e6) return fmt(abs / 1e6, "M");
  if (abs >= 1e3) return fmt(abs / 1e3, "K");
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2)}`;
}

export function FeaturedCampaigns({ chainId = 97, limit = 10 }: { chainId?: number; limit?: number }) {
  const navigate = useNavigate();
  const { fetchCampaigns, fetchCampaignCardStats } = useLaunchpad();
  const { price: bnbUsdPrice } = useBnbUsdPrice(true);

  const [featured, setFeatured] = useState<FeaturedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<FeaturedCard[]>([]);

  // Tiny in-memory cache to avoid re-fetching the same profiles across rerenders
  const [profilesByAddress, setProfilesByAddress] = useState<Record<string, any>>({});

  useEffect(() => {
    let cancelled = false;

    const loadFeatured = async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/featured?chainId=${encodeURIComponent(String(chainId))}&sort=trending&limit=${encodeURIComponent(String(limit))}`);
        const j = await r.json();
        const items: FeaturedRow[] = Array.isArray(j?.items) ? j.items : [];
        if (!cancelled) setFeatured(items);
      } catch (e) {
        console.error("[FeaturedCampaigns] failed to load /api/featured", e);
        if (!cancelled) setFeatured([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, [chainId, limit]);

  // Build cards by merging featured addresses with on-chain campaign metadata
  useEffect(() => {
    let cancelled = false;

    const loadCards = async () => {
      if (!featured.length) {
        setCards([]);
        return;
      }

      try {
        const campaigns = await fetchCampaigns();
        const byCampaign = new Map<string, CampaignInfo>();
        for (const c of campaigns ?? []) {
          const addr = String((c as any).campaign ?? "").toLowerCase();
          if (isAddress(addr)) byCampaign.set(addr, c);
        }

        const out: FeaturedCard[] = [];
        for (const row of featured) {
          const addr = String(row.campaignAddress ?? "").toLowerCase();
          const campaign = byCampaign.get(addr);
          if (!campaign) continue;

          const stats = await fetchCampaignCardStats(campaign);
          const marketCapLabel = stats?.marketCap ?? "—";

          // Convert "X BNB" -> USD for ATH tracking
          let usdLabel: string | null = null;
          const mcBnb = marketCapLabel.toUpperCase().includes("BNB")
            ? parseCompactNumber(marketCapLabel.replace(/BNB/i, "").trim())
            : null;
          if (mcBnb != null && bnbUsdPrice && Number.isFinite(Number(bnbUsdPrice))) {
            const usd = mcBnb * Number(bnbUsdPrice);
            usdLabel = formatCompactUsd(usd);
          }

          out.push({ campaign, marketCapLabel, marketCapUsdLabel: usdLabel, creatorProfile: null });
        }

        if (!cancelled) setCards(out);
      } catch (e) {
        console.error("[FeaturedCampaigns] failed to load cards", e);
        if (!cancelled) setCards([]);
      }
    };

    loadCards();
    return () => {
      cancelled = true;
    };
  }, [featured, fetchCampaigns, fetchCampaignCardStats, bnbUsdPrice]);

  // Fetch creator profiles (best effort) for the cards we ended up with
  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      const creators = Array.from(
        new Set(
          cards
            .map((c) => String((c.campaign as any).creator ?? "").toLowerCase())
            .filter((a) => isAddress(a))
        )
      );

      const missing = creators.filter((a) => !profilesByAddress[a]);
      if (!missing.length) return;

      try {
        const results = await Promise.all(
          missing.map(async (addr) => {
            try {
              const r = await fetch(
                `/api/profile?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(addr)}`
              );
              const j = await r.json();
              return [addr, j?.profile ?? null] as const;
            } catch {
              return [addr, null] as const;
            }
          })
        );

        if (cancelled) return;
        setProfilesByAddress((prev) => {
          const next = { ...prev };
          for (const [addr, prof] of results) next[addr] = prof;
          return next;
        });
      } catch (e) {
        console.error("[FeaturedCampaigns] profile fetch failed", e);
      }
    };

    loadProfiles();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, chainId]);

  const hydrated = useMemo(() => {
    return cards.map((c) => {
      const creator = String((c.campaign as any).creator ?? "").toLowerCase();
      const profile = creator ? profilesByAddress[creator] ?? null : null;
      return { ...c, creatorProfile: profile };
    });
  }, [cards, profilesByAddress]);

  if (loading) {
    return (
      <div className="mb-4 md:mb-6">
        <div className="mb-2 flex items-center justify-between">
  <h2 className="text-sm md:text-base font-semibold tracking-wide">Featured Coins</h2>
  <span className="text-xs text-muted-foreground">Top {limit}</span>
</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="h-28 md:h-32 rounded-[1.25rem] border border-border/40 bg-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!hydrated.length) return null;

  return (
    <div className="mb-4 md:mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm md:text-base font-semibold tracking-wide">Featured Coins</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {hydrated.slice(0, limit).map((card, idx) => {
          const campaignAddr = String((card.campaign as any).campaign ?? "").trim();
          const creatorAddr = String((card.campaign as any).creator ?? "").trim();
          const displayName =
            (card.creatorProfile?.displayName ? String(card.creatorProfile.displayName).trim() : "") ||
            (creatorAddr ? shortAddr(creatorAddr) : "—");
          const initial = displayName ? displayName.slice(0, 1).toUpperCase() : "C";

          return (
            <button
              key={campaignAddr}
              type="button"
              className="text-left"
              onClick={() => navigate(`/token/${campaignAddr}`)}
            >
              <div className="relative rounded-[1.25rem] p-[1px]">
                <GlowingEffect spread={32} glow={false} disabled={false} proximity={80} inactiveZone={0.01} borderWidth={2} />
                <div className="relative h-28 md:h-32 w-full rounded-[1.15rem] border border-border/40 bg-card p-3 md:p-4 shadow-sm overflow-hidden">
                {/* Rank badge */}
<div className="absolute top-2 right-2 z-10 h-6 min-w-6 px-2 flex items-center justify-center rounded-full bg-card border-2 border-primary text-xs font-bold text-primary">
  {idx + 1}
</div>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center flex-shrink-0">
                      <img
                        src={card.campaign.logoURI || "/placeholder.svg"}
                        alt={card.campaign.symbol}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs md:text-sm font-semibold truncate">
                            {String(card.campaign.symbol ?? "").toUpperCase() || "TOKEN"}
                          </div>
                          <div className="text-[10px] md:text-xs text-muted-foreground truncate">
                            {card.campaign.name || ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] md:text-xs text-muted-foreground">MCap</div>
                          <div className="text-xs md:text-sm font-semibold truncate">
                            {card.marketCapLabel}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={card.creatorProfile?.avatarUrl || undefined} alt={displayName} />
                            <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-[10px] md:text-xs text-muted-foreground">Creator</div>
                            <div className="text-xs md:text-sm truncate">{displayName}</div>
                          </div>
                        </div>

                        <div className="w-[110px] md:w-[140px]">
                          <AthBar
                            currentLabel={card.marketCapUsdLabel}
                            storageKey={`ath:${chainId}:${String(campaignAddr).toLowerCase()}`}
                            className="text-[10px]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
