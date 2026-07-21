import fs from "fs";
import path from "path";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol } from "../scripts/lib/deployProtocol";

const ENV_KEYS = [
  "DEPLOY_TREASURY_ROUTER_V2",
  "USE_TREASURY_ROUTER_V2",
  "DEPLOY_MOCK_TOPAZ_ROUTER",
  "DEPLOY_MOCK_ROUTER",
  "DEPLOY_MOCK_PRICE_FEED",
  "MOCK_NATIVE_USD_PRICE",
  "TOPAZ_ROUTER",
  "TOPAZ_V2_ROUTER",
  "ROUTER_ADDRESS",
  "PANCAKE_ROUTER",
  "PANCAKE_V2_ROUTER",
  "MONTHLY_LEAGUE_TREASURY",
  "MONTHLY_LEAGUE_TREASURY_ADDRESS",
  "GRADUATION_ORACLE_ADDRESS",
  "BNB_USD_PRICE_FEED",
  "NATIVE_USD_PRICE_FEED",
  "GRADUATION_PRICE_FEED",
  "GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS",
  "TREASURY_SAFE",
  "FEE_RECIPIENT",
  "UPGRADE_DELAY_SECONDS",
  "PROTOCOL_FEE_BPS",
  "LEAGUE_PAYOUT_OPERATOR",
  "LEAGUE_ROOT_POSTER",
  "LEAGUE_PAYOUT_MAX_PER_TX",
  "LEAGUE_PAYOUT_DAILY_CAP",
  "LEAGUE_CLAIM_MAX_PER_TX",
  "LEAGUE_CLAIM_MAX_EPOCH_TOTAL",
  "ENABLE_LEAGUE_PAYOUTS",
  "ENABLE_LEAGUE_CLAIMS",
  "RECRUITER_PAYOUT_OPERATOR",
  "RECRUITER_PAYOUT_MAX_PER_TX",
  "RECRUITER_PAYOUT_DAILY_CAP",
  "ENABLE_RECRUITER_PAYOUTS",
  "PHASE1_TRADE_ROUTE_PROFILE",
  "PHASE1_FINALIZE_ROUTE_PROFILE",
  "ROUTE_AUTHORITY_ADDRESS",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("deployProtocol TreasuryRouterV2 path", function () {
  this.timeout(120_000);

  const deploymentFile = path.join(__dirname, "..", "deployments", "hardhat.json");
  let envSnapshot: Record<string, string | undefined>;
  let originalDeployment: string | null;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
    originalDeployment = fs.existsSync(deploymentFile) ? fs.readFileSync(deploymentFile, "utf8") : null;

    for (const key of ENV_KEYS) delete process.env[key];
    process.env.DEPLOY_TREASURY_ROUTER_V2 = "true";
    process.env.DEPLOY_MOCK_TOPAZ_ROUTER = "true";
    process.env.DEPLOY_MOCK_PRICE_FEED = "true";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    if (originalDeployment === null) {
      if (fs.existsSync(deploymentFile)) fs.unlinkSync(deploymentFile);
    } else {
      fs.writeFileSync(deploymentFile, originalDeployment);
    }
  });

  it("deploys V2, records weekly/monthly metadata, and authorizes the factory LP locker", async () => {
    const deployment: any = await deployProtocol();

    expect(deployment.treasuryRouterVersion).to.equal("v2");
    expect(deployment.contracts.TreasuryRouter).to.equal(deployment.contracts.TreasuryRouterV2);
    expect(deployment.contracts.WeeklyLeagueVault).to.equal(deployment.weeklyLeagueVault);
    expect(deployment.contracts.MonthlyLeagueTreasury).to.equal(deployment.monthlyLeagueTreasury);
    expect(deployment.weeklyLeagueBps).to.equal(3000);
    expect(deployment.monthlyLeagueBps).to.equal(7000);
    expect(deployment.monthlyLeagueTreasuryDeployed).to.equal(true);
    expect(deployment.routing.permanentLpLockerAuthorized).to.equal(true);
    expect(deployment.postDeployActions).to.deep.equal([]);

    const router = await ethers.getContractAt("TreasuryRouterV2", deployment.contracts.TreasuryRouterV2);
    expect(await router.weeklyLeagueVault()).to.equal(deployment.contracts.WeeklyLeagueVault);
    expect(await router.monthlyLeagueTreasury()).to.equal(deployment.contracts.MonthlyLeagueTreasury);
    expect(await router.weeklyLeagueBps()).to.equal(3000n);
    expect(await router.monthlyLeagueBps()).to.equal(7000n);
    expect(await router.recruiterRewardsVault()).to.equal(deployment.contracts.RecruiterRewardsVault);
    expect(await router.communityRewardsVault()).to.equal(deployment.contracts.CommunityRewardsVault);
    expect(await router.protocolRevenueVault()).to.equal(deployment.contracts.ProtocolRevenueVault);
    expect(await router.authorizedLpLocker(deployment.contracts.PermanentLpLocker)).to.equal(true);
    expect(await router.permanentLpLocker()).to.equal(deployment.contracts.PermanentLpLocker);
  });
});
