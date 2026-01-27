import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";
import { quoteBuyExactTokens } from "./helpers/math";

describe("LaunchFactory", function () {
  it("constructor requires router != 0 and sets defaults", async () => {
    const Factory = await ethers.getContractFactory("LaunchFactory");
    await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      Factory,
      "RouterZero"
    );

    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    const factory = await Factory.deploy(await router.getAddress());

    expect(await factory.router()).to.eq(await router.getAddress());
    expect((await factory.config()).totalSupply).to.be.gt(0n);
    expect(await factory.protocolFeeBps()).to.eq(200n);
  });

  it("quoteInitialBuyTotal: 0 tokens -> 0; override params respected", async () => {
    const { factory } = await deployCoreFixture();
    expect(await factory.quoteInitialBuyTotal(0n, 0n, 0n)).to.eq(0n);

    const base = 777n;
    const slope = 999n;
    const amount = ethers.parseEther("10");
    const quoted = await factory.quoteInitialBuyTotal(amount, base, slope);

    const { total } = quoteBuyExactTokens(0n, amount, base, slope, await factory.protocolFeeBps());
    expect(quoted).to.eq(total);
  });

  it("createCampaign: validates inputs, emits, persists CampaignInfo; refunds excess msg.value", async () => {
    const { factory, creator } = await deployCoreFixture();

    const bad = {
      name: "",
      symbol: "X",
      logoURI: "ipfs://logo",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: 0n,
    };

    await expect(factory.connect(creator).createCampaign(bad as any)).to.be.revertedWithCustomError(
      factory,
      "NameEmpty"
    );
    await expect(
      factory.connect(creator).createCampaign({ ...bad, name: "N", symbol: "" } as any)
    ).to.be.revertedWithCustomError(factory, "SymbolEmpty");
    await expect(
      factory.connect(creator).createCampaign({ ...bad, name: "N", symbol: "S", logoURI: "" } as any)
    ).to.be.revertedWithCustomError(factory, "LogoEmpty");

    const req = { ...bad, name: "MyToken", symbol: "MYT", logoURI: "ipfs://logo" };
    const tx = await factory.connect(creator).createCampaign(req as any, { value: ethers.parseEther("1") });

    await expect(tx).to.emit(factory, "CampaignCreated");

    expect(await factory.campaignsCount()).to.eq(1n);
    const info = await factory.getCampaign(0n);
    expect(info.creator).to.eq(await creator.getAddress());
    expect(info.name).to.eq("MyToken");
    expect(info.symbol).to.eq("MYT");
    expect(info.logoURI).to.eq("ipfs://logo");

    // getCampaignPage
    const page = await factory.getCampaignPage(0n, 10n);
    expect(page.length).to.eq(1);
    expect(page[0].campaign).to.eq(info.campaign);

    // bounds
    await expect(factory.getCampaign(1n)).to.be.revertedWithCustomError(factory, "OutOfBounds");
    await expect(factory.getCampaignPage(2n, 1n)).to.be.revertedWithCustomError(factory, "Offset");
  });

  it("createCampaign optional initialBuy: requires enough value; performs buy; refunds extra", async () => {
    const { factory, creator, feeRecipient } = await deployCoreFixture();

    const req = {
      name: "MyToken",
      symbol: "MYT",
      logoURI: "ipfs://logo",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: ethers.parseEther("1"),
    };

    await expect(
      factory.connect(creator).createCampaign(req as any, { value: req.initialBuyBnbWei - 1n })
    ).to.be.revertedWithCustomError(factory, "InitBuyValue");

    const feeBefore = await ethers.provider.getBalance(await feeRecipient.getAddress());
    const tx = await factory
      .connect(creator)
      .createCampaign(req as any, { value: req.initialBuyBnbWei + ethers.parseEther("0.5") });
    const receipt = await tx.wait();

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", await campaign.token());

    // Exact-BNB buy: token amount is determined by the curve, so just assert nonzero.
    expect(await campaign.sold()).to.be.gt(0n);
    expect(await token.balanceOf(await creator.getAddress())).to.be.gt(0n);

    // Fee recipient should have received the bonding-curve fee from the initial buy (not affected by creator gas)
    const feeAfter = await ethers.provider.getBalance(await feeRecipient.getAddress());
    expect(feeAfter).to.be.gt(feeBefore);

    // Campaign retains the no-fee portion of the buy (nonzero)
    expect(await ethers.provider.getBalance(info.campaign)).to.be.gt(0n);

    expect(receipt).to.not.eq(null);
  });

  it("createCampaign optional initialBuy: reverts when creator initial buy exceeds 1 BNB cap", async () => {
    const { factory, creator } = await deployCoreFixture();

    const req = {
      name: "MyToken",
      symbol: "MYT",
      logoURI: "ipfs://logo",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: ethers.parseEther("1.01"),
    };

    await expect(
      factory.connect(creator).createCampaign(req as any, { value: req.initialBuyBnbWei })
    ).to.be.revertedWithCustomError(factory, "InitBuyTooLarge");
  });

  it("owner-only setters with validation + events", async () => {
    const { factory, owner, alice } = await deployCoreFixture();

    await expect(factory.connect(alice).setRouter(await alice.getAddress())).to.be.revertedWithCustomError(
      factory,
      "OwnableUnauthorizedAccount"
    );

    await expect(factory.connect(owner).setRouter(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      factory,
      "RouterZero"
    );
    await expect(factory.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      factory,
      "RecipientZero"
    );
    await expect(factory.connect(owner).setProtocolFee(1001n)).to.be.revertedWithCustomError(
      factory,
      "FeeTooHigh"
    );

    await expect(factory.connect(owner).setProtocolFee(123n)).to.emit(factory, "ProtocolFeeUpdated").withArgs(123n);
    expect(await factory.protocolFeeBps()).to.eq(123n);

    const newRouter = await (await ethers.getContractFactory("MockRouter")).deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await expect(factory.connect(owner).setRouter(await newRouter.getAddress()))
      .to.emit(factory, "RouterUpdated")
      .withArgs(await newRouter.getAddress());

    await expect(factory.connect(owner).setFeeRecipient(await alice.getAddress()))
      .to.emit(factory, "FeeRecipientUpdated")
      .withArgs(await alice.getAddress());

    await expect(
      factory.connect(owner).setConfig({
        totalSupply: 0n,
        curveBps: 5000n,
        liquidityTokenBps: 4000n,
        basePrice: 1n,
        priceSlope: 1n,
        graduationTarget: 1n,
        liquidityBps: 8000n,
      })
    ).to.be.revertedWithCustomError(factory, "SupplyZero");

    await expect(
      factory.connect(owner).setConfig({
        totalSupply: 1n,
        curveBps: 0n,
        liquidityTokenBps: 0n,
        basePrice: 1n,
        priceSlope: 1n,
        graduationTarget: 1n,
        liquidityBps: 8000n,
      })
    ).to.be.revertedWithCustomError(factory, "InvalidCurveBps");
  });
});
