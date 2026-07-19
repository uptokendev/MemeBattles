import { ethers } from "ethers";
import LaunchFactoryArtifact from "@/abi/LaunchFactory.json";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";
import GraduationOracleArtifact from "@/abi/GraduationOracle.json";
import CreatorRegistryArtifact from "@/abi/CreatorRegistry.json";
import RiskRegistryArtifact from "@/abi/RiskRegistry.json";
import TreasuryRouterArtifact from "@/abi/TreasuryRouter.json";
import RecruiterRewardsVaultArtifact from "@/abi/RecruiterRewardsVault.json";
import ProtocolRevenueVaultArtifact from "@/abi/ProtocolRevenueVault.json";
import CommunityRewardsVaultArtifact from "@/abi/CommunityRewardsVault.json";
import TreasuryVaultV2Artifact from "@/abi/TreasuryVaultV2.json";
import UPVoteTreasuryArtifact from "@/abi/UPVoteTreasury.json";
import PermanentLpLockerArtifact from "@/abi/PermanentLpLocker.json";
import type { SupportedChainId } from "@/lib/chainConfig";
import { isEvmChainId } from "@/lib/chainConfig";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type Artifact = { abi?: ethers.InterfaceAbi; contractName?: string } | ethers.InterfaceAbi;

function toAbi(artifact: Artifact): ethers.InterfaceAbi {
  return ((artifact as { abi?: ethers.InterfaceAbi })?.abi ?? artifact) as ethers.InterfaceAbi;
}

function env(name: string): string {
  const viteEnv = import.meta.env as Record<string, unknown>;
  return String(viteEnv[name] ?? "").trim();
}

function normalizeAddress(value: string): string {
  return ADDRESS_RE.test(value) ? value : "";
}

function readAddress(chainId: SupportedChainId, perChainName: string, fallbackName?: string) {
  if (!isEvmChainId(chainId)) return "";
  return normalizeAddress(env(`${perChainName}_${chainId}`) || (fallbackName ? env(fallbackName) : ""));
}

export type BnbContractKey =
  | "launchFactory"
  | "launchCampaignImplementation"
  | "treasuryRouter"
  | "treasuryVault"
  | "recruiterRewardsVault"
  | "communityRewardsVault"
  | "protocolRevenueVault"
  | "creatorRegistry"
  | "riskRegistry"
  | "graduationOracle"
  | "permanentLpLocker"
  | "voteTreasury"
  | "topazRouter"
  | "topazFactory"
  | "topazWbnb";

export type BnbContractAddresses = Record<BnbContractKey, string>;

export type BnbContractReadinessItem = {
  key: BnbContractKey;
  label: string;
  required: boolean;
  address: string;
  ready: boolean;
};

export type BnbContractReadiness = {
  chainId: SupportedChainId;
  ready: boolean;
  items: BnbContractReadinessItem[];
  missingRequired: BnbContractReadinessItem[];
};

export const bnbContractAbis = {
  launchFactory: toAbi(LaunchFactoryArtifact),
  launchCampaign: toAbi(LaunchCampaignArtifact),
  launchToken: toAbi(LaunchTokenArtifact),
  graduationOracle: toAbi(GraduationOracleArtifact),
  creatorRegistry: toAbi(CreatorRegistryArtifact),
  riskRegistry: toAbi(RiskRegistryArtifact),
  treasuryRouter: toAbi(TreasuryRouterArtifact),
  recruiterRewardsVault: toAbi(RecruiterRewardsVaultArtifact),
  protocolRevenueVault: toAbi(ProtocolRevenueVaultArtifact),
  communityRewardsVault: toAbi(CommunityRewardsVaultArtifact),
  treasuryVault: toAbi(TreasuryVaultV2Artifact),
  voteTreasury: toAbi(UPVoteTreasuryArtifact),
  permanentLpLocker: toAbi(PermanentLpLockerArtifact),
} as const;

const contractLabels: Record<BnbContractKey, string> = {
  launchFactory: "LaunchFactory",
  launchCampaignImplementation: "LaunchCampaign implementation",
  treasuryRouter: "TreasuryRouter",
  treasuryVault: "TreasuryVaultV2",
  recruiterRewardsVault: "RecruiterRewardsVault",
  communityRewardsVault: "CommunityRewardsVault",
  protocolRevenueVault: "ProtocolRevenueVault",
  creatorRegistry: "CreatorRegistry",
  riskRegistry: "RiskRegistry",
  graduationOracle: "GraduationOracle",
  permanentLpLocker: "PermanentLpLocker",
  voteTreasury: "UPVoteTreasury",
  topazRouter: "Topaz router",
  topazFactory: "Topaz pool factory",
  topazWbnb: "Topaz WBNB",
};

const requiredContracts = new Set<BnbContractKey>([
  "launchFactory",
  "launchCampaignImplementation",
  "treasuryRouter",
  "treasuryVault",
  "recruiterRewardsVault",
  "communityRewardsVault",
  "protocolRevenueVault",
  "creatorRegistry",
  "riskRegistry",
  "graduationOracle",
  "permanentLpLocker",
  "voteTreasury",
  "topazRouter",
  "topazFactory",
  "topazWbnb",
]);

export function getBnbContractAddresses(chainId: SupportedChainId): BnbContractAddresses {
  return {
    launchFactory: readAddress(chainId, "VITE_FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"),
    launchCampaignImplementation: readAddress(chainId, "VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS"),
    treasuryRouter: readAddress(chainId, "VITE_TREASURY_ROUTER_ADDRESS"),
    treasuryVault: readAddress(chainId, "VITE_TREASURY_VAULT_ADDRESS", "VITE_TREASURY_VAULT_ADDRESS"),
    recruiterRewardsVault: readAddress(chainId, "VITE_RECRUITER_REWARDS_VAULT_ADDRESS"),
    communityRewardsVault: readAddress(chainId, "VITE_COMMUNITY_REWARDS_VAULT_ADDRESS"),
    protocolRevenueVault: readAddress(chainId, "VITE_PROTOCOL_REVENUE_VAULT_ADDRESS"),
    creatorRegistry: readAddress(chainId, "VITE_CREATOR_REGISTRY_ADDRESS"),
    riskRegistry: readAddress(chainId, "VITE_RISK_REGISTRY_ADDRESS"),
    graduationOracle: readAddress(chainId, "VITE_GRADUATION_ORACLE_ADDRESS"),
    permanentLpLocker: readAddress(chainId, "VITE_PERMANENT_LP_LOCKER_ADDRESS"),
    voteTreasury: readAddress(chainId, "VITE_VOTE_TREASURY_ADDRESS", "VITE_VOTE_TREASURY_ADDRESS"),
    topazRouter: readAddress(chainId, "VITE_TOPAZ_ROUTER_ADDRESS"),
    topazFactory: readAddress(chainId, "VITE_TOPAZ_FACTORY_ADDRESS"),
    topazWbnb: readAddress(chainId, "VITE_TOPAZ_WBNB_ADDRESS"),
  };
}

export function getBnbContractReadiness(chainId: SupportedChainId): BnbContractReadiness {
  const addresses = getBnbContractAddresses(chainId);
  const items = (Object.keys(addresses) as BnbContractKey[]).map((key) => {
    const required = requiredContracts.has(key);
    const address = addresses[key];
    return {
      key,
      label: contractLabels[key],
      required,
      address,
      ready: Boolean(address),
    };
  });
  const missingRequired = items.filter((item) => item.required && !item.ready);
  return {
    chainId,
    ready: missingRequired.length === 0,
    items,
    missingRequired,
  };
}

export function summarizeMissingBnbContracts(readiness: BnbContractReadiness): string {
  if (readiness.ready) return "All required BNB launchpad contracts are configured.";
  const names = readiness.missingRequired.map((item) => item.label).join(", ");
  return `Missing ${readiness.missingRequired.length} required contract${readiness.missingRequired.length === 1 ? "" : "s"}: ${names}.`;
}
