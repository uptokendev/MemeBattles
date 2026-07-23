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
  LaunchpadTxReceipt,
} from "./types";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { requestSolanaCreateAuthorizationPreview } from "@/lib/solanaCreateAuthorization";

export const SOLANA_LAUNCHPAD_ADAPTER_ID = "solana" as const;

const PLACEHOLDER_PROGRAM_ID = "11111111111111111111111111111111";
const PROGRAM_PENDING_MESSAGE =
  "Solana launchpad actions remain gated until the deployed Anchor program, IDL/client, route authorization, indexer, dashboard, and devnet proof are complete.";
const WALLET_PENDING_MESSAGE = "Connect a Solana wallet that supports transaction signing.";
const CREATE_CLIENT_PENDING_MESSAGE =
  "Solana authorized create is not connected to the frontend transaction client yet. Save a signed Solana draft while the Phase 4 backend/client path is completed.";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function envEnabled(value: unknown): boolean {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function getSolanaProgramId(): string {
  return String(import.meta.env.VITE_SOLANA_LAUNCHPAD_PROGRAM_ID || "").trim();
}

function isProgramConfigured(programId = getSolanaProgramId()): boolean {
  return Boolean(programId && programId !== PLACEHOLDER_PROGRAM_ID);
}

function isSolanaTransactionsExplicitlyEnabled(): boolean {
  return envEnabled(import.meta.env.VITE_ENABLE_SOLANA_LAUNCHPAD_TRANSACTIONS);
}

function isSolanaAuthorizedCreateClientReady(): boolean {
  return envEnabled(import.meta.env.VITE_SOLANA_AUTHORIZED_CREATE_CLIENT_READY);
}

function getProtocolStatus() {
  // Keep Solana protocol_pending until the new Phase 4 authorized-create client replaces
  // the earlier experimental transaction builder. A configured program ID alone is not enough.
  return isProgramConfigured() && isSolanaTransactionsExplicitlyEnabled() && isSolanaAuthorizedCreateClientReady()
    ? "ready"
    : "protocol_pending";
}

export function createSolanaProtocolPendingError(): Error {
  return new Error(PROGRAM_PENDING_MESSAGE);
}

function createSolanaClientPendingError(): Error {
  return new Error(CREATE_CLIENT_PENDING_MESSAGE);
}

function createUnavailableReceipt(): Promise<LaunchpadTxReceipt> {
  return Promise.reject(createSolanaClientPendingError());
}

function attachPreviewAndReject(error: Error, preview: unknown): Promise<LaunchpadTxReceipt> {
  (error as any).solanaCreateAuthorizationPreview = preview;
  return Promise.reject(error);
}

const emptyStats: CampaignCardStats = {
  holders: "-",
  volume: "-",
  marketCap: "-",
};

function sliceCampaigns(campaigns: CampaignInfo[], offset: number, limit: number, opts?: FetchCampaignPageOptions): CampaignInfo[] {
  const safeOffset = Math.max(0, Number(offset || 0));
  const safeLimit = Math.max(1, Number(limit || 24));
  const page = campaigns.slice(safeOffset, safeOffset + safeLimit);
  return opts?.newestFirst === false ? page : page.slice().reverse();
}

export function getSolanaLaunchpadSafetyStatus(params: {
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
} = {}): LaunchpadSafetyStatus {
  const signerReady = Boolean(params.hasSolanaWallet);
  const programId = getSolanaProgramId();
  const programReady = isProgramConfigured(programId);
  const transactionsEnabled = isSolanaTransactionsExplicitlyEnabled();
  const createClientReady = isSolanaAuthorizedCreateClientReady();
  const protocolReady = getProtocolStatus() === "ready";

  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    chainId: SOLANA_CHAIN_ID,
    chainLabel: "Solana Mainnet",
    protocolStatus: protocolReady ? "ready" : "protocol_pending",
    title: protocolReady ? "Solana launch route ready" : "Solana launch route pending",
    primaryActionLabel: protocolReady ? "Solana Live Route" : "Solana Program Required",
    description: protocolReady
      ? "Solana launch actions are explicitly enabled and routed through the Phase 4 authorized-create client."
      : PROGRAM_PENDING_MESSAGE,
    checks: [
      {
        id: "draftAuth",
        label: "Draft authorization",
        state: "ready",
        detail: "Nonce-backed Solana draft signatures remain available for Prepare Mode.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: signerReady ? "ready" : "pending",
        detail: signerReady ? `${params.solanaWalletName || "Solana wallet"} connected for Solana draft signing.` : WALLET_PENDING_MESSAGE,
      },
      {
        id: "program",
        label: "Anchor program",
        state: programReady ? "ready" : "blocked",
        detail: programReady ? programId : "Set VITE_SOLANA_LAUNCHPAD_PROGRAM_ID after deploy.",
      },
      {
        id: "transactions",
        label: "Live transactions",
        state: transactionsEnabled ? "pending" : "blocked",
        detail: transactionsEnabled
          ? "Live Solana transactions are env-enabled, but the authorized-create client must still be marked ready."
          : "VITE_ENABLE_SOLANA_LAUNCHPAD_TRANSACTIONS is intentionally off while Solana is protocol_pending.",
      },
      {
        id: "authorizedCreateClient",
        label: "Authorized create client",
        state: createClientReady ? "ready" : "blocked",
        detail: createClientReady ? "Phase 4 authorized-create transaction client is marked ready." : CREATE_CLIENT_PENDING_MESSAGE,
      },
    ],
    milestones: [
      {
        id: "wallets",
        label: "Wallet connect",
        state: "ready",
        detail: "Solana wallet detection and signed draft flow are available.",
      },
      {
        id: "programFoundation",
        label: "Program foundation",
        state: programReady ? "in_progress" : "pending",
        detail: programReady ? "Anchor program ID is configured, but launch actions remain gated." : "Waiting for deployed program configuration.",
      },
      {
        id: "authorizedCreate",
        label: "Authorized create",
        state: createClientReady ? "in_progress" : "pending",
        detail: "Backend preflight, route authorization, IDL/client wiring, and transaction-level replay tests must be completed before live create.",
      },
      {
        id: "trading",
        label: "Buy/sell/finalize",
        state: "pending",
        detail: "Buy, sell, graduation, reward claims, indexer, dashboard, and devnet proof remain locked for later phases.",
      },
    ],
  };
}

export function createSolanaLaunchpadAdapter(params: {
  fetchCampaigns: () => Promise<CampaignInfo[]>;
  walletProvider: unknown;
  hasSolanaWallet?: boolean;
  solanaWalletName?: string;
  solanaAccount?: string;
}): LaunchpadAdapter {
  const protocolStatus = getProtocolStatus();

  return {
    adapterId: SOLANA_LAUNCHPAD_ADAPTER_ID,
    protocolStatus,
    fetchCampaignsCount: async () => (await params.fetchCampaigns()).length,
    fetchCampaignPage: async (offset: number, limit: number, opts?: FetchCampaignPageOptions) => {
      return sliceCampaigns(await params.fetchCampaigns(), offset, limit, opts);
    },
    fetchCampaigns: params.fetchCampaigns,
    fetchCampaignLogoURI: async (_campaignAddress: string) => null,
    fetchCampaignMetrics: async (_campaignAddress: string): Promise<CampaignMetrics | null> => null,
    fetchCampaignCardStats: async (_campaign: CampaignInfo) => emptyStats,
    fetchCampaignActivity: async (_campaignAddress: string): Promise<CampaignActivity | null> => null,
    fetchCampaignSummary: async (campaign: CampaignInfo): Promise<CampaignSummary> => ({
      campaign,
      metrics: null,
      stats: emptyStats,
    }),
    createCampaign: async (createParams: CreateCampaignParams) => {
      if (!params.solanaAccount) return createUnavailableReceipt();

      const preview = await requestSolanaCreateAuthorizationPreview({
        creatorWallet: params.solanaAccount,
        metadata: {
          name: createParams.name,
          symbol: createParams.symbol,
          logoURI: createParams.logoURI,
          website: createParams.website,
          xAccount: createParams.xAccount,
          extraLink: createParams.extraLink,
          category: "meme",
        },
      });

      return attachPreviewAndReject(createSolanaClientPendingError(), preview);
    },
    buyTokens: async (_campaignAddress: string, _amountLamports: bigint, _maxCostLamports: bigint) => createUnavailableReceipt(),
    sellTokens: async (_campaignAddress: string, _tokenAmount: bigint, _minLamports: bigint) => createUnavailableReceipt(),
    finalizeCampaign: async (_campaignAddress: string, _minTokens: bigint, _minBnb: bigint) => createUnavailableReceipt(),
    claimCreatorRewards: async (_campaignAddress: string) => createUnavailableReceipt(),
    claimRecruiterRewards: async (_campaignAddress: string) => createUnavailableReceipt(),
    claimSquadRewards: async (_campaignAddress: string) => createUnavailableReceipt(),
    claimProtocolRewards: async (_campaignAddress: string) => createUnavailableReceipt(),
    getSafetyStatus: () => getSolanaLaunchpadSafetyStatus({
      hasSolanaWallet: params.hasSolanaWallet,
      solanaWalletName: params.solanaWalletName,
    }),
    walletProvider: params.walletProvider,
    activeChainId: SOLANA_CHAIN_ID,
    factoryAddress: getSolanaProgramId(),
  };
}
