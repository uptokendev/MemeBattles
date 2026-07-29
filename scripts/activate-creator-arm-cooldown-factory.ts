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

async function waitTx(txPromise: Promise<any> | any, label: string) {
  const tx = await txPromise;
  console.log(`[activate-creator-arm-cooldown] submitted ${label}: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed.`);
  return receipt.hash;
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
  const obsoleteEntry = manifest.supportedFactories?.find((entry: any) => entry.address?.toLowerCase() === "0xe0fbba4533513110cec7e78aa3e48ec45301b5e6");
  const obsoleteAddress = requireAddress("Obsolete factory", obsoleteEntry?.address);
  const oldEntries = (manifest.supportedFactories || []).filter((entry: any) => entry.address?.toLowerCase() !== replacementAddress.toLowerCase());

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

  const registryAddress = requireAddress("CreatorRegistry", await replacement.creatorRegistry());
  const treasuryAddress = requireAddress("TreasuryRouterV2", await replacement.feeRecipient());
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

  const txHashes: Record<string, string> = {};
  txHashes.enableReplacement = await waitTx(replacement.enableLive(), "LaunchFactory.enableLive");
  if (!(await obsolete.createPaused())) {
    txHashes.pauseObsoleteCreation = await waitTx(obsolete.setCreatePaused(true), "Obsolete LaunchFactory.setCreatePaused(true)");
  }

  if (!(await replacement.live())) throw new Error("Replacement factory did not become live.");
  if (await replacement.createPaused()) throw new Error("Replacement creation is paused after activation.");
  if (!(await obsolete.createPaused())) throw new Error("Obsolete factory creation was not paused.");
  if (await obsolete.globalPaused()) throw new Error("Obsolete factory was globally paused; existing campaigns must remain supported.");

  manifest.status = "active-corrected-factory";
  manifest.activatedAt = new Date().toISOString();
  manifest.activationTransactions = txHashes;
  manifest.replacement.live = true;
  for (const entry of manifest.supportedFactories || []) {
    entry.creationEnabled = entry.address.toLowerCase() === replacementAddress.toLowerCase();
    entry.supportEnabled = true;
  }
  manifest.dependencyState.primaryLocker = await treasury.permanentLpLocker();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[activate-creator-arm-cooldown] active factory=${replacementAddress}`);
  console.log(`[activate-creator-arm-cooldown] obsolete creation paused=${obsoleteAddress}`);
  console.log("[activate-creator-arm-cooldown] old factories and lockers remain supported");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
