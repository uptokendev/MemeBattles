import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode, resolveContracts } from "./verify-deployment";

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
}

function loadBaseDeployment() {
  const file = rawEnv("DEPLOYMENT_FILE")
    ? path.resolve(rawEnv("DEPLOYMENT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.treasury-v2-staged.json`);
  if (!fs.existsSync(file)) throw new Error(`Base deployment file not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signerMatchesGetter(contractAddress: string, getter: "owner" | "admin"): Promise<boolean> {
  const [signer] = await ethers.getSigners();
  const contract = new ethers.Contract(contractAddress, [`function ${getter}() view returns (address)`], signer);
  try {
    return String(await contract[getter]()).toLowerCase() === (await signer.getAddress()).toLowerCase();
  } catch {
    return false;
  }
}

async function waitForTransaction(tx: any, label: string) {
  console.log(`[recover-scheduled-factory] submitted ${label}: ${tx.hash}`);
  const receipt = await tx.wait(2);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed.`);
  console.log(`[recover-scheduled-factory] confirmed ${label} at block ${receipt.blockNumber}`);
  return receipt;
}

async function readGraduationTarget(factory: any, blockTag?: number): Promise<bigint> {
  const config = blockTag == null ? await factory.config() : await factory.config({ blockTag });
  return BigInt(config.graduationTarget);
}

async function verifyGraduationTarget(factory: any, expected: bigint, receiptBlock?: number) {
  if (receiptBlock != null) {
    try {
      const atReceipt = await readGraduationTarget(factory, receiptBlock);
      console.log(`[recover-scheduled-factory] graduation target at receipt block=${atReceipt.toString()}`);
      if (atReceipt === expected) return;
    } catch (error: any) {
      console.warn(`[recover-scheduled-factory] block-tag verification unavailable: ${error?.shortMessage || error?.message || error}`);
    }
  }

  let actual = 0n;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    actual = await readGraduationTarget(factory);
    console.log(
      `[recover-scheduled-factory] graduation target verification ${attempt}/15: actual=${actual.toString()} expected=${expected.toString()}`,
    );
    if (actual === expected) return;
    await sleep(1_500);
  }
  throw new Error(`Factory graduation target verification failed: expected ${expected.toString()}, got ${actual.toString()}.`);
}

async function discoverDeploymentBlock(address: string, lowerBound: number): Promise<number> {
  const currentBlock = await ethers.provider.getBlockNumber();
  const explicit = rawEnv("SCHEDULED_FACTORY_START_BLOCK_97");
  if (explicit) {
    const parsed = Number(explicit);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > currentBlock) {
      throw new Error(`Invalid SCHEDULED_FACTORY_START_BLOCK_97=${explicit}.`);
    }
    return parsed;
  }

  let low = Math.max(0, Math.min(lowerBound, currentBlock));
  let high = currentBlock;
  try {
    if ((await ethers.provider.getCode(address, low)) !== "0x") return low;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const code = await ethers.provider.getCode(address, mid);
      if (code === "0x") low = mid + 1;
      else high = mid;
    }
    if ((await ethers.provider.getCode(address, low)) !== "0x") return low;
  } catch (error: any) {
    console.warn(`[recover-scheduled-factory] historical block lookup unavailable: ${error?.message || error}`);
  }

  console.warn(
    `[recover-scheduled-factory] Could not discover the exact deployment block. Using current block ${currentBlock} as the event-indexing start; the factory has no campaigns yet.`,
  );
  return currentBlock;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) throw new Error("Refusing scheduled test-factory recovery on BSC mainnet (chain 56).");
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This recovery is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: baseFile, deployment: baseDeployment } = loadBaseDeployment();
  if (baseDeployment.treasuryRouterVersion !== "v2") {
    throw new Error("Scheduled factory recovery requires the valid TreasuryRouterV2 staged deployment.");
  }

  const contracts = resolveContracts(baseDeployment);
  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());

  const newFactory = requireAddress("Existing scheduled LaunchFactory", rawEnv("SCHEDULED_FACTORY_ADDRESS"));
  const campaignImplementationAddress = requireAddress(
    "Existing LaunchCampaign implementation",
    rawEnv("SCHEDULED_CAMPAIGN_IMPLEMENTATION_ADDRESS"),
  );

  const oldFactory = requireAddress("Base LaunchFactory", contracts.LaunchFactory);
  const oldLocker = requireAddress("Base PermanentLpLocker", contracts.PermanentLpLocker);
  const launchRouter = requireAddress(
    "Launch router",
    rawEnv("FACTORY_ONLY_TOPAZ_ROUTER") ||
      baseDeployment.routing?.topazRouter ||
      baseDeployment.router ||
      baseDeployment.topazRouterAdapter ||
      baseDeployment.topazRouter,
  );
  const treasuryRouter = requireAddress("TreasuryRouterV2", contracts.TreasuryRouterV2);
  const graduationOracle = requireAddress("GraduationOracle", contracts.GraduationOracle);
  const creatorRegistry = requireAddress("CreatorRegistry", contracts.CreatorRegistry);
  const riskRegistry = requireAddress("RiskRegistry", contracts.RiskRegistry);
  const weeklyLeagueVault = requireAddress(
    "WeeklyLeagueVault",
    contracts.WeeklyLeagueVault || contracts.TreasuryVaultV2,
  );
  const monthlyLeagueTreasury = requireAddress("MonthlyLeagueTreasury", contracts.MonthlyLeagueTreasury);
  const recruiterRewardsVault = requireAddress("RecruiterRewardsVault", contracts.RecruiterRewardsVault);
  const communityRewardsVault = requireAddress("CommunityRewardsVault", contracts.CommunityRewardsVault);
  const protocolRevenueVault = requireAddress("ProtocolRevenueVault", contracts.ProtocolRevenueVault);
  const routeAuthority = requireAddress(
    "Route authority",
    rawEnv("ROUTE_AUTHORITY_ADDRESS") || baseDeployment.routing?.factoryRouteAuthority || baseDeployment.routeAuthority || "",
  );

  for (const [label, address] of [
    ["Old LaunchFactory", oldFactory],
    ["Old PermanentLpLocker", oldLocker],
    ["Launch router", launchRouter],
    ["TreasuryRouterV2", treasuryRouter],
    ["GraduationOracle", graduationOracle],
    ["CreatorRegistry", creatorRegistry],
    ["RiskRegistry", riskRegistry],
    ["WeeklyLeagueVault", weeklyLeagueVault],
    ["MonthlyLeagueTreasury", monthlyLeagueTreasury],
    ["RecruiterRewardsVault", recruiterRewardsVault],
    ["CommunityRewardsVault", communityRewardsVault],
    ["ProtocolRevenueVault", protocolRevenueVault],
    ["Existing LaunchCampaign implementation", campaignImplementationAddress],
    ["Existing scheduled LaunchFactory", newFactory],
  ] as Array<[string, string]>) {
    await assertCode(label, address);
  }

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = Factory.attach(newFactory).connect(deployer);
  const newLocker = ethers.getAddress(await factory.permanentLpLocker());
  await assertCode("Scheduled PermanentLpLocker", newLocker);

  console.log(`[recover-scheduled-factory] base deployment=${baseFile}`);
  console.log(`[recover-scheduled-factory] deployer=${deployerAddress}`);
  console.log(`[recover-scheduled-factory] LaunchCampaign implementation=${campaignImplementationAddress}`);
  console.log(`[recover-scheduled-factory] LaunchFactory=${newFactory}`);
  console.log(`[recover-scheduled-factory] PermanentLpLocker=${newLocker}`);

  assertAddressEq("LaunchFactory.owner", await factory.owner(), deployerAddress);
  assertAddressEq("LaunchFactory.router", await factory.router(), launchRouter);
  assertAddressEq("LaunchFactory.feeRecipient", await factory.feeRecipient(), treasuryRouter);
  assertAddressEq("LaunchFactory.leagueReceiver", await factory.leagueReceiver(), treasuryRouter);
  assertAddressEq("LaunchFactory.campaignImplementation", await factory.campaignImplementation(), campaignImplementationAddress);
  assertAddressEq("LaunchFactory.graduationOracle", await factory.graduationOracle(), graduationOracle);

  if (await factory.live()) throw new Error("Recovered factory is already live; refusing staged recovery.");
  if (BigInt(await factory.campaignsCount()) !== 0n) throw new Error("Recovered factory already has campaigns; refusing mutable recovery.");

  let config = await factory.config();
  let configReceiptBlock: number | undefined;
  if (BigInt(config.graduationTarget) !== TEST_GRADUATION_TARGET_USD) {
    const receipt = await waitForTransaction(
      await factory.setConfig({
        totalSupply: config.totalSupply,
        curveBps: config.curveBps,
        liquidityTokenBps: config.liquidityTokenBps,
        basePrice: config.basePrice,
        priceSlope: config.priceSlope,
        graduationTarget: TEST_GRADUATION_TARGET_USD,
        liquidityBps: config.liquidityBps,
      }),
      "LaunchFactory.setConfig($6)",
    );
    configReceiptBlock = Number(receipt.blockNumber);
  }
  await verifyGraduationTarget(factory, TEST_GRADUATION_TARGET_USD, configReceiptBlock);

  if (
    String(await factory.creatorRegistry()).toLowerCase() !== creatorRegistry.toLowerCase() ||
    String(await factory.riskRegistry()).toLowerCase() !== riskRegistry.toLowerCase()
  ) {
    await waitForTransaction(await factory.setRegistries(creatorRegistry, riskRegistry), "LaunchFactory.setRegistries");
  }

  if (String(await factory.routeAuthority()).toLowerCase() !== routeAuthority.toLowerCase()) {
    await waitForTransaction(await factory.setRouteAuthority(routeAuthority), "LaunchFactory.setRouteAuthority");
  }

  const tradeRouteProfile = BigInt(baseDeployment.routing?.factoryTradeRouteProfile ?? 1);
  const finalizeRouteProfile = BigInt(baseDeployment.routing?.factoryFinalizeRouteProfile ?? 1);
  if (
    BigInt(await factory.tradeRouteProfile()) !== tradeRouteProfile ||
    BigInt(await factory.finalizeRouteProfile()) !== finalizeRouteProfile
  ) {
    await waitForTransaction(
      await factory.setRouteProfiles(tradeRouteProfile, finalizeRouteProfile),
      "LaunchFactory.setRouteProfiles",
    );
  }

  const protocolFeeBps = BigInt(baseDeployment.protocolFeeBps ?? 200);
  if (BigInt(await factory.protocolFeeBps()) !== protocolFeeBps) {
    await waitForTransaction(await factory.setProtocolFee(protocolFeeBps), "LaunchFactory.setProtocolFee");
  }

  if (!(await factory.requireAuthorizedTrading())) {
    if (await factory.securityDefaultsLocked()) throw new Error("Authorized trading is disabled on an already locked factory.");
    await waitForTransaction(await factory.setRequireAuthorizedTrading(true), "LaunchFactory.setRequireAuthorizedTrading(true)");
  }
  if (!(await factory.requireRouteAuthorization())) {
    if (await factory.securityDefaultsLocked()) throw new Error("Route authorization is disabled on an already locked factory.");
    await waitForTransaction(await factory.setRequireRouteAuthorization(true), "LaunchFactory.setRequireRouteAuthorization(true)");
  }
  if (!(await factory.securityDefaultsLocked())) {
    await waitForTransaction(await factory.lockSecurityDefaults(), "LaunchFactory.lockSecurityDefaults");
  }

  const treasury = new ethers.Contract(
    treasuryRouter,
    [
      "function admin() view returns (address)",
      "function weeklyLeagueVault() view returns (address)",
      "function monthlyLeagueTreasury() view returns (address)",
      "function recruiterRewardsVault() view returns (address)",
      "function communityRewardsVault() view returns (address)",
      "function protocolRevenueVault() view returns (address)",
      "function forwardingPaused() view returns (bool)",
      "function authorizedLpLocker(address) view returns (bool)",
      "function permanentLpLocker() view returns (address)",
      "function setAuthorizedLpLocker(address,bool)",
      "function setPrimaryLpLocker(address)",
    ],
    deployer,
  );

  assertAddressEq("TreasuryRouterV2.weeklyLeagueVault", await treasury.weeklyLeagueVault(), weeklyLeagueVault);
  assertAddressEq("TreasuryRouterV2.monthlyLeagueTreasury", await treasury.monthlyLeagueTreasury(), monthlyLeagueTreasury);
  assertAddressEq("TreasuryRouterV2.recruiterRewardsVault", await treasury.recruiterRewardsVault(), recruiterRewardsVault);
  assertAddressEq("TreasuryRouterV2.communityRewardsVault", await treasury.communityRewardsVault(), communityRewardsVault);
  assertAddressEq("TreasuryRouterV2.protocolRevenueVault", await treasury.protocolRevenueVault(), protocolRevenueVault);
  if (await treasury.forwardingPaused()) throw new Error("TreasuryRouterV2 forwarding is paused.");
  if (!(await treasury.authorizedLpLocker(oldLocker))) throw new Error("TreasuryRouterV2 no longer authorizes the legacy locker.");

  const postDeployActions: string[] = [];
  const registry = new ethers.Contract(
    creatorRegistry,
    ["function setLaunchRecorder(address,bool)", "function launchRecorder(address) view returns (bool)"],
    deployer,
  );

  if (!(await registry.launchRecorder(newFactory))) {
    if (await signerMatchesGetter(creatorRegistry, "owner")) {
      await waitForTransaction(await registry.setLaunchRecorder(newFactory, true), "CreatorRegistry.setLaunchRecorder");
    } else {
      postDeployActions.push(`CreatorRegistry.setLaunchRecorder(${newFactory}, true)`);
    }
  }

  const signerIsTreasuryAdmin = await signerMatchesGetter(treasuryRouter, "admin");
  if (!(await treasury.authorizedLpLocker(newLocker))) {
    if (signerIsTreasuryAdmin) {
      await waitForTransaction(
        await treasury.setAuthorizedLpLocker(newLocker, true),
        "TreasuryRouterV2.setAuthorizedLpLocker(newLocker,true)",
      );
    } else {
      postDeployActions.push(`TreasuryRouterV2.setAuthorizedLpLocker(${newLocker}, true)`);
    }
  }

  if (String(await treasury.permanentLpLocker()).toLowerCase() !== newLocker.toLowerCase()) {
    if (signerIsTreasuryAdmin) {
      await waitForTransaction(await treasury.setPrimaryLpLocker(newLocker), "TreasuryRouterV2.setPrimaryLpLocker(newLocker)");
    } else {
      postDeployActions.push(`TreasuryRouterV2.setPrimaryLpLocker(${newLocker})`);
    }
  }

  const launchRecorderEnabled = Boolean(await registry.launchRecorder(newFactory));
  const newLockerAuthorized = Boolean(await treasury.authorizedLpLocker(newLocker));
  const newLockerPrimary = String(await treasury.permanentLpLocker()).toLowerCase() === newLocker.toLowerCase();
  const activationReady = launchRecorderEnabled && newLockerAuthorized && newLockerPrimary;

  const lowerBound = Number(baseDeployment.treasuryV2Migration?.deploymentBlock ?? baseDeployment.deploymentBlock ?? 0);
  const deploymentBlock = await discoverDeploymentBlock(newFactory, lowerBound);
  const generation = rawEnv("FACTORY_ONLY_GENERATION") || "bnb-testnet-scheduled-v2";
  const priorFactories = Array.isArray(baseDeployment.factoryRegistry?.factories)
    ? baseDeployment.factoryRegistry.factories
        .filter((entry: any) => String(entry.address || "").toLowerCase() !== newFactory.toLowerCase())
        .map((entry: any) => ({
          ...entry,
          creationEnabled: String(entry.address || "").toLowerCase() === oldFactory.toLowerCase(),
          tradingEnabled: entry.tradingEnabled !== false,
          supportEnabled: entry.supportEnabled !== false,
        }))
    : [];

  let oldGeneration = baseDeployment.factoryRegistry?.activeGeneration || "previous";
  const oldEntry = priorFactories.find((entry: any) => String(entry.address || "").toLowerCase() === oldFactory.toLowerCase());
  if (oldEntry) {
    oldGeneration = oldEntry.generation || oldGeneration;
  } else {
    priorFactories.push({
      generation: oldGeneration,
      address: oldFactory,
      deploymentBlock: baseDeployment.deploymentBlock ?? null,
      creationEnabled: true,
      tradingEnabled: true,
      supportEnabled: true,
      routeAuthority: baseDeployment.routing?.factoryRouteAuthority || null,
      treasuryRouter:
        baseDeployment.contracts?.LegacyTreasuryRouter || baseDeployment.treasuryV2Migration?.legacyTreasuryRouter || null,
      permanentLpLocker: oldLocker,
      notes: "previous test factory retained as active until staged activation",
    });
  }

  priorFactories.push({
    generation,
    address: newFactory,
    deploymentBlock,
    creationEnabled: false,
    tradingEnabled: true,
    supportEnabled: true,
    routeAuthority,
    treasuryRouter,
    permanentLpLocker: newLocker,
    campaignImplementation: campaignImplementationAddress,
    factoryGeneration: 2,
    campaignGeneration: 2,
    graduationTargetUsd: TEST_GRADUATION_TARGET_USD.toString(),
    notes: "recovered staged BSC Testnet scheduled-launch factory; activation verification required",
  });

  const nextDeployment = {
    ...baseDeployment,
    network: network.name,
    chainId: Number(net.chainId),
    factoryReplacement: {
      stagedAt: new Date().toISOString(),
      activationRequired: true,
      recoveredFromPartialDeployment: true,
      baseDeployment: baseFile,
      oldFactory,
      oldPermanentLpLocker: oldLocker,
      newFactory,
      newPermanentLpLocker: newLocker,
      newCampaignImplementation: campaignImplementationAddress,
      deploymentBlock,
      purpose: "scheduled-launch end-to-end graduation testing",
    },
    stagedContracts: {
      LaunchCampaignImplementation: campaignImplementationAddress,
      LaunchFactory: newFactory,
      PermanentLpLocker: newLocker,
    },
    routing: {
      ...(baseDeployment.routing || {}),
      stagedFactoryFeeRecipient: treasuryRouter,
      stagedFactoryRouteAuthority: routeAuthority,
      stagedCampaignImplementation: campaignImplementationAddress,
      stagedPermanentLpLocker: newLocker,
      stagedPermanentLpLockerAuthorized: newLockerAuthorized,
    },
    stagedGraduationTargetUsd: TEST_GRADUATION_TARGET_USD.toString(),
    stagedFactoryGeneration: 2,
    stagedCampaignGeneration: 2,
    factoryRegistry: {
      activeFactory: oldFactory,
      activeGeneration: oldGeneration,
      stagedFactory: newFactory,
      stagedGeneration: generation,
      factories: priorFactories,
    },
    activationRequired: true,
    activationReady,
    postDeployActions,
  };

  const outFile = rawEnv("SCHEDULED_FACTORY_STAGED_OUTPUT_FILE")
    ? path.resolve(rawEnv("SCHEDULED_FACTORY_STAGED_OUTPUT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.staged.json`);
  writeJson(outFile, nextDeployment);

  console.log(`\n[recover-scheduled-factory] staged deployment=${outFile}`);
  console.log(`[recover-scheduled-factory] STAGED_FACTORY_ADDRESS_97=${newFactory}`);
  console.log(`[recover-scheduled-factory] STAGED_FACTORY_START_BLOCK_97=${deploymentBlock}`);
  console.log(`[recover-scheduled-factory] launch recorder enabled=${launchRecorderEnabled}`);
  console.log(`[recover-scheduled-factory] new locker authorized=${newLockerAuthorized}`);
  console.log(`[recover-scheduled-factory] new locker primary=${newLockerPrimary}`);
  console.log(`[recover-scheduled-factory] activation ready=${activationReady}`);
  console.log("[recover-scheduled-factory] factory remains disabled until activation verification passes");

  if (postDeployActions.length) {
    console.log("\n[recover-scheduled-factory] required external admin actions before activation:");
    for (const action of postDeployActions) console.log(`- ${action}`);
  } else {
    console.log("[recover-scheduled-factory] on-chain permissions are ready.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
