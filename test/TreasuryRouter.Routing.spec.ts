import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("TreasuryRouter Phase 1 routing", () => {
  async function deployFixture() {
    const [admin, outsider, recipient] = await ethers.getSigners();

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

    return {
      admin,
      outsider,
      recipient,
      router,
      leagueVault,
      recruiterVault,
      protocolVault,
      communityVault,
    };
  }

  it("keeps legacy league-only forwarding via receive()", async () => {
    const { router, leagueVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("1");
    await outsider.sendTransaction({ to: await router.getAddress(), value: amount });

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(amount);
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
  });

  it("routes trade / linked recruiter + linked squad correctly", async () => {
    const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("2");
    await expect(
      router.connect(outsider).route(0, 0, { value: amount })
    )
      .to.emit(router, "RouteExecuted")
      .withArgs(0, 0, amount, ethers.parseEther("0.75"), ethers.parseEther("0.25"), 0, ethers.parseEther("0.05"), ethers.parseEther("0.95"));

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(ethers.parseEther("0.75"));
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(ethers.parseEther("0.25"));
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(ethers.parseEther("0.95"));
    expect(await communityVault.warzoneAirdropBalance()).to.equal(0n);
    expect(await communityVault.squadPoolBalance()).to.equal(ethers.parseEther("0.05"));
    expect(await ethers.provider.getBalance(await communityVault.getAddress())).to.equal(ethers.parseEther("0.05"));
  });

  it("routes trade / no recruiter and no squad to airdrops", async () => {
    const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("2");
    await router.connect(outsider).route(0, 1, { value: amount });

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(ethers.parseEther("0.75"));
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(ethers.parseEther("0.95"));
    expect(await communityVault.warzoneAirdropBalance()).to.equal(ethers.parseEther("0.30"));
    expect(await communityVault.squadPoolBalance()).to.equal(0n);
  });

  it("routes finalize / linked recruiter + creator in squad correctly", async () => {
    const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("2");
    await router.connect(outsider).route(1, 0, { value: amount });

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(ethers.parseEther("0.30"));
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(ethers.parseEther("1.65"));
    expect(await communityVault.warzoneAirdropBalance()).to.equal(0n);
    expect(await communityVault.squadPoolBalance()).to.equal(ethers.parseEther("0.05"));
  });

  it("routes finalize / no recruiter and no squad to airdrops", async () => {
    const { router, leagueVault, recruiterVault, protocolVault, communityVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("2");
    await router.connect(outsider).route(1, 1, { value: amount });

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(ethers.parseEther("1.65"));
    expect(await communityVault.warzoneAirdropBalance()).to.equal(ethers.parseEther("0.35"));
    expect(await communityVault.squadPoolBalance()).to.equal(0n);
  });

  it("routes OG-linked trade and finalize by carving extra reward out of protocol share", async () => {
    const { router, recruiterVault, protocolVault, communityVault, outsider } = await loadFixture(deployFixture);

    const amount = ethers.parseEther("2");
    await router.connect(outsider).route(0, 2, { value: amount });
    await router.connect(outsider).route(1, 2, { value: amount });

    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.equal(ethers.parseEther("0.65"));
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.equal(ethers.parseEther("2.50"));
    expect(await communityVault.squadPoolBalance()).to.equal(ethers.parseEther("0.10"));
    expect(await communityVault.warzoneAirdropBalance()).to.equal(0n);
  });

  it("tracks community balances and restricts direct native deposits", async () => {
    const { communityVault, admin, recipient, router, outsider } = await loadFixture(deployFixture);

    await expect(outsider.sendTransaction({ to: await communityVault.getAddress(), value: 1n })).to.be.revertedWith("direct disabled");

    await router.connect(outsider).route(0, 1, { value: ethers.parseEther("2") });
    await expect(communityVault.connect(admin).withdrawAirdrop(await recipient.getAddress(), ethers.parseEther("0.30")))
      .to.emit(communityVault, "AirdropWithdrawn");

    expect(await communityVault.warzoneAirdropBalance()).to.equal(0n);
  });

  it("previewRoute always nets exactly to the input amount", async () => {
    const { router } = await loadFixture(deployFixture);

    const amount = 123_456_789n;
    for (const kind of [0, 1] as const) {
      for (const profile of [0, 1, 2] as const) {
        const preview = await router.previewRoute(amount, kind, profile);
        const total = preview.league + preview.recruiter + preview.airdrop + preview.squad + preview.protocol;
        expect(total).to.equal(amount);
      }
    }
  });

  it("requires downstream vaults to be configured before routed splits", async () => {
    const [admin, outsider] = await ethers.getSigners();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const leagueVault = await AcceptingReceiver.deploy();
    await leagueVault.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const router = await TreasuryRouter.deploy(await admin.getAddress(), await leagueVault.getAddress(), 3600);
    await router.waitForDeployment();

    await expect(router.connect(outsider).route(0, 0, { value: 1n })).to.be.revertedWith("recruiterVault=0");
  });
});
