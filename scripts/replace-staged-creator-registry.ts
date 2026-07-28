import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode } from "./verify-deployment";

const TESTNET_CHAIN_ID = 97n;
const MAINNET_CHAIN_ID = 56n;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function requireAddress(label: string, value: string): string {
  if (!ADDRESS_RE.test(value || "")) {
    throw new Error(`${label}: missing or invalid address: ${value || "<empty>"}`);
  }
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label}: zero address is not allowed.`);
  return address;
}

function assertAddressEq(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function loadStagedDeployment() {
  const file = rawEnv("DEPLOYMENT_FILE")
    ? path.resolve(rawEnv("DEPLOYMENT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.staged.json`);
  if (!fs.existsSync(file)) throw new Error(`Staged deployment file not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function waitForTransaction(tx: any, label: string) {
  console.log(`[replace-creator-registry] submitted ${label}: ${tx.hash}`);
  const receipt = await tx.wait(2);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed.`);
  console.log(`[replace-creator-registry] confirmed ${label} at block ${receipt.blockNumber}`);
  return receipt;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) {
    throw new Error("Refusing staged CreatorRegistry replacement on BSC mainnet (chain 56).");
  }
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This workflow is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: stagedFile, deployment: staged } = loadStagedDeployment();
  if (staged.treasuryRouterVersion !== "v2") {
    throw new Error("Staged CreatorRegistry replacement requires TreasuryRouterV2.");
  }
  if (!staged.activationRequired) {
    throw new Error("The staged factory is already activated; refusing registry replacement.");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());

  const newFactory = requireAddress(
    "Staged LaunchFactory",
    staged.stagedContracts?.LaunchFactory || staged.factoryReplacement?.newFactory,
  );
  const oldRegistry = requireAddress(
    "Legacy CreatorRegistry",
    staged.contracts?.CreatorRegistry || staged.creatorRegistry,
  );
  const riskRegistry = requireAddress(
    "RiskRegistry",
    staged.contracts?.RiskRegistry || staged.riskRegistry,
  );
  const treasuryRouter = requireAddress("TreasuryRouterV2", staged.contracts?.TreasuryRouterV2);
  const oldLocker = requireAddress(
    "Legacy PermanentLpLocker",
    staged.factoryReplacement?.oldPermanentLpLocker,
  );
  const newLocker = requireAddress(
    "Staged PermanentLpLocker",
    staged.stagedContracts?.PermanentLpLocker || staged.factoryReplacement?.newPermanentLpLocker,
  );

  for (const [label, address] of [
    ["Staged LaunchFactory", newFactory],
    ["Legacy CreatorRegistry", oldRegistry],
    ["RiskRegistry", riskRegistry],
    ["TreasuryRouterV2", treasuryRouter],
    ["Legacy PermanentLpLocker", oldLocker],
    ["Staged PermanentLpLocker", newLocker],
  ] as Array<[string, string]>) {
    await assertCode(label, address);
  }

  const factory = await ethers.getContractAt("LaunchFactory", newFactory, deployer);
  assertAddressEq("LaunchFactory.owner", await factory.owner(), deployerAddress);
  if (await factory.live()) throw new Error("Staged factory is already live; refusing registry replacement.");
  if (BigInt(await factory.campaignsCount()) !== 0n) {
    throw new Error("Staged factory already contains campaigns; refusing registry replacement.");
  }

  const currentFactoryRegistry = ethers.getAddress(await factory.creatorRegistry());
  if (currentFactoryRegistry.toLowerCase() !== oldRegistry.toLowerCase()) {
    throw new Error(
      `Staged factory CreatorRegistry is ${currentFactoryRegistry}, but manifest expects legacy registry ${oldRegistry}. ` +
        "Refusing to deploy another registry without reconciling state.",
    );
  }
  assertAddressEq("LaunchFactory.riskRegistry", await factory.riskRegistry(), riskRegistry);

  const oldRegistryRead = new ethers.Contract(
    oldRegistry,
    ["function owner() view returns (address)", "function launchRecorder(address) view returns (bool)"],
    ethers.provider,
  );
  const oldRegistryOwner = ethers.getAddress(await oldRegistryRead.owner());
  const oldFactoryAuthorized = Boolean(await oldRegistryRead.launchRecorder(newFactory));

  console.log(`[replace-creator-registry] staged deployment=${stagedFile}`);
  console.log(`[replace-creator-registry] deployer=${deployerAddress}`);
  console.log(`[replace-creator-registry] staged factory=${newFactory}`);
  console.log(`[replace-creator-registry] legacy CreatorRegistry=${oldRegistry}`);
  console.log(`[replace-creator-registry] legacy registry owner=${oldRegistryOwner}`);
  console.log(`[replace-creator-registry] legacy registry authorizes staged factory=${oldFactoryAuthorized}`);

  if (oldFactoryAuthorized) {
    throw new Error(
      "Legacy CreatorRegistry already authorizes the staged factory. Rerun recovery instead of replacing the registry.",
    );
  }
  if (oldRegistryOwner.toLowerCase() === deployerAddress.toLowerCase()) {
    throw new Error(
      "The deployer owns the legacy CreatorRegistry. Authorize the staged factory there instead of replacing it.",
    );
  }

  const CreatorRegistry = await ethers.getContractFactory("CreatorRegistry");
  const replacement = await CreatorRegistry.deploy();
  const deployTx = replacement.deploymentTransaction();
  if (!deployTx) throw new Error("CreatorRegistry deployment transaction is unavailable.");
  console.log(`[replace-creator-registry] submitted CreatorRegistry deployment: ${deployTx.hash}`);
  await replacement.waitForDeployment();
  const deploymentReceipt = await deployTx.wait(2);
  if (!deploymentReceipt || deploymentReceipt.status !== 1) {
    throw new Error("CreatorRegistry deployment failed.");
  }

  const replacementRegistry = ethers.getAddress(await replacement.getAddress());
  await assertCode("Replacement CreatorRegistry", replacementRegistry);
  assertAddressEq("Replacement CreatorRegistry.owner", await replacement.owner(), deployerAddress);
  console.log(`[replace-creator-registry] replacement CreatorRegistry=${replacementRegistry}`);
  console.log(`[replace-creator-registry] deployment block=${deploymentReceipt.blockNumber}`);

  await waitForTransaction(
    await replacement.setLaunchRecorder(newFactory, true),
    "CreatorRegistry.setLaunchRecorder(newFactory,true)",
  );
  if (!(await replacement.launchRecorder(newFactory))) {
    throw new Error("Replacement CreatorRegistry did not retain the staged factory authorization.");
  }

  await waitForTransaction(
    await factory.setRegistries(replacementRegistry, riskRegistry),
    "LaunchFactory.setRegistries(replacementCreatorRegistry,riskRegistry)",
  );
  assertAddressEq("LaunchFactory.creatorRegistry", await factory.creatorRegistry(), replacementRegistry);
  assertAddressEq("LaunchFactory.riskRegistry", await factory.riskRegistry(), riskRegistry);

  const treasury = new ethers.Contract(
    treasuryRouter,
    [
      "function authorizedLpLocker(address) view returns (bool)",
      "function permanentLpLocker() view returns (address)",
    ],
    ethers.provider,
  );
  const oldLockerAuthorized = Boolean(await treasury.authorizedLpLocker(oldLocker));
  const newLockerAuthorized = Boolean(await treasury.authorizedLpLocker(newLocker));
  const newLockerPrimary =
    String(await treasury.permanentLpLocker()).toLowerCase() === newLocker.toLowerCase();
  if (!oldLockerAuthorized) throw new Error("TreasuryRouterV2 no longer authorizes the legacy locker.");

  const postDeployActions = Array.isArray(staged.postDeployActions)
    ? staged.postDeployActions.filter(
        (action: unknown) =>
          !String(action || "").includes("CreatorRegistry.setLaunchRecorder") &&
          !String(action || "").includes(newFactory),
      )
    : [];
  const activationReady =
    Boolean(await replacement.launchRecorder(newFactory)) &&
    newLockerAuthorized &&
    newLockerPrimary &&
    postDeployActions.length === 0;

  const nextDeployment = {
    ...staged,
    creatorRegistry: replacementRegistry,
    contracts: {
      ...(staged.contracts || {}),
      LegacyCreatorRegistry: oldRegistry,
      CreatorRegistry: replacementRegistry,
    },
    security: {
      ...(staged.security || {}),
      legacyCreatorRegistry: oldRegistry,
      creatorRegistry: replacementRegistry,
      registryOwner: deployerAddress,
      factoryLaunchRecorderEnabled: true,
    },
    factoryReplacement: {
      ...(staged.factoryReplacement || {}),
      legacyCreatorRegistry: oldRegistry,
      replacementCreatorRegistry: replacementRegistry,
      replacementCreatorRegistryDeploymentBlock: Number(deploymentReceipt.blockNumber),
    },
    stagedContracts: {
      ...(staged.stagedContracts || {}),
      CreatorRegistry: replacementRegistry,
    },
    activationReady,
    postDeployActions,
  };

  const outFile = rawEnv("CREATOR_REGISTRY_REPLACEMENT_OUTPUT_FILE")
    ? path.resolve(rawEnv("CREATOR_REGISTRY_REPLACEMENT_OUTPUT_FILE"))
    : stagedFile;
  writeJson(outFile, nextDeployment);

  console.log(`\n[replace-creator-registry] updated staged deployment=${outFile}`);
  console.log(`[replace-creator-registry] CREATOR_REGISTRY_ADDRESS_97=${replacementRegistry}`);
  console.log(`[replace-creator-registry] factory launch recorder enabled=true`);
  console.log(`[replace-creator-registry] old locker authorized=${oldLockerAuthorized}`);
  console.log(`[replace-creator-registry] new locker authorized=${newLockerAuthorized}`);
  console.log(`[replace-creator-registry] new locker primary=${newLockerPrimary}`);
  console.log(`[replace-creator-registry] activation ready=${activationReady}`);

  if (!activationReady) {
    console.log("[replace-creator-registry] The registry replacement succeeded, but another activation prerequisite remains.");
    if (postDeployActions.length) {
      console.log("[replace-creator-registry] Remaining actions:");
      for (const action of postDeployActions) console.log(`- ${action}`);
    }
    return;
  }

  console.log("[replace-creator-registry] Ready for contract verification and staged factory activation.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
