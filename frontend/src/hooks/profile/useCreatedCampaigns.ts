import { useEffect, useState } from "react";
import { Contract } from "ethers";
import type { CampaignSummary } from "@/lib/launchpadClient";
import { formatTimeAgo } from "@/lib/profile/profileFormatters";
import { getActiveChainId, getFactoryAddress } from "@/lib/chainConfig";
import { getReadProvider } from "@/lib/readProvider";

type FetchCampaigns = () => Promise<any[]>;
type FetchCampaignSummary = (campaign: any) => Promise<CampaignSummary>;

export interface CreatedCampaignCard {
  id: number;
  image: string;
  name: string;
  ticker: string;
  campaignAddress: string;
  tokenAddress?: string;
  marketCap: string;
  timeAgo: string;
  buyersCount?: number;
}

interface UseCreatedCampaignsArgs {
  viewedAddress: string | null;
  account: string | null;
  chainId?: number;
  fetchCampaigns: FetchCampaigns;
  fetchCampaignSummary: FetchCampaignSummary;
}

const LEGACY_FACTORY_ABI = [
  "function campaignsCount() view returns (uint256)",
  "function getCampaignPage(uint256 offset, uint256 limit) view returns ((address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt)[] page)",
] as const;

function normalizeAddress(value?: string | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}

function mapFactoryCampaign(raw: any, id: number) {
  return {
    id,
    campaign: String(raw?.campaign ?? "").toLowerCase(),
    token: String(raw?.token ?? "").toLowerCase(),
    creator: String(raw?.creator ?? "").toLowerCase(),
    name: String(raw?.name ?? "Unnamed coin"),
    symbol: String(raw?.symbol ?? "???"),
    logoURI: String(raw?.logoURI ?? "") || "/placeholder.svg",
    xAccount: String(raw?.xAccount ?? ""),
    website: String(raw?.website ?? ""),
    extraLink: String(raw?.extraLink ?? ""),
    createdAt: raw?.createdAt ? Number(raw.createdAt) : undefined,
  };
}

async function fetchCreatedCampaignsOnChain(chainId: number | undefined, creator: string): Promise<any[]> {
  try {
    const activeChainId = getActiveChainId(Number(chainId ?? 97));
    const factoryAddress = getFactoryAddress(activeChainId);
    if (!factoryAddress) return [];

    const provider = getReadProvider(activeChainId);
    const factory = new Contract(factoryAddress, LEGACY_FACTORY_ABI, provider) as any;

    const totalRaw: bigint = await factory.campaignsCount();
    const total = Number(totalRaw ?? 0n);
    if (!Number.isFinite(total) || total <= 0) return [];

    const pageSize = 50;
    const maxPages = 10; // enough for the latest 500 launches without hammering public RPC
    const out: any[] = [];

    for (let page = 0; page < maxPages; page++) {
      const endExclusive = total - page * pageSize;
      if (endExclusive <= 0) break;

      const offset = Math.max(0, endExclusive - pageSize);
      const limit = endExclusive - offset;
      const rows = await factory.getCampaignPage(offset, limit);

      const mapped = Array.from(rows ?? [])
        .map((row: any, idx: number) => mapFactoryCampaign(row, offset + idx))
        .reverse();

      for (const item of mapped) {
        if (normalizeAddress(item.creator) === creator) out.push(item);
      }

      // Stop early once we have enough for the Command Center card grid.
      if (out.length >= 100) break;
    }

    return out;
  } catch {
    return [];
  }
}

export function useCreatedCampaigns({
  viewedAddress,
  account,
  chainId,
  fetchCampaigns,
  fetchCampaignSummary,
}: UseCreatedCampaignsArgs) {
  const [created, setCreated] = useState<CreatedCampaignCard[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadCreated = async () => {
      try {
        const owner = normalizeAddress(viewedAddress || account);
        if (!owner) {
          setCreated([]);
          return;
        }

        const campaigns = (await fetchCampaigns().catch(() => [])) ?? [];
        let mine = campaigns.filter(
          (c) => normalizeAddress(c?.creator) === owner,
        );

        if (!mine.length) {
          mine = await fetchCreatedCampaignsOnChain(chainId, owner);
        }

        const results = await Promise.allSettled(mine.map((c) => fetchCampaignSummary(c)));

        if (cancelled) return;

        const next = results
          .filter((r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled")
          .map((r, idx) => {
            const s = r.value;
            return {
              id: typeof s.campaign.id === "number" ? s.campaign.id : idx + 1,
              image: s.campaign.logoURI || "/placeholder.svg",
              name: s.campaign.name,
              ticker: s.campaign.symbol,
              campaignAddress: s.campaign.campaign,
              tokenAddress: s.campaign.token,
              marketCap: s.stats.marketCap,
              timeAgo: (s.campaign as any).timeAgo || formatTimeAgo(s.campaign.createdAt),
              buyersCount: (s.stats as any)?.buyersCount ?? undefined,
            };
          });

        setCreated(next);
      } catch (e) {
        console.error("[Profile] Failed to load created campaigns", e);
        if (!cancelled) setCreated([]);
      }
    };

    loadCreated();
    return () => {
      cancelled = true;
    };
  }, [viewedAddress, account, chainId, fetchCampaigns, fetchCampaignSummary]);

  return created;
}
