import { useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";
import { CampaignCard, type CampaignCardVM } from "@/components/home/CampaignCard";
import type { HomeQuery } from "@/components/home/CampaignGrid";
import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeedBase";
import { getReadProvider } from "@/lib/readProvider";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi;
const PAGE_SIZE = 100;
const MAX_CAMPAIGNS = 500;
const READ_BATCH_SIZE = 12;

async function readGraduatedCampaigns(chainId: number): Promise<CampaignCardVM[]> {
  const provider = getReadProvider(chainId as any);
  const campaigns: any[] = [];
  let cursor: number | null = 0;

  while (cursor != null && campaigns.length < MAX_CAMPAIGNS) {
    const page = await fetchOnChainCampaignPage(chainId as any, { limit: PAGE_SIZE, cursor });
    campaigns.push(...page.campaigns);
    cursor = page.nextCursor;
    if (!page.campaigns.length) break;
  }

  const graduated: CampaignCardVM[] = [];
  for (let start = 0; start < campaigns.length; start += READ_BATCH_SIZE) {
    const batch = campaigns.slice(start, start + READ_BATCH_SIZE);
    const checked = await Promise.all(batch.map(async (campaign) => {
      try {
        const contract = new Contract(campaign.campaign, CAMPAIGN_ABI, provider) as any;
        if (!Boolean(await contract.launched())) return null;
        return {
          campaignAddress: String(campaign.campaign).toLowerCase(),
          tokenAddress: campaign.token ? String(campaign.token).toLowerCase() : null,
          name: String(campaign.name || "Unknown"),
          symbol: String(campaign.symbol || ""),
          logoURI: String(campaign.logoURI || ""),
          creator: campaign.creator ? String(campaign.creator).toLowerCase() : undefined,
          createdAt: campaign.createdAt ? Number(campaign.createdAt) : undefined,
          marketCapUsdLabel: null,
          athLabel: null,
          progressPct: 100,
          isDexTrading: true,
          votes24h: 0,
        } satisfies CampaignCardVM;
      } catch (error) {
        console.warn("[GraduatedCampaignGrid] lifecycle read failed", campaign.campaign, error);
        return null;
      }
    }));
    graduated.push(...checked.filter(Boolean) as CampaignCardVM[]);
  }

  return graduated;
}

function matchesQuery(campaign: CampaignCardVM, search: unknown) {
  const query = String(search ?? "").trim().toLowerCase();
  if (!query) return true;
  return [campaign.name, campaign.symbol, campaign.campaignAddress, campaign.tokenAddress, campaign.creator]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(query));
}

export function GraduatedCampaignGrid({ query }: { query: HomeQuery }) {
  const [chainId] = useSelectedFeedChainId();
  const [campaigns, setCampaigns] = useState<CampaignCardVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ chainId?: number }>).detail;
      if (detail?.chainId != null && Number(detail.chainId) !== chainId) return;
      setRefresh((value) => value + 1);
    };
    window.addEventListener("memebattles:txConfirmed", onRefresh as EventListener);
    return () => window.removeEventListener("memebattles:txConfirmed", onRefresh as EventListener);
  }, [chainId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void readGraduatedCampaigns(chainId)
      .then((items) => {
        if (!cancelled) setCampaigns(items);
      })
      .catch((reason) => {
        if (!cancelled) {
          setCampaigns([]);
          setError(String(reason?.message || reason || "Failed to load graduated campaigns"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [chainId, refresh]);

  const visible = useMemo(() => {
    const filtered = campaigns.filter((campaign) => matchesQuery(campaign, query.search));
    return filtered.slice().sort((a, b) => {
      const left = Number(a.createdAt || 0);
      const right = Number(b.createdAt || 0);
      return query.sort === "created_asc" ? left - right : right - left;
    });
  }, [campaigns, query.search, query.sort]);

  const gridClass = "grid grid-cols-2 gap-3 justify-items-stretch sm:[grid-template-columns:repeat(auto-fill,minmax(180px,220px))] sm:justify-start sm:gap-4";

  return (
    <div className="w-full">
      <div className="mb-3 text-xs text-muted-foreground">
        {loading ? "Checking campaign contracts..." : `Showing ${visible.length} graduated campaigns`}
      </div>

      {loading && !visible.length ? (
        <div className={gridClass}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-[1/2] w-full rounded-2xl border border-border/40 bg-card/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-orange-200">{error}</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No graduated campaigns found on this chain.</div>
      ) : (
        <div className={gridClass}>
          {visible.map((campaign) => (
            <CampaignCard key={campaign.campaignAddress} vm={campaign} chainIdForStorage={chainId} />
          ))}
        </div>
      )}
    </div>
  );
}
