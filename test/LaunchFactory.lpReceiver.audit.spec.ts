import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const baseReq = (overrides: Record<string, unknown> = {}) => ({
  name: "LpReceiverToken",
  symbol: "LPR",
  logoURI: "ipfs://lp-receiver-logo",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: 0n,
  priceSlope: 0n,
  graduationTarget: 0n,
  lpReceiver: ethers.ZeroAddress,
  ...overrides,
});

describe("LaunchFactory LP receiver hardening", function () {
  it("rejects non-locker LP receivers and accepts the permanent locker", async () => {
    const { factory, creator, alice } = await deployCoreFixture();
    const locker = await factory.permanentLpLocker();

    await expect(
      factory.connect(creator).createCampaign(baseReq({ lpReceiver: await alice.getAddress() }) as any)
    ).to.be.revertedWithCustomError(factory, "InvalidLpReceiver");

    await expect(
      factory.connect(creator).createCampaign(baseReq({ name: "LockerReceiver", symbol: "LOCK", lpReceiver: locker }) as any)
    ).to.emit(factory, "CampaignCreated");

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.lpReceiver()).to.eq(locker);
  });
});
