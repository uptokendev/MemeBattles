import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

/**
 * Tests for the Ackee Printr W15 mitigation.
 *
 * Threat (verified in the previous commit on the unfixed contract):
 *   An attacker calls factory.createPair(token, WBNB) and donates WBNB into
 *   the resulting pair before graduation. UniswapV2Library.quote() reverts
 *   on a zero reserve, so router.addLiquidityETH reverts during _finalize,
 *   bricking the campaign.
 *
 * Fix (this commit):
 *   _finalize reads the pair's reserves before calling the router. If the
 *   pair has one-sided liquidity, _finalize bypasses the router: it wraps
 *   our native into WBNB, transfers WBNB + tokens directly to the pair, and
 *   mints LP via pair.mint(). Any attacker pre-seed becomes part of the
 *   pool's reserves at the burn address.
 */

const noLimitsTier = {
  cooldownSeconds: 0n,
  deploySlots: 0,
  maxLiveCampaigns: 0,
  creatorNoSellBlocks: 0n,
};

/// Reproduces the real-world W15 attack:
///   1. attacker calls factory.createPair(token, wbnb) — pair exists with no reserves
///   2. attacker wraps native into WBNB and transfers WBNB into the pair
///   3. attacker calls pair.sync() — reserves now match the donated balance
/// After sync, getReserves() returns one-sided reserves, which makes
/// router.addLiquidityETH revert via UniswapV2Library.quote().
async function preSeedPairWithWbnb(
  v2factory: any,
  tokenAddr: string,
  wbnbAddr: string,
  preSeedAmount: bigint,
  attacker: any
): Promise<{ pair: any; pairAddr: string }> {
  await v2factory.createPair(tokenAddr, wbnbAddr);
  const pairAddr = await v2factory.getPair(tokenAddr, wbnbAddr);
  const pair = await ethers.getContractAt("MockV2Pair", pairAddr);
  const wbnb = await ethers.getContractAt("MockWBNB", wbnbAddr);

  // Attacker wraps native into WBNB and donates it to the pair.
  await wbnb.connect(attacker).deposit({ value: preSeedAmount });
  await wbnb.connect(attacker).transfer(pairAddr, preSeedAmount);

  // Simulate UniswapV2Pair.sync(): reserves are updated to match balances.
  // setReserves convention in MockV2Pair: (r0, r1) with r0 mapping to
  // whichever address is canonically smaller (token0).
  const tokenIsToken0 = tokenAddr.toLowerCase() < wbnbAddr.toLowerCase();
  if (tokenIsToken0) {
    await pair.setReserves(0, preSeedAmount);
  } else {
    await pair.setReserves(preSeedAmount, 0);
  }

  return { pair, pairAddr };
}

describe("Pre-seeded pair attack on auto-finalize (Ackee W15 mitigation)", () => {
  it("auto-finalize SUCCEEDS even when pair has one-sided WBNB pre-seed", async () => {
    const { factory, owner, creator, alice, bob, v2factory } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, noLimitsTier);

    // Default fixture has graduationTarget = 1 BNB; a small buy will cross it.
    await factory.connect(creator).createCampaign({
      name: "Saved",
      symbol: "SAV",
      logoURI: "ipfs://sav",
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
    const tokenAddr = await campaign.token();
    const router = await ethers.getContractAt("MockRouter", await campaign.router());
    const wbnbAddr = await router.WETH();

    // ATTACKER: pre-create the pair and donate WBNB into it.
    const preSeedAmount = ethers.parseEther("5");
    const { pair } = await preSeedPairWithWbnb(
      v2factory, tokenAddr, wbnbAddr, preSeedAmount, bob
    );

    // VICTIM: trigger auto-finalize by crossing graduationTarget.
    const graduationTarget = await campaign.graduationTarget();
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: graduationTarget + 1n })
    ).to.not.be.reverted;

    expect(await campaign.launched()).to.eq(true);

    // Pair received both legs of LP — token side from us, WBNB side from us
    // PLUS the attacker's pre-seed donation. mint() ran successfully.
    expect(await pair.totalSupply()).to.be.gt(0n);
  });

  it("manual finalize() also succeeds under one-sided WBNB pre-seed", async () => {
    const { factory, owner, creator, alice, bob, v2factory } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, noLimitsTier);

    // High graduation target so we choose when to finalize manually.
    await factory.connect(creator).createCampaign({
      name: "Manual",
      symbol: "MAN",
      logoURI: "ipfs://man",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: ethers.parseEther("100"),
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: 0n,
      firstMinWalletCapWei: 0n,
      antiBotEnabled: false,
    });

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const tokenAddr = await campaign.token();
    const router = await ethers.getContractAt("MockRouter", await campaign.router());
    const wbnbAddr = await router.WETH();

    // Top up campaign with native to meet finalize threshold.
    await alice.sendTransaction({
      to: info.campaign,
      value: ethers.parseEther("100"),
    });

    // Pre-seed the pair.
    const { pair } = await preSeedPairWithWbnb(
      v2factory,
      tokenAddr,
      wbnbAddr,
      ethers.parseEther("5"),
      bob
    );

    // Creator finalizes — fix kicks in, direct mint succeeds.
    await expect(campaign.connect(creator).finalize(0, 0)).to.not.be.reverted;

    expect(await campaign.launched()).to.eq(true);
    expect(await pair.totalSupply()).to.be.gt(0n);
  });

  it("normal graduation (no pre-seed, pair created by router) still works via router path", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, noLimitsTier);

    await factory.connect(creator).createCampaign({
      name: "Normal",
      symbol: "NRM",
      logoURI: "ipfs://nrm",
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
    const graduationTarget = await campaign.graduationTarget();

    // No pre-seed: router path is used (pair doesn't exist yet OR has 0/0 reserves).
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: graduationTarget + 1n })
    ).to.not.be.reverted;

    expect(await campaign.launched()).to.eq(true);
  });
});
