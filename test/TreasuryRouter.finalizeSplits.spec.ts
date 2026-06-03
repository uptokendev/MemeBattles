import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// DEV-14: Align finalize/graduation-fee split model (no League share).
// Finalize routes the whole fee (msg.value) split in bps of 10_000. League == 0
// for every finalize profile. With a 2 ETH input the amounts equal the spec %:
//   StandardLinked   (0): league 0 | recruiter 0.30 | airdrop 0.00 | squad 0.05 | protocol 1.65
//   StandardUnlinked (1): league 0 | recruiter 0.00 | airdrop 0.35 | squad 0.00 | protocol 1.65
//     ^ unlinked: recruiter (0.30) + squad (0.05) shares fold into Airdrop = 0.35; squad = 0.
//   OgLinked         (2): league 0 | recruiter 0.35 | airdrop 0.00 | squad 0.05 | protocol 1.60
describe("TreasuryRouter finalize-fee splits (DEV-14)", () => {
  const ROUTE_KIND_FINALIZE = 1;
  const PROFILE = { StandardLinked: 0, StandardUnlinked: 1, OgLinked: 2 } as const;

  const AMOUNT = ethers.parseEther("2");
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
    { name: "StandardLinked: recruiter 0.30 + squad 0.05, protocol 1.65, league 0",
      profile: PROFILE.StandardLinked, recruiter: "0.30", airdrop: "0", squad: "0.05", protocol: "1.65" },
    { name: "StandardUnlinked: orphaned shares fold to airdrop 0.35, squad 0, protocol 1.65, league 0",
      profile: PROFILE.StandardUnlinked, recruiter: "0", airdrop: "0.35", squad: "0", protocol: "1.65" },
    { name: "OgLinked: recruiter 0.35 + squad 0.05, protocol 1.60, league 0",
      profile: PROFILE.OgLinked, recruiter: "0.35", airdrop: "0", squad: "0.05", protocol: "1.60" },
  ];

  for (const c of cases) {
    it(`splits FINALIZE / ${c.name}`, async () => {
      const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } =
        await loadFixture(deployFixture);

      const p = await router.previewRoute(AMOUNT, ROUTE_KIND_FINALIZE, c.profile);
      expect(p.league, "league must be 0 on finalize").to.equal(0n);
      expect(p.recruiter, "recruiter").to.equal(E(c.recruiter));
      expect(p.airdrop, "airdrop").to.equal(E(c.airdrop));
      expect(p.squad, "squad").to.equal(E(c.squad));
      expect(p.protocol, "protocol").to.equal(E(c.protocol));
      expect(p.league + p.recruiter + p.airdrop + p.squad + p.protocol, "net").to.equal(AMOUNT);

      await expect(router.connect(outsider).route(ROUTE_KIND_FINALIZE, c.profile, { value: AMOUNT }))
        .to.emit(router, "RouteExecuted")
        .withArgs(ROUTE_KIND_FINALIZE, c.profile, AMOUNT,
          0n, E(c.recruiter), E(c.airdrop), E(c.squad), E(c.protocol));

      expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(E(c.recruiter));
      expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(E(c.protocol));
      expect(await communityVault.warzoneAirdropBalance()).to.equal(E(c.airdrop));
      expect(await communityVault.squadPoolBalance()).to.equal(E(c.squad));
    });
  }

  it("League is always 0 and splits net to input across all finalize profiles", async () => {
    const { router } = await loadFixture(deployFixture);
    const probe = 123_456_789n; // non-round to catch rounding leaks
    for (const profile of [PROFILE.StandardLinked, PROFILE.StandardUnlinked, PROFILE.OgLinked]) {
      const p = await router.previewRoute(probe, ROUTE_KIND_FINALIZE, profile);
      expect(p.league, `league must be 0 for finalize profile ${profile}`).to.equal(0n);
      expect(p.league + p.recruiter + p.airdrop + p.squad + p.protocol).to.equal(probe);
    }
  });
});
