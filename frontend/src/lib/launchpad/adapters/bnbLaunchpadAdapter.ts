import type { BnbContractReadiness } from "@/lib/bnbContracts";
import { getBnbContractReadiness } from "@/lib/bnbContracts";
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
      label: "Graduation route",
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
        ? "One or more launch requirements are temporarily unavailable."
        : `${configured}/${items.length} launch requirements ready for chain ${readiness.chainId}.`,
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
      ? `Your wallet is connected to chain ${params.walletChainId}. Switch to ${getBnbChainLabel(params.chainId)} (chain ${params.chainId}) to continue.`
      : protocolReady
      ? "BNB launch services are ready. Your campaign can launch and graduate through the supported MemeWarzone route."
      : "Launching is temporarily unavailable on this network. Your draft is safe. Please try again later.",
    checks: [
      {
        id: "network",
        label: "Wallet network",
        state: wrongWalletNetwork ? "blocked" : params.hasAccount ? "ready" : "pending",
        detail: wrongWalletNetwork
          ? `Your wallet is connected to chain ${params.walletChainId}. Switch to ${getBnbChainLabel(params.chainId)} (chain ${params.chainId}) to continue.`
          : params.hasAccount
            ? `Wallet connected to ${getBnbChainLabel(params.chainId)} (chain ${params.chainId}).`
            : `Connect a BNB-compatible wallet on ${getBnbChainLabel(params.chainId)} (chain ${params.chainId}).`,
      },
      {
        id: "routeAuth",
        label: "Transaction protection",
        state: "ready",
        detail: "Launch and trading transactions are protected before they are submitted.",
      },
      {
        id: "signer",
        label: "Wallet connection",
        state: params.hasSigner && params.hasAccount ? "ready" : "pending",
        detail: params.hasSigner && params.hasAccount ? "Wallet ready." : "Connect a BNB-compatible wallet to continue.",
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
        detail: contractsReady ? "Launch services are configured and ready." : "Launching is temporarily unavailable on this network. Your draft is safe. Please try again later.",
      },
      {
        id: "trading",
        label: "Trading",
        state: protocolReady ? "ready" : "blocked",
        detail: protocolReady ? "Buy and sell transactions are protected by MemeWarzone safety checks." : "Trading is temporarily unavailable on this network. Please try again later.",
      },
      {
        id: "graduation",
        label: "Topaz graduation",
        state: missingTopaz ? "blocked" : "ready",
        detail: missingTopaz
          ? "The graduation route is temporarily unavailable. Please try again later."
          : "Graduated tokens move into the supported Topaz liquidity pool.",
      },
    ],
  };
}
