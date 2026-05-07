import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

/**
 * Verification test for Ackee Printr audit finding W15:
 *   "Attacker can front-run the liquidity pool creation and make graduation fail"
 *
 * In Uniswap V2 / PancakeSwap V2, anyone can call factory.createPair() for any
 * (token, wrappedNative) pair, then transfer wrappedNative directly into the
 * resulting pair contract. This produces a pair with one-sided reserves
 * (reserveToken = 0, reserveWeth > 0).
 *
 * UniswapV2Router02._addLiquidity calls UniswapV2Library.quote() when reserves
 * are non-zero, and quote() reverts with INSUFFICIENT_LIQUIDITY when either
 * reserve is zero. So a pre-seeded pair makes router.addLiquidityETH() revert.
 *
 * Our LaunchCampaign._finalize calls router.addLiquidityETH(token, ..., 0, 0, ...).
 * If an attacker pre-seeds the pair with WBNB-equivalent reserves, _finalize
 * reverts, which reverts the buy that triggered auto-finalize, which permanently
 * bricks the campaign at the graduation threshold.
 *
 * MockRouter has been upgraded to mirror this behaviour: it reads the registered
 * pair's reserves and reverts InsufficientLiquidity when reserves are one-sided.
 *
 * This file documents the threat surface only. The fix and its test live in
 * Task 2 of docs/superpowers/plans/2026-04-22-pre-mainnet-hardening.md.
 */

describe("Pre-seeded pair attack on auto-finalize (Ackee W15)", () => {
  it("auto-finalize REVERTS when pair has one-sided WBNB reserves", async () => {
    const { factory, owner, creator, alice, v2factory } = await deployCoreFixture();

    // Use a tier with no protections so the buy path is the only thing under test.
    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 0,
      creatorNoSellBlocks: 0n,
    });

    // Default fixture has graduationTarget = 1 BNB and a small curve. A small
    // buy will cross the target and trigger auto-finalize.
    await factory.connect(creator).createCampaign({
      name: "Bricked",
      symbol: "BRK",
      logoURI: "ipfs://brk",
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
    const router = await ethers.getContractAt(
      "MockRouter",
      await campaign.router()
    );
    const wbnbAddr = await router.WETH();

    // ATTACKER: deploy a fresh pair, register it in the factory, and pre-seed
    // it with one-sided WBNB-equivalent reserves. In real life the attacker
    // calls IPancakeFactory.createPair(...) and transfers WBNB to the pair —
    // here we use the mock primitive setReserves(tokenAmt, wbnbAmt).
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();
    await v2factory.setPair(tokenAddr, wbnbAddr, await pair.getAddress());
    await pair.setReserves(0, ethers.parseEther("5"));

    // VICTIM: trigger auto-finalize with a buy that crosses graduationTarget.
    // The router will revert InsufficientLiquidity because reserves are
    // one-sided, which propagates up through _finalize and reverts the buy.
    const graduationTarget = await campaign.graduationTarget();
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: graduationTarget + 1n })
    ).to.be.revertedWithCustomError(router, "InsufficientLiquidity");

    // Campaign is bricked: launched stayed false, but every subsequent buy
    // that would re-trigger auto-finalize will hit the same revert.
    expect(await campaign.launched()).to.eq(false);
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: graduationTarget + 1n })
    ).to.be.revertedWithCustomError(router, "InsufficientLiquidity");
  });

  it("manual finalize() also reverts under the pre-seeded pair attack", async () => {
    const { factory, owner, creator, alice, v2factory } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 0,
      creatorNoSellBlocks: 0n,
    });

    // High graduation target so we choose when to finalize manually.
    await factory.connect(creator).createCampaign({
      name: "Bricked2",
      symbol: "BRK2",
      logoURI: "ipfs://brk2",
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
    const router = await ethers.getContractAt(
      "MockRouter",
      await campaign.router()
    );
    const wbnbAddr = await router.WETH();

    // Top up the campaign with native tokens so finalize threshold is met.
    await alice.sendTransaction({
      to: info.campaign,
      value: ethers.parseEther("100"),
    });

    // Pre-seed the pair with one-sided WBNB.
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();
    await v2factory.setPair(tokenAddr, wbnbAddr, await pair.getAddress());
    await pair.setReserves(0, ethers.parseEther("5"));

    // Creator-initiated finalize hits the same router revert.
    await expect(
      campaign.connect(creator).finalize(0, 0)
    ).to.be.revertedWithCustomError(router, "InsufficientLiquidity");
    expect(await campaign.launched()).to.eq(false);
  });
});
