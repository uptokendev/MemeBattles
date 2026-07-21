import { expect } from "chai";

const { buildFrontendEnv, pickTreasuryRouterAddress } = require("../scripts/lib/frontendEnv.cjs");
const { buildIndexerManifest, eventTopic } = require("../scripts/lib/indexerManifest.cjs");

function addr(id: number) {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

function v2Deployment() {
  return {
    network: "bscTestnet",
    chainId: 97,
    deploymentBlock: 12345,
    router: addr(30),
    topazRouterAdapter: addr(13),
    productionTopazRouter: addr(14),
    treasuryRouterVersion: "v2",
    weeklyLeagueVault: addr(4),
    monthlyLeagueTreasury: addr(15),
    monthlyLeagueTreasuryDeployed: true,
    weeklyLeagueBps: 3000,
    monthlyLeagueBps: 7000,
    contracts: {
      LaunchFactory: addr(1),
      LaunchCampaignImplementation: addr(2),
      TreasuryRouter: addr(3),
      TreasuryRouterV2: addr(3),
      TreasuryVaultV2: addr(4),
      WeeklyLeagueVault: addr(4),
      MonthlyLeagueTreasury: addr(15),
      RecruiterRewardsVault: addr(5),
      CommunityRewardsVault: addr(6),
      ProtocolRevenueVault: addr(7),
      CreatorRegistry: addr(8),
      RiskRegistry: addr(9),
      GraduationOracle: addr(10),
      PermanentLpLocker: addr(11),
      UPVoteTreasury: addr(12),
    },
    routing: {
      weeklyLeagueVault: addr(4),
      monthlyLeagueTreasury: addr(15),
      weeklyLeagueBps: 3000,
      monthlyLeagueBps: 7000,
      permanentLpLocker: addr(11),
      permanentLpLockerAuthorized: true,
    },
    topazInfrastructure: {
      contracts: {
        Router: addr(14),
        PoolFactory: addr(16),
        WBNB: addr(17),
      },
    },
  };
}

describe("TreasuryRouterV2 tooling support", function () {
  it("uses TreasuryRouterV2 as the frontend treasury router when a V2 manifest is supplied", async () => {
    const deployment = v2Deployment();
    const expectedRouter = addr(3);

    expect(pickTreasuryRouterAddress(deployment)).to.eq(expectedRouter);

    const env = buildFrontendEnv(deployment, "test deployment");
    expect(env).to.include(`VITE_TREASURY_ROUTER_ADDRESS_97=${expectedRouter}`);
    expect(env).to.include(`VITE_TOPAZ_ROUTER_ADDRESS_97=${addr(14)}`);
  });

  it("keeps the V2 deployment metadata needed by frontend, indexer, and revenue wiring", async () => {
    const deployment = v2Deployment();

    expect(deployment.treasuryRouterVersion).to.eq("v2");
    expect(deployment.contracts.TreasuryRouter).to.eq(addr(3));
    expect(deployment.contracts.TreasuryRouterV2).to.eq(addr(3));
    expect(deployment.contracts.WeeklyLeagueVault).to.eq(addr(4));
    expect(deployment.contracts.MonthlyLeagueTreasury).to.eq(addr(15));
    expect(deployment.weeklyLeagueVault).to.eq(addr(4));
    expect(deployment.monthlyLeagueTreasury).to.eq(addr(15));
    expect(deployment.weeklyLeagueBps).to.eq(3000);
    expect(deployment.monthlyLeagueBps).to.eq(7000);
    expect(deployment.routing.permanentLpLockerAuthorized).to.eq(true);
  });

  it("exports V2 router address and V2-only event topics in the indexer manifest", async () => {
    const manifest = buildIndexerManifest(v2Deployment(), "test deployment");

    expect(manifest.contracts.TreasuryRouter).to.eq(addr(3));
    expect(manifest.events.TreasuryRouter["WeeklyLeagueVaultProposed(address,uint64)"]).to.eq(
      eventTopic("WeeklyLeagueVaultProposed(address,uint64)")
    );
    expect(manifest.events.TreasuryRouter["MonthlyLeagueTreasuryActivated(address,address)"]).to.eq(
      eventTopic("MonthlyLeagueTreasuryActivated(address,address)")
    );
    expect(manifest.events.TreasuryRouter["LeagueSplitUpdated(uint16,uint16)"]).to.eq(
      eventTopic("LeagueSplitUpdated(uint16,uint16)")
    );
    expect(manifest.events.TreasuryRouter["AuthorizedLpLockerUpdated(address,bool)"]).to.eq(
      eventTopic("AuthorizedLpLockerUpdated(address,bool)")
    );
    expect(manifest.events.TreasuryRouter["PrimaryLpLockerUpdated(address,address)"]).to.eq(
      eventTopic("PrimaryLpLockerUpdated(address,address)")
    );
    expect(manifest.events.TreasuryRouter["LeagueRouted(uint256,uint256)"]).to.eq(
      eventTopic("LeagueRouted(uint256,uint256)")
    );
  });
});
