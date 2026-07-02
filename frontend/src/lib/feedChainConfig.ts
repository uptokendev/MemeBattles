import { getActiveChainId, getDefaultChainId, isAllowedChainId, type SupportedChainId } from "@/lib/chainConfig";

const BNB_TESTNET_CHAIN_ID: SupportedChainId = 97;
const LAST_FEATURED_CHAIN_KEY = "mwz:last_featured_chain_id";

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return String(env[name] ?? "").trim();
}

function readEnvChainId(name: string): SupportedChainId | null {
  const raw = readEnv(name);
  const chainId = Number(raw);
  return Number.isFinite(chainId) && isAllowedChainId(chainId) ? (chainId as SupportedChainId) : null;
}

function readConfiguredChainId(envNames: string[]): SupportedChainId | null {
  for (const envName of envNames) {
    const configured = readEnvChainId(envName);
    if (configured) return configured;
  }
  return null;
}

function envTrue(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(readEnv(name).toLowerCase());
}

function envFalse(name: string): boolean {
  return ["0", "false", "no", "off"].includes(readEnv(name).toLowerCase());
}

function isLikelyDevOrStagingHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("netlify") ||
    host.includes("vercel") ||
    host.includes("railway") ||
    host.includes("staging") ||
    host.includes("preview") ||
    host.includes("dev")
  );
}

function shouldDefaultFeaturedToTestnet(): boolean {
  if (envFalse("VITE_ENABLE_TESTNET_FEATURED_FEED")) return false;
  if (envTrue("VITE_ENABLE_TESTNET_FEATURED_FEED")) return true;
  if (envTrue("VITE_DEVPOSTGRAD_MODE")) return true;
  if (isLikelyDevOrStagingHost()) return true;
  return false;
}

function rememberFeaturedChain(chainId: SupportedChainId): SupportedChainId {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LAST_FEATURED_CHAIN_KEY, String(chainId));
    } catch {
      // ignore storage failures
    }
  }
  return chainId;
}

function resolveFeedChainId(envNames: string[], walletChainId?: number | null): SupportedChainId {
  const configured = readConfiguredChainId(envNames);
  if (configured) return configured;
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
  const configured = readConfiguredChainId(["VITE_FEATURED_FEED_CHAIN_ID", "VITE_CAMPAIGN_FEED_CHAIN_ID", "VITE_LOCALDEV_CAMPAIGN_CHAIN_ID"]);
  if (configured) return rememberFeaturedChain(configured);
  if (shouldDefaultFeaturedToTestnet()) return rememberFeaturedChain(BNB_TESTNET_CHAIN_ID);
  return rememberFeaturedChain(getActiveChainId(walletChainId));
}

export function getCreateDeployChainId(walletChainId?: number | null): SupportedChainId {
  return getActiveChainId(walletChainId) || getDefaultChainId();
}
