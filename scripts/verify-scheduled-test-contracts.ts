import fs from "fs";
import path from "path";
import { ethers, network, run } from "hardhat";
import { assertCode, resolveContracts, verifyDeployment } from "./verify-deployment";

const TESTNET_CHAIN_ID = 97n;
const MAINNET_CHAIN_ID = 56n;
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

function loadActiveDeployment() {
  const file = rawEnv("DEPLOYMENT_FILE")
    ? path.resolve(rawEnv("DEPLOYMENT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Active scheduled deployment not found: ${file}. Complete activation first or set DEPLOYMENT_FILE.`);
  }
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function isAlreadyVerified(error: any): boolean {
  const message = String(error?.message || error?.shortMessage || error || "").toLowerCase();
  return (
    message.includes("already verified") ||
    message.includes("already been verified") ||
    message.includes("contract source code already verified")
  );
}

async function verifyContract(
  label: string,
  contract: string,
  address: string,
  constructorArguments: unknown[],
): Promise<void> {
  await assertCode(label, address);
  console.log(`\n[explorer-verify] ${label}=${address}`);
  console.log(`[explorer-verify] contract=${contract}`);
  try {
    await run("verify:verify", {
      address,
      contract,
      constructorArguments,
    });
    console.log(`[explorer-verify] ${label}: verified`);
  } catch (error: any) {
    if (isAlreadyVerified(error)) {
      console.log(`[explorer-verify] ${label}: already verified`);
      return;
    }
    throw new Error(`${label} explorer verification failed: ${error?.message || error}`);
  }
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) {
    throw new Error("Refusing scheduled test-stack verification on BSC mainnet (chain 56).");
  }
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This verification is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }
  if (!rawEnv("ETHERSCAN_API_KEY")) {
    throw new Error("ETHERSCAN_API_KEY is missing. Add an Etherscan API V2 key to .env before explorer verification.");
  }

  const { file, deployment } = loadActiveDeployment();
  if (deployment.activationRequired !== false || deployment.factoryRegistry?.activeFactory == null) {
    throw new Error("Deployment is not marked active. Complete activate:scheduled-test-factory:bsc-testnet first.");
  }

  console.log(`[explorer-verify] active deployment=${file}`);
  await verifyDeployment(deployment);

  const contracts = resolveContracts(deployment);
  const treasuryAdmin = requireAddress(
    "Treasury admin",
    deployment.treasuryAdmin || deployment.treasurySafe,
  );
  const treasuryRouter = requireAddress(
    "TreasuryRouterV2",
    contracts.TreasuryRouterV2 || contracts.TreasuryRouter,
  );
  const weeklyLeagueVault = requireAddress(
    "WeeklyLeagueVault",
    contracts.WeeklyLeagueVault || contracts.TreasuryVaultV2,
  );
  const monthlyLeagueTreasury = requireAddress("MonthlyLeagueTreasury", contracts.MonthlyLeagueTreasury);
  const charityTreasury = requireAddress("CharityTreasury", contracts.CharityTreasury);
  const communityRewardsVault = requireAddress("CommunityRewardsVaultV2", contracts.CommunityRewardsVault);
  const creatorRegistry = requireAddress("CreatorRegistry", contracts.CreatorRegistry);
  const graduationOracle = requireAddress("GraduationOracle", contracts.GraduationOracle);
  const campaignImplementation = requireAddress(
    "LaunchCampaign implementation",
    contracts.LaunchCampaignImplementation,
  );
  const launchFactory = requireAddress("LaunchFactory", contracts.LaunchFactory);
  const permanentLpLocker = requireAddress("PermanentLpLocker", contracts.PermanentLpLocker);
  const topazRouter = requireAddress(
    "Topaz router",
    deployment.routing?.topazRouter || deployment.topazRouterAdapter || deployment.topazRouter || deployment.router,
  );

  const upgradeDelaySeconds = BigInt(deployment.upgradeDelaySeconds ?? 172800);
  const rootPoster = ADDRESS_RE.test(String(deployment.leagueRootPoster || ""))
    ? ethers.getAddress(deployment.leagueRootPoster)
    : ethers.ZeroAddress;
  const monthlyCapConstructorArg = BigInt(
    deployment.treasuryV2Migration?.monthlyCapConstructorArg ??
      deployment.monthlyLeagueCapUsd ??
      deployment.routing?.monthlyLeagueCapUsd ??
      0,
  );

  await verifyContract(
    "CharityTreasury",
    "contracts/CharityTreasury.sol:CharityTreasury",
    charityTreasury,
    [treasuryAdmin],
  );
  await verifyContract(
    "MonthlyLeagueTreasury",
    "contracts/MonthlyLeagueTreasury.sol:MonthlyLeagueTreasury",
    monthlyLeagueTreasury,
    [treasuryAdmin, rootPoster, graduationOracle, charityTreasury, monthlyCapConstructorArg],
  );
  await verifyContract(
    "TreasuryRouterV2",
    "contracts/TreasuryRouterV2.sol:TreasuryRouterV2",
    treasuryRouter,
    [treasuryAdmin, weeklyLeagueVault, monthlyLeagueTreasury, upgradeDelaySeconds],
  );
  await verifyContract(
    "CommunityRewardsVaultV2",
    "contracts/CommunityRewardsVault.sol:CommunityRewardsVault",
    communityRewardsVault,
    [treasuryAdmin, treasuryRouter],
  );
  await verifyContract(
    "CreatorRegistry",
    "contracts/CreatorRegistry.sol:CreatorRegistry",
    creatorRegistry,
    [],
  );
  await verifyContract(
    "LaunchCampaign implementation",
    "contracts/LaunchCampaign.sol:LaunchCampaign",
    campaignImplementation,
    [],
  );
  await verifyContract(
    "LaunchFactory",
    "contracts/LaunchFactory.sol:LaunchFactory",
    launchFactory,
    [topazRouter, treasuryRouter, campaignImplementation, graduationOracle],
  );
  await verifyContract(
    "PermanentLpLocker",
    "contracts/PermanentLpLocker.sol:PermanentLpLocker",
    permanentLpLocker,
    [launchFactory],
  );

  console.log("\n[explorer-verify] Scheduled BSC Testnet stack verification complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
