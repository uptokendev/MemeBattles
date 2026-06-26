import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const baseReq = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

describe("LaunchFactory", function () {
  it("constructor requires router != 0 and sets defaults", async () => {
    const Factory = await ethers.getContractFactory("LaunchFactory");
    const [deployer] = await ethers.getSigners();
    await expect(Factory.deploy(ethers.ZeroAddress, await deployer.getAddress())).to.be.revertedWithCustomError(
      Factory,
      "RouterZero"
    );

    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await expect(Factory.deploy(await router.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(
      Factory,
      "RecipientZero"
    );

    const factory = await Factory.deploy(await router.getAddress(), await deployer.getAddress());
    expect(await factory.router()).to.eq(await router.getAddress());
    expect((await factory.config()).totalSupply).to.be.gt(0n);
    expect(await factory.protocolFeeBps()).to.eq(200n);
    expect(await factory.live()).to.eq(false);
  });

  it("live latch: createCampaign blocked until enabled; onlyOwner; enableLive is one-way", async () => {
    const [owner, creator, lpReceiver] = await ethers.getSigners();
    const V2Factory = await ethers.getContractFactory("MockV2Factory");
    const v2factory = await V2Factory.deploy();
    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy(await v2factory.getAddress(), await owner.getAddress());
    const Factory = await ethers.getContractFactory("LaunchFactory");
    const factory = await Factory.deploy(await router.getAddress(), await lpReceiver.getAddress());

    await expect(factory.connect(creator).createCampaign(baseReq() as any)).to.be.revertedWithCustomError(factory, "NotLive");
    await expect(factory.connect(creator).enableLive()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.connect(owner).enableLive()).to.emit(factory, "LiveEnabled");
    expect(await factory.live()).to.eq(true);
    await expect(factory.connect(owner).enableLive()).to.be.revertedWithCustomError(factory, "AlreadyLive");
    await expect(factory.connect(creator).createCampaign(baseReq() as any)).to.emit(factory, "CampaignCreated");
  });

  it("createCampaign has no creator initial buy path", async () => {
    const { factory, creator } = await deployCoreFixture();

    const tx = await factory.connect(creator).createCampaign(baseReq() as any);
    await expect(tx).to.emit(factory, "CampaignCreated");

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", await campaign.token());

    expect(await campaign.sold()).to.eq(0n);
    expect(await token.balanceOf(await creator.getAddress())).to.eq(0n);
  });

  it("createCampaign: validates inputs, emits, persists CampaignInfo", async () => {
    const { factory, creator } = await deployCoreFixture();

    await expect(factory.connect(creator).createCampaign(baseReq({ name: "" }) as any)).to.be.revertedWithCustomError(
      factory,
      "NameEmpty"
    );
    await expect(factory.connect(creator).createCampaign(baseReq({ symbol: "" }) as any)).to.be.revertedWithCustomError(
      factory,
      "SymbolEmpty"
    );
    await expect(factory.connect(creator).createCampaign(baseReq({ logoURI: "" }) as any)).to.be.revertedWithCustomError(
      factory,
      "LogoEmpty"
    );

    const tx = await factory.connect(creator).createCampaign(baseReq() as any);
    await expect(tx).to.emit(factory, "CampaignCreated");

    expect(await factory.campaignsCount()).to.eq(1n);
    const info = await factory.getCampaign(0n);
    expect(info.creator).to.eq(await creator.getAddress());
    expect(info.name).to.eq("MyToken");
    expect(info.symbol).to.eq("MYT");
    expect(info.logoURI).to.eq("ipfs://logo");

    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.lpReceiver()).to.eq("0x000000000000000000000000000000000000dEaD");

    const page = await factory.getCampaignPage(0n, 10n);
    expect(page.length).to.eq(1);
    expect(page[0].campaign).to.eq(info.campaign);

    await expect(factory.getCampaign(1n)).to.be.revertedWithCustomError(factory, "OutOfBounds");
    await expect(factory.getCampaignPage(2n, 1n)).to.be.revertedWithCustomError(factory, "Offset");
  });

  it("createCampaignAuthorized applies signer-approved recruiter route profiles", async () => {
    const { factory, creator, owner } = await deployCoreFixture();
    await factory.connect(owner).setRouteAuthority(await owner.getAddress());

    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const digest = ethers.solidityPackedKeccak256(
      ["string", "uint256", "address", "address", "uint8", "uint8", "uint64"],
      ["MWZ_CREATE_ROUTE_AUTH", chainId, await factory.getAddress(), await creator.getAddress(), 2, 2, deadline]
    );
    const signature = await owner.signMessage(ethers.getBytes(digest));

    await factory.connect(creator).createCampaignAuthorized(baseReq({ name: "RecruiterToken", symbol: "RCRT" }) as any, {
      tradeRouteProfile: 2,
      finalizeRouteProfile: 2,
      deadline,
      signature,
    });

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.tradeRouteProfile()).to.eq(2n);
    expect(await campaign.finalizeRouteProfile()).to.eq(2n);
  });

  it("owner-only setters with validation + events", async () => {
    const { factory, owner, alice } = await deployCoreFixture();

    await expect(factory.connect(alice).setRouter(await alice.getAddress())).to.be.revertedWithCustomError(
      factory,
      "OwnableUnauthorizedAccount"
    );
    await expect(factory.connect(owner).setRouter(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "RouterZero");
    await expect(factory.connect(owner).setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      factory,
      "RecipientZero"
    );
    await expect(factory.connect(owner).setProtocolFee(1001n)).to.be.revertedWithCustomError(factory, "FeeTooHigh");
    await expect(factory.connect(owner).setProtocolFee(24n)).to.be.revertedWithCustomError(factory, "FeeTooLowForLeague");

    await expect(factory.connect(owner).setProtocolFee(123n)).to.emit(factory, "ProtocolFeeUpdated").withArgs(123n);
    expect(await factory.protocolFeeBps()).to.eq(123n);

    const newRouter = await (await ethers.getContractFactory("MockRouter")).deploy(ethers.ZeroAddress, ethers.ZeroAddress);
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

  it("locks economic and routing setters after the first campaign exists", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    await factory.connect(creator).createCampaign(baseReq({ name: "Locked", symbol: "LCK" }) as any);

    const newRouter = await (await ethers.getContractFactory("MockRouter")).deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await expect(factory.connect(owner).setRouter(await newRouter.getAddress())).to.be.revertedWithCustomError(factory, "FactoryLocked");
    await expect(factory.connect(owner).setFeeRecipient(await alice.getAddress())).to.be.revertedWithCustomError(factory, "FactoryLocked");
    await expect(factory.connect(owner).setProtocolFee(123n)).to.be.revertedWithCustomError(factory, "FactoryLocked");
    await expect(
      factory.connect(owner).setConfig({
        totalSupply: 1n,
        curveBps: 5000n,
        liquidityTokenBps: 4000n,
        basePrice: 1n,
        priceSlope: 1n,
        graduationTarget: 1n,
        liquidityBps: 8000n,
      })
    ).to.be.revertedWithCustomError(factory, "FactoryLocked");
  });

  it("createCampaign: rejects override params above bounds", async () => {
    const { factory, creator } = await deployCoreFixture();

    const baseTooHigh = ethers.parseEther("1001");
    const targetTooHigh = ethers.parseEther("1000001");
    const slopeTooHigh = 10n ** 36n + 1n;

    await expect(factory.connect(creator).createCampaign(baseReq({ basePrice: baseTooHigh }) as any)).to.be.revertedWithCustomError(
      factory,
      "ParamTooHigh"
    );
    await expect(factory.connect(creator).createCampaign(baseReq({ priceSlope: slopeTooHigh }) as any)).to.be.revertedWithCustomError(
      factory,
      "ParamTooHigh"
    );
    await expect(
      factory.connect(creator).createCampaign(baseReq({ graduationTarget: targetTooHigh }) as any)
    ).to.be.revertedWithCustomError(factory, "ParamTooHigh");
  });
});
