import { expect } from "chai";
import { ethers } from "hardhat";

const { buildIndexerManifest, eventTopic } = require("../scripts/lib/indexerManifest.cjs");

function addr(id: number) {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

describe("Indexer manifest TreasuryRouterV2 support", function () {
  it("accepts TreasuryRouterV2 as the canonical indexed treasury router and exports V2/Phase 5 event topics", async () => {
    const treasuryRouterV2 = addr(3);
    const deployment = {
      network: "bscTestnet",
      chainId: 97,
      deploymentBlock: 12345,
      topazRouterAdapter: addr(13),
      productionTopazRouter: addr(14),
      monthlyLeagueTreasury: addr(15),
      charityTreasury: addr(16),
      contracts: {
        LaunchFactory: addr(1),
        LaunchCampaignImplementation: addr(2),
        TreasuryRouterV2: treasuryRouterV2,
        TreasuryVaultV2: addr(4),
        MonthlyLeagueTreasury: addr(15),
        CharityTreasury: addr(16),
        RecruiterRewardsVault: addr(5),
        CommunityRewardsVault: addr(6),
        ProtocolRevenueVault: addr(7),
        CreatorRegistry: addr(8),
        RiskRegistry: addr(9),
        GraduationOracle: addr(10),
        PermanentLpLocker: addr(11),
        UPVoteTreasury: addr(12),
      },
    };

    const manifest = buildIndexerManifest(deployment, "test deployment");

    expect(manifest.contracts.TreasuryRouter).to.eq(ethers.getAddress(treasuryRouterV2));
    expect(manifest.contracts.MonthlyLeagueTreasury).to.eq(ethers.getAddress(addr(15)));
    expect(manifest.contracts.CharityTreasury).to.eq(ethers.getAddress(addr(16)));
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
    expect(manifest.events.MonthlyLeagueTreasury["MonthSealed(uint256,bytes32,uint256,uint256,uint256,uint256,uint256)"]).to.eq(
      eventTopic("MonthSealed(uint256,bytes32,uint256,uint256,uint256,uint256,uint256)")
    );
    expect(manifest.events.MonthlyLeagueTreasury["Claimed(uint256,address,uint256,bytes32)"]).to.eq(
      eventTopic("Claimed(uint256,address,uint256,bytes32)")
    );
    expect(manifest.events.CharityTreasury["NativeReceived(address,uint256)"]).to.eq(
      eventTopic("NativeReceived(address,uint256)")
    );
    expect(manifest.events.CharityTreasury["TokenWithdrawn(address,address,uint256)"]).to.eq(
      eventTopic("TokenWithdrawn(address,address,uint256)")
    );
  });
});
