import { useRef, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Globe, Users, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo, CampaignMetrics, CampaignSummary, CampaignActivity } from "@/lib/launchpadClient";
import { getActiveChainId } from "@/lib/chainConfig";
import { AthBar } from "@/components/token/AthBar";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";

// ---- Types ----
type CarouselCard = {
  id: number;
  image: string;
  ticker: string;
  tokenName: string;

  // Keep original campaign info around for lightweight stat refresh polling.
  campaignInfo?: CampaignInfo;

  // IMPORTANT: TokenDetails expects /token/:campaignAddress
  campaignAddress: string;

  // Optional token contract (post-graduation / or already known in your system)
  tokenAddress?: string;

  // Shown/copied in UI (prefer token, fallback campaign)
  contractAddress: string;

  description: string;
  marketCap: string; // BNB label (fallback)
  marketCapUsdLabel?: string | null; // preferred for UI + ATH tracking
  holders: string;
  volume: string;
  links: { website?: string; twitter?: string; telegram?: string; discord?: string };
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ---- Placeholder data used when there are no on-chain campaigns yet ----
const PLACEHOLDER_CARDS: CarouselCard[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=400&h=400&fit=crop",
    ticker: "LAUNCH",
    tokenName: "LaunchIt Preview",
    campaignAddress: ZERO_ADDR,
    tokenAddress: ZERO_ADDR,
    contractAddress: ZERO_ADDR,
    description: "Your first bonding curve token will appear here once deployed.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=400&h=400&fit=crop",
    ticker: "COMING",
    tokenName: "Coming Soon",
    campaignAddress: ZERO_ADDR,
    tokenAddress: ZERO_ADDR,
    contractAddress: ZERO_ADDR,
    description: "Create a campaign to turn this placeholder into a live token.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1516245834210-c4c142787335?w=400&h=400&fit=crop",
    ticker: "UPONLY",
    tokenName: "Sample Token",
    campaignAddress: ZERO_ADDR,
    tokenAddress: ZERO_ADDR,
    contractAddress: ZERO_ADDR,
    description: "This is demo data while we wait for the first launch.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
];

// ---------- Helpers ----------
const isAddress = (s?: string) => /^0x[a-fA-F0-9]{40}$/.test((s ?? "").trim());
const isZeroAddress = (s?: string) => /^0x0{40}$/.test((s ?? "").trim());

function normalizeWebsiteUrl(url?: string): string | undefined {
  const u = (url ?? "").trim();
  if (!u) return undefined;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

function normalizeTwitterUrl(input?: string): string | undefined {
  const v = (input ?? "").trim();
  if (!v) return undefined;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const handle = v.replace(/^@/, "");
  return `https://x.com/${handle}`;
}

// ---------- Market-cap conversion helpers (BNB label -> USD label) ----------
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
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `${sign}$${abs.toFixed(decimals)}`;
}

// ---------- Responsive card sizing ----------
const CARD_GAP = 16;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function computeCardWidth(containerWidth: number): number {
  // We size cards based on the *actual* carousel container width (not the full window)
  // so the layout stays correct next to the sidebar.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const cw = containerWidth > 0 ? containerWidth : vw;
  const mobile = vw < 768;

  if (mobile) {
    // One prominent card + peeks
    return Math.round(clamp(cw * 0.78, 240, 320));
  }

  // Desktop/tablet: two cards visible, centered card slightly larger
  return Math.round(clamp(cw * 0.36, 300, 420));
}

function getCardSize(containerWidth: number) {
  const width = computeCardWidth(containerWidth);
  return { width, totalWidth: width + CARD_GAP };
}

const Example = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDeltaRef = useRef(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const hasInitialized = useRef(false);
  const hasMeasured = useRef(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [cardSize, setCardSize] = useState(() =>
    getCardSize(typeof window !== "undefined" ? window.innerWidth : 1200)
  );
  const { width: CARD_WIDTH, totalWidth: TOTAL_CARD_WIDTH } = cardSize;

  // Ensure we size cards based on the actual container width (accounts for the sidebar).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const next = getCardSize(container.offsetWidth);
    setCardSize(next);
    if (typeof window !== "undefined") setIsMobile(window.innerWidth < 768);
    hasMeasured.current = true;
  }, []);

  // Blockchain campaigns -> cards
  const { fetchCampaigns, fetchCampaignCardStats, activeChainId } = useLaunchpad();
  const chainIdForStorage = activeChainId ?? 97;
  const { price: bnbUsdPrice } = useBnbUsdPrice(true);
  const [cards, setCards] = useState<CarouselCard[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  

  // Keep a ref to the latest cards array so polling doesn't fight React's closure semantics.
  const cardsRef = useRef<CarouselCard[]>([]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // This is the array we actually render:
  // - real on-chain campaigns if available
  // - otherwise placeholder cards
  const displayCards: CarouselCard[] = useMemo(
    () => (cards.length ? cards : PLACEHOLDER_CARDS),
    [cards]
  );

  // Scroll position (initially 0, we correct it in an effect once we know card count)
  const [scrollPosition, setScrollPosition] = useState(0);

  // Fetch campaigns on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingCampaigns(true);
        setCampaignError(null);

        const campaigns: CampaignInfo[] = await fetchCampaigns();

        // If no campaigns, keep cards empty so placeholders render.
        if (!campaigns || campaigns.length === 0) {
          if (!cancelled) setCards([]);
          return;
        }

        const mapped: CarouselCard[] = await Promise.all(
          campaigns.map(async (c, i) => {
            const stats = await fetchCampaignCardStats(c);

            // IMPORTANT: TokenDetails expects campaign address in route param
            const campaignAddress = String((c as any).campaign ?? "").trim();
            const tokenAddress = String((c as any).token ?? "").trim();

            // Prefer token address for copy, fallback campaign
            const contractAddress =
              tokenAddress && isAddress(tokenAddress)
                ? tokenAddress
                : campaignAddress && isAddress(campaignAddress)
                ? campaignAddress
                : ZERO_ADDR;

            const marketCapLabel = stats?.marketCap ?? "—";

            // Convert "X BNB" -> USD label for UI + ATH tracking
            let marketCapUsdLabel: string | null = null;
            const mcBnb = marketCapLabel.toUpperCase().includes("BNB")
              ? parseCompactNumber(marketCapLabel.replace(/BNB/i, "").trim())
              : null;
            if (mcBnb != null && bnbUsdPrice && Number.isFinite(Number(bnbUsdPrice))) {
              marketCapUsdLabel = formatCompactUsd(mcBnb * Number(bnbUsdPrice));
            }

            return {
              id: Number((c as any).id ?? i + 1),
              image: c.logoURI || "/placeholder.svg",
              ticker: String(c.symbol ?? "").toUpperCase(),
              tokenName: c.name ?? "Token",

              campaignInfo: c,

              campaignAddress: isAddress(campaignAddress) ? campaignAddress : ZERO_ADDR,
              tokenAddress: isAddress(tokenAddress) ? tokenAddress : undefined,
              contractAddress,

              description: (c as any).description || (c as any).extraLink || "",
              marketCap: marketCapLabel,
              marketCapUsdLabel,
              holders: stats?.holders ?? "—",
              volume: stats?.volume ?? "—",
              links: {
                website: normalizeWebsiteUrl((c as any).website || undefined),
                twitter: normalizeTwitterUrl((c as any).xAccount || undefined),
                telegram: normalizeWebsiteUrl((c as any).telegram || undefined),
                discord: normalizeWebsiteUrl((c as any).discord || undefined),
              },
            };
          })
        );

        if (!cancelled) setCards(mapped);
      } catch (err) {
        console.error(err);
        if (!cancelled) setCampaignError("Failed to load campaigns");
      } finally {
        if (!cancelled) setLoadingCampaigns(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignCardStats, bnbUsdPrice]);

  // Poll lightweight stats (market cap/holders/volume) so the card + ATH bar feel "live".
  // This is best-effort and intentionally modest to avoid hammering the RPC.
  useEffect(() => {
    let cancelled = false;
    const intervalMs = 15_000;

    const tick = async () => {
      const snapshot = cardsRef.current;
      if (!snapshot.length) return;

      // Only refresh real campaigns (skip placeholders)
      const real = snapshot.filter((c) => c.campaignInfo && isAddress(c.campaignAddress) && !isZeroAddress(c.campaignAddress));
      if (!real.length) return;

      try {
        const updated = await Promise.all(
          real.map(async (card) => {
            const stats = card.campaignInfo ? await fetchCampaignCardStats(card.campaignInfo) : null;
            const marketCapLabel = stats?.marketCap ?? card.marketCap;

            let marketCapUsdLabel: string | null = null;
            const mcBnb = marketCapLabel.toUpperCase().includes("BNB")
              ? parseCompactNumber(marketCapLabel.replace(/BNB/i, "").trim())
              : null;
            if (mcBnb != null && bnbUsdPrice && Number.isFinite(Number(bnbUsdPrice))) {
              marketCapUsdLabel = formatCompactUsd(mcBnb * Number(bnbUsdPrice));
            }

            return {
              ...card,
              marketCap: marketCapLabel,
              marketCapUsdLabel,
              holders: stats?.holders ?? card.holders,
              volume: stats?.volume ?? card.volume,
            };
          })
        );

        if (cancelled) return;

        const byAddr = new Map(updated.map((u) => [String(u.campaignAddress).toLowerCase(), u]));
        setCards((prev) =>
          prev.map((p) => byAddr.get(String(p.campaignAddress).toLowerCase()) ?? p)
        );
      } catch (e) {
        console.warn("[carousel] stats refresh failed", e);
      }
    };

    // Initial tick (after mount) + interval
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [fetchCampaignCardStats, bnbUsdPrice]);

  // Save scroll position to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem("carousel-position", scrollPosition.toString());
  }, [scrollPosition]);

  // Initialize to center the first card on first mount, once we know how many cards we have
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (!displayCards.length) return;
    if (!hasMeasured.current) return;

    const stored = sessionStorage.getItem("carousel-position");

    if (!hasInitialized.current) {
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      if (!stored) {
        // No stored position - center the first card of the middle set
        const containerWidth = scrollContainerRef.current.offsetWidth;
        const firstCardCenter = singleSetWidth + CARD_WIDTH / 2;
        const targetPosition = firstCardCenter - containerWidth / 2;
        setScrollPosition(targetPosition);
      } else {
        // Has stored position - trigger a snap to ensure proper highlighting
        setTimeout(() => {
          if (!scrollContainerRef.current) return;
          const containerWidth = scrollContainerRef.current.offsetWidth;
          const storedPos = parseFloat(stored);

          const viewportCenter = storedPos + containerWidth / 2;
          const fIndex = (viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH;
          let baseIndex = Math.round(fIndex);

          const cardCenter = baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
          const rawTarget = cardCenter - containerWidth / 2;

          const W = singleSetWidth;
          const candidateShifts = [-2, -1, 0, 1, 2];

          let best = rawTarget,
            bestDist = Number.POSITIVE_INFINITY;

          for (const k of candidateShifts) {
            let c = rawTarget + k * W;

            // Normalize into the middle set [W, 2W)
            if (c < W) c += W;
            else if (c >= 2 * W) c -= W;

            const d = Math.abs(c - storedPos);
            if (d < bestDist) {
              best = c;
              bestDist = d;
            }
          }

          setScrollPosition(best);
          setIsSnapping(true);
          setTimeout(() => setIsSnapping(false), 600);
        }, 100);
      }

      hasInitialized.current = true;
    }
  }, [displayCards.length, TOTAL_CARD_WIDTH, CARD_WIDTH]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!displayCards.length) return;

    // --- Wheel helpers ---
    const getWheelDelta = (evt: WheelEvent, el: HTMLDivElement) => {
      // deltaMode: 0=pixels, 1=lines, 2=pages
      if (evt.deltaMode === 1) return evt.deltaY * 16;
      if (evt.deltaMode === 2) return evt.deltaY * el.clientHeight;
      return evt.deltaY;
    };

    // IMPORTANT: Keep scrollPosition ALWAYS in the middle set [W, 2W)
    // so snapping logic (which normalizes to [W,2W)) cannot "fight" the wheel.
    const wrapIntoMiddleSet = (pos: number, W: number) => {
      const total = W * 3;
      if (!W || !Number.isFinite(pos)) return 0;

      // modulo into [0, total)
      let p = ((pos % total) + total) % total;

      // normalize into middle set [W, 2W)
      if (p < W) p += W;
      else if (p >= 2 * W) p -= W;

      return p;
    };

    const snapToNearestCard = (overrides?: { cardWidth?: number; totalCardWidth?: number }) => {
      if (!displayCards.length) return;

      const cw = overrides?.cardWidth ?? CARD_WIDTH;
      const tw = overrides?.totalCardWidth ?? TOTAL_CARD_WIDTH;

      const containerWidth = container.offsetWidth;
      const singleSetWidth = tw * displayCards.length;

      setScrollPosition((currentPos) => {
        if (!singleSetWidth) return currentPos;

        const viewportCenter = currentPos + containerWidth / 2;
        const fIndex = (viewportCenter - cw / 2) / tw;

        let baseIndex = Math.round(fIndex);

        if (lastDeltaRef.current > 0 && baseIndex * tw + cw / 2 < viewportCenter) {
          baseIndex += 1;
        } else if (lastDeltaRef.current < 0 && baseIndex * tw + cw / 2 > viewportCenter) {
          baseIndex -= 1;
        }

        const cardCenter = baseIndex * tw + cw / 2;
        const rawTarget = cardCenter - containerWidth / 2;

        const W = singleSetWidth;
        const candidateShifts = [-2, -1, 0, 1, 2];

        let best = rawTarget,
          bestDist = Number.POSITIVE_INFINITY;

        for (const k of candidateShifts) {
          let c = rawTarget + k * W;

          // normalize into [W,2W)
          if (c < W) c += W;
          else if (c >= 2 * W) c -= W;

          const d = Math.abs(c - currentPos);
          if (d < bestDist) {
            best = c;
            bestDist = d;
          }
        }

        return best;
      });

      setIsSnapping(true);
      setTimeout(() => setIsSnapping(false), 600);
    };

    // --- FIX: infinite scroll both directions on desktop wheel ---
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const delta = getWheelDelta(e, container);
      lastDeltaRef.current = delta;

      if (isSnapping) setIsSnapping(false);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      setScrollPosition((prev) => {
        const W = TOTAL_CARD_WIDTH * displayCards.length;
        if (!W) return prev;

        // speed factor
        const next = prev + delta * 0.6;

        // keep it in the middle set so it never "runs out" in either direction
        return wrapIntoMiddleSet(next, W);
      });

      scrollTimeoutRef.current = setTimeout(() => snapToNearestCard(), 150);
    };

    // Handle window resize
    const handleResize = () => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
      setIsMobile(vw < 768);

      const next = getCardSize(container.offsetWidth);
      setCardSize(next);
      snapToNearestCard({ cardWidth: next.width, totalCardWidth: next.totalWidth });
    };

    // Handle touch events for mobile swipe
    let touchStartX = 0;
    let touchStartScrollPos = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartScrollPos = scrollPosition;
      if (isSnapping) setIsSnapping(false);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchX = e.touches[0].clientX;
      const deltaX = touchStartX - touchX;

      const W = TOTAL_CARD_WIDTH * displayCards.length;
      if (!W) return;

      setScrollPosition(() => {
        const next = touchStartScrollPos + deltaX;

        // keep it in the middle set for seamless infinite swipe
        return wrapIntoMiddleSet(next, W);
      });
    };

    const handleTouchEnd = () => {
      scrollTimeoutRef.current = setTimeout(() => snapToNearestCard(), 100);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", handleResize);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [displayCards.length, isSnapping, scrollPosition, TOTAL_CARD_WIDTH, CARD_WIDTH]);

  // Calculate which absolute card index is centered for highlighting
  const getCenteredAbsIndex = () => {
    if (!scrollContainerRef.current || !displayCards.length) return 0;
    const containerWidth = scrollContainerRef.current.offsetWidth;
    const viewportCenter = scrollPosition + containerWidth / 2;
    const absIndex = Math.round((viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH);
    return absIndex;
  };

  const centeredAbsIndex = getCenteredAbsIndex();
  const totalTriple = displayCards.length * 3 || 1;
  const centeredTripleIndex = ((centeredAbsIndex % totalTriple) + totalTriple) % totalTriple;

  // Handle card click to snap it to center
  const handleCardClick = (clickedIndex: number) => {
    if (!scrollContainerRef.current || !displayCards.length) return;
    const containerWidth = scrollContainerRef.current.offsetWidth;
    const W = TOTAL_CARD_WIDTH * displayCards.length;
    if (!W) return;

    // Center of the exact clicked instance in the triple set
    const clickedCenter = clickedIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
    const rawTarget = clickedCenter - containerWidth / 2;

    setScrollPosition((currentPos) => {
      // Pick the nearest equivalent target by shifting by +/- W and +/- 2W
      const candidates = [rawTarget - 2 * W, rawTarget - W, rawTarget, rawTarget + W, rawTarget + 2 * W];
      let best = candidates[0];
      let bestDist = Infinity;

      for (let c of candidates) {
        let cn = c;

        // normalize into middle set [W,2W)
        if (cn < W) cn += W;
        else if (cn >= 2 * W) cn -= W;

        const d = Math.abs(cn - currentPos);
        if (d < bestDist) {
          best = cn;
          bestDist = d;
        }
      }
      return best;
    });

    setIsSnapping(true);
    setTimeout(() => setIsSnapping(false), 600);
  };

  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full flex items-center overflow-hidden relative touch-pan-x scrollbar-hidden py-8 md:py-12"
      style={{
        maskImage: isMobile
          ? "none"
          : "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        WebkitMaskImage: isMobile
          ? "none"
          : "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div
        className="flex items-center"
        style={{
          transform: `translateX(-${scrollPosition}px)`,
          transition: isSnapping ? "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
          gap: `${CARD_GAP}px`,
        }}
      >
        {/* Render cards 3 times for seamless infinite scroll */}
        {[...displayCards, ...displayCards, ...displayCards].map((card, index) => {
          const isCentered = index === centeredTripleIndex;
          return (
            <CardView
              card={card}
              key={`${card.id}-${index}`}
              isCentered={isCentered}
              cardWidth={CARD_WIDTH}
              isMobile={isMobile}
              chainIdForStorage={chainIdForStorage}
              onClick={() => handleCardClick(index)}
            />
          );
        })}
      </div>

      {/* Optional: lightweight status (doesn't affect layout) */}
      {campaignError ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-background/40 border border-border/40 rounded-full px-2 py-0.5">
          {campaignError}
        </div>
      ) : loadingCampaigns ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-background/40 border border-border/40 rounded-full px-2 py-0.5">
          Loading…
        </div>
      ) : null}
    </div>
  );
};

const CardView = ({
  card,
  isCentered,
  cardWidth,
  isMobile,
  chainIdForStorage,
  onClick,
}: {
  card: CarouselCard;
  isCentered: boolean;
  cardWidth: number;
  isMobile: boolean;
  chainIdForStorage: number;
  onClick: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const addr = (card.contractAddress ?? "").trim();
    if (!addr) return;

    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      toast.success("Contract address copied!");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleClick = () => {
    const addr = (card.campaignAddress ?? "").trim();
    const isDummy = !addr || !isAddress(addr) || isZeroAddress(addr);

    if (isCentered && !isDummy) {
      // Navigate to token details if centered/highlighted AND we have a real campaign address
      navigate(`/token/${addr.toLowerCase()}`);
      return;
    }

    // Otherwise just center the card
    onClick();
  };

  const mcapDisplay = (card.marketCapUsdLabel ?? null) || (card.marketCap ?? "—");
  const barWidthPx = Math.round(Math.max(110, Math.min(170, cardWidth * 0.45)));

  return (
    <div
      className="relative cursor-pointer transition-[transform,filter,opacity] duration-500 ease-out will-change-transform"
      style={{
        // Keep the "featured" card prominent, but avoid blowing up the layout.
        transform: isCentered ? (isMobile ? "scale(1.10)" : "scale(1.22)") : "scale(1)",
        transformOrigin: "center",
        minWidth: `${cardWidth}px`,
        minHeight: `${cardWidth}px`,
        zIndex: isCentered ? 10 : 1,
        // Make the centered card crisp and push the depth effect to the side cards.
        opacity: isMobile ? 1 : isCentered ? 1 : 0.78,
        filter: isMobile ? "none" : isCentered ? "none" : "blur(1.1px)",
      }}
      onClick={handleClick}
    >
      <div
        className={`relative rounded-[1.25rem] p-[1px] ${
          isCentered
            ? //? "ring-2 ring-accent/60 shadow-xl shadow-accent/10"
              ""
            : //: "border border-border/40"
              ""
        }`}
        style={{
          height: `${cardWidth}px`,
          width: `${cardWidth}px`,
        }}
      >
        <GlowingEffect
          spread={32}
          glow={false}
          disabled={false}
          proximity={80}
          inactiveZone={0.01}
          borderWidth={2}
        />
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden rounded-[1.15rem] border border-border/40 bg-card/80 p-6 shadow-sm ${
            // IMPORTANT: backdrop-blur on the top (center) card will blur the cards behind it.
            // We only apply backdrop-blur on the side cards.
            !isMobile && !isCentered ? "backdrop-blur" : ""
          }`}
        >
          {/* Top Section: Links and Stats */}
          <div className="flex items-start justify-between mb-4">
            {/* Social Links - Top Left */}
            <div className="flex gap-2">
              {card.links.website && (
                <a
                  href={card.links.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-lg border border-border bg-muted flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-colors"
                >
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {card.links.twitter && (
                <a
                  href={card.links.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-lg border border-border bg-muted flex items-center justify-center text-muted-foreground hover:text-accent hover:border-accent transition-colors"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              )}
            </div>

            {/* Holders and Volume - Top Right */}
            <div className="flex flex-col items-end gap-1 text-xs font-retro">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{card.holders}</span>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <span>Vol {card.volume}</span>
              </div>
            </div>
          </div>

          {/* Center: Token Image */}
          <div className="flex-1 flex items-center justify-center mb-4">
            <div
              className="rounded-full overflow-hidden bg-muted border-2 border-border"
              style={{
                width: isMobile ? "80px" : "128px",
                height: isMobile ? "80px" : "128px",
              }}
            >
              <img src={card.image} alt={card.ticker} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Token Info */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <h3 className="text-2xl font-retro tracking-tight text-foreground">{card.ticker}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-retro text-muted-foreground">{card.tokenName}</span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="Copy contract address"
              >
                {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-[10px] font-retro text-muted-foreground text-center leading-relaxed line-clamp-2">
              {card.description}
            </p>
          </div>

          {/* Bottom: MC (USD) + ATH bar */}
          <div className="flex items-center justify-between gap-3">
            <AthBar
              currentLabel={card.marketCapUsdLabel ?? null}
              storageKey={`ath:${String(chainIdForStorage)}:${String(card.campaignAddress).toLowerCase()}`}
              className="text-[10px]"
              barWidthPx={barWidthPx}
              barMaxWidth="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Example;