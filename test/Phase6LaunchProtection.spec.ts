import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const TOKEN = ethers.parseEther("1");
const ROUTE_PROFILE = 1;

const req = (overrides: Record<string, unknown> = {}) => ({
  name: "ProtectedToken",
  symbol: "PROT",
  logoURI: "ipfs://logo",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: ethers.parseEther("0.001"),
  priceSlope: 1n,
  graduationTarget: ethers.parseEther("100"),
  lpReceiver: ethers.ZeroAddress,
  ...overrides,
});

async function createProtectedCampaign(overrides: Record<string, unknown> = {}) {
  const fixture = await deployCoreFixture();
  const { factory, owner, creator } = fixture;

  await factory.connect(owner).setRouteAuthority(await owner.getAddress());
  await factory
    .connect(owner)
    .setLaunchProtectionConfig(4n, ethers.parseEther("0.0015"), ethers.parseEther("0.0025"));
  await factory.connect(creator).createCampaign(req(overrides) as any);

  const info = await factory.getCampaign(0n);
  const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
  const token = await ethers.getContractAt("LaunchToken", await campaign.token());

  return { ...fixture, campaign, token };
}

async function routeSignature(authority: any, campaign: any, actor: any, routeProfile = ROUTE_PROFILE) {
  const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint8", "uint64"],
    ["MWZ_ROUTE_TRADE_AUTH", chainId, await campaign.getAddress(), await actor.getAddress(), routeProfile, deadline]
  );
  const signature = await authority.signMessage(ethers.getBytes(digest));
  return { deadline, signature, routeProfile };
}

async function buyAuthorized(campaign: any, authority: any, buyer: any, amount = TOKEN) {
  const quote = await campaign.quoteBuyExactTokens(amount);
  const auth = await routeSignature(authority, campaign, buyer);
  await campaign.connect(buyer).buyExactTokensAuthorized(amount, quote, auth.routeProfile, auth.deadline, auth.signature, {
    value: quote,
  });
  return quote;
}

describe("Phase 6 launch protection", function () {
  it("blocks direct buys during the protected blocks and allows signed route buys", async () => {
    const { campaign, owner, alice } = await createProtectedCampaign();
    const currentBlock = await ethers.provider.getBlockNumber();

    expect(await campaign.launchProtectionEndBlock()).to.be.gt(currentBlock);
    await expect(
      campaign.connect(alice).buyExactBnb(0n, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWithCustomError(campaign, "AuthorizedTradingRequired");

    await expect(buyAuthorized(campaign, owner, alice)).to.emit(campaign, "TokensPurchased");
    expect(await campaign.protectedBuyWei(await alice.getAddress())).to.be.gt(0n);
  });

  it("enforces per-buy and cumulative wallet caps so split buys cannot bypass the window", async () => {
    const { campaign, owner, alice, bob } = await createProtectedCampaign();
    const oversizedQuote = await campaign.quoteBuyExactTokens(2n * TOKEN);
    const oversizedAuth = await routeSignature(owner, campaign, bob);

    await expect(
      campaign.connect(bob).buyExactTokensAuthorized(
        2n * TOKEN,
        oversizedQuote,
        oversizedAuth.routeProfile,
        oversizedAuth.deadline,
        oversizedAuth.signature,
        { value: oversizedQuote }
      )
    ).to.be.revertedWithCustomError(campaign, "LaunchProtectionBuyLimit");

    await buyAuthorized(campaign, owner, alice);
    await buyAuthorized(campaign, owner, alice);
    await expect(buyAuthorized(campaign, owner, alice)).to.be.revertedWithCustomError(
      campaign,
      "LaunchProtectionWalletLimit"
    );
  });

  it("keeps sells route-authorized during the protected window", async () => {
    const { campaign, token, owner, alice } = await createProtectedCampaign();
    await buyAuthorized(campaign, owner, alice);
    await token.connect(alice).approve(await campaign.getAddress(), TOKEN);

    await expect(campaign.connect(alice).sellExactTokens(TOKEN, 0n)).to.be.revertedWithCustomError(
      campaign,
      "AuthorizedTradingRequired"
    );

    const auth = await routeSignature(owner, campaign, alice);
    await expect(
      campaign.connect(alice).sellExactTokensAuthorized(TOKEN, 0n, auth.routeProfile, auth.deadline, auth.signature)
    ).to.emit(campaign, "TokensSold");
  });

  it("expires at the block boundary and cannot be restarted after campaigns exist", async () => {
    const { campaign, factory, owner, alice } = await createProtectedCampaign();

    await expect(
      factory.connect(owner).setLaunchProtectionConfig(8n, ethers.parseEther("0.01"), ethers.parseEther("0.02"))
    ).to.be.revertedWithCustomError(factory, "FactoryLocked");

    for (let i = 0; i < 5; i++) {
      await ethers.provider.send("evm_mine", []);
    }

    await expect(
      campaign.connect(alice).buyExactBnb(0n, { value: ethers.parseEther("0.01") })
    ).to.emit(campaign, "TokensPurchased");
  });
});
