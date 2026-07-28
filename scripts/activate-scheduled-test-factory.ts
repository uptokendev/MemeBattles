import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode, verifyDeployment } from "./verify-deployment";

const { writeFrontendEnv } = require("./lib/frontendEnv.cjs");
const { writeIndexerManifest } = require("./lib/indexerManifest.cjs");

const TESTNET_CHAIN_ID = 97n;
const MAINNET_CHAIN_ID = 56n;
const TEST_GRADUATION_TARGET_USD = ethers.parseUnits("6", 18);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function requireAddress(label: string, value: string): string {
  if (!ADDRESS_RE.test(value || "")) throw new Error(`${label}: missing or invalid address: ${value || "<empty>"}`);
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label}: zero address is not allowed.`);
  return address;
}

function assertAddressEq(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`[activate-scheduled-factory] ${label}: ok`);
}

function assertTrue(label: string, value: boolean) {
  if (!value) throw new Error(`${label}: expected true`);
  console.log(`[activate-scheduled-factory] ${label}: ok`);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLive(factory: any, receiptBlock?: number): Promise<void> {
  if (receiptBlock != null) {
    try {
      const liveAtReceipt = Boolean(await factory.live({ blockTag: receiptBlock }));
      console.log(`[activate-scheduled-factory] LaunchFactory.live at receipt block ${receiptBlock}: ${liveAtReceipt}`);
      if (liveAtReceipt) return;
    } catch (error: any) {
      console.warn(
        `[activate-scheduled-factory] block-tag live verification unavailable: ${error?.shortMessage || error?.message || error}`,
      );
    }
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const live = Boolean(await factory.live());
    console.log(`[activate-scheduled-factory] LaunchFactory.live verification ${attempt}/20: ${live}`);
    if (live) return;
    await sleep(1_500);
  }

  throw new Error(
    "LaunchFactory.live remained false after a confirmed enableLive transaction. Check the transaction receipt and RPC endpoint before retrying.",
  );
}

async function findLiveEnabledBlock(factory: any, lowerBound: number): Promise<number | null> {
  const currentBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, Math.min(lowerBound, currentBlock));
  try {
    const events = await factory.queryFilter(factory.filters.LiveEnabled(), fromBlock, currentBlock);
    if (events.length > 0) return Number(events[events.length - 1].blockNumber);
  } catch (error: any) {
    console.warn(
      `[activate-scheduled-factory] LiveEnabled event lookup unavailable: ${error?.shortMessage || error?.message || error}`,
    );
  }
  return null;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) {
    throw new Error("Refusing scheduled test-factory activation on BSC mainnet (chain 56).");
  }
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This activation is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: stagedFile, deployment: staged } = loadStagedDeployment();
  if (staged.treasuryRouterVersion !== "v2") {
    throw new Error("Staged factory activation requires TreasuryRouterV2.");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const oldFactory = requireAddress("Old LaunchFactory", staged.factoryReplacement?.oldFactory);
  const oldLocker = requireAddress("Old PermanentLpLocker", staged.factoryReplacement?.oldPermanentLpLocker);
  const newFactory = requireAddress(
    "Staged LaunchFactory",
    staged.stagedContracts?.LaunchFactory || staged.factoryReplacement?.newFactory,
  );
  const newLocker = requireAddress(
    "Staged PermanentLpLocker",
    staged.stagedContracts?.PermanentLpLocker || staged.factoryReplacement?.newPermanentLpLocker,
  );
  const campaignImplementation = requireAddress(
    "Staged LaunchCampaign implementation",
    staged.stagedContracts?.LaunchCampaignImplementation || staged.factoryReplacement?.newCampaignImplementation,
  );
  const treasuryRouter = requireAddress("TreasuryRouterV2", staged.contracts?.TreasuryRouterV2);
  const creatorRegistry = requireAddress("CreatorRegistry", staged.contracts?.CreatorRegistry || staged.creatorRegistry);
  const riskRegistry = requireAddress("RiskRegistry", staged.contracts?.RiskRegistry || staged.riskRegistry);
  const recruiterRewardsVault = requireAddress("RecruiterRewardsVault", staged.contracts?.RecruiterRewardsVault);
  const communityRewardsVault = requireAddress("CommunityRewardsVault", staged.contracts?.CommunityRewardsVault);
  const protocolRevenueVault = requireAddress("ProtocolRevenueVault", staged.contracts?.ProtocolRevenueVault);
  const expectedRouteAuthority = requireAddress(
    "Staged route authority",
    staged.routing?.stagedFactoryRouteAuthority || staged.routing?.factoryRouteAuthority,
  );

  for (const [label, address] of [
    ["Old LaunchFactory", oldFactory],
    ["Old PermanentLpLocker", oldLocker],
    ["Staged LaunchFactory", newFactory],
    ["Staged PermanentLpLocker", newLocker],
    ["Staged LaunchCampaign implementation", campaignImplementation],
    ["TreasuryRouterV2", treasuryRouter],
    ["CreatorRegistry", creatorRegistry],
    ["RiskRegistry", riskRegistry],
    ["RecruiterRewardsVault", recruiterRewardsVault],
    ["CommunityRewardsVault", communityRewardsVault],
    ["ProtocolRevenueVault", protocolRevenueVault],
  ] as Array<[string, string]>) {
    await assertCode(label, address);
  }

  const factory = await ethers.getContractAt("LaunchFactory", newFactory, deployer);
  assertAddressEq("LaunchFactory.owner", await factory.owner(), deployerAddress);
  assertAddressEq("LaunchFactory.campaignImplementation", await factory.campaignImplementation(), campaignImplementation);
  assertAddressEq("LaunchFactory.permanentLpLocker", await factory.permanentLpLocker(), newLocker);
  assertAddressEq("LaunchFactory.feeRecipient", await factory.feeRecipient(), treasuryRouter);
  assertAddressEq("LaunchFactory.leagueReceiver", await factory.leagueReceiver(), treasuryRouter);
  assertAddressEq("LaunchFactory.creatorRegistry", await factory.creatorRegistry(), creatorRegistry);
  assertAddressEq("LaunchFactory.riskRegistry", await factory.riskRegistry(), riskRegistry);
  assertAddressEq("LaunchFactory.routeAuthority", await factory.routeAuthority(), expectedRouteAuthority);
  assertTrue("LaunchFactory.securityDefaultsLocked", await factory.securityDefaultsLocked());
  assertTrue("LaunchFactory.requireAuthorizedTrading", await factory.requireAuthorizedTrading());
  assertTrue("LaunchFactory.requireRouteAuthorization", await factory.requireRouteAuthorization());

  const config = await factory.config();
  if (BigInt(config.graduationTarget) !== TEST_GRADUATION_TARGET_USD) {
    throw new Error(
      `LaunchFactory graduation target must be fixed at $6 USD (${TEST_GRADUATION_TARGET_USD}), got ${config.graduationTarget}`,
    );
  }
  console.log("[activate-scheduled-factory] LaunchFactory $6 graduation target: ok");

  const registry = new ethers.Contract(
    creatorRegistry,
    ["function launchRecorder(address) view returns (bool)"],
    ethers.provider,
  );
  assertTrue("CreatorRegistry.launchRecorder(newFactory)", await registry.launchRecorder(newFactory));

  const treasury = new ethers.Contract(
    treasuryRouter,
    [
      "function admin() view returns (address)",
      "function recruiterRewardsVault() view returns (address)",
      "function communityRewardsVault() view returns (address)",
      "function protocolRevenueVault() view returns (address)",
      "function forwardingPaused() view returns (bool)",
      "function authorizedLpLocker(address) view returns (bool)",
      "function permanentLpLocker() view returns (address)",
    ],
    ethers.provider,
  );
  assertAddressEq("TreasuryRouterV2.recruiterRewardsVault", await treasury.recruiterRewardsVault(), recruiterRewardsVault);
  assertAddressEq("TreasuryRouterV2.communityRewardsVault", await treasury.communityRewardsVault(), communityRewardsVault);
  assertAddressEq("TreasuryRouterV2.protocolRevenueVault", await treasury.protocolRevenueVault(), protocolRevenueVault);
  if (await treasury.forwardingPaused()) throw new Error("TreasuryRouterV2 forwarding is paused.");
  assertTrue("TreasuryRouterV2.authorizedLpLocker(oldLocker)", await treasury.authorizedLpLocker(oldLocker));
  assertTrue("TreasuryRouterV2.authorizedLpLocker(newLocker)", await treasury.authorizedLpLocker(newLocker));
  assertAddressEq("TreasuryRouterV2.permanentLpLocker", await treasury.permanentLpLocker(), newLocker);

  const locker = new ethers.Contract(
    newLocker,
    [
      "function admin() view returns (address)",
      "function treasuryRouter() view returns (address)",
      "function topazFactory() view returns (address)",
    ],
    ethers.provider,
  );
  assertAddressEq("PermanentLpLocker.admin", await locker.admin(), newFactory);
  assertAddressEq("PermanentLpLocker.treasuryRouter", await locker.treasuryRouter(), treasuryRouter);
  const topazFactory = requireAddress("PermanentLpLocker.topazFactory", await locker.topazFactory());
  await assertCode("PermanentLpLocker.topazFactory", topazFactory);

  let activationBlock: number;
  const wasLive = Boolean(await factory.live());
  if (!wasLive) {
    console.log("[activate-scheduled-factory] enabling staged factory...");
    const tx = await factory.enableLive();
    console.log(`[activate-scheduled-factory] submitted LaunchFactory.enableLive: ${tx.hash}`);
    const receipt = await tx.wait(2);
    if (!receipt || receipt.status !== 1) throw new Error("LaunchFactory.enableLive transaction failed.");
    activationBlock = Number(receipt.blockNumber);
    console.log(`[activate-scheduled-factory] confirmed LaunchFactory.enableLive at block ${activationBlock}`);
    await waitForLive(factory, activationBlock);
  } else {
    console.log("[activate-scheduled-factory] staged factory is already live; resuming manifest finalization.");
    await waitForLive(factory);
    const lowerBound = Number(staged.factoryReplacement?.deploymentBlock ?? staged.deploymentBlock ?? 0);
    activationBlock =
      (await findLiveEnabledBlock(factory, lowerBound)) ??
      Number(staged.factoryReplacement?.activationBlock ?? staged.activationBlock ?? (await ethers.provider.getBlockNumber()));
    console.log(`[activate-scheduled-factory] recovered activation block=${activationBlock}`);
  }
  assertTrue("LaunchFactory.live", Boolean(await factory.live()));

  const generation = staged.factoryRegistry?.stagedGeneration || "bnb-testnet-scheduled-v2";
  const factories = Array.isArray(staged.factoryRegistry?.factories)
    ? staged.factoryRegistry.factories.map((entry: any) => {
        const address = String(entry.address || "").toLowerCase();
        return {
          ...entry,
          creationEnabled: address === newFactory.toLowerCase(),
          tradingEnabled: entry.tradingEnabled !== false,
          supportEnabled: entry.supportEnabled !== false,
        };
      })
    : [];

  if (!factories.some((entry: any) => String(entry.address || "").toLowerCase() === newFactory.toLowerCase())) {
    throw new Error("Staged factory is missing from factoryRegistry.factories.");
  }

  const nextDeployment = {
    ...staged,
    deploymentBlock: staged.factoryReplacement?.deploymentBlock ?? staged.deploymentBlock,
    permanentLpLocker: newLocker,
    graduationTargetUsd: TEST_GRADUATION_TARGET_USD.toString(),
    factoryGeneration: 2,
    campaignGeneration: 2,
    contracts: {
      ...(staged.contracts || {}),
      LaunchCampaignImplementation: campaignImplementation,
      LaunchFactory: newFactory,
      PermanentLpLocker: newLocker,
      TreasuryRouter: treasuryRouter,
      TreasuryRouterV2: treasuryRouter,
    },
    routing: {
      ...(staged.routing || {}),
      factoryFeeRecipient: treasuryRouter,
      factoryRouteAuthority: expectedRouteAuthority,
      campaignImplementation,
      permanentLpLocker: newLocker,
      permanentLpLockerAuthorized: true,
    },
    factoryReplacement: {
      ...(staged.factoryReplacement || {}),
      activatedAt: new Date().toISOString(),
      activationBlock,
      activationRequired: false,
    },
    factoryRegistry: {
      activeFactory: newFactory,
      activeGeneration: generation,
      factories,
    },
    activationRequired: false,
    activationReady: true,
    activatedAt: new Date().toISOString(),
    activationBlock,
    postDeployActions: [],
  };

  await verifyDeployment(nextDeployment);

  const outBase = rawEnv("SCHEDULED_FACTORY_ACTIVE_OUTPUT_FILE")
    ? path.resolve(rawEnv("SCHEDULED_FACTORY_ACTIVE_OUTPUT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.json`);
  const outFrontend = path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.frontend.env`);
  const outManifest = path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.indexer-manifest.json`);

  writeJson(outBase, nextDeployment);
  writeFrontendEnv(nextDeployment, outFrontend, outBase);
  writeIndexerManifest(nextDeployment, outManifest, outBase);

  console.log(`\n[activate-scheduled-factory] deployment=${outBase}`);
  console.log(`[activate-scheduled-factory] frontend=${outFrontend}`);
  console.log(`[activate-scheduled-factory] indexer=${outManifest}`);
  console.log(`[activate-scheduled-factory] FACTORY_ADDRESS_97=${newFactory}`);
  console.log(`[activate-scheduled-factory] FACTORY_START_BLOCK_97=${nextDeployment.deploymentBlock}`);
  console.log(`[activate-scheduled-factory] VITE_FACTORY_ADDRESS_97=${newFactory}`);
  console.log(`[activate-scheduled-factory] VITE_PERMANENT_LP_LOCKER_ADDRESS_97=${newLocker}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
