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
const PROTOCOL_PENDING_MESSAGE = "Solana on-chain launch actions need the deployed Anchor program ID, generated IDL, transaction builder, and indexer before create, buy, sell, and finalize can run safely.";

export function createSolanaProtocolPendingError(): Error {
  return new Error(PROTOCOL_PENDING_MESSAGE);
}

export function getSolanaLaunchpadSafetyStatus(params: {
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
} = {}): LaunchpadSafetyStatus {
  const signerReady = Boolean(params.hasSolanaWallet);
  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    chainId: SOLANA_CHAIN_ID,
    chainLabel: "Solana Mainnet",
    protocolStatus: "protocol_pending",
    title: "Solana Prepare Mode ready",
    primaryActionLabel: "Solana Protocol Pending",
    description: "Solana wallet signing and Prepare Mode drafts are ready for demos. Direct create, buy, sell, and finalize stay blocked until the Solana launch program is deployed and the adapter has a real transaction builder.",
    checks: [
      {
        id: "routeAuth",
        label: "Draft authorization",
        state: "ready",
        detail: "Nonce-backed Solana draft signatures are wired for create, edit, publish, and archive actions.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: signerReady ? "ready" : "pending",
        detail: signerReady ? `${params.solanaWalletName || "Solana wallet"} connected for signed drafts.` : "Connect Phantom, Solflare, Backpack, or Glow to sign Solana drafts.",
      },
      {
        id: "program",
        label: "Launch program",
        state: "in_progress",
        detail: "Anchor scaffold exists under solana/programs/meme_warzone_launchpad; deployment address, IDL, SPL vaults, and transaction builders are still required.",
      },
      {
        id: "protocol",
        label: "Protocol adapter",
        state: "blocked",
        detail: PROTOCOL_PENDING_MESSAGE,
      },
    ],
    milestones: [
      {
        id: "wallets",
        label: "Wallet connect",
        state: "ready",
        detail: "Solana wallet detection and manual connection are available in the launch flow.",
      },
      {
        id: "drafts",
        label: "Signed drafts",
        state: "ready",
        detail: "Solana creators can create, edit, publish, preview, and archive Prepare Mode drafts with wallet auth.",
      },
      {
        id: "program",
        label: "Anchor program",
        state: "in_progress",
        detail: "Program scaffold includes safety/risk PDAs and instruction shells; SPL token economics and deploy configuration remain next.",
      },
      {
        id: "trading",
        label: "Buy/sell/finalize",
        state: "pending",
        detail: "Trading and finalize stay disabled until devnet program tests, IDL generation, and frontend transaction builders are complete.",
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
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
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
    getSafetyStatus: () => getSolanaLaunchpadSafetyStatus({
      hasSolanaWallet: params.hasSolanaWallet,
      solanaWalletName: params.solanaWalletName,
    }),
    walletProvider: params.walletProvider,
    activeChainId: SOLANA_CHAIN_ID,
    factoryAddress: "",
  };
}
