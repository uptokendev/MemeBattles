import { Contract, ethers } from "ethers";

import { apiFetch } from "@/lib/apiBase";
import type { SupportedChainId } from "@/lib/chainConfig";
import type { CampaignDraft } from "@/lib/draftApi";
import { getReadProvider } from "@/lib/readProvider";

const SCHEDULE_ABI = ["function launchAt() view returns (uint64)"] as const;

export type CampaignDraftLifecycle = CampaignDraft & {
  scheduledLaunchAt?: string | null;
  draftCreatedAt?: string | null;
  contractDeployedAt?: string | null;
  tradingLaunchAt?: string | null;
};

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

export function timestampSeconds(value?: string | number | null) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function timestampIso(value?: string | number | null) {
  const seconds = timestampSeconds(value);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export async function fetchPublicCampaignLifecycleDrafts(input: { chainId?: number; limit?: number } = {}) {
  const response = await apiFetch(
    `/api/drafts${query({ chainId: input.chainId, limit: input.limit ?? 200, lifecycle: "campaign" })}`,
    { cache: "no-store" },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(json?.error || json?.message || `Request failed (${response.status})`));
  return Array.isArray(json.items) ? (json.items as CampaignDraftLifecycle[]) : [];
}

export async function readCampaignLaunchAt(chainId: number, campaignAddress?: string | null) {
  const address = String(campaignAddress || "").trim();
  if (!ethers.isAddress(address)) return null;
  try {
    const provider = getReadProvider(chainId as SupportedChainId);
    const campaign = new Contract(address, SCHEDULE_ABI, provider) as any;
    const launchAt = Number(await campaign.launchAt());
    return Number.isFinite(launchAt) && launchAt > 0 ? Math.floor(launchAt) : null;
  } catch {
    return null;
  }
}

export function lifecycleByCampaign(items: CampaignDraftLifecycle[]) {
  return new Map(
    (items || [])
      .filter((item) => item.campaignAddress)
      .map((item) => [String(item.campaignAddress).toLowerCase(), item] as const),
  );
}
