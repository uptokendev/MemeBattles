import { expect } from "chai";
import { ethers } from "hardhat";
import { deployConfiguredTreasuryRouter } from "./helpers/deployRouting";

const TRADE = 0;
const FINALIZE = 1;
const STANDARD_LINKED = 0;
const STANDARD_UNLINKED = 1;
const OG_LINKED = 2;

async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("TreasuryRouter", function () {
  async function deployBare(opts?: { activeVault?: string; delay?: number }) {
    const [admin, alice, bob] = await ethers.getSigners();

    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const activeVault = opts?.activeVault ? undefined : await AcceptingReceiver.deploy();
    if (activeVault) await activeVault.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const router = await TreasuryRouter.deploy(
      await admin.getAddress(),
      opts?.activeVault ?? (await activeVault!.getAddress()),
      opts?.delay ?? 3600
    );
    await router.waitForDeployment();

    return { router, activeVault, admin, alice, bob };
  }

  it("validates constructor arguments", async () => {
    const [admin] = await ethers.getSigners();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const receiver = await AcceptingReceiver.deploy();
    await receiver.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    await expect(TreasuryRouter.deploy(ethers.ZeroAddress, await receiver.getAddress(), 3600)).to.be.revertedWith(
      "admin=0"
    );
    await expect(TreasuryRouter.deploy(await admin.getAddress(), ethers.ZeroAddress, 3600)).to.be.revertedWith(
      "vault=0"
    );
    await expect(TreasuryRouter.deploy(await admin.getAddress(), await receiver.getAddress(), 3599)).to.be.revertedWith(
      "delay too small"
    );
  });

  it("forwards direct native deposits, pauses forwarding, and flushes retained balance after unpause", async () => {
    const { router, activeVault, admin } = await deployBare();
    const routerAddress = await router.getAddress();
    const vaultAddress = await activeVault!.getAddress();
    const amount = 1234n;

    await expect(admin.sendTransaction({ to: routerAddress, value: amount }))
      .to.emit(router, "Forwarded")
      .withArgs(vaultAddress, amount);
    expect(await ethers.provider.getBalance(vaultAddress)).to.eq(amount);
    expect(await ethers.provider.getBalance(routerAddress)).to.eq(0n);

    await expect(router.setForwardingPaused(true)).to.emit(router, "ForwardingPaused").withArgs(true);
    await admin.sendTransaction({ to: routerAddress, value: amount });
    expect(await ethers.provider.getBalance(vaultAddress)).to.eq(amount);
    expect(await ethers.provider.getBalance(routerAddress)).to.eq(amount);

    await router.forward();
    expect(await ethers.provider.getBalance(routerAddress)).to.eq(amount);

    await router.setForwardingPaused(false);
    await expect(router.forward()).to.emit(router, "Forwarded").withArgs(vaultAddress, amount);
    expect(await ethers.provider.getBalance(routerAddress)).to.eq(0n);
    expect(await ethers.provider.getBalance(vaultAddress)).to.eq(amount * 2n);
  });

  it("does not revert direct deposits when the active vault rejects native value", async () => {
    const [admin] = await ethers.getSigners();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingVault = await RevertingReceiver.deploy();
    await rejectingVault.waitForDeployment();

    const { router } = await deployBare({ activeVault: await rejectingVault.getAddress() });
    const routerAddress = await router.getAddress();
    const amount = 999n;

    await expect(admin.sendTransaction({ to: routerAddress, value: amount }))
      .to.emit(router, "ForwardFailed")
      .withArgs(await rejectingVault.getAddress(), amount);
    expect(await ethers.provider.getBalance(routerAddress)).to.eq(amount);
  });

  it("enforces admin-only delayed active vault rotation", async () => {
    const { router, activeVault, admin, alice } = await deployBare();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const newVault = await AcceptingReceiver.deploy();
    await newVault.waitForDeployment();

    await expect(router.connect(alice).acceptVault()).to.be.revertedWith("not admin");
    await expect(router.acceptVault()).to.be.revertedWith("no pending");
    await expect(router.connect(alice).proposeVault(await newVault.getAddress())).to.be.revertedWith("not admin");
    await expect(router.proposeVault(ethers.ZeroAddress)).to.be.revertedWith("vault=0");
    await expect(router.proposeVault(await alice.getAddress())).to.be.revertedWith("not contract");

    await expect(router.proposeVault(await newVault.getAddress())).to.emit(router, "VaultProposed");
    await expect(router.acceptVault()).to.be.revertedWith("delay");

    await increaseTime(3600);

    await expect(router.connect(admin).acceptVault())
      .to.emit(router, "VaultActivated")
      .withArgs(await activeVault!.getAddress(), await newVault.getAddress());
    expect(await router.activeVault()).to.eq(await newVault.getAddress());
    expect(await router.pendingVault()).to.eq(ethers.ZeroAddress);
    expect(await router.pendingSince()).to.eq(0n);
  });

  it("enforces admin and non-zero guards on route vault setters", async () => {
    const { router, alice } = await deployBare();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const receiver = await AcceptingReceiver.deploy();
    await receiver.waitForDeployment();
    const receiverAddress = await receiver.getAddress();

    await expect(router.connect(alice).setRecruiterRewardsVault(receiverAddress)).to.be.revertedWith("not admin");
    await expect(router.connect(alice).setCommunityRewardsVault(receiverAddress)).to.be.revertedWith("not admin");
    await expect(router.connect(alice).setProtocolRevenueVault(receiverAddress)).to.be.revertedWith("not admin");

    await expect(router.setRecruiterRewardsVault(ethers.ZeroAddress)).to.be.revertedWith("vault=0");
    await expect(router.setCommunityRewardsVault(ethers.ZeroAddress)).to.be.revertedWith("vault=0");
    await expect(router.setProtocolRevenueVault(ethers.ZeroAddress)).to.be.revertedWith("vault=0");

    await expect(router.setRecruiterRewardsVault(receiverAddress))
      .to.emit(router, "RecruiterRewardsVaultUpdated")
      .withArgs(ethers.ZeroAddress, receiverAddress);
    await expect(router.setCommunityRewardsVault(receiverAddress))
      .to.emit(router, "CommunityRewardsVaultUpdated")
      .withArgs(ethers.ZeroAddress, receiverAddress);
    await expect(router.setProtocolRevenueVault(receiverAddress))
      .to.emit(router, "ProtocolRevenueVaultUpdated")
      .withArgs(ethers.ZeroAddress, receiverAddress);

    expect(await router.recruiterRewardsVault()).to.eq(receiverAddress);
    expect(await router.communityRewardsVault()).to.eq(receiverAddress);
    expect(await router.protocolRevenueVault()).to.eq(receiverAddress);
  });

  it("previews exact route splits for every kind/profile", async () => {
    const { router } = await deployBare();
    const amount = 10_000n;
    const cases: Array<[number, number, [bigint, bigint, bigint, bigint, bigint]]> = [
      [TRADE, STANDARD_LINKED, [3750n, 1250n, 0n, 250n, 4750n]],
      [TRADE, STANDARD_UNLINKED, [3750n, 0n, 1500n, 0n, 4750n]],
      [TRADE, OG_LINKED, [3750n, 1500n, 0n, 250n, 4500n]],
      [FINALIZE, STANDARD_LINKED, [0n, 1500n, 0n, 250n, 8250n]],
      [FINALIZE, STANDARD_UNLINKED, [0n, 0n, 1750n, 0n, 8250n]],
      [FINALIZE, OG_LINKED, [0n, 1750n, 0n, 250n, 8000n]],
    ];

    for (const [kind, profile, expected] of cases) {
      const amounts = await router.previewRoute(amount, kind, profile);
      const actual = [amounts.league, amounts.recruiter, amounts.airdrop, amounts.squad, amounts.protocol];
      expect(actual).to.deep.eq(expected);
      expect(actual.reduce((sum, value) => sum + value, 0n)).to.eq(amount);
    }

    await expect(router.previewRoute(0, TRADE, STANDARD_LINKED)).to.be.revertedWith("amount=0");
  });

  it("rejects route execution while paused, empty, or missing configured vaults", async () => {
    const { router } = await deployBare();

    await router.setForwardingPaused(true);
    await expect(router.route(TRADE, STANDARD_LINKED, { value: 1n })).to.be.revertedWith("routing paused");

    await router.setForwardingPaused(false);
    await expect(router.route(TRADE, STANDARD_LINKED, { value: 0n })).to.be.revertedWith("amount=0");
    await expect(router.route(TRADE, STANDARD_LINKED, { value: 1n })).to.be.revertedWith("recruiterVault=0");
  });

  it("executes standard unlinked trade routes into league, airdrop, and protocol balances", async () => {
    const [admin, trader] = await ethers.getSigners();
    const { treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault } =
      await deployConfiguredTreasuryRouter(await admin.getAddress());
    const amount = 10_000n;

    await expect(treasuryRouter.connect(trader).route(TRADE, STANDARD_UNLINKED, { value: amount }))
      .to.emit(treasuryRouter, "RouteExecuted")
      .withArgs(TRADE, STANDARD_UNLINKED, amount, 3750n, 0n, 1500n, 0n, 4750n);

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.eq(3750n);
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.eq(0n);
    expect(await ethers.provider.getBalance(await communityVault.getAddress())).to.eq(1500n);
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.eq(4750n);
    expect(await communityVault.warzoneAirdropBalance()).to.eq(1500n);
    expect(await communityVault.squadPoolBalance()).to.eq(0n);
  });

  it("executes linked finalize routes into recruiter, squad, and protocol balances", async () => {
    const [admin, campaign] = await ethers.getSigners();
    const { treasuryRouter, leagueVault, recruiterVault, protocolVault, communityVault } =
      await deployConfiguredTreasuryRouter(await admin.getAddress());
    const amount = 10_000n;

    await expect(treasuryRouter.connect(campaign).route(FINALIZE, STANDARD_LINKED, { value: amount }))
      .to.emit(treasuryRouter, "RouteExecuted")
      .withArgs(FINALIZE, STANDARD_LINKED, amount, 0n, 1500n, 0n, 250n, 8250n);

    expect(await ethers.provider.getBalance(await leagueVault.getAddress())).to.eq(0n);
    expect(await ethers.provider.getBalance(await recruiterVault.getAddress())).to.eq(1500n);
    expect(await ethers.provider.getBalance(await communityVault.getAddress())).to.eq(250n);
    expect(await ethers.provider.getBalance(await protocolVault.getAddress())).to.eq(8250n);
    expect(await communityVault.warzoneAirdropBalance()).to.eq(0n);
    expect(await communityVault.squadPoolBalance()).to.eq(250n);
  });

  it("reverts route execution when a configured route target rejects funds", async () => {
    const [admin] = await ethers.getSigners();
    const { treasuryRouter } = await deployConfiguredTreasuryRouter(await admin.getAddress());
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingVault = await RevertingReceiver.deploy();
    await rejectingVault.waitForDeployment();

    await treasuryRouter.setProtocolRevenueVault(await rejectingVault.getAddress());
    await expect(treasuryRouter.route(TRADE, STANDARD_UNLINKED, { value: 10_000n })).to.be.revertedWith(
      "route failed"
    );
  });
});
