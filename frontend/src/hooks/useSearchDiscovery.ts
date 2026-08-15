import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiBase";
import { getBnbCampaignFeedChainIds } from "@/lib/feedChainConfig";
import { loadFeaturedSponsorSlot } from "@/lib/featuredSponsor";
import { normalizeTokenRouteAddress, tokenDetailsPath } from "@/lib/tokenDetailsPath";
import type { FeaturedSponsorPlacement } from "@/components/home/SponsoredFeaturedSlotCard";

export type SearchRailToken = {
  chainId: number;
  name: string;
  symbol: string;
  logoURI?: string;
  marketcapBnb?: string | null;
  href: string;
};

function mapRailToken(raw: Record<string, unknown>, fallbackChainId: number): SearchRailToken | null {
  const chainId = Number(raw.chainId ?? raw.chain_id ?? fallbackChainId) || fallbackChainId;
  const campaignAddress = normalizeTokenRouteAddress(
    raw.campaignAddress ?? raw.campaign_address ?? raw.campaign,
    chainId,
  );
  const tokenAddress = normalizeTokenRouteAddress(raw.tokenAddress ?? raw.token_address ?? raw.token, chainId);
  const href = tokenDetailsPath({ tokenAddress, campaignAddress, chainId }, { chainId });
  if (!href) return null;
  return {
    chainId,
    name: String(raw.name || raw.symbol || "Unknown"),
    symbol: String(raw.symbol || raw.ticker || ""),
    logoURI: raw.logoURI || raw.logoUri || raw.logo_uri ? String(raw.logoURI || raw.logoUri || raw.logo_uri) : undefined,
    marketcapBnb: raw.marketcapBnb != null || raw.marketcap_bnb != null ? String(raw.marketcapBnb ?? raw.marketcap_bnb) : null,
    href,
  };
}

async function fetchJsonItems(path: string): Promise<Record<string, unknown>[]> {
  const res = await apiFetch(path, { cache: "no-store" });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

export function useSearchDiscovery(open: boolean, chainId: number) {
  const [sponsor, setSponsor] = useState<FeaturedSponsorPlacement | null>(null);
  const [featured, setFeatured] = useState<SearchRailToken[]>([]);
  const [trending, setTrending] = useState<SearchRailToken[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const chainIds = getBnbCampaignFeedChainIds(chainId);

    void (async () => {
      const [slot, featuredPages, trendingPages] = await Promise.all([
        loadFeaturedSponsorSlot(chainId),
        Promise.all(
          chainIds.map((id) =>
            fetchJsonItems(`/api/featured?chainId=${id}&sort=24h&limit=12`).catch(() => []),
          ),
        ),
        Promise.all(
          chainIds.map((id) =>
            fetchJsonItems(`/api/campaigns?chainId=${id}&tab=trending&status=all&limit=12`).catch(() => []),
          ),
        ),
      ]);
      if (cancelled) return;
      setSponsor(slot);
      const featuredRows = featuredPages
        .flatMap((rows, index) => rows.map((row) => mapRailToken(row, chainIds[index] || chainId)))
        .filter((row): row is SearchRailToken => Boolean(row));
      const trendingRows = trendingPages
        .flatMap((rows, index) => rows.map((row) => mapRailToken(row, chainIds[index] || chainId)))
        .filter((row): row is SearchRailToken => Boolean(row));
      const dedupe = (rows: SearchRailToken[]) => {
        const seen = new Set<string>();
        return rows.filter((row) => {
          if (seen.has(row.href)) return false;
          seen.add(row.href);
          return true;
        });
      };
      setFeatured(dedupe(featuredRows).slice(0, 16));
      setTrending(dedupe(trendingRows).slice(0, 16));
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, open]);

  return { sponsor, featured, trending };
}
