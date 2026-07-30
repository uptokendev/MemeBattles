import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

/**
 * Per-campaign and global buy pause flags. Modeled on:
 *   - Four.meme's `suspendTrading(token, bool)` per-token pause
 *   - Pump.fun's `disable_flags` global bitmask
 *
 * Sells are deliberately NEVER blocked — holders must always have an
 * exit, even during an incident response or for an abandoned campaign.
 */

const noLimitsTier = {
  cooldownSeconds: 0n,
  deploySlots: 0,
  maxLiveCampaigns: 0,
  creatorNoSellBlocks: 0n,
};

async function setup() {
  const fx = await deployCoreFixture();
  const { factory, owner, creator } = fx;

  await factory.connect(owner).setTierConfig(0, noLimitsTier);

  // High-supply config so a small initial buy doesn't auto-finalize.
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000000"),
    curveBps: 8800,
    liquidityTokenBps: 1000,
    basePrice: 10n ** 10n,
    priceSlope: 10n ** 6n,
    graduationTarget: ethers.parseEther("1000"),
    liquidityBps: 8000,
  });

  await factory.connect(creator).createCampaign({
    name: "P",
    symbol: "P",
    logoURI: "ipfs://p",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: 0n,
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
    firstMinWalletCapWei: 0n,
    antiBotEnabled: false,
  });

  const info = await factory.getCampaign(0);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  return { ...fx, campaign };
}

describe("Per-campaign pause", () => {
  it("only factory owner can pause a campaign", async () => {
    const { factory, campaign, alice } = await setup();
    await expect(
      factory.connect(alice).setCampaignPaused(await campaign.getAddress(), true)
    ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });

  it("only factory can call setPaused on a campaign directly", async () => {
    const { campaign, alice } = await setup();
    await expect(campaign.connect(alice).setPaused(true))
      .to.be.revertedWith("ONLY_FACTORY");
  });

  it("setCampaignPaused reverts on unregistered campaign", async () => {
    const { factory, owner, alice } = await setup();
    await expect(
      factory.connect(owner).setCampaignPaused(await alice.getAddress(), true)
    ).to.be.revertedWithCustomError(factory, "NotRegistered");
  });

  it("paused campaign blocks buyExactBnb", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWithCustomError(campaign, "CampaignPaused");
  });

  it("paused campaign still allows sellExactTokens (exit path)", async () => {
    const { factory, campaign, owner, alice } = await setup();

    // Buy first while unpaused.
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") });
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const bal = await token.balanceOf(await alice.getAddress());

    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);
    await token.connect(alice).approve(await campaign.getAddress(), bal);
    await expect(campaign.connect(alice).sellExactTokens(bal, 0)).to.not.be.reverted;
  });

  it("unpausing restores buys", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), false);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") })
    ).to.not.be.reverted;
  });

  it("setPaused emits PausedSet event", async () => {
    const { factory, campaign, owner } = await setup();
    await expect(factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true))
      .to.emit(campaign, "PausedSet")
      .withArgs(true);
  });
});

describe("Global buy pause", () => {
  it("only owner can set global pause", async () => {
    const { factory, alice } = await setup();
    await expect(factory.connect(alice).setGlobalPauseBuys(true))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });

  it("setGlobalPauseBuys emits GlobalPauseBuysSet event", async () => {
    const { factory, owner } = await setup();
    await expect(factory.connect(owner).setGlobalPauseBuys(true))
      .to.emit(factory, "GlobalPauseBuysSet")
      .withArgs(true);
  });

  it("global pause blocks buys on a registered campaign", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setGlobalPauseBuys(true);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWithCustomError(campaign, "CampaignPaused");
  });

  it("global pause does not block sells", async () => {
    const { factory, campaign, owner, alice } = await setup();

    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") });
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const bal = await token.balanceOf(await alice.getAddress());

    await factory.connect(owner).setGlobalPauseBuys(true);

    await token.connect(alice).approve(await campaign.getAddress(), bal);
    await expect(campaign.connect(alice).sellExactTokens(bal, 0)).to.not.be.reverted;
  });

  it("disabling global pause restores buys", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setGlobalPauseBuys(true);
    await factory.connect(owner).setGlobalPauseBuys(false);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") })
    ).to.not.be.reverted;
  });
});
