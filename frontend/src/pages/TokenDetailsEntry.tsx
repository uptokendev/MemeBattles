import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { useTokenStatsRealtime } from "@/hooks/useTokenStatsRealtime";
import { useLaunchpad, type CampaignInfo } from "@/lib/launchpadClient";
import {
  fetchSolanaCampaignCurveState,
  type SolanaCampaignCurveState,
} from "@/lib/solanaCampaignRead";
import { isSolanaTokenRouteId } from "@/lib/tokenDetailsPath";

import TokenDetails from "./TokenDetails";
import SolanaGraduatedTokenDetails from "./SolanaGraduatedTokenDetails";

const SOLANA_ROUTE_CACHE_PREFIX = "mwz:solana-token-route:v1:";
const SOLANA_ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SolanaRouteCache = {
  campaignAddress: string;
  graduated: boolean;
  updatedAt: number;
};

function tokenIdMatches(candidate?: string | null, routeId?: string | null): boolean {
  const left = String(candidate || "").trim();
  const right = String(routeId || "").trim();
  if (!left || !right) return false;
  return left === right || left.toLowerCase() === right.toLowerCase();
}

function routeCacheKey(routeId: string): string {
  return `${SOLANA_ROUTE_CACHE_PREFIX}${routeId}`;
}

function readRouteCache(routeId: string): SolanaRouteCache | null {
  if (typeof window === "undefined" || !routeId) return null;
  try {
    const raw = window.localStorage.getItem(routeCacheKey(routeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SolanaRouteCache>;
    const campaignAddress = String(parsed.campaignAddress || "").trim();
    const updatedAt = Number(parsed.updatedAt || 0);
    if (!campaignAddress || !Number.isFinite(updatedAt)) return null;
    if (Date.now() - updatedAt > SOLANA_ROUTE_CACHE_TTL_MS) return null;
    return {
      campaignAddress,
      graduated: parsed.graduated === true,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function writeRouteCache(routeId: string, cache: SolanaRouteCache) {
  if (typeof window === "undefined" || !routeId || !cache.campaignAddress) return;
  try {
    window.localStorage.setItem(routeCacheKey(routeId), JSON.stringify(cache));
  } catch {
    // Best-effort only.
  }
}

const TokenDetailsEntry = () => {
  const { campaignAddress } = useParams<{ campaignAddress: string }>();
  const [searchParams] = useSearchParams();
  const { fetchCampaigns } = useLaunchpad();

  const routeId = String(campaignAddress || "").trim();
  const forcedChainId = Number(searchParams.get("chainId") || "");
  const isSolanaRoute = useMemo(
    () => forcedChainId === SOLANA_CHAIN_ID || isSolanaTokenRouteId(routeId),
    [forcedChainId, routeId],
  );
  const initialCache = useMemo(
    () => (isSolanaRoute ? readRouteCache(routeId) : null),
    [isSolanaRoute, routeId],
  );

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [campaignResolved, setCampaignResolved] = useState<boolean>(!isSolanaRoute);
  const [curve, setCurve] = useState<SolanaCampaignCurveState | null>(null);
  const [curveResolved, setCurveResolved] = useState<boolean>(!isSolanaRoute);
  const [cachedCampaignAddress, setCachedCampaignAddress] = useState<string>(initialCache?.campaignAddress || "");
  const [stickyGraduated, setStickyGraduated] = useState<boolean>(initialCache?.graduated === true);

  useEffect(() => {
    if (!isSolanaRoute) {
      setCampaign(null);
      setCampaignResolved(true);
      setCurve(null);
      setCurveResolved(true);
      setCachedCampaignAddress("");
      setStickyGraduated(false);
      return;
    }

    const cache = readRouteCache(routeId);
    setCampaign(null);
    setCurve(null);
    setCampaignResolved(Boolean(cache?.campaignAddress));
    setCurveResolved(Boolean(cache?.campaignAddress));
    setCachedCampaignAddress(cache?.campaignAddress || "");
    setStickyGraduated(cache?.graduated === true);
  }, [isSolanaRoute, routeId]);

  useEffect(() => {
    if (!isSolanaRoute || !routeId) {
      setCampaign(null);
      setCampaignResolved(true);
      return;
    }

    let cancelled = false;
    setCampaignResolved(Boolean(cachedCampaignAddress));

    (async () => {
      try {
        const campaigns = await fetchCampaigns();
        if (cancelled) return;
        const match =
          campaigns.find((item) => tokenIdMatches(item.token, routeId) || tokenIdMatches(item.campaign, routeId)) ??
          null;
        if (match) {
          setCampaign(match);
          if (match.campaign) setCachedCampaignAddress(String(match.campaign).trim());
        }
      } catch {
        // Keep any previously resolved identity instead of clearing it.
      } finally {
        if (!cancelled) setCampaignResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cachedCampaignAddress, fetchCampaigns, isSolanaRoute, routeId]);

  const curveLookupAddress = useMemo(
    () => String(campaign?.campaign || cachedCampaignAddress || routeId || "").trim(),
    [cachedCampaignAddress, campaign?.campaign, routeId],
  );

  useEffect(() => {
    if (!isSolanaRoute || !curveLookupAddress) {
      setCurve(null);
      setCurveResolved(true);
      return;
    }

    let cancelled = false;
    setCurveResolved(Boolean(curve?.campaignAddress || cachedCampaignAddress));

    (async () => {
      try {
        const nextCurve = await fetchSolanaCampaignCurveState(curveLookupAddress);
        if (cancelled) return;
        if (nextCurve) {
          setCurve(nextCurve);
          setCachedCampaignAddress(String(nextCurve.campaignAddress || "").trim());
          if (nextCurve.graduated) setStickyGraduated(true);
        }
      } catch {
        // Preserve the last known curve identity; a temporary fetch miss must not de-graduate the route.
      } finally {
        if (!cancelled) setCurveResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cachedCampaignAddress, curve?.campaignAddress, curveLookupAddress, isSolanaRoute]);

  const resolvedCampaignAddress = useMemo(
    () => String(campaign?.campaign || curve?.campaignAddress || cachedCampaignAddress || "").trim(),
    [cachedCampaignAddress, campaign?.campaign, curve?.campaignAddress],
  );

  const { stats } = useTokenStatsRealtime(
    resolvedCampaignAddress || undefined,
    SOLANA_CHAIN_ID,
    isSolanaRoute && Boolean(resolvedCampaignAddress),
  );

  const indexedGraduated = stats?.graduated === true;
  const indexedDexReady = Boolean(stats?.dexPool || stats?.dexPosition || stats?.dex);
  const graduated = Boolean(
    stickyGraduated ||
      curve?.graduated ||
      (indexedGraduated && (indexedDexReady || Boolean(resolvedCampaignAddress))),
  );

  useEffect(() => {
    if (!isSolanaRoute || !routeId) return;
    if (graduated) setStickyGraduated(true);

    const campaignAddressToCache = String(resolvedCampaignAddress || cachedCampaignAddress || curveLookupAddress || "").trim();
    if (!campaignAddressToCache) return;
    writeRouteCache(routeId, {
      campaignAddress: campaignAddressToCache,
      graduated,
      updatedAt: Date.now(),
    });
  }, [
    cachedCampaignAddress,
    curveLookupAddress,
    graduated,
    isSolanaRoute,
    resolvedCampaignAddress,
    routeId,
  ]);

  if (!isSolanaRoute) return <TokenDetails />;

  if (graduated) {
    return <SolanaGraduatedTokenDetails routeId={routeId} campaign={campaign} initialCurve={curve} />;
  }

  if (!campaignResolved || !curveResolved) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4 text-sm text-muted-foreground">
        Loading Solana token...
      </div>
    );
  }

  return <TokenDetails />;
};

export default TokenDetailsEntry;
