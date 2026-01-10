import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Globe, Users, DollarSign, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignInfo } from "@/lib/launchpadClient";

// ---- Types ----
type CarouselCard = {
  id: number;
  image: string;
  ticker: string;
  tokenName: string;
  contractAddress: string;
  description: string;
  marketCap: string;
  holders: string;
  volume: string;
  links: { website?: string; twitter?: string; telegram?: string; discord?: string };
};

// ---- Placeholder data used when there are no on-chain campaigns yet ----
const PLACEHOLDER_CARDS: CarouselCard[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1621504450181-5d356f61d307?w=400&h=400&fit=crop",
    ticker: "LAUNCH",
    tokenName: "LaunchIt Preview",
    contractAddress: "0x0000000000000000000000000000000000000000",
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
    contractAddress: "0x0000000000000000000000000000000000000000",
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
    contractAddress: "0x0000000000000000000000000000000000000000",
    description: "This is demo data while we wait for the first launch.",
    marketCap: "0",
    holders: "0",
    volume: "0",
    links: {},
  },
];

// Responsive card sizing
const getCardWidth = () => (typeof window !== "undefined" && window.innerWidth < 768 ? 280 : 450);
const CARD_GAP = 16;
const getCardSize = () => {
  const width = getCardWidth();
  return { width, totalWidth: width + CARD_GAP };
};

const Example = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const lastDeltaRef = useRef(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const hasInitialized = useRef(false);
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const [cardSize, setCardSize] = useState(getCardSize());
  const { width: CARD_WIDTH, totalWidth: TOTAL_CARD_WIDTH } = cardSize;

  // Blockchain campaigns -> cards
  const { fetchCampaigns, fetchCampaignCardStats } = useLaunchpad();
  const [cards, setCards] = useState<CarouselCard[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  // This is the array we actually render:
  // - real on-chain campaigns if available
  // - otherwise placeholder cards
  const displayCards: CarouselCard[] = cards.length ? cards : PLACEHOLDER_CARDS;

  // Scroll position (initially 0, we correct it in an effect once we know card count)
  const [scrollPosition, setScrollPosition] = useState(0);

  // Fetch campaigns on mount
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingCampaigns(true);
        setCampaignError(null);

        const campaigns: CampaignInfo[] = await fetchCampaigns();

        const mapped: CarouselCard[] = await Promise.all(
          campaigns.map(async (c) => {
            const stats = await fetchCampaignCardStats(c);

            return {
              id: c.id,
              image: c.logoURI || "/placeholder.svg",
              ticker: c.symbol,
              tokenName: c.name,
              contractAddress: c.token,
              description: c.extraLink || "",
              marketCap: stats.marketCap,
              holders: stats.holders,
              volume: stats.volume,
              links: {
                website: c.website || undefined,
                twitter: c.xAccount || undefined,
                telegram: (c as any).telegram || undefined,
                discord: (c as any).discord || undefined,
              },
            };
          })
        );

        setCards(mapped);
      } catch (err) {
        console.error(err);
        setCampaignError("Failed to load campaigns");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    load();
  }, [fetchCampaigns]);

  // Save scroll position to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem("carousel-position", scrollPosition.toString());
  }, [scrollPosition]);

  // Initialize to center the first card on first mount, once we know how many cards we have
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    if (!displayCards.length) return;

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

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastDeltaRef.current = e.deltaY;

      // Cancel ongoing snap
      if (isSnapping) {
        setIsSnapping(false);
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      // Smooth scroll with edge re-centering
      setScrollPosition((prev) => {
        const W = singleSetWidth;
        const total = W * 3;
        let newPosition = prev + e.deltaY * 0.6; // reduced sensitivity

        if (!W) return prev; // safety

        // First, wrap to stay within [0, 3W)
        while (newPosition < 0) newPosition += W;
        while (newPosition >= total) newPosition -= W;

        // Recenter to middle set if we're getting too close to edges
        if (newPosition < W * 0.5) {
          newPosition += W;
        } else if (newPosition >= W * 2.5) {
          newPosition -= W;
        }

        return newPosition;
      });

      // Snap after user stops scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        snapToNearestCard();
      }, 150);
    };

    const snapToNearestCard = () => {
      if (!displayCards.length) return;

      const containerWidth = container.offsetWidth;
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      setScrollPosition((currentPos) => {
        if (!singleSetWidth) return currentPos;

        const viewportCenter = currentPos + containerWidth / 2;
        const fIndex = (viewportCenter - CARD_WIDTH / 2) / TOTAL_CARD_WIDTH;
        let baseIndex = Math.round(fIndex);
        if (lastDeltaRef.current > 0 && baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2 < viewportCenter) {
          baseIndex += 1;
        } else if (
          lastDeltaRef.current < 0 &&
          baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2 > viewportCenter
        ) {
          baseIndex -= 1;
        }
        const cardCenter = baseIndex * TOTAL_CARD_WIDTH + CARD_WIDTH / 2;
        const rawTarget = cardCenter - containerWidth / 2;
        const W = singleSetWidth;
        const candidateShifts = [-2, -1, 0, 1, 2];
        let best = rawTarget,
          bestDist = Number.POSITIVE_INFINITY;
        for (const k of candidateShifts) {
          let c = rawTarget + k * W;
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

    // Handle window resize
    const handleResize = () => {
      setCardSize(getCardSize());
      snapToNearestCard();
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
      const singleSetWidth = TOTAL_CARD_WIDTH * displayCards.length;

      setScrollPosition(() => {
        const W = singleSetWidth;
        if (!W) return touchStartScrollPos;

        let newPosition = touchStartScrollPos + deltaX;

        while (newPosition < 0) newPosition += W;
        while (newPosition >= W * 3) newPosition -= W;

        if (newPosition < W * 0.5) {
          newPosition += W;
        } else if (newPosition >= W * 2.5) {
          newPosition -= W;
        }

        return newPosition;
      });
    };

    const handleTouchEnd = () => {
      scrollTimeoutRef.current = setTimeout(() => {
        snapToNearestCard();
      }, 100);
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
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
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
if (!loadingCampaigns && cards.length === 0) {
  return (
    <div className="flex items-center justify-center w-full h-full text-xs md:text-sm text-muted-foreground">
      No token data
    </div>
  );
}
  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full flex items-center overflow-hidden relative touch-pan-x scrollbar-hidden"
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
          transition: isSnapping
            ? "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "none",
          gap: `${CARD_GAP}px`,
        }}
      >
        {/* Render cards 3 times for seamless infinite scroll */}
        {[...displayCards, ...displayCards, ...displayCards].map((card, index) => {
          const isCentered = index === centeredTripleIndex;
          return (
            <Card
              card={card}
              key={`${card.id}-${index}`}
              isCentered={isCentered}
              onClick={() => handleCardClick(index)}
            />
          );
        })}
      </div>
    </div>
  );
};

const Card = ({
  card,
  isCentered,
  onClick,
}: {
  card: CarouselCard;
  isCentered: boolean;
  onClick: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const cardWidth = isMobile ? 280 : 450;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(card.contractAddress);
    setCopied(true);
    toast.success("Contract address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClick = () => {
    if (isCentered && card.campaignAddress !== "0x0000000000000000000000000000000000000000") {
      // Navigate to token details if centered/highlighted AND not a dummy address
      navigate(`/token/${card.campaignAddress.toLowerCase()}`);
    } else if (!isCentered) {
      // Otherwise just center the card
      onClick();
    }
  };

  return (
    <div
      className="relative transition-all duration-500 ease-out cursor-pointer"
      style={{
        transform: isCentered ? (isMobile ? "scale(1.15)" : "scale(1.5)") : "scale(1)",
        transformOrigin: "center",
        minWidth: `${cardWidth}px`,
        minHeight: `${cardWidth}px`,
        zIndex: isCentered ? 10 : 1,
        opacity: isMobile ? 1 : isCentered ? 1 : 0.85,
      }}
      onClick={handleClick}
    >
      <div
        className="relative rounded-[1.25rem] border-[0.75px] border-border p-2"
        style={{
          height: `${cardWidth}px`,
          width: `${cardWidth}px`,
        }}
      >
        <GlowingEffect
          spread={40}
          glow={false}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={3}
        />
        <div className="relative flex h-full flex-col overflow-hidden rounded-xl border-[0.75px] bg-card p-6 shadow-sm">
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
            <h3 className="text-2xl font-retro tracking-tight text-foreground">
              {card.ticker}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-retro text-muted-foreground">
                {card.tokenName}
              </span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="Copy contract address"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-accent" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-[10px] font-retro text-muted-foreground text-center leading-relaxed line-clamp-2">
              {card.description}
            </p>
          </div>

          {/* Bottom Right: Market Cap */}
          <div className="flex justify-end">
            <span className="text-xs font-retro text-accent">
              MC {card.marketCap}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Example;
