import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode, pickAddress, resolveContracts } from "./verify-deployment";

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
  return ethers.getAddress(value);
}

function loadBaseDeployment() {
  const file = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Base deployment file not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function signerOwns(contractAddress: string): Promise<boolean> {
  const [signer] = await ethers.getSigners();
  const ownable = new ethers.Contract(contractAddress, ["function owner() view returns (address)"], signer);
  try {
    return String(await ownable.owner()).toLowerCase() === (await signer.getAddress()).toLowerCase();
  } catch {
    return false;
  }
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) {
    throw new Error("Refusing test-threshold deployment on BSC mainnet (chain 56).");
  }
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This deployment is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: baseFile, deployment: baseDeployment } = loadBaseDeployment();
  const contracts = resolveContracts(baseDeployment);
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const deploymentBlock = await ethers.provider.getBlockNumber();

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
  const treasuryRouter = requireAddress("TreasuryRouterV2", contracts.TreasuryRouterV2 || contracts.TreasuryRouter);
  const graduationOracle = requireAddress("GraduationOracle", contracts.GraduationOracle);
  const creatorRegistry = requireAddress("CreatorRegistry", contracts.CreatorRegistry);
  const riskRegistry = requireAddress("RiskRegistry", contracts.RiskRegistry);
  const routeAuthority = requireAddress(
    "Route authority",
    rawEnv("ROUTE_AUTHORITY_ADDRESS") || baseDeployment.routing?.factoryRouteAuthority || baseDeployment.routeAuthority || "",
  );

  await assertCode("Old LaunchFactory", oldFactory);
  await assertCode("Old PermanentLpLocker", oldLocker);
  await assertCode("Launch router", launchRouter);
  await assertCode("TreasuryRouterV2", treasuryRouter);
  await assertCode("GraduationOracle", graduationOracle);
  await assertCode("CreatorRegistry", creatorRegistry);
  await assertCode("RiskRegistry", riskRegistry);

  console.log(`[scheduled-test-factory] base deployment: ${baseFile}`);
  console.log(`[scheduled-test-factory] chainId=${net.chainId.toString()} network=${network.name}`);
  console.log(`[scheduled-test-factory] deployer=${deployerAddress}`);
  console.log(`[scheduled-test-factory] fixed graduation target=$6 USD`);

  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const campaignImplementation = await Campaign.deploy();
  await campaignImplementation.waitForDeployment();
  const campaignImplementationAddress = await campaignImplementation.getAddress();
  console.log(`[scheduled-test-factory] LaunchCampaign implementation=${campaignImplementationAddress}`);

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(launchRouter, treasuryRouter, campaignImplementationAddress, graduationOracle);
  await factory.waitForDeployment();
  const newFactory = await factory.getAddress();
  const newLocker = await factory.permanentLpLocker();
  console.log(`[scheduled-test-factory] LaunchFactory=${newFactory}`);
  console.log(`[scheduled-test-factory] PermanentLpLocker=${newLocker}`);

  const currentConfig = await factory.config();
  await (
    await factory.setConfig({
      totalSupply: currentConfig.totalSupply,
      curveBps: currentConfig.curveBps,
      liquidityTokenBps: currentConfig.liquidityTokenBps,
      basePrice: currentConfig.basePrice,
      priceSlope: currentConfig.priceSlope,
      graduationTarget: TEST_GRADUATION_TARGET_USD,
      liquidityBps: currentConfig.liquidityBps,
    })
  ).wait();
  if ((await factory.config()).graduationTarget !== TEST_GRADUATION_TARGET_USD) {
    throw new Error("Factory graduation target verification failed.");
  }

  await (await factory.setRegistries(creatorRegistry, riskRegistry)).wait();
  await (await factory.setRouteAuthority(routeAuthority)).wait();

  const tradeRouteProfile = BigInt(baseDeployment.routing?.factoryTradeRouteProfile ?? 1);
  const finalizeRouteProfile = BigInt(baseDeployment.routing?.factoryFinalizeRouteProfile ?? 1);
  await (await factory.setRouteProfiles(tradeRouteProfile, finalizeRouteProfile)).wait();

  const protocolFeeBps = BigInt(baseDeployment.protocolFeeBps ?? 200);
  await (await factory.setProtocolFee(protocolFeeBps)).wait();

  const postDeployActions: string[] = [];

  if (await signerOwns(creatorRegistry)) {
    const registry = new ethers.Contract(
      creatorRegistry,
      ["function setLaunchRecorder(address,bool)", "function launchRecorders(address) view returns (bool)"],
      deployer,
    );
    if (!(await registry.launchRecorders(newFactory))) {
      await (await registry.setLaunchRecorder(newFactory, true)).wait();
    }
  } else {
    postDeployActions.push(`CreatorRegistry.setLaunchRecorder(${newFactory}, true)`);
  }

  const treasury = new ethers.Contract(
    treasuryRouter,
    [
      "function authorizedLpLocker(address) view returns (bool)",
      "function setAuthorizedLpLocker(address,bool)",
      "function permanentLpLocker() view returns (address)",
      "function setPrimaryLpLocker(address)",
    ],
    deployer,
  );

  if (await signerOwns(treasuryRouter)) {
    if (!(await treasury.authorizedLpLocker(oldLocker))) {
      await (await treasury.setAuthorizedLpLocker(oldLocker, true)).wait();
    }
    if (!(await treasury.authorizedLpLocker(newLocker))) {
      await (await treasury.setAuthorizedLpLocker(newLocker, true)).wait();
    }
    if (String(await treasury.permanentLpLocker()).toLowerCase() !== newLocker.toLowerCase()) {
      await (await treasury.setPrimaryLpLocker(newLocker)).wait();
    }
  } else {
    postDeployActions.push(`TreasuryRouterV2.setAuthorizedLpLocker(${oldLocker}, true)`);
    postDeployActions.push(`TreasuryRouterV2.setAuthorizedLpLocker(${newLocker}, true)`);
    postDeployActions.push(`TreasuryRouterV2.setPrimaryLpLocker(${newLocker})`);
  }

  await (await factory.lockSecurityDefaults()).wait();
  await (await factory.enableLive()).wait();

  const generation = rawEnv("FACTORY_ONLY_GENERATION") || "bnb-testnet-scheduled-v2";
  const priorFactories = Array.isArray(baseDeployment.factoryRegistry?.factories)
    ? baseDeployment.factoryRegistry.factories.map((entry: any) => ({
        ...entry,
        creationEnabled: false,
        tradingEnabled: entry.tradingEnabled !== false,
        supportEnabled: entry.supportEnabled !== false,
      }))
    : [];
  if (!priorFactories.some((entry: any) => String(entry.address || "").toLowerCase() === oldFactory.toLowerCase())) {
    priorFactories.push({
      generation: baseDeployment.factoryRegistry?.activeGeneration || "previous",
      address: oldFactory,
      deploymentBlock: baseDeployment.deploymentBlock ?? null,
      creationEnabled: false,
      tradingEnabled: true,
      supportEnabled: true,
      routeAuthority: baseDeployment.routing?.factoryRouteAuthority || null,
      treasuryRouter,
      permanentLpLocker: oldLocker,
      notes: "previous test factory retained for legacy campaign support",
    });
  }
  priorFactories.push({
    generation,
    address: newFactory,
    deploymentBlock,
    creationEnabled: true,
    tradingEnabled: true,
    supportEnabled: true,
    routeAuthority,
    treasuryRouter,
    permanentLpLocker: newLocker,
    campaignImplementation: campaignImplementationAddress,
    factoryGeneration: 2,
    campaignGeneration: 2,
    graduationTargetUsd: TEST_GRADUATION_TARGET_USD.toString(),
    notes: "BSC Testnet scheduled-launch factory with fixed $6 graduation threshold",
  });

  const nextDeployment = {
    ...baseDeployment,
    network: network.name,
    chainId: Number(net.chainId),
    deploymentBlock,
    deployer: deployerAddress,
    factoryReplacement: {
      replacedAt: new Date().toISOString(),
      baseDeployment: baseFile,
      oldFactory,
      oldPermanentLpLocker: oldLocker,
      purpose: "scheduled-launch end-to-end graduation testing",
    },
    contracts: {
      ...(baseDeployment.contracts || {}),
      LaunchCampaignImplementation: campaignImplementationAddress,
      LaunchFactory: newFactory,
      PermanentLpLocker: newLocker,
    },
    routing: {
      ...(baseDeployment.routing || {}),
      factoryFeeRecipient: treasuryRouter,
      factoryRouteAuthority: routeAuthority,
      campaignImplementation: campaignImplementationAddress,
      graduationOracle,
      topazRouter: launchRouter,
      permanentLpLocker: newLocker,
      permanentLpLockerAuthorized: postDeployActions.length === 0,
    },
    graduationTargetUsd: TEST_GRADUATION_TARGET_USD.toString(),
    factoryGeneration: 2,
    campaignGeneration: 2,
    factoryRegistry: {
      activeFactory: newFactory,
      activeGeneration: generation,
      factories: priorFactories,
    },
    postDeployActions,
  };

  const outBase = path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.json`);
  const outFrontend = path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.frontend.env`);
  const outManifest = path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.indexer-manifest.json`);
  writeJson(outBase, nextDeployment);
  writeFrontendEnv(nextDeployment, outFrontend, outBase);
  writeIndexerManifest(nextDeployment, outManifest, outBase);

  console.log(`\n[scheduled-test-factory] deployment=${outBase}`);
  console.log(`[scheduled-test-factory] frontend=${outFrontend}`);
  console.log(`[scheduled-test-factory] indexer=${outManifest}`);
  console.log(`[scheduled-test-factory] FACTORY_ADDRESS_97=${newFactory}`);
  console.log(`[scheduled-test-factory] FACTORY_START_BLOCK_97=${deploymentBlock}`);
  console.log(`[scheduled-test-factory] VITE_FACTORY_ADDRESS_97=${newFactory}`);
  console.log(`[scheduled-test-factory] VITE_PERMANENT_LP_LOCKER_ADDRESS_97=${newLocker}`);

  if (postDeployActions.length) {
    console.log("\n[scheduled-test-factory] required Safe/admin actions before full testing:");
    for (const action of postDeployActions) console.log(`- ${action}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
