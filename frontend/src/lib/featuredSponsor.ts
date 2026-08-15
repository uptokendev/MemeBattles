import { apiFetch } from "@/lib/apiBase";
import {
  FEATURED_HOUSE_AD,
  type FeaturedSponsorPlacement,
} from "@/components/home/SponsoredFeaturedSlotCard";

export const FEATURED_SPONSOR_SLOT = "featured-top-left";

export async function loadFeaturedSponsorSlot(chainId: number): Promise<FeaturedSponsorPlacement | null> {
  try {
    const qs = new URLSearchParams({
      chainId: String(chainId),
      slot: FEATURED_SPONSOR_SLOT,
      select: "one",
      strategy: "weighted",
      limit: "1",
    });
    const res = await apiFetch(`/api/sponsored?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const houseEnabled = json?.houseAdEnabled !== false;
    const item = Array.isArray(json?.items) ? json.items[0] : null;
    if (!item) return houseEnabled ? { ...FEATURED_HOUSE_AD } : null;
    const imageUrl = item.imageUrl || item.logoUri || item.logoURI || item.image_url || null;
    const name = String(item.name || item.projectName || "").trim();
    const isHouse =
      Boolean(item.isHouseAd) ||
      String(item.id || "") === "house-advertise-featured" ||
      String(item.placementType || "") === "house";
    if (!name && !imageUrl) return houseEnabled ? { ...FEATURED_HOUSE_AD } : null;
    return {
      id: item.id != null ? String(item.id) : null,
      name: name || (isHouse ? "Advertise here" : "Sponsored"),
      imageUrl: imageUrl || FEATURED_HOUSE_AD.imageUrl,
      logoUri: item.logoUri || imageUrl || FEATURED_HOUSE_AD.logoUri,
      targetUrl: isHouse ? null : item.targetUrl || item.websiteUrl || item.url || null,
      websiteUrl: isHouse ? null : item.websiteUrl || item.targetUrl || null,
      bio: item.bio || (isHouse ? FEATURED_HOUSE_AD.bio : null),
      placementLabel: item.placementLabel || (isHouse ? "Open spot" : "Sponsored"),
      slotCode: item.slotCode || FEATURED_SPONSOR_SLOT,
      isHouseAd: isHouse,
    };
  } catch {
    return null;
  }
}
