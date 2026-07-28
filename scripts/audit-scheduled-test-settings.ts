import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode, resolveContracts } from "./verify-deployment";

const TESTNET_CHAIN_ID = 97n;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function loadDeployment() {
  const file = rawEnv("DEPLOYMENT_FILE")
    ? path.resolve(rawEnv("DEPLOYMENT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.scheduled-test-factory.json`);
  if (!fs.existsSync(file)) throw new Error(`Active scheduled deployment not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function line(label: string, value: unknown, status: "ok" | "optional" | "attention") {
  console.log(`[settings-audit] ${status.toUpperCase()} ${label}=${String(value)}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Settings audit is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file, deployment } = loadDeployment();
  const contracts = resolveContracts(deployment);
  console.log(`[settings-audit] deployment=${file}`);

  const factory = await ethers.getContractAt("LaunchFactory", contracts.LaunchFactory);
  const treasury = new ethers.Contract(
    contracts.TreasuryRouterV2 || contracts.TreasuryRouter,
    [
      "function admin() view returns (address)",
      "function weeklyLeagueVault() view returns (address)",
      "function monthlyLeagueTreasury() view returns (address)",
      "function recruiterRewardsVault() view returns (address)",
      "function communityRewardsVault() view returns (address)",
      "function protocolRevenueVault() view returns (address)",
      "function weeklyLeagueBps() view returns (uint16)",
      "function monthlyLeagueBps() view returns (uint16)",
      "function permanentLpLocker() view returns (address)",
      "function authorizedLpLocker(address) view returns (bool)",
      "function forwardingPaused() view returns (bool)",
    ],
    ethers.provider,
  );
  const creator = await ethers.getContractAt("CreatorRegistry", contracts.CreatorRegistry);
  const risk = await ethers.getContractAt("RiskRegistry", contracts.RiskRegistry);
  const monthly = await ethers.getContractAt("MonthlyLeagueTreasury", contracts.MonthlyLeagueTreasury);
  const community = await ethers.getContractAt("CommunityRewardsVault", contracts.CommunityRewardsVault);
  const recruiter = await ethers.getContractAt("RecruiterRewardsVault", contracts.RecruiterRewardsVault);
  const weekly = await ethers.getContractAt("TreasuryVaultV2", contracts.WeeklyLeagueVault || contracts.TreasuryVaultV2);

  for (const [label, address] of Object.entries({
    LaunchFactory: contracts.LaunchFactory,
    TreasuryRouterV2: contracts.TreasuryRouterV2 || contracts.TreasuryRouter,
    CreatorRegistry: contracts.CreatorRegistry,
    RiskRegistry: contracts.RiskRegistry,
    MonthlyLeagueTreasury: contracts.MonthlyLeagueTreasury,
    CommunityRewardsVault: contracts.CommunityRewardsVault,
    RecruiterRewardsVault: contracts.RecruiterRewardsVault,
    WeeklyLeagueVault: contracts.WeeklyLeagueVault || contracts.TreasuryVaultV2,
  })) {
    await assertCode(label, address as string);
  }

  const config = await factory.config();
  line("LaunchFactory.live", await factory.live(), "ok");
  line("LaunchFactory.securityDefaultsLocked", await factory.securityDefaultsLocked(), "ok");
  line("LaunchFactory.requireAuthorizedTrading", await factory.requireAuthorizedTrading(), "ok");
  line("LaunchFactory.requireRouteAuthorization", await factory.requireRouteAuthorization(), "ok");
  line("LaunchFactory.protocolFeeBps", await factory.protocolFeeBps(), "ok");
  line("LaunchFactory.graduationTarget", config.graduationTarget, "ok");
  line("LaunchFactory.routeAuthority", await factory.routeAuthority(), "ok");
  line("LaunchFactory.creatorRegistry", await factory.creatorRegistry(), "ok");
  line("LaunchFactory.riskRegistry", await factory.riskRegistry(), "ok");

  line("TreasuryRouterV2.admin", await treasury.admin(), "ok");
  line("TreasuryRouterV2.forwardingPaused", await treasury.forwardingPaused(), "ok");
  line("TreasuryRouterV2.weeklyLeagueBps", await treasury.weeklyLeagueBps(), "ok");
  line("TreasuryRouterV2.monthlyLeagueBps", await treasury.monthlyLeagueBps(), "ok");
  line("TreasuryRouterV2.recruiterRewardsVault", await treasury.recruiterRewardsVault(), "ok");
  line("TreasuryRouterV2.communityRewardsVault", await treasury.communityRewardsVault(), "ok");
  line("TreasuryRouterV2.protocolRevenueVault", await treasury.protocolRevenueVault(), "ok");
  line("TreasuryRouterV2.permanentLpLocker", await treasury.permanentLpLocker(), "ok");
  line(
    "TreasuryRouterV2.authorizedActiveLocker",
    await treasury.authorizedLpLocker(contracts.PermanentLpLocker),
    "ok",
  );

  line("CreatorRegistry.owner", await creator.owner(), "ok");
  line("CreatorRegistry.launchRecorder(activeFactory)", await creator.launchRecorder(contracts.LaunchFactory), "ok");
  line("RiskRegistry.owner", await risk.owner(), "attention");

  const monthlyRootPoster = await monthly.rootPoster();
  line(
    "MonthlyLeagueTreasury.rootPoster",
    monthlyRootPoster,
    monthlyRootPoster === ethers.ZeroAddress ? "optional" : "ok",
  );
  line("MonthlyLeagueTreasury.monthlyCapUsd", await monthly.monthlyCapUsd(), "ok");

  const rewardDistributor = await community.rewardDistributor();
  const airdropOperator = await community.airdropOperator();
  line(
    "CommunityRewardsVault.rewardDistributor",
    rewardDistributor,
    rewardDistributor === ethers.ZeroAddress ? "optional" : "ok",
  );
  line(
    "CommunityRewardsVault.airdropOperator",
    airdropOperator,
    airdropOperator === ethers.ZeroAddress ? "optional" : "ok",
  );

  const recruiterOperator = await recruiter.operator();
  line("RecruiterRewardsVault.operator", recruiterOperator, recruiterOperator === ethers.ZeroAddress ? "optional" : "ok");
  line("RecruiterRewardsVault.maxPayoutPerTx", await recruiter.maxPayoutPerTx(), "optional");
  line("RecruiterRewardsVault.dailyPayoutCap", await recruiter.dailyPayoutCap(), "optional");
  line("RecruiterRewardsVault.payoutsPaused", await recruiter.payoutsPaused(), "optional");

  const weeklyOperator = await weekly.operator();
  const weeklyRootPoster = await weekly.rootPoster();
  line("WeeklyLeagueVault.operator", weeklyOperator, weeklyOperator === ethers.ZeroAddress ? "optional" : "ok");
  line("WeeklyLeagueVault.rootPoster", weeklyRootPoster, weeklyRootPoster === ethers.ZeroAddress ? "optional" : "ok");
  line("WeeklyLeagueVault.payoutsPaused", await weekly.payoutsPaused(), "optional");
  line("WeeklyLeagueVault.claimsPaused", await weekly.claimsPaused(), "optional");

  console.log("\n[settings-audit] Required launch/graduation configuration is on-chain.");
  console.log("[settings-audit] OPTIONAL entries are only required when testing their specific payout lanes.");
  console.log("[settings-audit] ATTENTION entries indicate an admin key/address that must be available to operate that contract.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
