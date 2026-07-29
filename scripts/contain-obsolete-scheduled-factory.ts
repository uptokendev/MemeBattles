import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const TESTNET_CHAIN_ID = 97n;
const OBSOLETE_FACTORY = "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6";
const EXPECTED_LOCKER = "0x3Fd82ACA84E43CEDEb6B8b577fd15A1Ce9eC4161";

async function main() {
  const connected = await ethers.provider.getNetwork();
  if (connected.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Containment is restricted to BSC Testnet chain 97; connected chain is ${connected.chainId}.`);
  }

  const [operator] = await ethers.getSigners();
  const operatorAddress = ethers.getAddress(await operator.getAddress());
  const factory = await ethers.getContractAt("LaunchFactory", OBSOLETE_FACTORY, operator);
  const code = await ethers.provider.getCode(OBSOLETE_FACTORY);
  if (!code || code === "0x") throw new Error(`No factory code at ${OBSOLETE_FACTORY}.`);

  const owner = ethers.getAddress(await factory.owner());
  if (owner !== operatorAddress) {
    throw new Error(`Connected operator ${operatorAddress} does not own obsolete factory ${OBSOLETE_FACTORY}; owner is ${owner}.`);
  }
  const locker = ethers.getAddress(await factory.permanentLpLocker());
  if (locker !== ethers.getAddress(EXPECTED_LOCKER)) {
    throw new Error(`Obsolete factory locker mismatch: expected ${EXPECTED_LOCKER}, got ${locker}.`);
  }
  if (await factory.globalPaused()) {
    throw new Error("Obsolete factory is globally paused. Existing campaign trading and graduation must remain supported.");
  }

  const before = {
    live: Boolean(await factory.live()),
    globalPaused: Boolean(await factory.globalPaused()),
    createPaused: Boolean(await factory.createPaused()),
    campaignsCount: (await factory.campaignsCount()).toString(),
  };

  let transactionHash: string | null = null;
  let blockNumber: number | null = null;
  if (!before.createPaused) {
    const tx = await factory.setCreatePaused(true);
    console.log(`[contain-obsolete-factory] submitted setCreatePaused(true): ${tx.hash}`);
    const receipt = await tx.wait(2);
    if (!receipt || receipt.status !== 1) throw new Error("Obsolete factory containment transaction failed.");
    transactionHash = receipt.hash;
    blockNumber = Number(receipt.blockNumber);
  }

  const after = {
    live: Boolean(await factory.live()),
    globalPaused: Boolean(await factory.globalPaused()),
    createPaused: Boolean(await factory.createPaused()),
    campaignsCount: (await factory.campaignsCount()).toString(),
  };
  if (!after.createPaused) throw new Error("Obsolete factory creation remains enabled after containment.");
  if (after.globalPaused) throw new Error("Containment must not globally pause existing campaigns.");
  if (after.campaignsCount !== before.campaignsCount) throw new Error("Containment unexpectedly changed the factory campaign count.");

  const evidence = {
    network: network.name,
    chainId: Number(connected.chainId),
    recordedAt: new Date().toISOString(),
    operator: operatorAddress,
    factory: OBSOLETE_FACTORY,
    locker,
    action: "setCreatePaused(true)",
    transactionHash,
    blockNumber,
    before,
    after,
    invariants: {
      existingCampaignsRemainSupported: true,
      globalPauseUnchangedFalse: true,
      lockerMustRemainAuthorized: true,
      launchRecorderMustRemainAuthorized: true,
    },
  };

  const output = path.resolve(
    process.env.CONTAINMENT_EVIDENCE_FILE ||
      path.join("deployments", "bscTestnet.obsolete-scheduled-factory-containment.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[contain-obsolete-factory] creation paused; evidence=${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
