import { ethers } from "ethers";
import { getReadProvider } from "@/lib/readProvider";

export type EvmDeploymentChainId = 56 | 97;

export type ProtocolContractGroup = "Launch core" | "Treasury and security" | "Minimal Topaz";

export type ProtocolContractKey =
  | "launchFactory"
  | "campaignImplementation"
  | "launchRouter"
  | "permanentLpLocker"
  | "voteTreasury"
  | "treasuryVault"
  | "treasuryRouter"
  | "communityRewardsVault"
  | "recruiterRewardsVault"
  | "protocolRevenueVault"
  | "creatorRegistry"
  | "riskRegistry"
  | "graduationOracle"
  | "topazRouter"
  | "topazRouterAdapter"
  | "topazFactory"
  | "topazFactoryRegistry"
  | "topazWbnb"
  | "topazPoolImplementation";

type ProtocolContractDefinition = {
  key: ProtocolContractKey;
  label: string;
  group: ProtocolContractGroup;
  envBase: string;
  requiredForLaunch: boolean;
};

export type ProtocolContractConfig = ProtocolContractDefinition & {
  address: string;
  configured: boolean;
  explorerUrl: string;
};

export type ProtocolContractInspection = ProtocolContractConfig & {
  state: "missing" | "checking" | "live" | "no_code" | "rpc_error";
  error?: string;
};

const DEFINITIONS: readonly ProtocolContractDefinition[] = [
  { key: "launchFactory", label: "Launch Factory", group: "Launch core", envBase: "VITE_FACTORY_ADDRESS", requiredForLaunch: true },
  { key: "campaignImplementation", label: "Campaign Implementation", group: "Launch core", envBase: "VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS", requiredForLaunch: true },
  { key: "launchRouter", label: "Launch Router", group: "Launch core", envBase: "VITE_LAUNCH_ROUTER_ADDRESS", requiredForLaunch: true },
  { key: "permanentLpLocker", label: "Permanent LP Locker", group: "Launch core", envBase: "VITE_PERMANENT_LP_LOCKER_ADDRESS", requiredForLaunch: true },
  { key: "voteTreasury", label: "UPVote Treasury", group: "Treasury and security", envBase: "VITE_VOTE_TREASURY_ADDRESS", requiredForLaunch: true },
  { key: "treasuryVault", label: "League Treasury Vault", group: "Treasury and security", envBase: "VITE_TREASURY_VAULT_ADDRESS", requiredForLaunch: true },
  { key: "treasuryRouter", label: "Treasury Router", group: "Treasury and security", envBase: "VITE_TREASURY_ROUTER_ADDRESS", requiredForLaunch: true },
  { key: "communityRewardsVault", label: "Community Rewards Vault", group: "Treasury and security", envBase: "VITE_COMMUNITY_REWARDS_VAULT_ADDRESS", requiredForLaunch: true },
  { key: "recruiterRewardsVault", label: "Recruiter Rewards Vault", group: "Treasury and security", envBase: "VITE_RECRUITER_REWARDS_VAULT_ADDRESS", requiredForLaunch: true },
  { key: "protocolRevenueVault", label: "Protocol Revenue Vault", group: "Treasury and security", envBase: "VITE_PROTOCOL_REVENUE_VAULT_ADDRESS", requiredForLaunch: true },
  { key: "creatorRegistry", label: "Creator Registry", group: "Treasury and security", envBase: "VITE_CREATOR_REGISTRY_ADDRESS", requiredForLaunch: true },
  { key: "riskRegistry", label: "Risk Registry", group: "Treasury and security", envBase: "VITE_RISK_REGISTRY_ADDRESS", requiredForLaunch: true },
  { key: "graduationOracle", label: "Graduation Oracle", group: "Treasury and security", envBase: "VITE_GRADUATION_ORACLE_ADDRESS", requiredForLaunch: true },
  { key: "topazRouter", label: "Minimal Topaz Router", group: "Minimal Topaz", envBase: "VITE_TOPAZ_ROUTER_ADDRESS", requiredForLaunch: true },
  { key: "topazRouterAdapter", label: "Topaz Router Adapter", group: "Minimal Topaz", envBase: "VITE_TOPAZ_ROUTER_ADAPTER_ADDRESS", requiredForLaunch: true },
  { key: "topazFactory", label: "Topaz Pool Factory", group: "Minimal Topaz", envBase: "VITE_TOPAZ_FACTORY_ADDRESS", requiredForLaunch: true },
  { key: "topazFactoryRegistry", label: "Topaz Factory Registry", group: "Minimal Topaz", envBase: "VITE_TOPAZ_FACTORY_REGISTRY_ADDRESS", requiredForLaunch: false },
  { key: "topazWbnb", label: "Topaz WBNB", group: "Minimal Topaz", envBase: "VITE_TOPAZ_WBNB_ADDRESS", requiredForLaunch: true },
  { key: "topazPoolImplementation", label: "Topaz Pool Implementation", group: "Minimal Topaz", envBase: "VITE_TOPAZ_POOL_IMPLEMENTATION_ADDRESS", requiredForLaunch: false },
] as const;

function readEnvAddress(envBase: string, chainId: EvmDeploymentChainId): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[`${envBase}_${chainId}`] ?? env[envBase] ?? "";
  const trimmed = String(value).trim();
  return ethers.isAddress(trimmed) ? ethers.getAddress(trimmed) : "";
}

export function getAddressExplorerUrl(chainId: EvmDeploymentChainId, address: string): string {
  if (!address) return "";
  const base = chainId === 97 ? "https://testnet.bscscan.com/address/" : "https://bscscan.com/address/";
  return `${base}${address}`;
}

export function getProtocolContractConfig(chainId: EvmDeploymentChainId): ProtocolContractConfig[] {
  return DEFINITIONS.map((definition) => {
    const address = readEnvAddress(definition.envBase, chainId);
    return {
      ...definition,
      address,
      configured: Boolean(address),
      explorerUrl: getAddressExplorerUrl(chainId, address),
    };
  });
}

export function getProtocolDeploymentReadiness(chainId: EvmDeploymentChainId) {
  const contracts = getProtocolContractConfig(chainId);
  const required = contracts.filter((contract) => contract.requiredForLaunch);
  const missing = required.filter((contract) => !contract.configured);

  return {
    chainId,
    contracts,
    requiredCount: required.length,
    configuredRequiredCount: required.length - missing.length,
    missingRequired: missing,
    configured: missing.length === 0,
  };
}

export async function inspectProtocolDeployment(chainId: EvmDeploymentChainId): Promise<ProtocolContractInspection[]> {
  const provider = getReadProvider(chainId);
  const contracts = getProtocolContractConfig(chainId);

  return Promise.all(
    contracts.map(async (contract): Promise<ProtocolContractInspection> => {
      if (!contract.configured) return { ...contract, state: "missing" };

      try {
        const code = await provider.getCode(contract.address);
        return { ...contract, state: code && code !== "0x" ? "live" : "no_code" };
      } catch (error: any) {
        return {
          ...contract,
          state: "rpc_error",
          error: String(error?.shortMessage || error?.message || error || "RPC request failed"),
        };
      }
    }),
  );
}

export function summarizeProtocolInspection(inspections: ProtocolContractInspection[]) {
  const required = inspections.filter((contract) => contract.requiredForLaunch);
  const liveRequired = required.filter((contract) => contract.state === "live");
  const failedRequired = required.filter((contract) => contract.state !== "live");

  return {
    requiredCount: required.length,
    liveRequiredCount: liveRequired.length,
    failedRequired,
    ready: required.length > 0 && failedRequired.length === 0,
  };
}
