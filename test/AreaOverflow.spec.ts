import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

/**
 * Tests for Ackee Printr audit findings L4 / W10:
 *   "Possible overflow in print function" — silent wraparound when curve
 *   parameters allow x*x in the bonding-curve area function to exceed
 *   uint256.
 *
 * Today our `unchecked { square = x * x; }` block in LaunchCampaign._area
 * silently wraps around if `totalSupply` is configured beyond ~3.4e38.
 * Default config (1e27 wei = 1B tokens) is safe, but `setConfig` allows
 * any value. A compromised owner key could set totalSupply huge and
 * brick all curve quotes / graduation detection without any visible error.
 *
 * Fix: cap totalSupply via MAX_TOTAL_SUPPLY in _validateConfig. 1e30 wei
 * (1 trillion 18-decimal tokens) keeps x*x at ~1e60 — safely within
 * uint256 — while still well above any realistic meme launch.
 */
describe("MAX_TOTAL_SUPPLY (Ackee L4/W10)", () => {
  it("setConfig reverts when totalSupply exceeds MAX_TOTAL_SUPPLY", async () => {
    const { factory, owner } = await deployCoreFixture();

    const tooLarge = 10n ** 31n; // > 1e30 cap
    await expect(
      factory.connect(owner).setConfig({
        totalSupply: tooLarge,
        curveBps: 8800,
        liquidityTokenBps: 1000,
        basePrice: 10n ** 13n,
        priceSlope: 10n ** 9n,
        graduationTarget: ethers.parseEther("50"),
        liquidityBps: 8000,
      })
    ).to.be.revertedWithCustomError(factory, "ParamTooHigh");
  });

  it("setConfig accepts totalSupply at the upper bound", async () => {
    const { factory, owner } = await deployCoreFixture();

    await expect(
      factory.connect(owner).setConfig({
        totalSupply: 10n ** 30n,
        curveBps: 8800,
        liquidityTokenBps: 1000,
        basePrice: 10n ** 13n,
        priceSlope: 10n ** 9n,
        graduationTarget: ethers.parseEther("50"),
        liquidityBps: 8000,
      })
    ).to.not.be.reverted;
  });

  it("setConfig accepts default 1B-token supply (1e27)", async () => {
    const { factory, owner } = await deployCoreFixture();

    await expect(
      factory.connect(owner).setConfig({
        totalSupply: ethers.parseEther("1000000000"),
        curveBps: 8800,
        liquidityTokenBps: 1000,
        basePrice: 10n ** 13n,
        priceSlope: 10n ** 9n,
        graduationTarget: ethers.parseEther("50"),
        liquidityBps: 8000,
      })
    ).to.not.be.reverted;
  });
});
