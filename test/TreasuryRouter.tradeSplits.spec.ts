import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// DEV-13: Align trading-fee split model with incentive scope.
// previewRoute splits the routed fee (the 2.00% trade fee) in bps of 10_000.
// With a 2 ETH input the per-bucket ETH amounts equal the spec's "% of volume":
//   StandardLinked   (0): league 0.75 | recruiter 0.25 | airdrop 0.00 | squad 0.05 | protocol 0.95
//   StandardUnlinked (1): league 0.75 | recruiter 0.00 | airdrop 0.30 | squad 0.00 | protocol 0.95
//     ^ unlinked: the recruiter (0.25) AND squad (0.05) shares both fold into Airdrop = 0.30; squad = 0.
//   OgLinked         (2): league 0.75 | recruiter 0.30 | airdrop 0.00 | squad 0.05 | protocol 0.90
describe("TreasuryRouter trade-fee splits (DEV-13)", () => {
  const ROUTE_KIND_TRADE = 0;
  const PROFILE = { StandardLinked: 0, StandardUnlinked: 1, OgLinked: 2 } as const;

  const AMOUNT = ethers.parseEther("2"); // routed trade fee; 2 ETH => amounts equal spec %
  const E = (v: string) => ethers.parseEther(v);

  async function deployFixture() {
    const [admin, outsider] = await ethers.getSigners();

    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const leagueVault = await AcceptingReceiver.deploy();
    const recruiterVault = await AcceptingReceiver.deploy();
    const protocolVault = await AcceptingReceiver.deploy();
    await Promise.all([
      leagueVault.waitForDeployment(),
      recruiterVault.waitForDeployment(),
      protocolVault.waitForDeployment(),
    ]);

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const router = await TreasuryRouter.deploy(await admin.getAddress(), await leagueVault.getAddress(), 3600);
    await router.waitForDeployment();

    const CommunityRewardsVault = await ethers.getContractFactory("CommunityRewardsVault");
    const communityVault = await CommunityRewardsVault.deploy(await admin.getAddress(), ethers.ZeroAddress);
    await communityVault.waitForDeployment();

    await communityVault.connect(admin).setRouter(await router.getAddress());
    await router.connect(admin).setRecruiterRewardsVault(await recruiterVault.getAddress());
    await router.connect(admin).setCommunityRewardsVault(await communityVault.getAddress());
    await router.connect(admin).setProtocolRevenueVault(await protocolVault.getAddress());

    return { admin, outsider, router, leagueVault, recruiterVault, protocolVault, communityVault };
  }

  const cases = [
    { name: "StandardLinked: recruiter 0.25 + squad 0.05, protocol 0.95",
      profile: PROFILE.StandardLinked, league: "0.75", recruiter: "0.25", airdrop: "0", squad: "0.05", protocol: "0.95" },
    { name: "StandardUnlinked: orphaned shares fold to airdrop 0.30, squad 0, protocol 0.95",
      profile: PROFILE.StandardUnlinked, league: "0.75", recruiter: "0", airdrop: "0.30", squad: "0", protocol: "0.95" },
    { name: "OgLinked: recruiter 0.30 + squad 0.05, protocol 0.90",
      profile: PROFILE.OgLinked, league: "0.75", recruiter: "0.30", airdrop: "0", squad: "0.05", protocol: "0.90" },
  ];

  for (const c of cases) {
    it(`splits TRADE / ${c.name}`, async () => {
      const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } =
        await loadFixture(deployFixture);

      const p = await router.previewRoute(AMOUNT, ROUTE_KIND_TRADE, c.profile);
      expect(p.league, "league").to.equal(E(c.league));
      expect(p.recruiter, "recruiter").to.equal(E(c.recruiter));
      expect(p.airdrop, "airdrop").to.equal(E(c.airdrop));
      expect(p.squad, "squad").to.equal(E(c.squad));
      expect(p.protocol, "protocol").to.equal(E(c.protocol));
      expect(p.league + p.recruiter + p.airdrop + p.squad + p.protocol, "net").to.equal(AMOUNT);

      await expect(router.connect(outsider).route(ROUTE_KIND_TRADE, c.profile, { value: AMOUNT }))
        .to.emit(router, "RouteExecuted")
        .withArgs(ROUTE_KIND_TRADE, c.profile, AMOUNT,
          E(c.league), E(c.recruiter), E(c.airdrop), E(c.squad), E(c.protocol));

      expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(E(c.league));
      expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(E(c.recruiter));
      expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(E(c.protocol));
      expect(await communityVault.warzoneAirdropBalance()).to.equal(E(c.airdrop));
      expect(await communityVault.squadPoolBalance()).to.equal(E(c.squad));
    });
  }
});
