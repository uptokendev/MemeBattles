import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const baseReq = (overrides: Record<string, unknown> = {}) => ({
  name: "LockedToken",
  symbol: "LCK",
  logoURI: "ipfs://logo",
  xAccount: "",
  website: "",
  extraLink: "",
  ...overrides,
});

describe("LaunchFactory security defaults lock", function () {
  it("locks production security defaults against later bypass toggles", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    expect(await factory.securityDefaultsLocked()).to.eq(false);
    await expect(factory.connect(owner).lockSecurityDefaults()).to.be.revertedWithCustomError(factory, "SecurityDefaultsDisabled");

    await factory.connect(creator).createCampaign(baseReq() as any);
    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.requireAuthorizedTrading()).to.eq(false);

    await factory.connect(owner).setRequireRouteAuthorization(true);
    await factory.connect(owner).setRequireAuthorizedTrading(true);

    await expect(factory.connect(owner).lockSecurityDefaults()).to.emit(factory, "SecurityDefaultsLockedEnabled");
    expect(await factory.securityDefaultsLocked()).to.eq(true);

    await expect(factory.connect(owner).lockSecurityDefaults()).to.be.revertedWithCustomError(factory, "SecurityDefaultsLocked");
    await expect(factory.connect(owner).setRequireRouteAuthorization(false)).to.be.revertedWithCustomError(factory, "SecurityDefaultsLocked");
    await expect(factory.connect(owner).setRequireAuthorizedTrading(false)).to.be.revertedWithCustomError(factory, "SecurityDefaultsLocked");

    await expect(factory.connect(owner).setCampaignRequireAuthorizedTrading(info.campaign, true))
      .to.emit(campaign, "RequireAuthorizedTradingUpdated")
      .withArgs(true);
    expect(await campaign.requireAuthorizedTrading()).to.eq(true);
    await expect(factory.connect(owner).setCampaignRequireAuthorizedTrading(info.campaign, false)).to.be.revertedWithCustomError(
      factory,
      "SecurityDefaultsLocked"
    );
  });
});
