import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const TESTNET_CHAIN_ID = 97n;
const ACTIVE_FACTORY_FALLBACK = "0xF7872169265eCE4E4C93ef894F1635E84DC6F681";
const QA_CREATOR_FALLBACK = "0x13ad79765e14927df2c554d9662bbe539e89c8e8";
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
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function writeText(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
}

function writeJson(file: string, data: unknown) {
  writeText(file, JSON.stringify(data, null, 2));
}

function replaceRequired(file: string, pattern: RegExp, replacement: string, label: string) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label}: pattern not found in ${file}`);
  fs.writeFileSync(file, source.replace(pattern, replacement));
}

async function waitTx(txPromise: Promise<any> | any, label: string, confirmations = 1) {
  const tx = await txPromise;
  console.log(`[scheduled-cooldown-factory] submitted ${label}: ${tx.hash}`);
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed.`);
  console.log(`[scheduled-cooldown-factory] confirmed ${label} at block ${receipt.blockNumber}`);
  return receipt;
}

async function assertCode(label: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") throw new Error(`${label}: no contract code at ${address}`);
}

function asString(value: any): string {
  return BigInt(value).toString();
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Factory replacement is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const activeFactoryAddress = requireAddress(
    "Active scheduled LaunchFactory",
    rawEnv("ACTIVE_SCHEDULED_FACTORY_ADDRESS") || ACTIVE_FACTORY_FALLBACK,
  );
  const qaCreator = requireAddress("QA creator", rawEnv("QA_CREATOR_ADDRESS") || QA_CREATOR_FALLBACK);
  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log(`[scheduled-cooldown-factory] network=${network.name} chainId=${net.chainId.toString()}`);
  console.log(`[scheduled-cooldown-factory] deployer=${deployerAddress} balance=${ethers.formatEther(balance)} BNB`);
  console.log(`[scheduled-cooldown-factory] activeFactory=${activeFactoryAddress}`);

  if (balance === 0n) throw new Error("Deployer has no BSC Testnet BNB for factory replacement transactions.");
  await assertCode("Active LaunchFactory", activeFactoryAddress);

  const activeFactory = await ethers.getContractAt("LaunchFactory", activeFactoryAddress, deployer);
  assertAddressEq("Active LaunchFactory.owner", await activeFactory.owner(), deployerAddress);
  if (!(await activeFactory.live())) throw new Error("Active LaunchFactory is not live.");
  if (await activeFactory.globalPaused()) throw new Error("Active LaunchFactory is globally paused.");

  const router = requireAddress("Topaz router adapter", await activeFactory.router());
  const treasuryRouter = requireAddress("TreasuryRouterV2", await activeFactory.feeRecipient());
  assertAddressEq("LaunchFactory.leagueReceiver", await activeFactory.leagueReceiver(), treasuryRouter);
  const campaignImplementation = requireAddress("LaunchCampaign implementation", await activeFactory.campaignImplementation());
  const graduationOracle = requireAddress("GraduationOracle", await activeFactory.graduationOracle());
  const creatorRegistry = requireAddress("CreatorRegistry", await activeFactory.creatorRegistry());
  const riskRegistry = requireAddress("RiskRegistry", await activeFactory.riskRegistry());
  const routeAuthority = requireAddress("Route authority", await activeFactory.routeAuthority());
  const oldLocker = requireAddress("Current PermanentLpLocker", await activeFactory.permanentLpLocker());

  for (const [label, address] of [
    ["Topaz router adapter", router],
    ["TreasuryRouterV2", treasuryRouter],
    ["LaunchCampaign implementation", campaignImplementation],
    ["GraduationOracle", graduationOracle],
    ["CreatorRegistry", creatorRegistry],
    ["RiskRegistry", riskRegistry],
    ["Current PermanentLpLocker", oldLocker],
  ] as Array<[string, string]>) {
    await assertCode(label, address);
  }

  const registry = new ethers.Contract(
    creatorRegistry,
    [
      "function owner() view returns (address)",
      "function launchRecorder(address) view returns (bool)",
      "function setLaunchRecorder(address,bool)",
      "function getCreatorProfile(address) view returns (uint8 tier,uint256 trustScore,uint256 liveBondingCount,uint256 lastLaunchTimestamp,bool restricted,bool manualReviewRequired)",
      "function getCreatorRules(address) view returns (uint256 maxLiveBonding,uint256 cooldownSeconds,uint256 creatorBuyLockSeconds,uint256 creatorBuyCapWei,uint256 maxClusterWallets)",
    ],
    deployer,
  );
  assertAddressEq("CreatorRegistry.owner", await registry.owner(), deployerAddress);
  if (!(await registry.launchRecorder(activeFactoryAddress))) {
    throw new Error("Active factory is not an authorized CreatorRegistry launch recorder.");
  }

  const treasury = new ethers.Contract(
    treasuryRouter,
    [
      "function admin() view returns (address)",
      "function forwardingPaused() view returns (bool)",
      "function authorizedLpLocker(address) view returns (bool)",
      "function permanentLpLocker() view returns (address)",
      "function setAuthorizedLpLocker(address,bool)",
      "function setPrimaryLpLocker(address)",
      "function weeklyLeagueVault() view returns (address)",
      "function monthlyLeagueTreasury() view returns (address)",
      "function recruiterRewardsVault() view returns (address)",
      "function communityRewardsVault() view returns (address)",
      "function protocolRevenueVault() view returns (address)",
    ],
    deployer,
  );
  assertAddressEq("TreasuryRouterV2.admin", await treasury.admin(), deployerAddress);
  if (await treasury.forwardingPaused()) throw new Error("TreasuryRouterV2 forwarding is paused.");
  if (!(await treasury.authorizedLpLocker(oldLocker))) throw new Error("Existing PermanentLpLocker is not authorized by TreasuryRouterV2.");

  const oldConfig = await activeFactory.config();
  const oldLaunchProtection = await activeFactory.launchProtectionConfig();
  const tradeRouteProfile = Number(await activeFactory.tradeRouteProfile());
  const finalizeRouteProfile = Number(await activeFactory.finalizeRouteProfile());
  const protocolFeeBps = BigInt(await activeFactory.protocolFeeBps());

  console.log("[scheduled-cooldown-factory] deploying replacement factory with existing implementation and routing");
  const Factory = await ethers.getContractFactory("LaunchFactory", deployer);
  const replacement = await Factory.deploy(router, treasuryRouter, campaignImplementation, graduationOracle);
  const deploymentTx = replacement.deploymentTransaction();
  if (!deploymentTx) throw new Error("Replacement LaunchFactory deployment transaction is unavailable.");
  console.log(`[scheduled-cooldown-factory] submitted LaunchFactory deployment: ${deploymentTx.hash}`);
  const deploymentReceipt = await deploymentTx.wait(2);
  if (!deploymentReceipt || deploymentReceipt.status !== 1) throw new Error("Replacement LaunchFactory deployment failed.");
  const replacementFactoryAddress = ethers.getAddress(await replacement.getAddress());
  const replacementLocker = ethers.getAddress(await replacement.permanentLpLocker());
  await assertCode("Replacement LaunchFactory", replacementFactoryAddress);
  await assertCode("Replacement PermanentLpLocker", replacementLocker);
  console.log(`[scheduled-cooldown-factory] replacementFactory=${replacementFactoryAddress}`);
  console.log(`[scheduled-cooldown-factory] replacementLocker=${replacementLocker}`);

  await waitTx(
    replacement.setConfig({
      totalSupply: oldConfig.totalSupply,
      curveBps: oldConfig.curveBps,
      liquidityTokenBps: oldConfig.liquidityTokenBps,
      basePrice: oldConfig.basePrice,
      priceSlope: oldConfig.priceSlope,
      graduationTarget: oldConfig.graduationTarget,
      liquidityBps: oldConfig.liquidityBps,
    }),
    "LaunchFactory.setConfig(copy active $6 config)",
  );
  await waitTx(replacement.setRegistries(creatorRegistry, riskRegistry), "LaunchFactory.setRegistries");
  await waitTx(replacement.setRouteAuthority(routeAuthority), "LaunchFactory.setRouteAuthority");
  await waitTx(replacement.setRouteProfiles(tradeRouteProfile, finalizeRouteProfile), "LaunchFactory.setRouteProfiles");
  if (BigInt(await replacement.protocolFeeBps()) !== protocolFeeBps) {
    await waitTx(replacement.setProtocolFee(protocolFeeBps), "LaunchFactory.setProtocolFee");
  }
  if (
    BigInt(oldLaunchProtection.blocks_) !== 0n ||
    BigInt(oldLaunchProtection.maxBuyWei) !== 0n ||
    BigInt(oldLaunchProtection.maxWalletWei) !== 0n
  ) {
    await waitTx(
      replacement.setLaunchProtectionConfig(
        oldLaunchProtection.blocks_,
        oldLaunchProtection.maxBuyWei,
        oldLaunchProtection.maxWalletWei,
      ),
      "LaunchFactory.setLaunchProtectionConfig",
    );
  }
  if (!(await replacement.requireAuthorizedTrading())) {
    await waitTx(replacement.setRequireAuthorizedTrading(true), "LaunchFactory.setRequireAuthorizedTrading(true)");
  }
  if (!(await replacement.requireRouteAuthorization())) {
    await waitTx(replacement.setRequireRouteAuthorization(true), "LaunchFactory.setRequireRouteAuthorization(true)");
  }
  await waitTx(replacement.lockSecurityDefaults(), "LaunchFactory.lockSecurityDefaults");

  if (!(await registry.launchRecorder(replacementFactoryAddress))) {
    await waitTx(registry.setLaunchRecorder(replacementFactoryAddress, true), "CreatorRegistry.setLaunchRecorder(new factory)");
  }
  if (!(await treasury.authorizedLpLocker(replacementLocker))) {
    await waitTx(treasury.setAuthorizedLpLocker(replacementLocker, true), "TreasuryRouterV2.setAuthorizedLpLocker(new locker)");
  }
  if (String(await treasury.permanentLpLocker()).toLowerCase() !== replacementLocker.toLowerCase()) {
    await waitTx(treasury.setPrimaryLpLocker(replacementLocker), "TreasuryRouterV2.setPrimaryLpLocker(new locker)");
  }

  await waitTx(replacement.enableLive(), "LaunchFactory.enableLive");
  if (!(await activeFactory.createPaused())) {
    await waitTx(activeFactory.setCreatePaused(true), "Old LaunchFactory.setCreatePaused(true)");
  }

  assertAddressEq("Replacement owner", await replacement.owner(), deployerAddress);
  assertAddressEq("Replacement router", await replacement.router(), router);
  assertAddressEq("Replacement feeRecipient", await replacement.feeRecipient(), treasuryRouter);
  assertAddressEq("Replacement leagueReceiver", await replacement.leagueReceiver(), treasuryRouter);
  assertAddressEq("Replacement campaignImplementation", await replacement.campaignImplementation(), campaignImplementation);
  assertAddressEq("Replacement graduationOracle", await replacement.graduationOracle(), graduationOracle);
  assertAddressEq("Replacement creatorRegistry", await replacement.creatorRegistry(), creatorRegistry);
  assertAddressEq("Replacement riskRegistry", await replacement.riskRegistry(), riskRegistry);
  assertAddressEq("Replacement routeAuthority", await replacement.routeAuthority(), routeAuthority);
  if (!(await replacement.live())) throw new Error("Replacement factory is not live after activation.");
  if (await replacement.globalPaused()) throw new Error("Replacement factory is globally paused.");
  if (await replacement.createPaused()) throw new Error("Replacement factory creation is paused.");
  if (!(await replacement.securityDefaultsLocked())) throw new Error("Replacement factory security defaults are not locked.");
  if (!(await registry.launchRecorder(replacementFactoryAddress))) throw new Error("Replacement factory is not a launch recorder.");
  if (!(await treasury.authorizedLpLocker(replacementLocker))) throw new Error("Replacement locker is not treasury-authorized.");
  assertAddressEq("TreasuryRouterV2 primary locker", await treasury.permanentLpLocker(), replacementLocker);
  if (!(await activeFactory.createPaused())) throw new Error("Old factory creation was not paused.");
  if (BigInt(await replacement.campaignsCount()) !== 0n) throw new Error("Replacement factory unexpectedly contains campaigns.");

  const replacementConfig = await replacement.config();
  for (const key of ["totalSupply", "curveBps", "liquidityTokenBps", "basePrice", "priceSlope", "graduationTarget", "liquidityBps"] as const) {
    if (BigInt(replacementConfig[key]) !== BigInt(oldConfig[key])) {
      throw new Error(`Replacement config mismatch for ${key}.`);
    }
  }

  const creatorProfile = await registry.getCreatorProfile(qaCreator);
  const creatorRules = await registry.getCreatorRules(qaCreator);
  const expectedEarliest = BigInt(creatorProfile.lastLaunchTimestamp) + BigInt(creatorRules.cooldownSeconds);
  const beforeEligibility = await replacement.creatorLaunchEligibilityAt(qaCreator, expectedEarliest - 1n);
  const atEligibility = await replacement.creatorLaunchEligibilityAt(qaCreator, expectedEarliest);
  if (beforeEligibility.allowed) throw new Error("Replacement factory incorrectly allows a scheduled launch before cooldown ends.");
  if (!atEligibility.allowed) throw new Error("Replacement factory does not allow a scheduled launch at the cooldown boundary.");
  if (BigInt(atEligibility.earliestLaunchTimestamp) !== expectedEarliest) {
    throw new Error(`Eligibility boundary mismatch: expected ${expectedEarliest}, got ${atEligibility.earliestLaunchTimestamp}.`);
  }

  const deploymentBlock = Number(deploymentReceipt.blockNumber);
  const manifest = {
    network: network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    deploymentBlock,
    deploymentTxHash: deploymentReceipt.hash,
    deployer: deployerAddress,
    purpose: "scheduled launches may be armed now for a trading-open timestamp after creator cooldown",
    previousFactory: {
      address: activeFactoryAddress,
      permanentLpLocker: oldLocker,
      creationPaused: true,
      tradingAndGraduationSupportRetained: true,
    },
    activeFactory: {
      address: replacementFactoryAddress,
      permanentLpLocker: replacementLocker,
      live: true,
      creationPaused: false,
      securityDefaultsLocked: true,
      factoryGeneration: Number(await replacement.FACTORY_GENERATION()),
      campaignGeneration: Number(await replacement.CAMPAIGN_GENERATION()),
    },
    contracts: {
      LaunchFactory: replacementFactoryAddress,
      LaunchCampaignImplementation: campaignImplementation,
      PermanentLpLocker: replacementLocker,
      TreasuryRouterV2: treasuryRouter,
      TopazRouterAdapter: router,
      GraduationOracle: graduationOracle,
      CreatorRegistry: creatorRegistry,
      RiskRegistry: riskRegistry,
    },
    routing: {
      routeAuthority,
      tradeRouteProfile,
      finalizeRouteProfile,
      protocolFeeBps: protocolFeeBps.toString(),
      oldLockerStillAuthorized: Boolean(await treasury.authorizedLpLocker(oldLocker)),
      newLockerAuthorized: Boolean(await treasury.authorizedLpLocker(replacementLocker)),
      primaryLocker: await treasury.permanentLpLocker(),
      weeklyLeagueVault: await treasury.weeklyLeagueVault(),
      monthlyLeagueTreasury: await treasury.monthlyLeagueTreasury(),
      recruiterRewardsVault: await treasury.recruiterRewardsVault(),
      communityRewardsVault: await treasury.communityRewardsVault(),
      protocolRevenueVault: await treasury.protocolRevenueVault(),
    },
    config: {
      totalSupply: asString(replacementConfig.totalSupply),
      curveBps: asString(replacementConfig.curveBps),
      liquidityTokenBps: asString(replacementConfig.liquidityTokenBps),
      basePrice: asString(replacementConfig.basePrice),
      priceSlope: asString(replacementConfig.priceSlope),
      graduationTarget: asString(replacementConfig.graduationTarget),
      liquidityBps: asString(replacementConfig.liquidityBps),
    },
    qaCreator: {
      address: qaCreator,
      profileLastLaunchTimestamp: asString(creatorProfile.lastLaunchTimestamp),
      cooldownSeconds: asString(creatorRules.cooldownSeconds),
      earliestEligibleLaunchAt: expectedEarliest.toString(),
      earliestEligibleLaunchIso: new Date(Number(expectedEarliest) * 1000).toISOString(),
      beforeBoundaryRejected: true,
      boundaryAccepted: true,
    },
  };

  const root = path.resolve(__dirname, "..");
  const manifestFile = path.join(root, "deployments", "bscTestnet.scheduled-cooldown-factory.json");
  const envFile = path.join(root, "deployments", "bscTestnet.scheduled-cooldown-factory.env");
  writeJson(manifestFile, manifest);
  writeText(
    envFile,
    [
      `VITE_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,
      `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,
      `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,
      `FACTORY_ADDRESS_97=${replacementFactoryAddress}`,
      `FACTORY_START_BLOCK_97=${deploymentBlock}`,
    ].join("\n"),
  );

  const scheduledConfigFile = path.join(root, "frontend", "src", "lib", "scheduledFactoryConfig.ts");
  replaceRequired(
    scheduledConfigFile,
    /export const BSC_TESTNET_SCHEDULED_FACTORY = "0x[a-fA-F0-9]{40}";/,
    `export const BSC_TESTNET_SCHEDULED_FACTORY = "${replacementFactoryAddress}";`,
    "Update scheduled frontend factory constant",
  );
  replaceRequired(
    scheduledConfigFile,
    /export function getScheduledFactoryAddress\(chainId: number, genericFactoryAddress\?: string \| null\) \{[\s\S]*?\n\}/,
    [
      "export function getScheduledFactoryAddress(chainId: number, genericFactoryAddress?: string | null) {",
      "  if (Number(chainId) === 97) return BSC_TESTNET_SCHEDULED_FACTORY;",
      "  const explicit = validAddress(",
      "    env(`VITE_SCHEDULED_FACTORY_ADDRESS_${Number(chainId)}`) ||",
      "      env(`VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS_${Number(chainId)}`) ||",
      "      env(\"VITE_SCHEDULED_FACTORY_ADDRESS\") ||",
      "      env(\"VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS\"),",
      "  );",
      "  return explicit || validAddress(genericFactoryAddress);",
      "}",
    ].join("\n"),
    "Pin BSC Testnet scheduled factory before stale environment values",
  );

  const backendDeployFile = path.join(root, "frontend", "api", "dev-fix", "draft-deploy.js");
  replaceRequired(
    backendDeployFile,
    /const BSC_TESTNET_SCHEDULED_FACTORY = "0x[a-fA-F0-9]{40}";/,
    `const BSC_TESTNET_SCHEDULED_FACTORY = "${replacementFactoryAddress}";`,
    "Update backend scheduled factory constant",
  );
  replaceRequired(
    backendDeployFile,
    /function configuredScheduledFactory\(chainId\) \{[\s\S]*?\n\}/,
    [
      "function configuredScheduledFactory(chainId) {",
      "  const id = Number(chainId);",
      "  if (id === 97) return BSC_TESTNET_SCHEDULED_FACTORY;",
      "  const configured = String(",
      "    process.env[`SCHEDULED_FACTORY_ADDRESS_${id}`] ||",
      "      process.env[`SCHEDULED_LAUNCH_FACTORY_ADDRESS_${id}`] ||",
      "      process.env[`VITE_SCHEDULED_FACTORY_ADDRESS_${id}`] ||",
      "      process.env.SCHEDULED_FACTORY_ADDRESS ||",
      "      process.env.SCHEDULED_LAUNCH_FACTORY_ADDRESS ||",
      "      \"\",",
      "  ).trim();",
      "  return ethers.isAddress(configured) ? ethers.getAddress(configured) : \"\";",
      "}",
    ].join("\n"),
    "Pin backend BSC Testnet scheduled factory before stale environment values",
  );

  const bnbContractsFile = path.join(root, "frontend", "src", "lib", "bnbContracts.ts");
  let bnbContractsSource = fs.readFileSync(bnbContractsFile, "utf8");
  if (!bnbContractsSource.includes("ACTIVE_BSC_TESTNET_FACTORY")) {
    bnbContractsSource = bnbContractsSource.replace(
      "const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;",
      `const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;\nexport const ACTIVE_BSC_TESTNET_FACTORY = "${replacementFactoryAddress}";`,
    );
  } else {
    bnbContractsSource = bnbContractsSource.replace(
      /export const ACTIVE_BSC_TESTNET_FACTORY = "0x[a-fA-F0-9]{40}";/,
      `export const ACTIVE_BSC_TESTNET_FACTORY = "${replacementFactoryAddress}";`,
    );
  }
  bnbContractsSource = bnbContractsSource.replace(
    /launchFactory: readAddress\(chainId, "VITE_FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"\),/,
    "launchFactory: Number(chainId) === 97 ? ACTIVE_BSC_TESTNET_FACTORY : readAddress(chainId, \"VITE_FACTORY_ADDRESS\", \"VITE_FACTORY_ADDRESS\"),",
  );
  fs.writeFileSync(bnbContractsFile, bnbContractsSource);

  const indexerEnvFile = path.join(root, "realtime-indexer", "src", "env.ts");
  let indexerEnvSource = fs.readFileSync(indexerEnvFile, "utf8");
  if (!indexerEnvSource.includes("ACTIVE_BSC_TESTNET_FACTORY")) {
    indexerEnvSource = indexerEnvSource.replace(
      'import "dotenv/config";',
      `import "dotenv/config";\n\nconst ACTIVE_BSC_TESTNET_FACTORY = "${replacementFactoryAddress}";`,
    );
  } else {
    indexerEnvSource = indexerEnvSource.replace(
      /const ACTIVE_BSC_TESTNET_FACTORY = "0x[a-fA-F0-9]{40}";/,
      `const ACTIVE_BSC_TESTNET_FACTORY = "${replacementFactoryAddress}";`,
    );
  }
  indexerEnvSource = indexerEnvSource.replace(
    /FACTORY_ADDRESS_97: firstEnv\([^\n]+\),/,
    "FACTORY_ADDRESS_97: ACTIVE_BSC_TESTNET_FACTORY,",
  );
  fs.writeFileSync(indexerEnvFile, indexerEnvSource);

  const exampleEnvFile = path.join(root, "frontend", ".env.example");
  let exampleEnv = fs.readFileSync(exampleEnvFile, "utf8");
  exampleEnv = exampleEnv.replace(/^VITE_FACTORY_ADDRESS_97=.*$/m, `VITE_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);
  exampleEnv = exampleEnv.replace(/^VITE_SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);
  exampleEnv = exampleEnv.replace(/^SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);
  fs.writeFileSync(exampleEnvFile, exampleEnv);

  console.log(`\n[scheduled-cooldown-factory] manifest=${manifestFile}`);
  console.log(`[scheduled-cooldown-factory] env=${envFile}`);
  console.log(`[scheduled-cooldown-factory] ACTIVE_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);
  console.log(`[scheduled-cooldown-factory] ACTIVE_FACTORY_START_BLOCK_97=${deploymentBlock}`);
  console.log(`[scheduled-cooldown-factory] old factory creation paused; existing campaign trading/graduation retained`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
