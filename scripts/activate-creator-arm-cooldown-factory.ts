import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";

const DEFAULT_MANIFEST = "deployments/bscTestnet.creator-arm-cooldown-factory.staged.json";

function requireAddress(label: string, value: unknown) {
  const raw = String(value || "").trim();
  if (!ethers.isAddress(raw) || ethers.getAddress(raw) === ethers.ZeroAddress) {
    throw new Error(`${label}: invalid address ${raw || "<empty>"}`);
  }
  return ethers.getAddress(raw);
}

function writeText(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`);
}

function writeJson(file: string, value: unknown) {
  writeText(file, JSON.stringify(value, null, 2));
}

async function waitTx(txPromise: Promise<any> | any, label: string) {
  const tx = await txPromise;
  console.log(`[activate-creator-arm-cooldown] submitted ${label}: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed.`);
  return { hash: receipt.hash, blockNumber: Number(receipt.blockNumber) };
}

async function main() {
  const manifestPath = path.resolve(process.env.DEPLOYMENT_FILE || DEFAULT_MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new Error(`Deployment manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== 97 || Number(manifest.chainId) !== 97) {
    throw new Error("Activation is restricted to BSC Testnet chain 97.");
  }

  const replacementAddress = requireAddress("Replacement factory", manifest.replacement?.factory);
  const replacementLocker = requireAddress("Replacement locker", manifest.replacement?.locker);
  const obsoleteEntry = manifest.supportedFactories?.find(
    (entry: any) => entry.address?.toLowerCase() === "0xe0fbba4533513110cec7e78aa3e48ec45301b5e6",
  );
  const obsoleteAddress = requireAddress("Obsolete factory", obsoleteEntry?.address);
  const oldEntries = (manifest.supportedFactories || []).filter(
    (entry: any) => entry.address?.toLowerCase() !== replacementAddress.toLowerCase(),
  );

  const [operator] = await ethers.getSigners();
  const operatorAddress = ethers.getAddress(await operator.getAddress());
  const replacement = await ethers.getContractAt("LaunchFactory", replacementAddress, operator);
  const obsolete = await ethers.getContractAt("LaunchFactory", obsoleteAddress, operator);

  if (Number(await replacement.FACTORY_GENERATION()) !== 3) throw new Error("Replacement factory generation is not 3.");
  if (Number(await replacement.CAMPAIGN_GENERATION()) !== 2) throw new Error("Replacement campaign generation is not 2.");
  if (await replacement.live()) throw new Error("Replacement factory is already live; refusing duplicate activation.");
  if (BigInt(await replacement.campaignsCount()) !== 0n) throw new Error("Replacement factory already contains campaigns.");
  if (!(await replacement.securityDefaultsLocked())) throw new Error("Replacement factory security defaults are not locked.");
  if (await replacement.globalPaused()) throw new Error("Replacement factory is globally paused.");
  if (await replacement.createPaused()) throw new Error("Replacement factory creation is paused before activation.");
  if ((await replacement.owner()).toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error("Connected operator does not own the replacement factory.");
  }

  const campaignImplementation = requireAddress("LaunchCampaign implementation", await replacement.campaignImplementation());
  const registryAddress = requireAddress("CreatorRegistry", await replacement.creatorRegistry());
  const riskRegistryAddress = requireAddress("RiskRegistry", await replacement.riskRegistry());
  const graduationOracleAddress = requireAddress("GraduationOracle", await replacement.graduationOracle());
  const treasuryAddress = requireAddress("TreasuryRouterV2", await replacement.feeRecipient());
  const launchRouterAddress = requireAddress("Topaz launch router", await replacement.router());
  const routeAuthorityAddress = requireAddress("Route authority", await replacement.routeAuthority());

  const registry = new ethers.Contract(
    registryAddress,
    ["function launchRecorder(address) view returns (bool)"],
    operator,
  );
  const treasury = new ethers.Contract(
    treasuryAddress,
    [
      "function authorizedLpLocker(address) view returns (bool)",
      "function permanentLpLocker() view returns (address)",
    ],
    operator,
  );

  if (!(await registry.launchRecorder(replacementAddress))) {
    throw new Error("Replacement factory is not authorized as a CreatorRegistry launch recorder.");
  }
  if (!(await treasury.authorizedLpLocker(replacementLocker))) {
    throw new Error("Replacement locker is not authorized in TreasuryRouterV2.");
  }

  for (const entry of oldEntries) {
    const oldFactory = requireAddress("Supported old factory", entry.address);
    const oldLocker = requireAddress("Supported old locker", entry.locker);
    if (!(await registry.launchRecorder(oldFactory))) {
      throw new Error(`Supported factory ${oldFactory} was removed as a launch recorder.`);
    }
    if (!(await treasury.authorizedLpLocker(oldLocker))) {
      throw new Error(`Supported locker ${oldLocker} is no longer authorized.`);
    }
  }

  const transactions: Record<string, { hash: string; blockNumber: number }> = {};
  transactions.enableReplacement = await waitTx(replacement.enableLive(), "LaunchFactory.enableLive");
  if (!(await obsolete.createPaused())) {
    transactions.pauseObsoleteCreation = await waitTx(
      obsolete.setCreatePaused(true),
      "Obsolete LaunchFactory.setCreatePaused(true)",
    );
  }

  if (!(await replacement.live())) throw new Error("Replacement factory did not become live.");
  if (await replacement.createPaused()) throw new Error("Replacement creation is paused after activation.");
  if (!(await obsolete.createPaused())) throw new Error("Obsolete factory creation was not paused.");
  if (await obsolete.globalPaused()) {
    throw new Error("Obsolete factory was globally paused; existing campaigns must remain supported.");
  }

  const activatedAt = new Date().toISOString();
  const activationBlock = transactions.enableReplacement.blockNumber;
  manifest.status = "active-corrected-factory";
  manifest.activatedAt = activatedAt;
  manifest.activationBlock = activationBlock;
  manifest.activationTransactions = transactions;
  manifest.replacement.live = true;
  manifest.replacement.creationEnabled = true;
  for (const entry of manifest.supportedFactories || []) {
    entry.creationEnabled = entry.address.toLowerCase() === replacementAddress.toLowerCase();
    entry.supportEnabled = true;
  }
  manifest.dependencyState.primaryLocker = await treasury.permanentLpLocker();
  manifest.activeFactory = replacementAddress;
  manifest.factoryGeneration = 3;
  manifest.campaignGeneration = 2;
  manifest.contracts = {
    ...(manifest.contracts || {}),
    LaunchFactory: replacementAddress,
    LaunchCampaignImplementation: campaignImplementation,
    PermanentLpLocker: replacementLocker,
    TreasuryRouter: treasuryAddress,
    TreasuryRouterV2: treasuryAddress,
    CreatorRegistry: registryAddress,
    RiskRegistry: riskRegistryAddress,
    GraduationOracle: graduationOracleAddress,
  };
  manifest.routing = {
    ...(manifest.routing || {}),
    factoryRouteAuthority: routeAuthorityAddress,
    launchRouter: launchRouterAddress,
  };

  const root = path.resolve(__dirname, "..");
  const activeManifestPath = path.join(root, "deployments", "bscTestnet.creator-arm-cooldown-factory.json");
  const frontendEnvPath = path.join(root, "deployments", "bscTestnet.creator-arm-cooldown-factory.frontend.env");
  const railwayEnvPath = path.join(root, "deployments", "bscTestnet.creator-arm-cooldown-factory.railway.env");
  const generationManifestPath = path.join(
    root,
    "deployments",
    "bscTestnet.creator-arm-cooldown-factory.generations.json",
  );

  const supportedAddresses = (manifest.supportedFactories || []).map((entry: any) =>
    requireAddress("Supported factory", entry.address),
  );
  const supportedCsv = supportedAddresses.join(",");
  const frontendEnv = [
    `VITE_FACTORY_ADDRESS_97=${replacementAddress}`,
    `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementAddress}`,
    `VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_97=${campaignImplementation}`,
    `VITE_TREASURY_ROUTER_ADDRESS_97=${treasuryAddress}`,
    `VITE_CREATOR_REGISTRY_ADDRESS_97=${registryAddress}`,
    `VITE_RISK_REGISTRY_ADDRESS_97=${riskRegistryAddress}`,
    `VITE_GRADUATION_ORACLE_ADDRESS_97=${graduationOracleAddress}`,
    `VITE_PERMANENT_LP_LOCKER_ADDRESS_97=${replacementLocker}`,
    `VITE_SUPPORTED_FACTORY_ADDRESSES_97=${supportedCsv}`,
  ].join("\n");
  const railwayEnv = [
    `FACTORY_ADDRESS_97=${replacementAddress}`,
    `SCHEDULED_FACTORY_ADDRESS_97=${replacementAddress}`,
    `SUPPORTED_FACTORY_ADDRESSES_97=${supportedCsv}`,
    `FACTORY_START_BLOCK_97=${manifest.deploymentBlock}`,
  ].join("\n");
  const generationManifest = {
    chainId: 97,
    generatedAt: activatedAt,
    activeFactory: replacementAddress,
    activeFactoryGeneration: 3,
    activeCampaignGeneration: 2,
    factories: (manifest.supportedFactories || []).map((entry: any) => ({
      address: requireAddress("Supported factory", entry.address),
      locker: requireAddress("Supported locker", entry.locker),
      supportEnabled: true,
      creationEnabled: entry.address.toLowerCase() === replacementAddress.toLowerCase(),
      deploymentBlock:
        entry.address.toLowerCase() === replacementAddress.toLowerCase()
          ? Number(manifest.deploymentBlock)
          : entry.deploymentBlock ?? null,
      factoryGeneration:
        entry.address.toLowerCase() === replacementAddress.toLowerCase() ? 3 : entry.factoryGeneration ?? null,
      campaignGeneration:
        entry.address.toLowerCase() === replacementAddress.toLowerCase() ? 2 : entry.campaignGeneration ?? null,
    })),
  };

  writeJson(manifestPath, manifest);
  writeJson(activeManifestPath, manifest);
  writeText(frontendEnvPath, frontendEnv);
  writeText(railwayEnvPath, railwayEnv);
  writeJson(generationManifestPath, generationManifest);

  console.log(`[activate-creator-arm-cooldown] active factory=${replacementAddress}`);
  console.log(`[activate-creator-arm-cooldown] obsolete creation paused=${obsoleteAddress}`);
  console.log("[activate-creator-arm-cooldown] old factories and lockers remain supported");
  console.log(`[activate-creator-arm-cooldown] frontend env=${frontendEnvPath}`);
  console.log(`[activate-creator-arm-cooldown] Railway env=${railwayEnvPath}`);
  console.log(`[activate-creator-arm-cooldown] generation manifest=${generationManifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
