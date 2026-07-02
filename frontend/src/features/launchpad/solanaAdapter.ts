import type { LaunchpadAdapter, LaunchpadAdapterStatus, LaunchpadTradePreflight, TradeSide } from "@/features/launchpad/adapters";

const SOLANA_NOT_LIVE_REASONS = [
  "Solana launchpad protocol actions are not live yet.",
  "This placeholder is intentionally blocking creates, buys, and sells until the audited Solana program adapter is connected.",
];

export function createSolanaLaunchpadAdapter(): LaunchpadAdapter {
  return {
    chain: "solana",

    async getStatus(): Promise<LaunchpadAdapterStatus> {
      return {
        chain: "solana",
        protocolLive: false,
        label: "Solana launchpad placeholder",
        message: "Solana support is planned, but protocol trading is blocked in this build until the Solana program, tests, and route authorization are complete.",
        routeAuthorizationReady: false,
        warnings: SOLANA_NOT_LIVE_REASONS,
      };
    },

    async preflightTrade({ side }: { side: TradeSide }): Promise<LaunchpadTradePreflight> {
      return {
        allowed: false,
        chain: "solana",
        side,
        reasons: SOLANA_NOT_LIVE_REASONS,
        warnings: ["Do not expose fake Solana trading controls before the real protocol adapter is implemented."],
        schemaReady: false,
      };
    },
  };
}
