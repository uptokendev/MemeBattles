import { getActiveChainId } from "@/lib/chainConfig";
import type { LaunchpadPreflight } from "@/lib/recruiterApi";
import { apiFetch } from "@/lib/apiBase";

export type TradeSafetySide = "buy" | "sell";

export type TradeSafetyInput = {
  walletAddress?: string | null;
  campaignAddress?: string | null;
  side: TradeSafetySide;
  walletChainId?: number | null;
};

export type TradeSafetyState = {
  status: "idle" | "checking" | "clear" | "blocked" | "warning" | "unavailable";
  label: string;
  message: string;
};

function normalizePreflight(json: unknown): LaunchpadPreflight {
  const value = ((json as any)?.preflight ?? json) as LaunchpadPreflight;
  if (!value || typeof value.allowed !== "boolean") {
    throw new Error("Trade preflight response was invalid.");
  }
  return {
    ...value,
    reasons: Array.isArray(value.reasons) ? value.reasons : [],
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
  };
}

export async function fetchLaunchpadTradeEligibility(input: TradeSafetyInput): Promise<LaunchpadPreflight> {
  const walletAddress = String(input.walletAddress || "").trim();
  const campaignAddress = String(input.campaignAddress || "").trim();
  if (!walletAddress) {
    return { allowed: false, reasons: ["Connect wallet to check trade eligibility."], warnings: [], schemaReady: true };
  }
  if (!campaignAddress) {
    return { allowed: false, reasons: ["Campaign address is missing."], warnings: [], schemaReady: true };
  }

  const chainId = getActiveChainId(input.walletChainId);
  const path = input.side === "buy" ? "/api/launchpad/preflight-buy" : "/api/launchpad/preflight-sell";
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ walletAddress, campaignAddress, chainId }),
  });
  const json = await res.json().catch(() => ({}));
  return normalizePreflight(json);
}

export function getTradeSafetyState(preflight: LaunchpadPreflight | null, loading = false, error?: string | null): TradeSafetyState {
  if (loading) {
    return {
      status: "checking",
      label: "Checking",
      message: "Checking wallet, cluster, campaign pause, and route safety.",
    };
  }

  if (error) {
    return {
      status: "unavailable",
      label: "Unavailable",
      message: error,
    };
  }

  if (!preflight) {
    return {
      status: "idle",
      label: "Not checked",
      message: "Connect wallet to check trade eligibility.",
    };
  }

  if (!preflight.allowed) {
    return {
      status: "blocked",
      label: preflight.schemaReady === false ? "Schema pending" : "Blocked",
      message: preflight.reasons?.[0] || "Trade is blocked by launchpad safety checks.",
    };
  }

  if (preflight.warnings?.length) {
    return {
      status: "warning",
      label: preflight.schemaReady === false ? "Schema pending" : "Warning",
      message: preflight.warnings[0],
    };
  }

  return {
    status: "clear",
    label: preflight.schemaReady === false ? "Schema pending" : "Clear",
    message: preflight.schemaReady === false
      ? "Security tables are not installed yet, so fallback checks are active."
      : "Wallet and campaign safety checks are clear.",
  };
}
