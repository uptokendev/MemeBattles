import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Contract, ethers } from "ethers";
import { Button } from "@/components/ui/button";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useWallet } from "@/contexts/WalletContext";
import { useToast } from "@/hooks/use-toast";
import { followCampaign, unfollowCampaign, isFollowingCampaign } from "@/lib/followApi";
import { ChevronLeft, ChevronRight, Flame, Star, ThumbsUp } from "lucide-react";
import { AthBar } from "@/components/token/AthBar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";
import { useLeagueRealtime } from "@/hooks/useLeagueRealtime";
import { resolveImageUri } from "@/lib/media";
import { fetchUserProfile, type UserProfile } from "@/lib/profileApi";
import { apiFetch } from "@/lib/apiBase";
import { getReadProvider } from "@/lib/readProvider";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;

type FeaturedItemApi = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  creatorAddress?: string | null;
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

type FeaturedCardVM = {
  idx: number;
  chainId: number;
  addr: string;
  name: string;
  symbol: string;
  creator: string;
  creatorLabel: string;
  createdAt?: number;
  votes24h: number;
  votesAll: number;
  rankVotes: number;
  activitySec: number;
  mcapUsdLabel: string | null;
  image: string;
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

function normalizeFeaturedItem(raw: any): FeaturedItemApi | null {
  if (!raw) return null;
  const src = raw.campaign && typeof raw.campaign === "object" ? { ...raw.campaign, ...raw } : raw;
  const campaignAddress = String(src.campaignAddress ?? src.campaign_address ?? src.campaign ?? "").toLowerCase();
  if (!campaignAddress) return null;
  return {
    chainId: Number(src.chainId ?? src.chain_id ?? 56),
    campaignAddress,
    tokenAddress: src.tokenAddress ?? src.token_address ?? src.token ?? null,
    creatorAddress: src.creatorAddress ?? src.creator_address ?? src.creator ?? null,
    creatorName: src.creatorName ?? src.creator_name ?? null,
    creatorUsername: src.creatorUsername ?? src.creator_username ?? null,
    username: src.username ?? null,
    name: src.name ?? null,
    symbol: src.symbol ?? src.ticker ?? null,
    logoUri: src.logoUri ?? src.logo_uri ?? src.logoURI ?? src.image ?? null,
    createdAtChain: src.createdAtChain ?? src.created_at_chain ?? src.createdAt ?? null,
    graduatedAtChain: src.graduatedAtChain ?? src.graduated_at_chain ?? null,
    votes24h: Number(src.votes24h ?? src.votes_24h ?? 0),
    votesAllTime: Number(src.votesAllTime ?? src.votes_all_time ?? 0),
    marketcapBnb: src.marketcapBnb ?? src.marketcap_bnb ?? null,
  };
}

async function safeString(fn: () => Promise<unknown>, fallback = "") {
  try {
    const value = await fn();
    const text = String(value ?? "").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

async function hydrateFeaturedMetadata(items: FeaturedItemApi[], chainId: number): Promise<FeaturedItemApi[]> {
  const provider = getReadProvider(chainId as any);
  const hydrated = await Promise.all(
    items.map(async (item) => {
      const needsHydration = !item.name || item.name === "Unknown" || !item.symbol || !item.logoUri || !item.creatorAddress;
      if (!needsHydration || !isEvmAddress(item.campaignAddress)) return item;

      try {
        const campaign = new Contract(item.campaignAddress, CAMPAIGN_ABI, provider) as any;
        const tokenAddress = item.tokenAddress || (await safeString(() => campaign.token()));
        const token = isEvmAddress(tokenAddress) ? (new Contract(String(tokenAddress), TOKEN_ABI, provider) as any) : null;

        const [name, symbol, logoUri, creatorAddress] = await Promise.all([
          item.name && item.name !== "Unknown" ? Promise.resolve(item.name) : token ? safeString(() => token.name(), item.name || "Unknown") : Promise.resolve(item.name || "Unknown"),
          item.symbol ? Promise.resolve(item.symbol) : token ? safeString(() => token.symbol(), "") : Promise.resolve(""),
          item.logoUri ? Promise.resolve(item.logoUri) : safeString(() => campaign.logoURI(), "/placeholder.svg"),
          item.creatorAddress ? Promise.resolve(item.creatorAddress) : safeString(() => campaign.owner(), ""),
        ]);

        return {
          ...item,
          tokenAddress: tokenAddress ? String(tokenAddress).toLowerCase() : item.tokenAddress,
          name,
          symbol,
          logoUri,
          creatorAddress: isEvmAddress(creatorAddress) ? String(creatorAddress).toLowerCase() : item.creatorAddress,
        };
      } catch {
        return item;
      }
    })
  );

  return hydrated;
}

export function FeaturedCampaigns({ className }: { className?: string }) {
  const wallet = useWallet();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeChainId, fetchCampaignLogoURI } = useLaunchpad();
  const { price: bnbUsd } = useBnbUsdPrice(true);
  const [voteMode, setVoteMode] = useState<"24h" | "all">("24h");
  const [refetchNonce, setRefetchNonce] = useState(0);
  const [items, setItems] = useState<FeaturedItemApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [logoCache, setLogoCache] = useState<Record<string, string>>({});
  const [profilesByAddr, setProfilesByAddr] = useState<Record<string, UserProfile | null>>({});
  const [followedMap, setFollowedMap] = useState<Record<string, boolean>>({});
  const [followBusyMap, setFollowBusyMap] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initialLoadedRef = useRef(false);

  const { patchByCampaign } = useLeagueRealtime({
    enabled: true,
    chainId: activeChainId,
    fallbackMs: 25000,
    onFallbackRefresh: () => setRefetchNonce((n) => n + 1),
  });

  const goProfile = (creatorAddr?: string) => {
    const a = (creatorAddr ?? "").trim();
    if (!a) return;
    navigate(`/profile?address=${encodeURIComponent(a)}`);
  };

  useEffect(() => {
    const onRefresh = (e: Event) => {
      const d = (e as CustomEvent<{ chainId?: number }>).detail ?? {};
      const cid = Number(d.chainId ?? NaN);
      if (Number.isFinite(cid) && cid !== activeChainId) return;
      setRefetchNonce((n) => n + 1);
    };
    window.addEventListener("memebattles:upvoteConfirmed", onRefresh as EventListener);
    window.addEventListener("memebattles:txConfirmed", onRefresh as EventListener);
    return () => {
      window.removeEventListener("memebattles:upvoteConfirmed", onRefresh as EventListener);
      window.removeEventListener("memebattles:txConfirmed", onRefresh as EventListener);
    };
  }, [activeChainId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!initialLoadedRef.current) setLoading(true);
      setErr(null);
      try {
        const r = await apiFetch(`/api/featured?chainId=${activeChainId}&sort=activity&limit=20&_r=${refetchNonce}`, { cache: "no-store" as RequestCache });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Failed to load featured");
        if (!mounted) return;
        const rawItems = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : [];
        const normalized = rawItems.map(normalizeFeaturedItem).filter(Boolean) as FeaturedItemApi[];
        setItems(normalized);
        initialLoadedRef.current = true;

        // Featured endpoint can be intentionally lightweight. Hydrate sparse rows
        // from campaign/token contracts so cards do not render as Unknown.
        hydrateFeaturedMetadata(normalized, activeChainId).then((next) => {
          if (mounted) setItems(next);
        });
      } catch (e: unknown) {
        if (!mounted) return;
        setErr(String((e as { message?: string })?.message ?? "Failed to load featured"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeChainId, refetchNonce]);

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
        const pairs = await Promise.all(missing.map(async (addr) => [addr, await fetchCampaignLogoURI(addr)] as const));
        if (cancelled) return;
        setLogoCache((prev) => {
          const next = { ...prev };
          for (const [addr, uri] of pairs) if (uri) next[addr] = uri;
          return next;
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [items, logoCache, fetchCampaignLogoURI]);

  useEffect(() => {
    let cancelled = false;
    const unique = Array.from(new Set((items || []).map((it) => String(it.creatorAddress ?? "").trim().toLowerCase()).filter((a) => isEvmAddress(a))));
    const missing = unique.filter((a) => profilesByAddr[a] === undefined);
    if (!missing.length) return;

    (async () => {
      const results = await Promise.all(missing.map(async (addr) => {
        try { return [addr, await fetchUserProfile(activeChainId, addr)] as const; }
        catch { return [addr, null] as const; }
      }));
      if (cancelled) return;
      setProfilesByAddr((prev) => {
        const next = { ...prev };
        for (const [addr, p] of results) next[addr] = p;
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [items, activeChainId, profilesByAddr]);

  const cards: FeaturedCardVM[] = useMemo(() => {
    const mapped = items.map((it, idx) => {
      const addr = String(it.campaignAddress ?? "").toLowerCase();
      const patch = patchByCampaign[addr] ?? {};
      const createdAt = it.createdAtChain ? Math.floor(new Date(it.createdAtChain).getTime() / 1000) : undefined;
      const votes24h = Number((patch as { votes24h?: number }).votes24h ?? it.votes24h ?? 0);
      const votesAll = Number((patch as { votesAllTime?: number; votesAll?: number }).votesAllTime ?? (patch as { votesAll?: number }).votesAll ?? it.votesAllTime ?? 0);
      const rankVotes = voteMode === "24h" ? votes24h : votesAll;
      const activitySec = Number((patch as { lastActivityAt?: number }).lastActivityAt ?? 0);
      const mcapBnb = Number((patch as { marketcapBnb?: string | number }).marketcapBnb ?? it.marketcapBnb ?? NaN);
      const mcapUsdLabel = Number.isFinite(mcapBnb) && bnbUsd ? formatCompactUsd(mcapBnb * bnbUsd) : null;
      const rawLogo = it.logoUri || logoCache[addr] || null;
      const resolved = resolveImageUri(rawLogo) || "/placeholder.svg";
      const creatorAddr = String(it.creatorAddress ?? "");
      const creatorKey = creatorAddr ? creatorAddr.trim().toLowerCase() : "";
      const profile = creatorKey ? profilesByAddr[creatorKey] ?? null : null;
      const profileDisplayName = (profile?.displayName ?? "").trim();
      const usernameRaw = profileDisplayName || it.creatorUsername || it.username || it.creatorName || "";
      const creatorLabel = usernameRaw ? (String(usernameRaw).startsWith("@") ? String(usernameRaw) : `@${usernameRaw}`) : creatorAddr ? shortAddr(creatorAddr) : "—";

      return {
        idx: idx + 1,
        chainId: Number(it.chainId ?? 0) || activeChainId,
        addr,
        name: String(it.name || "Unknown"),
        symbol: String(it.symbol ?? ""),
        creator: creatorAddr,
        creatorLabel,
        createdAt,
        votes24h,
        votesAll,
        rankVotes,
        activitySec,
        mcapUsdLabel,
        image: resolved,
      };
    });

    mapped.sort((a, b) => {
      if (b.rankVotes !== a.rankVotes) return b.rankVotes - a.rankVotes;
      if (b.activitySec !== a.activitySec) return b.activitySec - a.activitySec;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    return mapped.map((c, i) => ({ ...c, idx: i + 1 }));
  }, [items, patchByCampaign, bnbUsd, logoCache, profilesByAddr, voteMode, activeChainId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!wallet.account) {
          if (alive) setFollowedMap({});
          return;
        }
        const next: Record<string, boolean> = {};
        await Promise.all(cards.map(async (c) => {
          try { next[c.addr] = await isFollowingCampaign(wallet.account!, c.addr, c.chainId); }
          catch { next[c.addr] = false; }
        }));
        if (alive) setFollowedMap(next);
      } catch {
        if (alive) setFollowedMap({});
      }
    })();
    return () => { alive = false; };
  }, [wallet.account, cards]);

  const toggleFollow = async (e: React.MouseEvent, c: FeaturedCardVM) => {
    e.stopPropagation();
    if (!c?.addr) return;
    if (!wallet.account) {
      toast({ title: "Connect wallet", description: "Connect your wallet to follow campaigns." });
      window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
      return;
    }

    const key = c.addr.toLowerCase();
    if (followBusyMap[key]) return;
    const nextVal = !(followedMap[key] ?? false);
    setFollowBusyMap((m) => ({ ...m, [key]: true }));
    setFollowedMap((m) => ({ ...m, [key]: nextVal }));

    try {
      if (nextVal) await followCampaign(wallet.account, key, c.chainId);
      else await unfollowCampaign(wallet.account, key, c.chainId);
    } catch (error: unknown) {
      setFollowedMap((m) => ({ ...m, [key]: !nextVal }));
      toast({ title: "Follow failed", description: String((error as { message?: string })?.message ?? error ?? "Unknown error") });
    } finally {
      setFollowBusyMap((m) => ({ ...m, [key]: false }));
    }
  };

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(360, Math.floor(el.clientWidth * 0.88));
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className={cn("mwz-hud-frame w-full px-3 py-3", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-2 mwz-section-title text-sm md:text-base">
            <ThumbsUp className="h-4 w-4" />
            Featured Campaigns
          </div>
          <div className="hidden md:block text-xs uppercase tracking-[0.16em] mwz-muted">
            Top 20 ({voteMode === "24h" ? "24h upvotes" : "all-time upvotes"})
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="ghost" size="sm" className={cn("mwz-chip !h-7 !min-h-0 !min-w-0 !px-1.5 !text-[9px] leading-none", voteMode === "24h" && "mwz-chip-active")} onClick={() => setVoteMode("24h")}>24H</Button>
          <Button type="button" variant="ghost" size="sm" className={cn("mwz-chip !h-7 !min-h-0 !min-w-0 !px-1.5 !text-[9px] leading-none", voteMode === "all" && "mwz-chip-active")} onClick={() => setVoteMode("all")}>All-Time</Button>
          <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollByCards("left")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="mwz-button hidden md:inline-flex !h-7 !w-6 !min-h-0 !min-w-0 !p-0" onClick={() => scrollByCards("right")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-1 pr-2 snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          {loading && !cards.length ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="mwz-card h-[204px] min-w-[420px] animate-pulse" />)
          ) : err && !cards.length ? (
            <div className="mwz-muted py-8 text-sm">{err}</div>
          ) : cards.length === 0 ? (
            <div className="mwz-muted py-8 text-sm">No featured campaigns yet.</div>
          ) : (
            <>
              {err && <div className="mwz-card min-w-[320px] max-w-[420px] p-4 text-xs text-orange-200">Background refresh failed. Showing last loaded featured campaigns.</div>}
              {cards.map((c) => (
                <div key={c.addr} data-addr={c.addr} className="mwz-card snap-start grid min-h-[204px] min-w-[350px] max-w-[460px] w-[calc(100vw-2.5rem)] sm:w-[420px] md:w-[460px] grid-cols-[148px_minmax(0,1fr)] sm:grid-cols-[164px_minmax(0,1fr)] md:grid-cols-[176px_minmax(0,1fr)] overflow-hidden rounded-none" role="button" tabIndex={0} onClick={() => navigate(`/token/${c.addr}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/token/${c.addr}`); }}>
                  <div className="relative h-full min-h-[204px] bg-black border-r border-success/25">
                    <div className="absolute inset-0 mwz-stat-grid opacity-25 z-10 pointer-events-none" />
                    <img src={c.image} alt={c.name} className="h-full w-full object-cover" draggable={false} onError={(e) => { const img = e.currentTarget; if (!img.dataset.fallback) { img.dataset.fallback = "1"; img.src = "/placeholder.svg"; } }} />
                    <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),transparent_42%,rgba(0,0,0,0.68))]" />
                    <div className="absolute left-2 top-2 z-30 flex h-8 min-w-8 items-center justify-center border border-success/70 bg-black/75 px-2 text-lg text-success shadow-[0_0_14px_rgba(57,255,79,0.18)]">{c.idx}</div>
                  </div>

                  <div className="relative flex min-w-0 flex-col p-3 pb-11">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mwz-section-title truncate text-lg leading-none">{c.name}</div>
                        <div className="mt-1 truncate text-sm text-success/70">{c.symbol ? `$${c.symbol}` : ""}</div>
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs text-orange-400 shrink-0">
                        <Flame className="h-4 w-4" />
                        <span>{voteMode === "24h" ? c.votes24h : c.votesAll}</span>
                        <span>{voteMode === "24h" ? "/24h" : "all"}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 min-w-0">
                      <img src="/assets/profile_placeholder.png" alt="Creator" className="h-7 w-7 rounded-full border border-success/35 object-cover hover:border-orange-400/70" draggable={false} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); goProfile(c.creator); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); goProfile(c.creator); } }} />
                      <div className="truncate text-xs text-success/65 hover:text-orange-400" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); goProfile(c.creator); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); goProfile(c.creator); } }}>{c.creatorLabel}</div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-success/50">MCap</div>
                        <div className="truncate text-sm text-success">{c.mcapUsdLabel ?? "—"}</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button type="button" variant="ghost" size="icon" className={cn("mwz-button h-8 w-8", followedMap[c.addr] && "mwz-button-active")} onClick={(e) => toggleFollow(e, c)} disabled={!!followBusyMap[c.addr]} aria-label={(followedMap[c.addr] ?? false) ? "Unfollow campaign" : "Follow campaign"} title={(followedMap[c.addr] ?? false) ? "Unfollow" : "Follow"}>
                          <Star className={cn("h-4 w-4", followedMap[c.addr] ? "fill-current text-orange-400" : "text-success/75")} />
                        </Button>
                        <UpvoteDialog campaignAddress={c.addr} className="mwz-button mwz-button-active h-8 px-3 text-[10px]" buttonVariant="ghost" buttonSize="sm" />
                      </div>
                    </div>

                    <div className="mt-auto pt-4">
                      <div className="h-2 border border-success/30 bg-black/70 p-[1px]"><div className="h-full w-[92%] bg-[linear-gradient(90deg,var(--mwz-orange),var(--mwz-green))] shadow-[0_0_12px_rgba(57,255,79,0.22)]" /></div>
                    </div>

                    <div className="absolute inset-x-3 bottom-2 pointer-events-none">
                      <AthBar currentLabel={c.mcapUsdLabel ?? null} storageKey={`ath:${activeChainId}:${c.addr}`} className="text-[10px]" barWidthPx={420} barMaxWidth="100%" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
