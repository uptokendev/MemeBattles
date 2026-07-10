import { artifacts } from "hardhat";

const EVM_RUNTIME_LIMIT_BYTES = 24_576;
const INTERNAL_RUNTIME_TARGET_BYTES = 23_000;
const PRODUCTION_CONTRACTS = [
  "LaunchCampaign",
  "LaunchFactory",
  "LaunchToken",
  "TreasuryRouter",
  "TreasuryVault",
  "UPVoteTreasury",
];

async function main() {
  let failed = false;

  for (const contractName of PRODUCTION_CONTRACTS) {
    const artifact = await artifacts.readArtifact(contractName);
    const runtimeBytes = (artifact.deployedBytecode.length - 2) / 2;
    const status = runtimeBytes < INTERNAL_RUNTIME_TARGET_BYTES ? "ok" : "too large";

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
