import type { BnbContractReadiness } from "@/lib/bnbContracts";
import { summarizeMissingBnbContracts } from "@/lib/bnbContracts";
import type { SupportedChainId } from "@/lib/chainConfig";
import type { LaunchpadSafetyCheck, LaunchpadSafetyStatus } from "./types";

export const BNB_LAUNCHPAD_ADAPTER_ID = "bnb" as const;

function getBnbChainLabel(chainId: SupportedChainId) {
  return chainId === 97 ? "BNB Testnet" : "BNB Smart Chain";
}

function contractChecks(readiness?: BnbContractReadiness): LaunchpadSafetyCheck[] {
  if (!readiness) return [];
  const groups = [
    {
      id: "coreContracts",
      label: "Core launchpad contracts",
      keys: ["launchFactory", "launchCampaignImplementation", "graduationOracle", "permanentLpLocker"],
    },
    {
      id: "securityContracts",
      label: "Creator and risk registries",
      keys: ["creatorRegistry", "riskRegistry"],
    },
    {
      id: "treasuryContracts",
      label: "Treasury and reward vaults",
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
  contractReadiness?: BnbContractReadiness;
}): LaunchpadSafetyStatus {
  const contractsReady = params.contractReadiness?.ready ?? Boolean(params.factoryAddress);
  const protocolReady = Boolean(params.factoryAddress) && contractsReady;

  return {
    adapterId: BNB_LAUNCHPAD_ADAPTER_ID,
    chainId: params.chainId,
    chainLabel: getBnbChainLabel(params.chainId),
    protocolStatus: protocolReady ? "ready" : "unavailable",
    title: protocolReady ? "BNB launch route ready" : "BNB contract wiring incomplete",
    primaryActionLabel: protocolReady ? "BNB Live Route" : "Contracts Required",
    description: protocolReady
      ? "BNB launches use route authorization, API preflight checks, the configured LaunchFactory, and the Topaz graduation route."
      : summarizeMissingBnbContracts(params.contractReadiness ?? {
          chainId: params.chainId,
          ready: false,
          items: [],
          missingRequired: [],
        }),
    checks: [
      {
        id: "routeAuth",
        label: "Route authorization",
        state: "ready",
        detail: "Create, buy, and sell request server authorization before contract writes.",
      },
      {
        id: "signer",
        label: "Wallet signer",
        state: params.hasSigner && params.hasAccount ? "ready" : "pending",
        detail: params.hasSigner && params.hasAccount ? "Signer connected." : "Connect a BNB-compatible wallet before launch actions.",
      },
      ...contractChecks(params.contractReadiness),
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
        label: "Contract env wiring",
        state: contractsReady ? "ready" : "blocked",
        detail: contractsReady ? "Launchpad, vault, registry, locker, and Topaz addresses are configured." : "Run the final deployment and export frontend env values.",
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
        state: params.contractReadiness?.missingRequired.some((item) => item.key.startsWith("topaz")) ? "blocked" : "ready",
        detail: params.contractReadiness?.missingRequired.some((item) => item.key.startsWith("topaz"))
          ? "Topaz router, pool factory, and WBNB addresses are required before final acceptance."
          : "Graduated tokens route into the configured Topaz volatile pool path.",
      },
    ],
  };
}