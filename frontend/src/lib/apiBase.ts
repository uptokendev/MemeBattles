import { Contract, ethers } from "ethers";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import { getReadProvider } from "@/lib/readProvider";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;

function normalizeApiBase(value: unknown): string {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return `https://${raw}`;
}

const EXPLICIT_API_BASE = normalizeApiBase(
  import.meta.env.VITE_FRONTEND_API_BASE ||
    import.meta.env.VITE_RAILWAY_FRONTEND_API_BASE ||
    import.meta.env.RAILWAY_FRONTEND_API_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_RAILWAY_API_BASE ||
    ""
);

const EXPLICIT_REALTIME_API_BASE = normalizeApiBase(
  import.meta.env.VITE_TOKEN_API_BASE ||
    import.meta.env.VITE_RAILWAY_TOKEN_API_BASE ||
    import.meta.env.RAILWAY_TOKEN_API_BASE_URL ||
    import.meta.env.VITE_REALTIME_API_BASE ||
    ""
);

// Do not route global list endpoints (/api/campaigns, /api/featured) to the
// realtime-indexer project: memebattles-production does not expose those routes.
// TokenDetails is protected below by a preemptive /token/0x... contract fallback
// when legacy code asks for /api/campaigns.
const REALTIME_INDEXER_API_PREFIXES = [
  "/api/league",
  "/api/leaguePayouts",
  "/api/leagueRoot",
  "/api/token/",
  "/api/token-metadata",
  "/api/votes",
  "/api/vote_counts",
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function shouldUseLocalDevProxy(path: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const { hostname } = window.location;
    if (!isLoopbackHost(hostname)) return false;
    // In local dev, use relative paths for main app endpoints so Vite proxy
    // forwards to the local test backend (whatever the user has running on the
    // VITE_DEV_API_PROXY_TARGET port, e.g. 3001). This keeps the test environment
    // working with localhost.
    return true;
  } catch {
    return false;
  }
}

function shouldUseRealtimeIndexer(path: string): boolean {
  return REALTIME_INDEXER_API_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) return path.startsWith(prefix);
    return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
  });
}

function isCampaignFeedPath(path: string): boolean {
  try {
    const url = new URL(path, "http://local");
    return url.pathname === "/api/campaigns";
  } catch {
    return normalizePath(path).split("?")[0] === "/api/campaigns";
  }
}

function getTokenPageCampaignAddress(): string {
  if (typeof window === "undefined") return "";
  try {
    const match = window.location.pathname.match(/^\/token\/(0x[a-fA-F0-9]{40})(?:\/)?$/);
    return match?.[1]?.toLowerCase() || "";
  } catch {
    return "";
  }
}

function getChainIdFromApiPath(path: string): number {
  try {
    const url = new URL(path, "http://local");
    const raw = Number(url.searchParams.get("chainId") || 56);
    return Number.isFinite(raw) ? raw : 56;
  } catch {
    return 56;
  }
}

async function safeString(fn: () => Promise<unknown>, fallback = ""): Promise<string> {
  try {
    const value = await fn();
    const text = String(value ?? "").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

async function safeBool(fn: () => Promise<unknown>, fallback = false): Promise<boolean> {
  try {
    return Boolean(await fn());
  } catch {
    return fallback;
  }
}

async function safeBigInt(fn: () => Promise<unknown>, fallback = 0n): Promise<bigint> {
  try {
    const value = await fn();
    if (typeof value === "bigint") return value;
    return BigInt(String(value ?? fallback));
  } catch {
    return fallback;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-mwz-client-fallback": "token-details-contract",
    },
  });
}

async function buildTokenDetailsCampaignFallback(path: string): Promise<Response | null> {
  const campaignAddress = getTokenPageCampaignAddress();
  if (!campaignAddress) return null;
  if (!isCampaignFeedPath(path)) return null;

  const chainId = getChainIdFromApiPath(path);

  try {
    const provider = getReadProvider(chainId as any);
    const campaign = new Contract(campaignAddress, CAMPAIGN_ABI, provider) as any;

    const tokenAddress = (await safeString(() => campaign.token())).toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) return null;

    const token = new Contract(tokenAddress, TOKEN_ABI, provider) as any;

    const [
      name,
      symbol,
      logoUri,
      creatorAddress,
      website,
      xAccount,
      extraLink,
      launched,
      sold,
      curveSupply,
    ] = await Promise.all([
      safeString(() => token.name(), "Unknown"),
      safeString(() => token.symbol(), ""),
      safeString(() => campaign.logoURI(), "/placeholder.svg"),
      safeString(() => campaign.owner()),
      safeString(() => campaign.website()),
      safeString(() => campaign.xAccount()),
      safeString(() => campaign.extraLink()),
      safeBool(() => campaign.launched(), false),
      safeBigInt(() => campaign.sold(), 0n),
      safeBigInt(() => campaign.curveSupply(), 0n),
    ]);

    const progressPct = curveSupply > 0n ? Number((sold * 10_000n) / curveSupply) / 100 : null;

    return jsonResponse({
      items: [
        {
          chainId,
          campaignAddress,
          tokenAddress,
          creatorAddress: /^0x[a-fA-F0-9]{40}$/.test(creatorAddress) ? creatorAddress.toLowerCase() : null,
          name,
          symbol,
          logoUri,
          logoURI: logoUri,
          website,
          xAccount,
          xUrl: xAccount,
          extraLink,
          isDexTrading: launched,
          isActive: !launched,
          status: launched ? "graduated" : "live",
          progressPct,
          votes24h: 0,
          votesAllTime: 0,
          raisedTotalBnb: "0",
          raised10mBnb: "0",
          source: "token-details-contract-fallback",
        },
      ],
      nextCursor: null,
      pageSize: 1,
      updatedAt: new Date().toISOString(),
      warning: "Campaign feed fallback hydrated this token directly from the campaign contract.",
    });
  } catch (error) {
    console.warn("[apiBase] TokenDetails contract fallback failed", error);
    return null;
  }
}

export function apiUrl(path: string): string {
  if (isHttpUrl(path)) return path;
  const normalized = normalizePath(path);

  if (EXPLICIT_REALTIME_API_BASE && shouldUseRealtimeIndexer(normalized)) {
    return `${EXPLICIT_REALTIME_API_BASE}${normalized}`;
  }

  if (shouldUseLocalDevProxy(normalized)) {
    // Local dev: relative so Vite /api proxy handles it to the user's local test backend.
    // This ensures the test environment works with whatever localhost backend the user
    // has running on the configured proxy port (e.g. 3001).
    return normalized;
  }

  return EXPLICIT_API_BASE ? `${EXPLICIT_API_BASE}${normalized}` : normalized;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const preemptiveFallback = await buildTokenDetailsCampaignFallback(path);
  if (preemptiveFallback) return preemptiveFallback;

  const url = apiUrl(path);

  try {
    const res = await fetch(url, init);
    if (!res.ok && isCampaignFeedPath(path)) {
      const fallback = await buildTokenDetailsCampaignFallback(path);
      if (fallback) return fallback;
    }
    return res;
  } catch (error) {
    const fallback = await buildTokenDetailsCampaignFallback(path);
    if (fallback) return fallback;
    throw error;
  }
}

export async function apiJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
  }
  return json as T;
}
