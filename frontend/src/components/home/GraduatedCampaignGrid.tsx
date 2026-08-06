import { useEffect, useMemo, useState } from "react";
import { Contract, type InterfaceAbi } from "ethers";
import { CampaignCard, type CampaignCardVM } from "@/components/home/CampaignCard";
import type { HomeQuery } from "@/components/home/CampaignGrid";
import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";
import { apiFetch } from "@/lib/apiBase";
import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeedBase";
import { getReadProvider } from "@/lib/readProvider";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as InterfaceAbi;
const PAGE_SIZE = 100;
const MAX_CAMPAIGNS = 500;
const READ_BATCH_SIZE = 12;

type CampaignCandidate = {
  campaign: string;
  token?: string | null;
  creator?: string | null;
  name?: string | null;
  symbol?: string | null;
  logoURI?: string | null;
  createdAt?: number;
  votes24h?: number;
};

function isAddress(value: unknown) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function toUnixSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

async function readIndexedCandidates(chainId: number): Promise<CampaignCandidate[]> {
  try {
    const params = new URLSearchParams({
      chainId: String(chainId),
      limit: String(MAX_CAMPAIGNS),
      cursor: "0",
      tab: "trending",
      sort: "created_desc",
      status: "all",
      _r: String(Date.now()),
    });
    const response = await apiFetch(`/api/campaigns?${params.toString()}`, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(json?.items)) return [];
    return json.items.map((item: any): CampaignCandidate | null => {
      const campaign = String(item?.campaignAddress ?? item?.campaign_address ?? "").toLowerCase();
      if (!isAddress(campaign)) return null;
      return {
        campaign,
        token: item?.tokenAddress ?? item?.token_address ?? null,
        creator: item?.creatorAddress ?? item?.creator_address ?? null,
        name: item?.name ?? null,
        symbol: item?.symbol ?? null,
        logoURI: item?.logoUri ?? item?.logo_uri ?? item?.logoURI ?? null,
        createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain),
        votes24h: Number(item?.votes24h ?? item?.votes_24h ?? 0),
      };
    }).filter(Boolean) as CampaignCandidate[];
  } catch {
    return [];
  }
}

async function readActiveFactoryCandidates(chainId: number): Promise<CampaignCandidate[]> {
  const campaigns: CampaignCandidate[] = [];
  let cursor: number | null = 0;

  while (cursor != null && campaigns.length < MAX_CAMPAIGNS) {
    const page = await fetchOnChainCampaignPage(chainId as any, { limit: PAGE_SIZE, cursor });
    campaigns.push(...page.campaigns.map((campaign) => ({
      campaign: String(campaign.campaign).toLowerCase(),
      token: campaign.token || null,
      creator: campaign.creator || null,
      name: campaign.name || null,
      symbol: campaign.symbol || null,
      logoURI: campaign.logoURI || null,
      createdAt: campaign.createdAt,
      votes24h: 0,
    })));
    cursor = page.nextCursor;
    if (!page.campaigns.length) break;
  }

  return campaigns;
}

async function readGraduatedCampaigns(chainId: number): Promise<CampaignCardVM[]> {
  const provider = getReadProvider(chainId as any);
  const [indexed, activeFactory] = await Promise.all([
    readIndexedCandidates(chainId),
    readActiveFactoryCandidates(chainId),
  ]);

  const merged = new Map<string, CampaignCandidate>();
  for (const candidate of [...indexed, ...activeFactory]) {
    if (!isAddress(candidate.campaign)) continue;
    const key = candidate.campaign.toLowerCase();
    merged.set(key, { ...(merged.get(key) || {}), ...candidate, campaign: key });
  }

  const campaigns = Array.from(merged.values()).slice(0, MAX_CAMPAIGNS);
  const graduated: CampaignCardVM[] = [];
  for (let start = 0; start < campaigns.length; start += READ_BATCH_SIZE) {
    const batch = campaigns.slice(start, start + READ_BATCH_SIZE);
    const checked = await Promise.all(batch.map(async (campaign) => {
      try {
        const contract = new Contract(campaign.campaign, CAMPAIGN_ABI, provider) as any;
        if (!(await contract.launched())) return null;
        return {
          campaignAddress: campaign.campaign,
          tokenAddress: isAddress(campaign.token) ? String(campaign.token).toLowerCase() : null,
          name: String(campaign.name || "Unknown"),
          symbol: String(campaign.symbol || ""),
          logoURI: String(campaign.logoURI || ""),
          creator: isAddress(campaign.creator) ? String(campaign.creator).toLowerCase() : undefined,
          createdAt: campaign.createdAt,
          marketCapUsdLabel: null,
          athLabel: null,
          progressPct: 100,
          isDexTrading: true,
          votes24h: Number(campaign.votes24h || 0),
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
    window.addEventListener("memewarzone:txConfirmed", onRefresh as EventListener);
    return () => window.removeEventListener("memewarzone:txConfirmed", onRefresh as EventListener);
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
