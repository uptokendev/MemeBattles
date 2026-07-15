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

async function deployBare() {
  const [admin, alice] = await ethers.getSigners();
  const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
  const activeVault = await AcceptingReceiver.deploy();
  await activeVault.waitForDeployment();

  const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
  const router = await TreasuryRouter.deploy(await admin.getAddress(), await activeVault.getAddress(), 3600);
  await router.waitForDeployment();

  return { router, activeVault, admin, alice };
}

describe("TreasuryRouter edge cases", function () {
  it("keeps rounding dust in protocol across every route profile", async () => {
    const { router } = await deployBare();
    const amount = 3n;
    const cases: Array<[number, number]> = [
      [TRADE, STANDARD_LINKED],
      [TRADE, STANDARD_UNLINKED],
      [TRADE, OG_LINKED],
      [FINALIZE, STANDARD_LINKED],
      [FINALIZE, STANDARD_UNLINKED],
      [FINALIZE, OG_LINKED],
    ];

    for (const [kind, profile] of cases) {
      const preview = await router.previewRoute(amount, kind, profile);
      expect(preview.league + preview.recruiter + preview.airdrop + preview.squad + preview.protocol).to.eq(amount);
      expect(preview.protocol).to.eq(amount);
    }
  });

  it("allows zero-balance forward calls as no-ops", async () => {
    const { router, activeVault } = await deployBare();

    await router.forward();
    expect(await ethers.provider.getBalance(await router.getAddress())).to.eq(0n);
    expect(await ethers.provider.getBalance(await activeVault.getAddress())).to.eq(0n);
  });

  it("replacing a pending vault restarts the activation delay", async () => {
    const { router, activeVault } = await deployBare();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const firstVault = await AcceptingReceiver.deploy();
    const secondVault = await AcceptingReceiver.deploy();
    await firstVault.waitForDeployment();
    await secondVault.waitForDeployment();

    await expect(router.proposeVault(await firstVault.getAddress())).to.emit(router, "VaultProposed");
    await increaseTime(3599);
    await expect(router.proposeVault(await secondVault.getAddress())).to.emit(router, "VaultProposed");

    await increaseTime(1);
    await expect(router.acceptVault()).to.be.revertedWith("delay");

    await increaseTime(3599);
    await expect(router.acceptVault())
      .to.emit(router, "VaultActivated")
      .withArgs(await activeVault.getAddress(), await secondVault.getAddress());
    expect(await router.activeVault()).to.eq(await secondVault.getAddress());
  });

  it("reverts airdrop routes when the community vault is misconfigured", async () => {
    const [admin] = await ethers.getSigners();
    const { treasuryRouter } = await deployConfiguredTreasuryRouter(await admin.getAddress());
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const wrongCommunityVault = await AcceptingReceiver.deploy();
    await wrongCommunityVault.waitForDeployment();

    await treasuryRouter.setCommunityRewardsVault(await wrongCommunityVault.getAddress());
    await expect(treasuryRouter.route(TRADE, STANDARD_UNLINKED, { value: 10_000n })).to.be.revertedWith(
      "airdrop route failed"
    );
  });

  it("reverts squad routes when the community vault is misconfigured", async () => {
    const [admin] = await ethers.getSigners();
    const { treasuryRouter } = await deployConfiguredTreasuryRouter(await admin.getAddress());
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const wrongCommunityVault = await AcceptingReceiver.deploy();
    await wrongCommunityVault.waitForDeployment();

    await treasuryRouter.setCommunityRewardsVault(await wrongCommunityVault.getAddress());
    await expect(treasuryRouter.route(FINALIZE, STANDARD_LINKED, { value: 10_000n })).to.be.revertedWith(
      "squad route failed"
    );
  });
});
