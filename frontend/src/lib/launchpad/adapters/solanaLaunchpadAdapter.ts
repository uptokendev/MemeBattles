import type {
  CampaignActivity,
  CampaignCardStats,
  CampaignInfo,
  CampaignMetrics,
  CampaignSummary,
  CreateCampaignParams,
  FetchCampaignPageOptions,
  LaunchpadAdapter,
  LaunchpadSafetyStatus,
} from "./types";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";

export const SOLANA_LAUNCHPAD_ADAPTER_ID = "solana" as const;
const PROTOCOL_PENDING_MESSAGE = "Solana launch protocol is pending. BNB launch remains available; Solana create, buy, sell, and finalize actions are not live yet.";

export function createSolanaProtocolPendingError(): Error {
  return new Error(PROTOCOL_PENDING_MESSAGE);
}

export function getSolanaLaunchpadSafetyStatus(): LaunchpadSafetyStatus {
  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    chainId: SOLANA_CHAIN_ID,
    protocolStatus: "protocol_pending",
    title: "Solana protocol pending",
    description: "Solana wallet support can connect for account context, but launch protocol actions are intentionally blocked until the Solana contracts/programs are implemented and verified.",
    checks: [
      {
        id: "routeAuth",
        label: "Route authorization",
        state: "blocked",
        detail: "Solana launch route authorization is not enabled yet.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: "pending",
        detail: "Solana wallet connection is allowed, but launch signing is disabled for now.",
      },
      {
        id: "factory",
        label: "LaunchFactory",
        state: "blocked",
        detail: "No Solana launch program/factory is configured yet.",
      },
      {
        id: "protocol",
        label: "Protocol adapter",
        state: "blocked",
        detail: PROTOCOL_PENDING_MESSAGE,
      },
    ],
  };
}

const emptyStats: CampaignCardStats = {
  holders: "-",
  volume: "-",
  marketCap: "-",
};

export function createSolanaLaunchpadAdapter(params: {
  fetchCampaigns: () => Promise<CampaignInfo[]>;
  walletProvider: unknown;
}): LaunchpadAdapter {
  const pending = () => Promise.reject(createSolanaProtocolPendingError());

  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    protocolStatus: "protocol_pending",
    fetchCampaignsCount: async () => 0,
    fetchCampaignPage: async (_offset: number, _limit: number, _opts?: FetchCampaignPageOptions) => [],
    fetchCampaigns: params.fetchCampaigns,
    fetchCampaignLogoURI: async (_campaignAddress: string) => null,
    fetchCampaignMetrics: async (_campaignAddress: string): Promise<CampaignMetrics | null> => null,
    fetchCampaignCardStats: async (_campaign: CampaignInfo) => emptyStats,
    fetchCampaignActivity: async (_campaignAddress: string): Promise<CampaignActivity | null> => null,
    fetchCampaignSummary: async (campaign: CampaignInfo): Promise<CampaignSummary> => ({ campaign, metrics: null, stats: emptyStats }),
    createCampaign: (_params: CreateCampaignParams) => pending(),
    buyTokens: (_campaignAddress: string, _amountWei: bigint, _maxCostWei: bigint) => pending(),
    sellTokens: (_campaignAddress: string, _amountWei: bigint, _minAmountWei: bigint) => pending(),
    finalizeCampaign: (_campaignAddress: string, _minTokens: bigint, _minBnb: bigint) => pending(),
    getSafetyStatus: getSolanaLaunchpadSafetyStatus,
    walletProvider: params.walletProvider,
    activeChainId: SOLANA_CHAIN_ID,
    factoryAddress: "",
  };
}
