import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

function makeReq(overrides: Record<string, any> = {}) {
  return {
    name: "TestToken",
    symbol: "TST",
    logoURI: "ipfs://logo",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: 0n,
    priceSlope: 0n,
    graduationTarget: ethers.parseEther("100"), // high target to avoid auto-finalize
    lpReceiver: ethers.ZeroAddress,
    initialBuyBnbWei: 0n,
    firstMinWalletCapWei: 0n,
    antiBotEnabled: false,
    ...overrides,
  };
}

// Default unlimited tier config (every check disabled).
const NO_LIMITS = {
  cooldownSeconds: 0n,
  deploySlots: 0,
  maxLiveCampaigns: 0,
  creatorNoSellBlocks: 0n,
};

describe("Protection Framework", function () {
  // ── Tier config & management ──

  it("setTierConfig + setCreatorTier: owner only, validates tier <= 2", async () => {
    const { factory, owner, alice } = await deployCoreFixture();

    const cfg = {
      cooldownSeconds: 3600n,
      deploySlots: 2,
      maxLiveCampaigns: 2,
      creatorNoSellBlocks: 100n,
    };

    await expect(factory.connect(alice).setTierConfig(0, cfg))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");

    await expect(factory.connect(owner).setTierConfig(0, cfg))
      .to.emit(factory, "TierConfigUpdated");

    const stored = await factory.tierConfig(0);
    expect(stored.cooldownSeconds).to.eq(cfg.cooldownSeconds);
    expect(stored.deploySlots).to.eq(cfg.deploySlots);

    await expect(factory.connect(owner).setCreatorTier(await alice.getAddress(), 3))
      .to.be.revertedWithCustomError(factory, "InvalidTier");

    await expect(factory.connect(owner).setCreatorTier(await alice.getAddress(), 1))
      .to.emit(factory, "CreatorTierUpdated")
      .withArgs(await alice.getAddress(), 1);

    expect(await factory.creatorTier(await alice.getAddress())).to.eq(1);
  });

  it("batchSetCreatorTier: sets multiple tiers, validates length mismatch", async () => {
    const { factory, owner, alice, bob } = await deployCoreFixture();

    await expect(
      factory.connect(owner).batchSetCreatorTier(
        [await alice.getAddress()],
        [1, 2]
      )
    ).to.be.revertedWithCustomError(factory, "LengthMismatch");

    await factory.connect(owner).batchSetCreatorTier(
      [await alice.getAddress(), await bob.getAddress()],
      [1, 2]
    );

    expect(await factory.creatorTier(await alice.getAddress())).to.eq(1);
    expect(await factory.creatorTier(await bob.getAddress())).to.eq(2);
  });

  // ── Per-slot cooldown ──

  it("createCampaign: per-slot cooldown — N concurrent deploys allowed, (N+1)th blocked, slot frees after timeout", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 3600n, // 1h per slot
      deploySlots: 3,
      maxLiveCampaigns: 10, // high so it doesn't interfere with this test
      creatorNoSellBlocks: 0n,
    });

    // Three deploys in a row — each fills its own slot, all succeed.
    await factory.connect(creator).createCampaign(makeReq({ symbol: "T1" }));
    await factory.connect(creator).createCampaign(makeReq({ symbol: "T2" }));
    await factory.connect(creator).createCampaign(makeReq({ symbol: "T3" }));

    // Fourth deploy is blocked: all 3 slots in cooldown.
    await expect(
      factory.connect(creator).createCampaign(makeReq({ symbol: "T4" }))
    ).to.be.revertedWithCustomError(factory, "CooldownActive");

    // Advance past cooldown — slot 1 (oldest) is now free.
    await time.increase(3601);

    // Fourth deploy now succeeds, reusing slot 1.
    await expect(
      factory.connect(creator).createCampaign(makeReq({ symbol: "T4" }))
    ).to.emit(factory, "CampaignCreated");
  });

  it("createCampaign: per-slot cooldown disabled when deploySlots = 0", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    // deploySlots=0 means cooldown is disabled; only maxLive applies.
    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 99999n, // would be huge if active
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(makeReq({ symbol: "A1" }));
    await expect(
      factory.connect(creator).createCampaign(makeReq({ symbol: "A2" }))
    ).to.emit(factory, "CampaignCreated");
  });

  // ── Max live campaigns ──

  it("createCampaign: reverts when max live campaigns reached", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 1,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(makeReq({ symbol: "M1" }));

    await expect(
      factory.connect(creator).createCampaign(makeReq({ symbol: "M2" }))
    ).to.be.revertedWithCustomError(factory, "MaxLiveCampaignsReached");
  });

  // ── Premium mode tier gating ──

  it("createCampaign: reverts premium modes for base tier (tier 0)", async () => {
    const { factory, creator } = await deployCoreFixture();

    await expect(
      factory.connect(creator).createCampaign(
        makeReq({ firstMinWalletCapWei: ethers.parseEther("0.5") })
      )
    ).to.be.revertedWithCustomError(factory, "PremiumTierRequired");

    await expect(
      factory.connect(creator).createCampaign(
        makeReq({ antiBotEnabled: true })
      )
    ).to.be.revertedWithCustomError(factory, "PremiumTierRequired");
  });

  it("createCampaign: allows premium modes for tier >= 1", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setCreatorTier(await creator.getAddress(), 1);

    await expect(
      factory.connect(creator).createCampaign(
        makeReq({ firstMinWalletCapWei: ethers.parseEther("0.5") })
      )
    ).to.emit(factory, "CampaignCreated");
  });

  // ── Creator no-sell window ──

  it("sellExactTokens: blocks creator during no-sell window, allows non-creator sells, unblocks after window", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    // Use a higher-supply config so a small initial buy doesn't auto-finalize.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000000"),
      curveBps: 8800,
      liquidityTokenBps: 1000,
      basePrice: 10n ** 10n,
      priceSlope: 10n ** 6n,
      graduationTarget: ethers.parseEther("1000"),
      liquidityBps: 8000,
    });

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 50n,
    });

    const tx = await factory.connect(creator).createCampaign(
      makeReq({
        initialBuyBnbWei: ethers.parseEther("0.001"),
        graduationTarget: ethers.parseEther("1000"),
      }),
      { value: ethers.parseEther("0.001") }
    );
    await tx.wait();

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);

    const creatorBalance = await token.balanceOf(await creator.getAddress());
    expect(creatorBalance).to.be.gt(0n);
    expect(await campaign.launched()).to.eq(false);

    await token.connect(creator).approve(info.campaign, creatorBalance);
    await expect(
      campaign.connect(creator).sellExactTokens(creatorBalance / 2n, 0)
    ).to.be.revertedWithCustomError(campaign, "CreatorSellLocked");

    // Non-creator buy + sell works during the creator's lock window.
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") });
    const aliceBalance = await token.balanceOf(await alice.getAddress());
    await token.connect(alice).approve(info.campaign, aliceBalance);
    await campaign.connect(alice).sellExactTokens(aliceBalance / 2n, 0);

    // Advance past the no-sell window.
    await mine(51);

    await expect(
      campaign.connect(creator).sellExactTokens(creatorBalance / 4n, 0)
    ).to.not.be.reverted;
  });

  // ── Anti-bot ──

  it("buyExactBnb: anti-bot stamps lastBuyBlock for the buyer", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    await factory.connect(owner).setCreatorTier(await creator.getAddress(), 1);
    await factory.connect(owner).setTierConfig(1, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(makeReq({ antiBotEnabled: true }));

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") });

    // Hardhat default automines a new block per tx, so we can't reproduce the
    // same-block reverts here without automining off. Asserting the state
    // variable is updated proves the wallet was stamped for this block.
    expect(await campaign.lastBuyBlock(await alice.getAddress())).to.be.gt(0n);
  });

  // ── First-minute wallet cap ──

  it("buyExactBnb: enforces firstMinWalletCap cumulatively in the first 60s", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    // Use a higher-supply config so small buys don't sell out the curve and
    // trigger auto-finalize before we get to assert the cap.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000000"),
      curveBps: 8800,
      liquidityTokenBps: 1000,
      basePrice: 10n ** 10n,
      priceSlope: 10n ** 6n,
      graduationTarget: ethers.parseEther("1000"),
      liquidityBps: 8000,
    });

    await factory.connect(owner).setCreatorTier(await creator.getAddress(), 1);
    await factory.connect(owner).setTierConfig(1, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(
      makeReq({
        firstMinWalletCapWei: ethers.parseEther("0.005"),
        graduationTarget: ethers.parseEther("1000"),
      })
    );

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    // First small buy succeeds.
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.003") });

    // Cumulative second buy that would push past the cap reverts.
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWithCustomError(campaign, "WalletCapExceeded");

    // After the first-minute window ends, the cap no longer applies.
    await time.increase(61);
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") })
    ).to.not.be.reverted;
  });

  // ── State tracking ──

  it("createCampaign: tracks activeCampaignCount, deploySlotLastUsed, isRegisteredCampaign", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 3600n,
      deploySlots: 2,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(makeReq());

    expect(await factory.activeCampaignCount(await creator.getAddress())).to.eq(1);
    expect(await factory.deploySlotLastUsed(await creator.getAddress(), 0)).to.be.gt(0n);
    // Slot 1 untouched for the first deploy.
    expect(await factory.deploySlotLastUsed(await creator.getAddress(), 1)).to.eq(0n);

    const info = await factory.getCampaign(0);
    expect(await factory.isRegisteredCampaign(info.campaign)).to.eq(true);
  });

  it("campaign stores protection fields correctly", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 200n,
    });

    await factory.connect(creator).createCampaign(makeReq());

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    expect(await campaign.creator()).to.eq(await creator.getAddress());
    expect(await campaign.creatorNoSellBlocks()).to.eq(200n);
    expect(await campaign.startBlock()).to.be.gt(0n);
    expect(await campaign.campaignStartTime()).to.be.gt(0n);
    expect(await campaign.lastActivityTime()).to.be.gt(0n);
    expect(await campaign.antiBotEnabled()).to.eq(false);
    expect(await campaign.firstMinWalletCap()).to.eq(0n);
  });

  // ── Abandon flow ──

  it("abandonCampaign: reverts when not registered", async () => {
    const { factory, alice } = await deployCoreFixture();
    await expect(factory.connect(alice).abandonCampaign(await alice.getAddress()))
      .to.be.revertedWithCustomError(factory, "NotRegistered");
  });

  it("abandonCampaign: reverts before timeout, succeeds after, frees slot, blocks new buys, allows sells", async () => {
    const { factory, owner, creator, alice } = await deployCoreFixture();

    // High-supply config so initial buy doesn't auto-finalize.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000000"),
      curveBps: 8800,
      liquidityTokenBps: 1000,
      basePrice: 10n ** 10n,
      priceSlope: 10n ** 6n,
      graduationTarget: ethers.parseEther("1000"),
      liquidityBps: 8000,
    });

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 10,
      creatorNoSellBlocks: 0n,
    });

    await factory.connect(creator).createCampaign(makeReq());
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    // alice buys some tokens so we have someone with a position.
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") });
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const aliceBalance = await token.balanceOf(await alice.getAddress());

    // Too early — abandon timeout has not elapsed.
    await expect(factory.connect(alice).abandonCampaign(info.campaign))
      .to.be.revertedWithCustomError(factory, "AbandonTooEarly");

    // Advance past abandon timeout (default 30 days).
    await time.increase(30 * 24 * 3600 + 1);

    await expect(factory.connect(alice).abandonCampaign(info.campaign))
      .to.emit(factory, "CampaignAbandoned")
      .withArgs(await creator.getAddress(), info.campaign);

    // Active count decremented.
    expect(await factory.activeCampaignCount(await creator.getAddress())).to.eq(0);
    // Registration flipped off.
    expect(await factory.isRegisteredCampaign(info.campaign)).to.eq(false);
    // Campaign-side flag set.
    expect(await campaign.abandoned()).to.eq(true);

    // New buys blocked.
    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWithCustomError(campaign, "CampaignAbandoned");

    // Sells still work — alice can exit her position.
    await token.connect(alice).approve(info.campaign, aliceBalance);
    await expect(campaign.connect(alice).sellExactTokens(aliceBalance / 2n, 0))
      .to.not.be.reverted;
  });

  // ── Factory finalize callback ──

  it("onCampaignFinalized: decrements activeCampaignCount on graduation", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    await factory.connect(owner).setTierConfig(0, {
      cooldownSeconds: 0n,
      deploySlots: 0,
      maxLiveCampaigns: 1, // tight cap so we can prove decrement
      creatorNoSellBlocks: 0n,
    });

    // Pick a low graduation target that the initial buy crosses.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000000000"),
      curveBps: 8800,
      liquidityTokenBps: 1000,
      basePrice: 5n * 10n ** 13n,
      priceSlope: 10n ** 9n,
      graduationTarget: 1n,
      liquidityBps: 8000,
    });

    await factory
      .connect(creator)
      .createCampaign(
        makeReq({
          initialBuyBnbWei: ethers.parseEther("0.01"),
          graduationTarget: 1n,
        }),
        { value: ethers.parseEther("0.01") }
      );

    // Auto-finalize triggered, callback fired, count decremented to 0.
    expect(await factory.activeCampaignCount(await creator.getAddress())).to.eq(0);

    // Slot freed by callback — creator can deploy again immediately.
    await expect(
      factory.connect(creator).createCampaign(makeReq({ symbol: "AGAIN" }))
    ).to.emit(factory, "CampaignCreated");
  });

  it("onCampaignFinalized: only callable by registered campaign", async () => {
    const { factory, alice } = await deployCoreFixture();
    await expect(
      factory.connect(alice).onCampaignFinalized(await alice.getAddress())
    ).to.be.revertedWithCustomError(factory, "NotRegistered");
  });

  // ── setTierConfig bounds (Salus Finding 5) ──

  describe("setTierConfig bounds", () => {
    it("reverts when cooldownSeconds exceeds MAX_COOLDOWN", async () => {
      const { factory, owner } = await deployCoreFixture();
      await expect(
        factory.connect(owner).setTierConfig(0, {
          cooldownSeconds: 8n * 24n * 3600n, // 8 days, > 7 day cap
          deploySlots: 3,
          maxLiveCampaigns: 5,
          creatorNoSellBlocks: 100n,
        })
      ).to.be.revertedWithCustomError(factory, "InvalidTierConfig");
    });

    it("reverts when deploySlots exceeds MAX_DEPLOY_SLOTS", async () => {
      const { factory, owner } = await deployCoreFixture();
      await expect(
        factory.connect(owner).setTierConfig(0, {
          cooldownSeconds: 3600n,
          deploySlots: 11, // > 10 cap — slot loop must stay bounded
          maxLiveCampaigns: 5,
          creatorNoSellBlocks: 100n,
        })
      ).to.be.revertedWithCustomError(factory, "InvalidTierConfig");
    });

    it("reverts when maxLiveCampaigns exceeds MAX_LIVE_CAMPAIGNS_BOUND", async () => {
      const { factory, owner } = await deployCoreFixture();
      await expect(
        factory.connect(owner).setTierConfig(0, {
          cooldownSeconds: 3600n,
          deploySlots: 3,
          maxLiveCampaigns: 21, // > 20 cap
          creatorNoSellBlocks: 100n,
        })
      ).to.be.revertedWithCustomError(factory, "InvalidTierConfig");
    });

    it("reverts when creatorNoSellBlocks exceeds MAX_NO_SELL_BLOCKS", async () => {
      const { factory, owner } = await deployCoreFixture();
      await expect(
        factory.connect(owner).setTierConfig(0, {
          cooldownSeconds: 3600n,
          deploySlots: 3,
          maxLiveCampaigns: 5,
          creatorNoSellBlocks: 100_001n, // > 100_000 cap
        })
      ).to.be.revertedWithCustomError(factory, "InvalidTierConfig");
    });

    it("accepts values at the upper bound", async () => {
      const { factory, owner } = await deployCoreFixture();
      await expect(
        factory.connect(owner).setTierConfig(0, {
          cooldownSeconds: 7n * 24n * 3600n,
          deploySlots: 10,
          maxLiveCampaigns: 20,
          creatorNoSellBlocks: 100_000n,
        })
      ).to.not.be.reverted;
    });
  });
});
