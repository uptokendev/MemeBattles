import type {
  LaunchpadAdapter,
  LaunchpadAdapterStatus,
  LaunchpadTradePreflight,
  TradeSide,
} from "@/features/launchpad/adapters";
import { isSolanaAddress } from "@/lib/address";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";

/**
 * Solana safety adapter.
 *
 * Bonding buy/sell land in P1 (V4 program ixs exist when deployed). Until
 * SOLANA_TRADE_AUTH_ENABLED + unpaused GlobalConfig + upgraded program binary
 * are confirmed live, preflight stays fail-closed but messaging is honest.
 *
 * Set VITE_SOLANA_TRADE_LIVE=true only after ops has unpaused buy/sell and
 * Railway trade authorization is live.
 */
function tradeLiveFlag() {
  return ["1", "true", "yes", "on"].includes(
    String(import.meta.env.VITE_SOLANA_TRADE_LIVE || "")
      .trim()
      .toLowerCase(),
  );
}

export function createSolanaLaunchpadAdapter(): LaunchpadAdapter {
  const live = tradeLiveFlag();

  return {
    chain: "solana",

    async getStatus(): Promise<LaunchpadAdapterStatus> {
      if (!live) {
        return {
          chain: "solana",
          protocolLive: false,
          label: "Solana bonding (P1)",
          message:
            "Create/deploy works. Bonding buy/sell require the V4 trade instructions on the deployed program, buy/sell unpaused on GlobalConfig, and Railway trade authorization.",
          routeAuthorizationReady: false,
          warnings: [
            "Bonding buy/sell not live yet (P1).",
            "Safety is intentionally fail-closed until trade is enabled.",
          ],
        };
      }
      return {
        chain: "solana",
        protocolLive: true,
        label: "Solana bonding trade",
        message: "Solana V4 bonding trade path is enabled for this build.",
        routeAuthorizationReady: true,
        warnings: [],
      };
    },

    async preflightTrade({ side, walletAddress, campaignAddress }): Promise<LaunchpadTradePreflight> {
      const sideLabel: TradeSide = side === "sell" ? "sell" : "buy";
      const campaign = String(campaignAddress || "").trim();
      const wallet = String(walletAddress || "").trim();

      if (!live) {
        return {
          allowed: false,
          chain: "solana",
          side: sideLabel,
          reasons: ["Solana bonding buy/sell is not live yet (P1)."],
          warnings: [
            wallet && !isSolanaAddress(wallet)
              ? "Connect a Solana wallet (not EVM) for Solana campaigns."
              : "When trade goes live, use a Solana wallet with SOL + token ATA.",
          ].filter(Boolean),
          schemaReady: true,
          campaign: campaign
            ? {
                campaignAddress: campaign,
                paused: false,
                buyPaused: sideLabel === "buy",
                sellPaused: sideLabel === "sell",
              }
            : null,
        };
      }

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
        // Soft visitor pass matching BNB: status only, no hard dual-block for guests.
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

      // Live path: allow at adapter level; program still enforces pause/auth/risk.
      return {
        allowed: true,
        chain: "solana",
        side: sideLabel,
        reasons: [],
        warnings: [
          "Program enforces launch_at, pause flags, risk profile, and route authorization on-chain.",
        ],
        schemaReady: true,
        campaign: {
          campaignAddress: campaign,
          buyPaused: false,
          sellPaused: false,
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
