import { apiFetch } from "@/lib/apiBase";
import type { LaunchpadAdapter, LaunchpadAdapterStatus, LaunchpadTradePreflight, TradeSide } from "@/features/launchpad/adapters";
import { normalizeEvmAddress } from "@/features/launchpad/adapters";

async function readJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const response = await apiFetch(path, {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === "object") return payload as T;
    return fallback;
  } catch {
    return fallback;
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>, fallback: T): Promise<T> {
  return readJson<T>(path, fallback, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function normalizePreflight(payload: any, side: TradeSide): LaunchpadTradePreflight {
  const preflight = payload?.preflight && typeof payload.preflight === "object" ? payload.preflight : payload;
  return {
    allowed: Boolean(preflight?.allowed),
    chain: "bnb",
    side,
    reasons: Array.isArray(preflight?.reasons) ? preflight.reasons.map(String) : [],
    warnings: Array.isArray(preflight?.warnings) ? preflight.warnings.map(String) : [],
    schemaReady: preflight?.schemaReady,
    campaign: preflight?.campaign || null,
    walletRisk: preflight?.walletRisk || null,
    cluster: preflight?.cluster || null,
    lookupErrors: Array.isArray(preflight?.lookupErrors) ? preflight.lookupErrors.map(String) : [],
  };
}

export function createBnbLaunchpadAdapter(): LaunchpadAdapter {
  return {
    chain: "bnb",

    async getStatus(): Promise<LaunchpadAdapterStatus> {
      const [security, routing] = await Promise.all([
        readJson<any>("/api/security/status", {}),
        readJson<any>("/api/routing/status", {}),
      ]);

      const paused = security?.paused || {};
      const warnings: string[] = [];
      if (paused.global) warnings.push("BNB launchpad is globally paused.");
      if (paused.create) warnings.push("New BNB campaign creation is paused.");
      if (paused.buys) warnings.push("One or more BNB campaign buy paths are paused.");
      if (paused.sells) warnings.push("One or more BNB campaign sell paths are paused.");
      if (security?.bnbContractSync === "pending") warnings.push("BNB security contract sync has pending jobs.");
      if (security?.schemaReady === false) warnings.push("Security schema is not fully installed.");

      const routeReady = Boolean(
        routing?.ready ??
        routing?.enabled ??
        routing?.routeAuthority ??
        routing?.routeAuthorityAddress
      );

      if (!routeReady) warnings.push("Route authorization readiness is unknown. Direct on-chain protection may reject unsigned routes.");

      return {
        chain: "bnb",
        protocolLive: true,
        label: "BNB launchpad",
        message: "BNB bonding trades use MemeWarzone launchpad preflight and route authorization checks before execution.",
        routeAuthorizationReady: routeReady,
        warnings,
      };
    },

    async preflightTrade({ side, walletAddress, campaignAddress }): Promise<LaunchpadTradePreflight> {
      const wallet = normalizeEvmAddress(walletAddress);
      const campaign = normalizeEvmAddress(campaignAddress);
      if (!wallet) {
        return {
          allowed: false,
          chain: "bnb",
          side,
          reasons: ["Connect a valid EVM wallet to run the trade safety check."],
          warnings: [],
        };
      }
      if (!campaign) {
        return {
          allowed: false,
          chain: "bnb",
          side,
          reasons: ["Token campaign address is missing or invalid."],
          warnings: [],
        };
      }

      const endpoint = side === "buy" ? "/api/launchpad/preflight-buy" : "/api/launchpad/preflight-sell";
      const payload = await postJson<any>(endpoint, { walletAddress: wallet, campaignAddress: campaign }, { preflight: null });
      return normalizePreflight(payload, side);
    },
  };
}
