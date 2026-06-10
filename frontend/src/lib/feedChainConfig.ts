import { getActiveChainId, getDefaultChainId, isAllowedChainId, type SupportedChainId } from "@/lib/chainConfig";

function readEnvChainId(name: string): SupportedChainId | null {
  const raw = (import.meta.env[name] as string | undefined) ?? "";
  const chainId = Number(raw);
  return Number.isFinite(chainId) && isAllowedChainId(chainId) ? (chainId as SupportedChainId) : null;
}

function resolveFeedChainId(envNames: string[], walletChainId?: number | null): SupportedChainId {
  for (const envName of envNames) {
    const configured = readEnvChainId(envName);
    if (configured) return configured;
  }

  return getActiveChainId(walletChainId);
}

export function getCampaignFeedChainId(walletChainId?: number | null): SupportedChainId {
  return resolveFeedChainId(["VITE_CAMPAIGN_FEED_CHAIN_ID", "VITE_LOCALDEV_CAMPAIGN_CHAIN_ID"], walletChainId);
}

export function getDraftDiscoveryChainId(walletChainId?: number | null): SupportedChainId {
  return resolveFeedChainId(["VITE_DRAFT_FEED_CHAIN_ID", "VITE_DRAFT_DISCOVERY_CHAIN_ID"], walletChainId);
}

export function getWarRoomFeedChainId(walletChainId?: number | null): SupportedChainId {
  return resolveFeedChainId(["VITE_WAR_ROOM_CHAIN_ID", "VITE_CAMPAIGN_FEED_CHAIN_ID", "VITE_LOCALDEV_CAMPAIGN_CHAIN_ID"], walletChainId);
}

export function getTickerFeedChainId(walletChainId?: number | null): SupportedChainId {
  return resolveFeedChainId(["VITE_TICKER_FEED_CHAIN_ID", "VITE_CAMPAIGN_FEED_CHAIN_ID", "VITE_LOCALDEV_CAMPAIGN_CHAIN_ID"], walletChainId);
}

export function getFeaturedFeedChainId(walletChainId?: number | null): SupportedChainId {
  return resolveFeedChainId(["VITE_FEATURED_FEED_CHAIN_ID", "VITE_CAMPAIGN_FEED_CHAIN_ID", "VITE_LOCALDEV_CAMPAIGN_CHAIN_ID"], walletChainId);
}

export function getCreateDeployChainId(walletChainId?: number | null): SupportedChainId {
  return getActiveChainId(walletChainId) || getDefaultChainId();
}
