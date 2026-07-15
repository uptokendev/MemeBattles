import { artifacts } from "hardhat";

export const EVM_RUNTIME_LIMIT_BYTES = 24_576;
export const INTERNAL_RUNTIME_TARGET_BYTES = 23_000;
export const PRODUCTION_CONTRACTS = [
  "LaunchCampaign",
  "LaunchFactory",
  "LaunchToken",
  "GraduationOracle",
  "CreatorRegistry",
  "RiskRegistry",
  "TreasuryRouter",
  "TreasuryVaultV2",
  "RecruiterRewardsVault",
  "CommunityRewardsVault",
  "ProtocolRevenueVault",
  "UPVoteTreasury",
  "PermanentLpLocker",
];

export function runtimeByteLength(deployedBytecode: string) {
  return (deployedBytecode.length - 2) / 2;
}

export function runtimeSizeStatus(runtimeBytes: number) {
  return runtimeBytes < INTERNAL_RUNTIME_TARGET_BYTES ? "ok" : "too large";
}

export function assertRuntimeSize(contractName: string, runtimeBytes: number) {
  if (runtimeBytes > EVM_RUNTIME_LIMIT_BYTES) {
    throw new Error(`${contractName} exceeds the EVM runtime limit of ${EVM_RUNTIME_LIMIT_BYTES} bytes`);
  }

  if (runtimeBytes >= INTERNAL_RUNTIME_TARGET_BYTES) {
    throw new Error(`One or more production contracts exceed the internal ${INTERNAL_RUNTIME_TARGET_BYTES} byte target`);
  }
}

async function main() {
  let failed = false;

  for (const contractName of PRODUCTION_CONTRACTS) {
    const artifact = await artifacts.readArtifact(contractName);
    const runtimeBytes = runtimeByteLength(artifact.deployedBytecode);
    const status = runtimeSizeStatus(runtimeBytes);

    console.log(`${contractName}: ${runtimeBytes} bytes (${status})`);

    if (runtimeBytes > EVM_RUNTIME_LIMIT_BYTES) {
      throw new Error(`${contractName} exceeds the EVM runtime limit of ${EVM_RUNTIME_LIMIT_BYTES} bytes`);
    }

    if (runtimeBytes >= INTERNAL_RUNTIME_TARGET_BYTES) {
      failed = true;
    }
  }

  if (failed) {
    throw new Error(`One or more production contracts exceed the internal ${INTERNAL_RUNTIME_TARGET_BYTES} byte target`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
