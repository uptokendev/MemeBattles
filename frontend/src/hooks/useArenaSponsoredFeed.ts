import { useEffect, useMemo, useState } from "react";
import type { ArenaCampaignFeedSource, ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { apiFetch } from "@/lib/apiBase";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

type SponsoredPlacementInfo = {
  id: string;
  imageUrl: string;
  name: string;
  bio: string;
  websiteUrl: string;
  placementLabel: string;
  activeDatesLabel?: string | null;
};

function trimText(value?: string | null, max = 140) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function formatPlacementDates(start?: string | null, end?: string | null) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return null;

  const startLabel = startDate.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  if (!endDate || Number.isNaN(endDate.getTime())) return `Active ${startLabel}`;

  const endLabel = endDate.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function normalizeSponsoredPlacement(item: any, index: number): SponsoredPlacementInfo | null {
  const name = trimText(item?.name ?? item?.title ?? item?.projectName ?? item?.project_name, 80);
  const bio = trimText(item?.bio ?? item?.shortBio ?? item?.short_bio ?? item?.summary ?? item?.description, 140);
  const websiteUrl = String(item?.websiteUrl ?? item?.website_url ?? item?.website ?? item?.targetUrl ?? item?.target_url ?? "").trim();
  const imageUrl = resolveImageUri(item?.imageUrl ?? item?.image_url ?? item?.logoUri ?? item?.logoURI ?? item?.logo_url ?? item?.logo_uri);
  const placementLabel = trimText(item?.placementLabel ?? item?.placement_label ?? item?.slotLabel ?? item?.slot_label ?? item?.slotCode ?? item?.slot_code, 48) || "Homepage rail";
  const activeDatesLabel = formatPlacementDates(item?.startsAt ?? item?.starts_at ?? item?.preferredStart ?? item?.preferred_start, item?.endsAt ?? item?.ends_at ?? item?.preferredEnd ?? item?.preferred_end);

  if (!name || !bio || !websiteUrl || !imageUrl) return null;

  return {
    id: String(item?.id ?? item?.placementId ?? item?.placement_id ?? websiteUrl ?? `sponsored-${index}`),
    imageUrl,
    name,
    bio,
    websiteUrl,
    placementLabel,
    activeDatesLabel,
  };
}

export function useArenaSponsoredFeed(limit = 4) {
  const { activeChainId } = useLaunchpad();
  const [placements, setPlacements] = useState<SponsoredPlacementInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ArenaCampaignFeedSource>("empty");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          chainId: String(activeChainId || 97),
          limit: String(limit),
        });
        const response = await apiFetch(`/api/sponsored?${params.toString()}`, { cache: "no-store" as RequestCache });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
        if (cancelled) return;

        const items = Array.isArray(json?.items) ? json.items : [];
        const nextPlacements = items.map((item: any, index: number) => normalizeSponsoredPlacement(item, index)).filter(Boolean) as SponsoredPlacementInfo[];
        setPlacements(nextPlacements);
        setSource(nextPlacements.length ? "api" : "empty");
      } catch (error) {
        console.warn("[useArenaSponsoredFeed] failed to load sponsored feed", error);
        if (!cancelled) {
          setPlacements([]);
          setSource("empty");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeChainId, limit]);

  const railItems = useMemo<ArenaCampaignRailItem[]>(() => {
    return placements.map((placement) => ({
      id: placement.id,
      title: placement.name,
      symbol: "",
      href: placement.websiteUrl,
      detail: "",
      statusLabel: "Sponsored",
      statusTone: "sponsored",
      rankLabel: placement.placementLabel,
      imageUrl: placement.imageUrl,
      summary: placement.bio,
      websiteUrl: placement.websiteUrl,
      websiteLabel: "Website",
      activeDatesLabel: placement.activeDatesLabel,
      cardVariant: "sponsored",
    }));
  }, [placements]);

  return {
    loading,
    source,
    railItems,
    hasSponsoredCampaigns: railItems.length > 0,
  };
}