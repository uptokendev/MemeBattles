import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { ChevronLeft, ChevronRight, Flame, ThumbsUp } from "lucide-react";
import { AthBar } from "@/components/token/AthBar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { resolveImageUri } from "@/lib/media";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";

type FeaturedItemApi = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoUri?: string | null;
  createdAtChain?: string | null;
  graduatedAtChain?: string | null;
  votes24h?: number | null;
  votesAllTime?: number | null;
  marketcapBnb?: string | null;
};

function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
  return fmt.format(value);
}

function timeAgoFromUnix(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - seconds);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function shortAddr(addr?: string | null) {
  if (!addr) return "";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

export function FeaturedCampaigns({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { activeChainId, fetchCampaignLogoURI } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);

  const [items, setItems] = useState<FeaturedItemApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Hydration caches (match CampaignGrid behavior)
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const [profileCache, setProfileCache] = useState<Record<string, UserProfile | null>>({});

  // Load top-20 by votes in last 24h; tie-break handled in SQL (votes_24h).
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/featured?chainId=${activeChainId}&sort=24h&limit=20`);
        const j = await r.json();
        if (!mounted) return;
        setItems(Array.isArray(j.items) ? j.items : []);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? "Failed to load featured");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeChainId]);

  // Hydrate missing token images from on-chain logoURI (same logic as CampaignGrid)
  useEffect(() => {
    let cancelled = false;

    const missing = (items || [])
      .map((it) => String(it.campaignAddress ?? "").toLowerCase())
      .filter((addr) => addr && !logoCache[addr])
      .filter((addr) => {
        const found = (items || []).find((x) => String(x.campaignAddress ?? "").toLowerCase() === addr);
        return !found?.logoUri;
      })
      .slice(0, 20);

    if (!missing.length) return;

    (async () => {
      try {
        const pairs = await Promise.all(
          missing.map(async (addr) => {
            const uri = await fetchCampaignLogoURI(addr);
            return [addr, uri] as const;
          })
        );
        if (cancelled) return;

        setLogoCache((prev) => {
          const next = { ...prev };
          for (const [addr, uri] of pairs) {
            if (uri) next[addr] = uri;
          }
          return next;
        });
      } catch {
        // non-fatal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, logoCache, fetchCampaignLogoURI]);

  // Hydrate creator profiles (displayName + avatarUrl) via /api/profile
  useEffect(() => {
    let cancelled = false;

    const creators = (items || [])
      .map((it) => String(it.creatorAddress ?? "").trim().toLowerCase())
      .filter((a) => a && a.startsWith("0x"))
      .filter((a) => profileCache[a] === undefined);

    // De-dupe
    const unique = Array.from(new Set(creators)).slice(0, 20);
    if (!unique.length) return;

    (async () => {
      try {
        const pairs = await Promise.all(
          unique.map(async (addr) => {
            try {
              const p = await fetchUserProfile(activeChainId, addr);
              return [addr, p] as const;
            } catch {
              return [addr, null] as const;
            }
          })
        );

        if (cancelled) return;

        setProfileCache((prev) => {
          const next = { ...prev };
          for (const [addr, p] of pairs) next[addr] = p;
          return next;
        });
      } catch {
        // non-fatal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, activeChainId, profileCache]);

  const cards = useMemo(() => {
    return items.map((it, idx) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const creator = String(it.creatorAddress ?? "").trim().toLowerCase() || null;

      const createdAt = it.createdAtChain ? Math.floor(new Date(it.createdAtChain).getTime() / 1000) : undefined;
      const votes24h = Number(it.votes24h ?? 0);
      const mcapBnb = Number(it.marketcapBnb ?? NaN);
      const mcapUsdLabel = Number.isFinite(mcapBnb) && bnbUsd ? formatCompactUsd(mcapBnb * bnbUsd) : null;

      const rawLogo = String(it.logoUri ?? "").trim() || logoCache[addr] || "";
      const image = resolveImageUri(rawLogo) || "/placeholder.svg";

      return {
        idx: idx + 1,
        addr,
        creator,
        name: String(it.name ?? "Unknown"),
        symbol: String(it.symbol ?? ""),
        createdAt,
        votes24h,
        mcapUsdLabel,
        image,
      };
    });
  }, [items, bnbUsd, logoCache]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(280, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <ThumbsUp className="h-4 w-4 text-accent" />
            UpVote Campaigns
          </div>
          <div className="text-xs text-muted-foreground">Top 20 (last 24h)</div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => scrollByCards("left")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => scrollByCards("right")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 pr-2 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: "none" } as any}
        >
          {loading && !cards.length ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="snap-start min-w-[260px] md:min-w-[280px] aspect-square rounded-2xl border border-border/40 bg-card/40 animate-pulse"
              />
            ))
          ) : err ? (
            <div className="text-sm text-muted-foreground py-8">{err}</div>
          ) : cards.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8">No featured campaigns yet.</div>
          ) : (
            cards.map((c) => {
              const creatorAddr = c.creator;
              const creatorProfile = creatorAddr ? profileCache[creatorAddr] ?? null : null;
              const displayName = (creatorProfile?.displayName ?? "").trim();
              const creatorLabel = displayName ? `@${displayName}` : shortAddr(creatorAddr);

              const avatarRaw = (creatorProfile?.avatarUrl ?? "").trim();
              const avatar = resolveImageUri(avatarRaw) || "/assets/profile_placeholder.png";

              return (
                <div
                  key={c.addr}
                  className="snap-start min-w-[260px] md:min-w-[280px] aspect-square rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-accent/50 transition-colors relative"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/token/${c.addr}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") navigate(`/token/${c.addr}`);
                  }}
                >
                  {/* Split layout */}
                  <div className="flex h-full">
                    {/* Left: campaign image */}
                    <div className="relative w-1/2 h-full">
                      <img
                        src={c.image}
                        alt={c.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                        onError={(e) => {
                          const img = e.currentTarget;
                          // Hard fallback, consistent with CampaignCard
                          if (!img.dataset.fallback) {
                            img.dataset.fallback = "1";
                            img.src = "/placeholder.svg";
                          }
                        }}
                      />

                      {/* Rank badge */}
                      <div className="absolute top-2 left-2 h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-black/60 border-2 border-emerald-400 text-xs font-bold text-emerald-400">
                        {c.idx}
                      </div>
                    </div>

                    {/* Right: data */}
                    <div className="w-1/2 p-3 flex flex-col min-w-0 pb-12">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.symbol ? `$${c.symbol}` : ""}</div>

                        {/* Creator row (clickable to /profile?address=...) */}
                        <button
                          type="button"
                          className="mt-2 flex items-center gap-2 min-w-0 text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (creatorAddr) navigate(`/profile?address=${creatorAddr}`);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          disabled={!creatorAddr}
                          aria-label={creatorAddr ? `Open profile ${creatorLabel}` : undefined}
                        >
                          <img
                            src={avatar}
                            alt="Creator"
                            className="w-6 h-6 rounded-full object-cover border border-border/60 shrink-0"
                            draggable={false}
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.fallback) {
                                img.dataset.fallback = "1";
                                img.src = "/assets/profile_placeholder.png";
                              }
                            }}
                          />
                          <div className="text-xs text-muted-foreground truncate">{creatorLabel || "—"}</div>
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-xs text-accent">
                          <Flame className="h-4 w-4" />
                          <span className="font-semibold">{c.votes24h}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{timeAgoFromUnix(c.createdAt)}</div>
                      </div>

                      <div className="mt-2">
                        <div className="text-[10px] text-muted-foreground">MCap</div>
                        <div className="text-xs font-semibold truncate">{c.mcapUsdLabel ?? "—"}</div>
                      </div>

                      <div className="flex-1" />

                      <div className="flex items-center gap-2 justify-end">
                        <div onClick={(e) => e.stopPropagation()}>
                          <UpvoteDialog campaignAddress={c.addr} />
                        </div>

                        <Button
                          size="sm"
                          className="bg-accent hover:bg-accent/90 text-accent-foreground font-retro"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/token/${c.addr}`);
                          }}
                        >
                          Buy
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* ATH overlay bottom across both halves */}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-md border-t border-border/40">
                    <AthBar
                      currentLabel={c.mcapUsdLabel ?? null}
                      storageKey={`ath:${activeChainId}:${c.addr}`}
                      className="text-[10px]"
                      barWidthPx={280}
                      barMaxWidth="100%"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
