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

function tokenIdMatches(candidate?: string | null, routeId?: string | null): boolean {
  const left = String(candidate || "").trim();
  const right = String(routeId || "").trim();
  if (!left || !right) return false;
  return left === right || left.toLowerCase() === right.toLowerCase();
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

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [campaignResolved, setCampaignResolved] = useState<boolean>(!isSolanaRoute);
  const [curve, setCurve] = useState<SolanaCampaignCurveState | null>(null);
  const [curveResolved, setCurveResolved] = useState<boolean>(!isSolanaRoute);

  useEffect(() => {
    if (!isSolanaRoute || !routeId) {
      setCampaign(null);
      setCampaignResolved(true);
      return;
    }

    let cancelled = false;
    setCampaignResolved(false);

    (async () => {
      try {
        const campaigns = await fetchCampaigns();
        if (cancelled) return;
        const match =
          campaigns.find((item) => tokenIdMatches(item.token, routeId) || tokenIdMatches(item.campaign, routeId)) ??
          null;
        setCampaign(match);
      } catch {
        if (!cancelled) setCampaign(null);
      } finally {
        if (!cancelled) setCampaignResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, isSolanaRoute, routeId]);

  const curveLookupAddress = useMemo(
    () => String(campaign?.campaign || routeId || "").trim(),
    [campaign?.campaign, routeId],
  );

  useEffect(() => {
    if (!isSolanaRoute || !curveLookupAddress) {
      setCurve(null);
      setCurveResolved(true);
      return;
    }

    let cancelled = false;
    setCurveResolved(false);

    (async () => {
      try {
        const nextCurve = await fetchSolanaCampaignCurveState(curveLookupAddress);
        if (!cancelled) setCurve(nextCurve);
      } catch {
        if (!cancelled) setCurve(null);
      } finally {
        if (!cancelled) setCurveResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [curveLookupAddress, isSolanaRoute]);

  const resolvedCampaignAddress = useMemo(
    () => String(campaign?.campaign || curve?.campaignAddress || "").trim(),
    [campaign?.campaign, curve?.campaignAddress],
  );

  const { stats } = useTokenStatsRealtime(
    resolvedCampaignAddress || undefined,
    SOLANA_CHAIN_ID,
    isSolanaRoute && Boolean(resolvedCampaignAddress),
  );

  if (!isSolanaRoute) return <TokenDetails />;

  if (!campaignResolved || !curveResolved) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center px-4 text-sm text-muted-foreground">
        Loading Solana token...
      </div>
    );
  }

  const graduated = Boolean(curve?.graduated || stats?.graduated);
  if (!graduated) return <TokenDetails />;

  return <SolanaGraduatedTokenDetails routeId={routeId} campaign={campaign} initialCurve={curve} />;
};

export default TokenDetailsEntry;
