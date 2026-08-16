import type { BnbContractReadiness } from "@/lib/bnbContracts";
import { getBnbContractReadiness, summarizeMissingBnbContracts } from "@/lib/bnbContracts";
import type { SupportedChainId } from "@/lib/chainConfig";
import type { LaunchpadSafetyCheck, LaunchpadSafetyStatus } from "./types";

export const BNB_LAUNCHPAD_ADAPTER_ID = "bnb" as const;

function getBnbChainLabel(chainId: SupportedChainId) {
  return chainId === 97 ? "BNB Testnet" : "BNB Smart Chain";
}

function contractChecks(readiness: BnbContractReadiness): LaunchpadSafetyCheck[] {
  const groups = [
    {
      id: "coreContracts",
      label: "Launch availability",
      keys: ["launchFactory", "launchCampaignImplementation", "graduationOracle", "permanentLpLocker"],
    },
    {
      id: "securityContracts",
      label: "Creator eligibility",
      keys: ["creatorRegistry", "riskRegistry"],
    },
    {
      id: "treasuryContracts",
      label: "MemeWarzone services",
      keys: ["treasuryRouter", "treasuryVault", "recruiterRewardsVault", "communityRewardsVault", "protocolRevenueVault", "voteTreasury"],
    },
    {
      id: "topazContracts",
      label: "Topaz graduation route",
      keys: ["topazRouter", "topazFactory", "topazWbnb"],
    },
  ];

  return groups.map((group) => {
    const items = readiness.items.filter((item) => group.keys.includes(item.key));
    const missing = items.filter((item) => item.required && !item.ready);
    const configured = items.filter((item) => item.ready).length;
    return {
      id: group.id,
      label: group.label,
      state: missing.length ? "blocked" : "ready",
      detail: missing.length
        ? `Missing ${missing.map((item) => item.label).join(", ")}.`
        : `${configured}/${items.length} configured for chain ${readiness.chainId}.`,
    };
  });
}

export function getBnbLaunchpadSafetyStatus(params: {
  chainId: SupportedChainId;
  factoryAddress: string;
  hasSigner: boolean;
  hasAccount: boolean;
  walletChainId?: number;
  contractReadiness?: BnbContractReadiness;
}): LaunchpadSafetyStatus {
  const readiness = params.contractReadiness ?? getBnbContractReadiness(params.chainId);
  const contractsReady = readiness.ready;
  const walletChainMatches = !params.hasAccount || params.walletChainId === params.chainId;
  const protocolReady = Boolean(params.factoryAddress) && contractsReady && walletChainMatches;
  const missingTopaz = readiness.missingRequired.some((item) => item.key.startsWith("topaz"));
  const wrongWalletNetwork = params.hasAccount && !walletChainMatches;

  return {
    adapterId: BNB_LAUNCHPAD_ADAPTER_ID,
    chainId: params.chainId,
    chainLabel: getBnbChainLabel(params.chainId),
    protocolStatus: protocolReady ? "ready" : "unavailable",
    protocolLabel: protocolReady ? "Live" : wrongWalletNetwork ? "Switch Network" : "Temporarily unavailable",
    title: protocolReady ? "BNB launch route ready" : wrongWalletNetwork ? "Switch wallet network" : "BNB launches are temporarily unavailable",
    primaryActionLabel: protocolReady ? "BNB Live Route" : wrongWalletNetwork ? "Switch Network" : "Temporarily unavailable",
    description: wrongWalletNetwork
      ? `${getBnbChainLabel(params.chainId)} contracts are configured. Switch your wallet from chain ${params.walletChainId} to chain ${params.chainId} before an on-chain launch.`
      : protocolReady
      ? "BNB launches use route authorization, API preflight checks, the configured LaunchFactory, and the Topaz graduation route."
      : summarizeMissingBnbContracts(readiness),
    checks: [
      {
        id: "network",
        label: "Wallet network",
        state: wrongWalletNetwork ? "blocked" : params.hasAccount ? "ready" : "pending",
        detail: wrongWalletNetwork
          ? `Your wallet is connected to chain ${params.walletChainId}. Switch to ${getBnbChainLabel(params.chainId)} (chain ${params.chainId}) to continue.`
          : params.hasAccount
            ? `Wallet is connected to chain ${params.chainId}.`
            : `Connect a wallet on chain ${params.chainId}.`,
      },
      {
        id: "routeAuth",
        label: "Transaction protection",
        state: "ready",
        detail: "Create, buy, and sell request server authorization before contract writes.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: params.hasSigner && params.hasAccount ? "ready" : "pending",
        detail: params.hasSigner && params.hasAccount ? "Signer connected." : "Connect a BNB-compatible wallet before launch actions.",
      },
      ...contractChecks(readiness),
    ],
    milestones: [
      {
        id: "drafts",
        label: "Prepare drafts",
        state: "ready",
        detail: "Creators can sign, save, and promote launch drafts before deploy.",
      },
      {
        id: "contracts",
        label: "Launch availability",
        state: contractsReady ? "ready" : "blocked",
        detail: contractsReady ? "Launchpad, vault, registry, locker, and Topaz addresses are configured." : "Launching is temporarily unavailable on this network. Your draft is safe. Please try again later.",
      },
      {
        id: "trading",
        label: "Curve trading",
        state: protocolReady ? "ready" : "blocked",
        detail: protocolReady ? "Authorized buy/sell routes stay protected by security API checks." : "Trading unlocks after the contract env surface is complete.",
      },
      {
        id: "graduation",
        label: "Topaz graduation",
        state: missingTopaz ? "blocked" : "ready",
        detail: missingTopaz
          ? "Topaz router, pool factory, and WBNB addresses are required before final acceptance."
          : "Graduated tokens route into the configured Topaz volatile pool path.",
      },
    ],
  };
}
