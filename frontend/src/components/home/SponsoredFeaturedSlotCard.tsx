/**
 * Fixed Featured top-left sponsorship cell.
 * Isolated from organic vote ranking and Arena sponsored rail.
 */
import { ExternalLink } from "lucide-react";
import { resolveImageUri } from "@/lib/media";

export type FeaturedSponsorPlacement = {
  id?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  logoUri?: string | null;
  targetUrl?: string | null;
  websiteUrl?: string | null;
  bio?: string | null;
  placementLabel?: string | null;
  slotCode?: string | null;
  /** House inventory — opens apply dialog instead of external link. */
  isHouseAd?: boolean;
};

export const FEATURED_HOUSE_AD: FeaturedSponsorPlacement = {
  id: "house-advertise-featured",
  name: "Advertise here",
  bio: "Put your project in Featured. Apply for a rotating sponsorship slot.",
  imageUrl: "/assets/memewarzone.png",
  logoUri: "/assets/memewarzone.png",
  placementLabel: "Open spot",
  slotCode: "featured-top-left",
  isHouseAd: true,
};

function usefulImage(value: unknown) {
  const raw = String(value ?? "").trim();
  return Boolean(raw && raw !== "/placeholder.svg" && raw !== "-");
}

export function SponsoredFeaturedSlotCard({
  placement,
  className = "",
  onHouseAdClick,
}: {
  placement: FeaturedSponsorPlacement;
  className?: string;
  onHouseAdClick?: () => void;
}) {
  const title = String(placement.name || "Sponsored").trim() || "Sponsored";
  const imageRaw = placement.imageUrl || placement.logoUri;
  const image = usefulImage(imageRaw) ? resolveImageUri(String(imageRaw)) : null;
  const href = String(placement.targetUrl || placement.websiteUrl || "").trim();
  const isHouse = Boolean(placement.isHouseAd);
  const pill = String(placement.placementLabel || (isHouse ? "Open spot" : "Sponsored")).trim() || "Sponsored";
  const clickable = isHouse || Boolean(href);

  const open = () => {
    if (isHouse) {
      onHouseAdClick?.();
      return;
    }
    if (!href) return;
    try {
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`mwz-hud-frame group relative flex h-[150px] w-full overflow-hidden rounded-none border ${
        isHouse ? "border-dashed border-amber-400/55" : "border-amber-400/45"
      } bg-black/80 transition hover:border-amber-300/80 hover:shadow-[0_0_18px_rgba(251,191,36,0.18)] ${clickable ? "cursor-pointer" : ""} ${className}`}
      role={clickable ? "button" : "article"}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? open : undefined}
      onKeyDown={(event) => {
        if (!clickable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      aria-label={isHouse ? "Advertise here — open sponsorship application" : `Sponsored: ${title}`}
    >
      <div className="absolute inset-0">
        <img
          src={image || "/placeholder.svg"}
          alt=""
          className="h-full w-full object-cover opacity-95 transition duration-300 group-hover:scale-[1.03]"
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            const el = event.currentTarget;
            if (el.dataset.fallbackApplied === "1") return;
            el.dataset.fallbackApplied = "1";
            el.src = "/placeholder.svg";
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.55)_48%,rgba(0,0,0,0.88)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.12),transparent_55%)]" />
      </div>

      <div className="absolute right-2 top-2 z-10 border border-amber-300/70 bg-black/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
        {pill}
      </div>

      <div className="relative z-10 flex h-full w-full flex-col justify-end p-3 pl-4">
        <div className="max-w-[92%]">
          <div className="truncate text-[18px] font-semibold leading-tight text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)] group-hover:text-amber-100">
            {title}
          </div>
          {placement.bio ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/80">{placement.bio}</p>
          ) : (
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-amber-200/80">Featured partner</p>
          )}
        </div>
        {isHouse ? (
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
            Apply now <ExternalLink className="h-3 w-3" />
          </div>
        ) : href ? (
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
            Visit <ExternalLink className="h-3 w-3" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SponsoredFeaturedSlotCard;
