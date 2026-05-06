import { useCallback } from "react";
import { ethers } from "ethers";
import { apiFetch } from "@/lib/apiBase";
import { resolveImageUri } from "@/lib/media";
import { useLaunchpad as useBaseLaunchpad } from "./launchpadClient";

export * from "./launchpadClient";
export type { CampaignInfo } from "./launchpadClient";

import type { CampaignInfo } from "./launchpadClient";

function normalizeAddress(value: unknown): string {
  const raw = String(value ?? "").trim();
  return ethers.isAddress(raw) ? raw.toLowerCase() : "";
}

function toUnixSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function buildMetadataURI(chainId: number, tokenOrCampaignAddress?: string): string {
  const address = normalizeAddress(tokenOrCampaignAddress);
  return address ? `/api/token-metadata/${chainId}/${address}` : "";
}

function isKnownDeadLogoUri(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  if (raw === "/placeholder.svg") return true;

  const resolved = resolveImageUri(raw);
  if (!resolved) return true;

  try {
    const url = new URL(resolved, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return url.hostname === "jlbdueorprgnfkcpnkfq.supabase.co";
  } catch {
    return false;
  }
}

function normalizeLogoUri(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "/placeholder.svg";

  const resolved = resolveImageUri(raw);
  if (!resolved) return "/placeholder.svg";

  if (isKnownDeadLogoUri(resolved)) return "/placeholder.svg";
  return resolved;
}

function mapDbCampaign(item: any, idx: number, chainId: number): CampaignInfo | null {
  const campaign = normalizeAddress(item?.campaignAddress ?? item?.campaign_address ?? item?.campaign);
  if (!campaign) return null;

  const token = normalizeAddress(item?.tokenAddress ?? item?.token_address ?? item?.token);
  const creator = normalizeAddress(item?.creatorAddress ?? item?.creator_address ?? item?.creator);

  return {
    id: 100000 + idx,
    campaign,
    token,
    creator,
    name: String(item?.name ?? "Unknown"),
    symbol: String(item?.symbol ?? ""),
    logoURI: normalizeLogoUri(item?.logoUri ?? item?.logoURI ?? item?.logo_uri),
    metadataURI: buildMetadataURI(chainId, token || campaign),
    xAccount: String(item?.xAccount ?? item?.xUrl ?? item?.x_url ?? ""),
    website: String(item?.website ?? item?.websiteUrl ?? item?.website_url ?? ""),
    extraLink: String(item?.extraLink ?? item?.extraUrl ?? item?.otherUrl ?? item?.other_url ?? ""),
    createdAt: toUnixSeconds(item?.createdAtChain ?? item?.created_at_chain ?? item?.createdAt ?? item?.created_at),
    dexPairAddress: item?.dexPairAddress ?? item?.dex_pair_address ?? undefined,
    dexScreenerUrl: item?.dexScreenerUrl ?? item?.dex_screener_url ?? undefined,
  };
}

async function fetchDbCampaigns(chainId: number, limit = 500): Promise<CampaignInfo[]> {
  try {
    const res = await apiFetch(
      `/api/campaigns?chainId=${encodeURIComponent(String(chainId))}&limit=${encodeURIComponent(String(limit))}&tab=trending&sort=default&status=all`,
      { cache: "no-store" as RequestCache }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));

    const items = Array.isArray(json?.items) ? json.items : [];
    return items.map((item: any, idx: number) => mapDbCampaign(item, idx, chainId)).filter(Boolean) as CampaignInfo[];
  } catch (error) {
    console.warn("[launchpadClientHybrid] DB campaign fallback failed", error);
    return [];
  }
}

function mergeCampaigns(onChain: CampaignInfo[], db: CampaignInfo[]): CampaignInfo[] {
  const seen = new Set<string>();
  const merged: CampaignInfo[] = [];

  for (const item of [...onChain, ...db]) {
    const key = normalizeAddress(item?.campaign);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

async function hydrateLogosFromContract(
  campaigns: CampaignInfo[],
  fetchCampaignLogoURI: (campaignAddress: string) => Promise<string | null>
): Promise<CampaignInfo[]> {
  const targets = campaigns.filter((campaign) => isKnownDeadLogoUri(campaign.logoURI)).slice(0, 25);
  if (!targets.length) return campaigns;

  const hydrated = new Map<string, string>();
  await Promise.all(
    targets.map(async (campaign) => {
      try {
        const logo = await fetchCampaignLogoURI(campaign.campaign);
        const normalized = normalizeLogoUri(logo);
        if (!isKnownDeadLogoUri(normalized)) hydrated.set(campaign.campaign.toLowerCase(), normalized);
      } catch {
        // best-effort only
      }
    })
  );

  if (!hydrated.size) return campaigns;

  return campaigns.map((campaign) => {
    const logoURI = hydrated.get(campaign.campaign.toLowerCase());
    return logoURI ? { ...campaign, logoURI } : campaign;
  });
}

export function useLaunchpad() {
  const base = useBaseLaunchpad();

  const fetchCampaigns = useCallback(async (): Promise<CampaignInfo[]> => {
    const [onChain, db] = await Promise.all([
      base.fetchCampaigns().catch((error: unknown) => {
        console.warn("[launchpadClientHybrid] on-chain campaign page failed", error);
        return [] as CampaignInfo[];
      }),
      fetchDbCampaigns(Number(base.activeChainId || 97)),
    ]);

    const merged = mergeCampaigns(onChain, db);
    return hydrateLogosFromContract(merged, base.fetchCampaignLogoURI);
  }, [base]);

  return {
    ...base,
    fetchCampaigns,
  };
}
