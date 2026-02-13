import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useWallet } from "@/contexts/WalletContext";
import { useToast } from "@/hooks/use-toast";
import { followCampaign, unfollowCampaign, isFollowingCampaign } from "@/lib/followApi";
import { ChevronLeft, ChevronRight, Flame, ThumbsUp, Star } from "lucide-react";
import { AthBar } from "@/components/token/AthBar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useLeagueRealtime } from "@/hooks/useLeagueRealtime";
import { resolveImageUri } from "@/lib/media";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";

type FeaturedItemApi = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
  // Optional profile fields (may or may not be present depending on API version)
  creatorName?: string | null;
  creatorUsername?: string | null;
  username?: string | null;
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

function shortAddr(addr?: string) {
  if (!addr) return "";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function isEvmAddress(addr?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr ?? "").trim());
}

export function FeaturedCampaigns({ className }: { className?: string }) {
  const wallet = useWallet();
  const { toast } = useToast();
  const [followedMap, setFollowedMap] = useState<Record<string, boolean>>({});
  const [followBusyMap, setFollowBusyMap] = useState<Record<string, boolean>>({});

  const navigate = useNavigate();
  const { activeChainId, fetchCampaignLogoURI } = useLaunchpad();
  const [refetchNonce, setRefetchNonce] = useState(0);

  const { patchByCampaign } = useLeagueRealtime({
  enabled: true,
  chainId: activeChainId,
  fallbackMs: 25000,
  onFallbackRefresh: () => setRefetchNonce((n) => n + 1),
 });
  const { price: bnbUsd } = useBnbUsdPrice(true);

  const goProfile = (creatorAddr?: string) => {
    const a = (creatorAddr ?? "").trim();
    if (!a) return;
    navigate(`/profile?address=${encodeURIComponent(a)}`);
  };

  const [items, setItems] = useState<FeaturedItemApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // On-chain logo hydration cache (same idea as CampaignGrid)
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const [profilesByAddr, setProfilesByAddr] = useState<Record<string, UserProfile | null>>({});

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Immediately refresh featured sorting after a confirmed tx (upvote/buy/sell/finalize).
  useEffect(() => {
    const onRefresh = (e: any) => {
      const d = e?.detail ?? {};
      const cid = Number(d.chainId ?? NaN);
      if (Number.isFinite(cid) && cid !== activeChainId) return;
      setRefetchNonce((n) => n + 1);
    };
    window.addEventListener("upmeme:upvoteConfirmed", onRefresh as any);
    window.addEventListener("upmeme:txConfirmed", onRefresh as any);
    return () => {
      window.removeEventListener("upmeme:upvoteConfirmed", onRefresh as any);
      window.removeEventListener("upmeme:txConfirmed", onRefresh as any);
    };
  }, [activeChainId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Avoid edge/browser caching so vote counts/order refresh immediately after tx confirmation.
        const r = await fetch(`/api/featured?chainId=${activeChainId}&sort=activity&limit=20&_r=${refetchNonce}`, {
          cache: "no-store" as any,
        });
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
  }, [activeChainId, refetchNonce]);

  // Hydrate missing logos from chain if DB didn’t have logoUri (mirrors CampaignGrid)
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


  // Hydrate creator profiles (username/displayName) so we can show username instead of short address
  useEffect(() => {
    let cancelled = false;

    const unique = Array.from(
      new Set(
        (items || [])
          .map((it) => String(it.creatorAddress ?? "").trim().toLowerCase())
          .filter((a) => isEvmAddress(a))
      )
    );

    const missing = unique.filter((a) => profilesByAddr[a] === undefined);
    if (!missing.length) return;

    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (addr) => {
            try {
              const p = await fetchUserProfile(activeChainId, addr);
              return [addr, p] as const;
            } catch {
              return [addr, null] as const;
            }
          })
        );
        if (cancelled) return;

        setProfilesByAddr((prev) => {
          const next = { ...prev };
          for (const [addr, p] of results) next[addr] = p;
          return next;
        });
      } catch {
        // non-fatal
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, activeChainId, profilesByAddr]);

  const cards = useMemo(() => {
    const mapped = items.map((it, idx) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const patch = patchByCampaign[addr];

      const createdAt = it.createdAtChain
        ? Math.floor(new Date(it.createdAtChain).getTime() / 1000)
        : undefined;

      const votes24h = Number(patch?.votes24h ?? it.votes24h ?? 0);

      // Pump.fun-like: sort by "most recent activity" (vote or trade)
      const activitySec =
        (typeof (patch as any)?.lastActivityAt === "number" ? (patch as any).lastActivityAt : null) ??
        (typeof (it as any)?.lastActivityAt === "number" ? (it as any).lastActivityAt : null) ??
        (typeof (it as any)?.last_activity_at === "number" ? (it as any).last_activity_at : null) ??
        (it as any)?.lastActivityAt ??
        null;
      
      const mcapBnb = Number((patch?.marketcapBnb ?? it.marketcapBnb) ?? NaN);
      const mcapUsdLabel = Number.isFinite(mcapBnb) && bnbUsd ? formatCompactUsd(mcapBnb * bnbUsd) : null;

      const rawLogo = it.logoUri || logoCache[addr] || null;
      const resolved = resolveImageUri(rawLogo) || "/placeholder.svg";

      const creatorAddr = String(it.creatorAddress ?? "");
      const creatorKey = creatorAddr ? creatorAddr.trim().toLowerCase() : "";
      const profile = creatorKey ? profilesByAddr[creatorKey] ?? null : null;

      const profileDisplayName = (profile?.displayName ?? "").trim();

      const maybeUsernameRaw =
        (it as any).creatorUsername ??
        (it as any).username ??
        (it as any).creatorName ??
        (it as any).creator?.username ??
        (it as any).creatorProfile?.username ??
        (it as any).profile?.username ??
        (it as any).creatorProfile?.displayName ??
        (it as any).profile?.displayName ??
        null;

      const usernameRaw =
        profileDisplayName ||
        (typeof maybeUsernameRaw === "string" && maybeUsernameRaw.trim().length > 0
          ? maybeUsernameRaw.trim()
          : "");

      const creatorName = usernameRaw
        ? usernameRaw.startsWith("@")
          ? usernameRaw
          : `@${usernameRaw}`
        : null;

      const creatorLabel = creatorName ? creatorName : creatorAddr ? shortAddr(creatorAddr) : "—";

      return {
        idx: idx + 1,
        chainId: Number((it as any).chainId ?? 0) || 0,
        addr,
        name: String(it.name ?? "Unknown"),
        symbol: String(it.symbol ?? ""),
        creator: creatorAddr,
        creatorName,
        creatorLabel,
        createdAt,
        votes24h,
        activitySec: typeof activitySec === "number" && Number.isFinite(activitySec) ? activitySec : 0,
        mcapUsdLabel,
        image: resolved,
      };
    });

    // Sort live on every realtime patch (both tabs)
    mapped.sort((a, b) => {
      if (b.activitySec !== a.activitySec) return b.activitySec - a.activitySec;
      if (b.votes24h !== a.votes24h) return b.votes24h - a.votes24h;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    // Re-number badges after sort
    return mapped.map((c, i) => ({ ...c, idx: i + 1 }));
  }, [items, patchByCampaign, bnbUsd, logoCache, profilesByAddr]);


  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!wallet.account) {
          if (alive) setFollowedMap({});
          return;
        }
        const next: Record<string, boolean> = {};
        await Promise.all(
          cards.map(async (c) => {
            try {
              const v = await isFollowingCampaign(wallet.account!, c.addr, c.chainId);
              next[c.addr] = !!v;
            } catch {
              next[c.addr] = false;
            }
          })
        );
        if (alive) setFollowedMap(next);
      } catch {
        if (alive) setFollowedMap({});
      }
    })();
    return () => {
      alive = false;
    };
  }, [wallet.account, cards]);

  const toggleFollow = async (e: any, c: any) => {
    e.stopPropagation();
    if (!c?.addr) return;

    if (!wallet.account) {
      toast({ title: "Connect wallet", description: "Connect your wallet to follow campaigns." });
      try {
        await wallet.connect();
      } catch {}
      return;
    }

    const key = String(c.addr).toLowerCase();
    if (followBusyMap[key]) return;

    const nextVal = !(followedMap[key] ?? false);
    setFollowBusyMap((m) => ({ ...m, [key]: true }));
    setFollowedMap((m) => ({ ...m, [key]: nextVal })); // optimistic

    try {
      if (nextVal) await followCampaign(wallet.account, key, c.chainId);
      else await unfollowCampaign(wallet.account, key, c.chainId);
    } catch (err: any) {
      // rollback
      setFollowedMap((m) => ({ ...m, [key]: !nextVal }));
      toast({ title: "Follow failed", description: String(err?.message ?? err ?? "Unknown error") });
    } finally {
      setFollowBusyMap((m) => ({ ...m, [key]: false }));
    }
  };
  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(320, Math.floor(el.clientWidth * 0.9));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <ThumbsUp className="h-4 w-4 text-accent" />
            Featured Campaigns
          </div>
          <div className="text-xs text-muted-foreground">Top 20 (most recent activity)</div>
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
                className={cn(
                  "snap-start shrink-0 rounded-2xl border border-border/40 bg-card/40 animate-pulse",
                  // responsive width so it never becomes tiny
                  "min-w-[320px] w-[92vw] max-w-[420px] sm:w-[360px] sm:max-w-[360px] md:w-[420px] md:max-w-[420px]"
                )}
              >
                <div className="aspect-[2/1]" />
                <div className="h-10 border-t border-border/40" />
              </div>
            ))
          ) : err ? (
            <div className="text-sm text-muted-foreground py-8">{err}</div>
          ) : cards.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8">No featured campaigns yet.</div>
          ) : (
            cards.map((c) => (
              <div
                key={c.addr}
                className={cn(
                  "snap-start shrink-0 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-accent/50 transition-colors",
                  // ✅ this prevents “tiny cards” on small screens
                  "min-w-[320px] w-[92vw] max-w-[420px] sm:w-[360px] sm:max-w-[360px] md:w-[420px] md:max-w-[420px]"
                )}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/token/${c.addr}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(`/token/${c.addr}`);
                }}
              >
                {/* ATH overlay across image + data */}
<div className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 pointer-events-none">
  <AthBar
    currentLabel={c.mcapUsdLabel ?? null}
    storageKey={`ath:${activeChainId}:${c.addr}`}
    className="text-[10px]"
    barWidthPx={420}
    barMaxWidth="100%"
  />
</div>
                {/* Top: two equal squares (image + data) */}
                <div className="grid grid-cols-2 aspect-[2/1]">
                  {/* Left: token image */}
                  <div className="relative w-full h-full bg-black">
                    <img
                      src={c.image}
                      alt={c.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.dataset.fallback) {
                          img.dataset.fallback = "1";
                          img.src = "/placeholder.svg";
                        }
                      }}
                    />

                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />

                    <div className="absolute top-2 left-2 h-7 min-w-7 px-2 flex items-center justify-center rounded-full bg-black/60 border-2 border-emerald-400 text-xs font-bold text-emerald-400">
                      {c.idx}
                    </div>
                  </div>

                  {/* Right: data panel (same size as image) */}
                  <div className="w-full h-full p-3 md:p-4 pb-20 flex flex-col min-w-0">
                    {/* Name + votes (24h) */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-base font-semibold truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.symbol ? `$${c.symbol}` : ""}
                        </div>
                      </div>

                      {/* Votes (24h) top-right */}
                      <div className="flex items-center gap-1 text-xs text-accent shrink-0">
                        <Flame className="h-4 w-4" />
                        <span className="font-semibold">{c.votes24h}</span>
                        <span className="text-muted-foreground">/ 24h</span>
                      </div>
                    </div>

                    {/* Creator row under ticker */}
                    <div className="mt-2 flex items-center gap-2 min-w-0">
                      <img
                        src="/assets/profile_placeholder.png"
                        alt="Creator"
                        className="w-7 h-7 rounded-full object-cover border border-border/60"
                        draggable={false}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          goProfile(c.creator);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            goProfile(c.creator);
                          }
                        }}
                      />
                      <div
                        className="text-xs text-muted-foreground truncate"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          goProfile(c.creator);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            goProfile(c.creator);
                          }
                        }}
                      >
                        {c.creatorLabel}
                      </div>
                    </div>

                    

                    {/* Upvote + MCap row */}
<div className="mt-3 flex items-center justify-between gap-3 w-full">
  {/* MCap (left) */}
  <div className="min-w-0">
    <div className="text-[10px] text-muted-foreground">MCap</div>
    <div className="text-sm font-semibold truncate">{c.mcapUsdLabel ?? "—"}</div>
  </div>

  {/* Actions (right) */}
  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="h-8 w-8 rounded-xl"
      onClick={(e) => toggleFollow(e, c)}
      disabled={!!followBusyMap[c.addr]}
      aria-label={(followedMap[c.addr] ?? false) ? "Unfollow campaign" : "Follow campaign"}
      title={(followedMap[c.addr] ?? false) ? "Unfollow" : "Follow"}
    >
      <Star className={cn("h-4 w-4 transition-all", (followedMap[c.addr] ?? false) ? "text-yellow-400 fill-yellow-400 scale-110 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]"
      : "text-muted-foreground/70")} />
    </Button>

    <UpvoteDialog campaignAddress={c.addr} />
  </div>
</div>

                    {/* Spacer so content doesn't hug AthBar overlay */}
                    <div className="flex-1" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}