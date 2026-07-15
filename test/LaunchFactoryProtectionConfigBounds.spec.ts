import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const MAX_LAUNCH_PROTECTION_BLOCKS = 28_800n;
const MAX_LAUNCH_PROTECTION_BUY_WEI = ethers.parseEther("1000");
const MAX_LAUNCH_PROTECTION_WALLET_WEI = ethers.parseEther("1000");

async function expectLaunchProtectionConfig(factory: any, blocks: bigint, maxBuyWei: bigint, maxWalletWei: bigint) {
  const config = await factory.launchProtectionConfig();
  expect(config.blocks_).to.eq(blocks);
  expect(config.maxBuyWei).to.eq(maxBuyWei);
  expect(config.maxWalletWei).to.eq(maxWalletWei);
}

describe("LaunchFactory launch protection config bounds", function () {
  it("accepts disabled limits and documented upper bounds before the factory is locked", async () => {
    const { factory, owner } = await deployCoreFixture();

    await expect(factory.connect(owner).setLaunchProtectionConfig(0n, 0n, 0n))
      .to.emit(factory, "LaunchProtectionConfigUpdated")
      .withArgs(0n, 0n, 0n);
    await expectLaunchProtectionConfig(factory, 0n, 0n, 0n);

    await expect(
      factory
        .connect(owner)
        .setLaunchProtectionConfig(
          MAX_LAUNCH_PROTECTION_BLOCKS,
          MAX_LAUNCH_PROTECTION_BUY_WEI,
          MAX_LAUNCH_PROTECTION_WALLET_WEI
        )
    )
      .to.emit(factory, "LaunchProtectionConfigUpdated")
      .withArgs(MAX_LAUNCH_PROTECTION_BLOCKS, MAX_LAUNCH_PROTECTION_BUY_WEI, MAX_LAUNCH_PROTECTION_WALLET_WEI);

    await expectLaunchProtectionConfig(
      factory,
      MAX_LAUNCH_PROTECTION_BLOCKS,
      MAX_LAUNCH_PROTECTION_BUY_WEI,
      MAX_LAUNCH_PROTECTION_WALLET_WEI
    );
  });

  it("accepts independent per-buy and wallet caps so either guard can be the tighter bound", async () => {
    const { factory, owner } = await deployCoreFixture();
    const maxBuyWei = ethers.parseEther("1");
    const maxWalletWei = ethers.parseEther("0.000015");

    await expect(factory.connect(owner).setLaunchProtectionConfig(30n, maxBuyWei, maxWalletWei))
      .to.emit(factory, "LaunchProtectionConfigUpdated")
      .withArgs(30n, maxBuyWei, maxWalletWei);
    await expectLaunchProtectionConfig(factory, 30n, maxBuyWei, maxWalletWei);
  });

  it("rejects every launch protection bound overflow", async () => {
    const { factory, owner } = await deployCoreFixture();

    await expect(
      factory.connect(owner).setLaunchProtectionConfig(MAX_LAUNCH_PROTECTION_BLOCKS + 1n, 0n, 0n)
    ).to.be.revertedWithCustomError(factory, "LaunchProtectionBounds");

    await expect(
      factory.connect(owner).setLaunchProtectionConfig(0n, MAX_LAUNCH_PROTECTION_BUY_WEI + 1n, 0n)
    ).to.be.revertedWithCustomError(factory, "LaunchProtectionBounds");

    await expect(
      factory.connect(owner).setLaunchProtectionConfig(0n, 0n, MAX_LAUNCH_PROTECTION_WALLET_WEI + 1n)
    ).to.be.revertedWithCustomError(factory, "LaunchProtectionBounds");
  });
});
