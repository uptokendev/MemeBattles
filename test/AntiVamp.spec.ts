import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployCoreFixture } from "./fixtures/core";

/**
 * Anti-vamp ticker + logoURI cooldown.
 *
 * Background: Salus four.meme Finding 6 ("different tokens may have the
 * same symbol") was acknowledged but never fixed by four.meme. Printr
 * ships a 48h ticker+image lockout. The same vector applies to us — a
 * malicious creator can clone a legitimate launch's symbol and logo in
 * the same hour and hijack buyer attention.
 *
 * Fix: factory blocks new campaigns whose (symbol, logoURI) hash matches
 * a recent campaign for `antiVampLockout` seconds (default 48h).
 */

const baseReq = {
  name: "Doge",
  symbol: "DOGE",
  logoURI: "ipfs://logo",
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
};

describe("Anti-vamp symbol+logo cooldown (Salus F6, Printr-style)", () => {
  it("blocks a second creation with same symbol+logoURI within lockout window", async () => {
    const { factory, creator, alice } = await deployCoreFixture();

    await factory.connect(creator).createCampaign(baseReq);

    await expect(factory.connect(alice).createCampaign(baseReq))
      .to.be.revertedWithCustomError(factory, "AntiVampLocked");
  });

  it("allows different symbol+logoURI combos in parallel", async () => {
    const { factory, creator, alice } = await deployCoreFixture();

    await factory.connect(creator).createCampaign(baseReq);

    await expect(
      factory.connect(alice).createCampaign({ ...baseReq, symbol: "PEPE" })
    ).to.emit(factory, "CampaignCreated");

    await expect(
      factory.connect(alice).createCampaign({ ...baseReq, logoURI: "ipfs://other" })
    ).to.emit(factory, "CampaignCreated");
  });

  it("releases the lock after the cooldown elapses", async () => {
    const { factory, creator, alice } = await deployCoreFixture();

    await factory.connect(creator).createCampaign(baseReq);

    await time.increase(48 * 3600 + 1);

    await expect(factory.connect(alice).createCampaign(baseReq))
      .to.emit(factory, "CampaignCreated");
  });

  it("admin can update the lockout duration", async () => {
    const { factory, owner } = await deployCoreFixture();

    await expect(factory.connect(owner).setAntiVampLockout(24 * 3600))
      .to.emit(factory, "AntiVampLockoutUpdated")
      .withArgs(24 * 3600);

    expect(await factory.antiVampLockout()).to.eq(24 * 3600);
  });

  it("admin cannot set lockout above MAX_ANTI_VAMP_LOCKOUT", async () => {
    const { factory, owner } = await deployCoreFixture();
    const tooLong = 30 * 24 * 3600 + 1;
    await expect(factory.connect(owner).setAntiVampLockout(tooLong))
      .to.be.revertedWithCustomError(factory, "ParamTooHigh");
  });

  it("non-owner cannot update lockout", async () => {
    const { factory, alice } = await deployCoreFixture();
    await expect(factory.connect(alice).setAntiVampLockout(3600))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });
});
