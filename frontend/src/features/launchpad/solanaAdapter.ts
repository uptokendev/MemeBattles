import type {
  LaunchpadAdapter,
  LaunchpadAdapterStatus,
  LaunchpadTradePreflight,
  TradeSide,
} from "@/features/launchpad/adapters";
import { isSolanaAddress } from "@/lib/address";
import { apiFetch } from "@/lib/apiBase";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";

type SolanaTradeStatusResponse = {
  tradeAuthEnabled?: boolean;
  protocolLive?: boolean;
  buyOpen?: boolean;
  sellOpen?: boolean;
  pauses?: {
    paused?: boolean;
    buyPaused?: boolean;
    sellPaused?: boolean;
    createPaused?: boolean;
  } | null;
  message?: string;
  rpcOk?: boolean;
  rpcError?: string | null;
};

/**
 * Solana safety adapter — BNB-like honesty.
 *
 * Hard gate remains Railway SOLANA_TRADE_AUTH_ENABLED (trade-authorize fail-closed).
 * This adapter reports /api/solana/trade-status for the safety panel.
 *
 * VITE_SOLANA_TRADE_LIVE:
 * - true/1/on  → force UI open when status unreachable (or auth already true)
 * - false/0/off → never force
 * - unset      → force UI open (devnet go-live). Railway still rejects if auth off.
 *                Set VITE_SOLANA_TRADE_LIVE=false to re-lock the safety overlay.
 */
function forceLiveOverride() {
  const raw = String(import.meta.env.VITE_SOLANA_TRADE_LIVE ?? "")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(raw)) return false;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  // Unset: open UI so TokenSafety overlay does not block real trades when API is live.
  return true;
}

async function fetchTradeStatus(): Promise<SolanaTradeStatusResponse | null> {
  try {
    const res = await apiFetch("/api/solana/trade-status", { method: "GET", cache: "no-store" });
    const body = (await res.json().catch(() => null)) as SolanaTradeStatusResponse | null;
    if (!res.ok || !body) return null;
    return body;
  } catch {
    return null;
  }
}

export function createSolanaLaunchpadAdapter(): LaunchpadAdapter {
  return {
    chain: "solana",

    async getStatus(): Promise<LaunchpadAdapterStatus> {
      const status = await fetchTradeStatus();
      const force = forceLiveOverride();

      if (!status) {
        if (force) {
          return {
            chain: "solana",
            protocolLive: true,
            label: "Solana bonding (override)",
            message:
              "Could not reach trade-status; VITE_SOLANA_TRADE_LIVE override is on. Program still enforces pauses/auth.",
            routeAuthorizationReady: true,
            warnings: ["Trade-status API unreachable — using FE override."],
          };
        }
        return {
          chain: "solana",
          protocolLive: false,
          label: "Solana bonding",
          message: "Could not load Solana trade status from API.",
          routeAuthorizationReady: false,
          warnings: ["Trade-status API unreachable. Safety is fail-closed."],
        };
      }

      const live = Boolean(status.protocolLive) || (force && Boolean(status.tradeAuthEnabled));
      return {
        chain: "solana",
        protocolLive: live,
        label: live ? "Solana bonding trade" : "Solana bonding",
        message: status.message || (live ? "Trade window open." : "Trade not live yet."),
        routeAuthorizationReady: Boolean(status.tradeAuthEnabled),
        warnings: [
          !status.tradeAuthEnabled
            ? "Railway SOLANA_TRADE_AUTH_ENABLED is false."
            : "",
          status.pauses?.buyPaused ? "On-chain buys are paused." : "",
          status.pauses?.sellPaused ? "On-chain sells are paused." : "",
          status.rpcOk === false ? `RPC pause probe failed: ${status.rpcError || "unknown"}` : "",
          force && !status.protocolLive ? "VITE_SOLANA_TRADE_LIVE override active." : "",
        ].filter(Boolean),
      };
    },

    async preflightTrade({ side, walletAddress, campaignAddress }): Promise<LaunchpadTradePreflight> {
      const sideLabel: TradeSide = side === "sell" ? "sell" : "buy";
      const campaign = String(campaignAddress || "").trim();
      const wallet = String(walletAddress || "").trim();
      const status = await fetchTradeStatus();
      const force = forceLiveOverride();

      if (!campaign || !isSolanaAddress(campaign)) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Invalid Solana campaign address."],
          warnings: [],
          schemaReady: true,
        };
      }

      if (!wallet) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Connect a Solana wallet to trade."],
          warnings: ["Solana campaigns require a Solana wallet (Phantom, Solflare, etc.)."],
          schemaReady: true,
          campaign: { campaignAddress: campaign },
        };
      }

      if (!isSolanaAddress(wallet)) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Connected wallet is not a Solana address. Switch to / connect a Solana wallet."],
          warnings: [],
          schemaReady: true,
          campaign: { campaignAddress: campaign },
        };
      }

      if (!status) {
        if (force) {
          return {
            allowed: true,
            chain: "solana",
            side: sideLabel,
            reasons: [],
            warnings: ["Trade-status unreachable; override allows UI. On-chain still enforces."],
            schemaReady: true,
            campaign: { campaignAddress: campaign },
            walletRisk: { walletAddress: wallet, restricted: false },
          };
        }
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Could not load Solana trade status — fail-closed."],
          warnings: [],
          schemaReady: true,
          campaign: { campaignAddress: campaign },
        };
      }

      if (!status.tradeAuthEnabled) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Solana trade authorization is disabled on Railway (SOLANA_TRADE_AUTH_ENABLED)."],
          warnings: ["When trade goes live, use a Solana wallet with SOL + token ATA."],
          schemaReady: true,
          campaign: {
            campaignAddress: campaign,
            buyPaused: true,
            sellPaused: true,
          },
          walletRisk: { walletAddress: wallet, restricted: false },
        };
      }

      const sideOpen = sideLabel === "buy" ? status.buyOpen : status.sellOpen;
      const pausedSide =
        sideLabel === "buy" ? Boolean(status.pauses?.buyPaused) : Boolean(status.pauses?.sellPaused);

      if (status.pauses?.paused) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Launchpad is globally paused on-chain."],
          warnings: [],
          schemaReady: true,
          campaign: {
            campaignAddress: campaign,
            paused: true,
            buyPaused: true,
            sellPaused: true,
          },
          walletRisk: { walletAddress: wallet, restricted: false },
        };
      }

      if (!sideOpen && !force) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: [
            pausedSide
              ? `On-chain ${sideLabel}s are paused (run unpause-trade).`
              : `Solana ${sideLabel} is not open yet.`,
          ],
          warnings: [status.message || ""].filter(Boolean),
          schemaReady: true,
          campaign: {
            campaignAddress: campaign,
            buyPaused: Boolean(status.pauses?.buyPaused),
            sellPaused: Boolean(status.pauses?.sellPaused),
          },
          walletRisk: { walletAddress: wallet, restricted: false },
        };
      }

      return {
        allowed: true,
        chain: "solana",
        side: sideLabel,
        // No warnings when clear — keeps safety pill green (on-chain still enforces).
        reasons: [],
        warnings: force && !status.protocolLive
          ? ["VITE_SOLANA_TRADE_LIVE override active (status reported not fully open)."]
          : [],
        schemaReady: true,
        campaign: {
          campaignAddress: campaign,
          buyPaused: Boolean(status.pauses?.buyPaused),
          sellPaused: Boolean(status.pauses?.sellPaused),
        },
        walletRisk: {
          walletAddress: wallet,
          restricted: false,
        },
      };
    },
  };
}

export const SOLANA_SAFETY_CHAIN_ID = SOLANA_CHAIN_ID;
