import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCoreFixture } from "./fixtures/core";

const DEAD = "0x000000000000000000000000000000000000dEaD";

describe("Security & invariants", function () {
  it("auto-finalize cannot be skipped: completion buy flips launched in same tx", async function () {
    const { owner, creator, alice, factory } = await deployCoreFixture();

    // Make graduation extremely easy to hit so we deterministically trigger inside a single buy.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000"),
      curveBps: 5000,
      liquidityTokenBps: 4000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: 1n, // 1 wei
      liquidityBps: 8000,
    });

    await factory.connect(creator).createCampaign(
      {
        name: "T",
        symbol: "T",
        logoURI: "ipfs://logo",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: 0n,
        priceSlope: 0n,
        graduationTarget: 0n,
        lpReceiver: await alice.getAddress(),
        initialBuyBnbWei: 0n,
      },
      { value: 0 }
    );

    const count = await factory.campaignsCount();
    const info = await factory.getCampaign(count - 1n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    // Small buy triggers threshold => finalize in the same tx.
    const buyTx = await campaign.connect(alice).buyExactBnb(0, { value: 1n });
    const buyRc = await buyTx.wait();

    // Assert finalize event present in receipt and launched flipped.
    const finalized = buyRc!.logs.some((l: any) => l.fragment?.name === "CampaignFinalized");
    expect(finalized).to.equal(true);
    expect(await campaign.launched()).to.equal(true);
  });

  it("finalize fee amounts: protocolFee equals balanceBefore * protocolFeeBps / 10000", async function () {
    const { owner, creator, alice, feeRecipient, factory } = await deployCoreFixture();

    // Prevent auto-finalize so we can measure balanceBefore deterministically.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000"),
      curveBps: 5000,
      liquidityTokenBps: 4000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("2"), // reachable via top-up; avoids auto-finalize during buy
      liquidityBps: 8000,
    });
    await factory.connect(owner).setProtocolFee(200); // 2%

    await factory.connect(creator).createCampaign(
      {
        name: "F",
        symbol: "F",
        logoURI: "ipfs://logo",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: 0,
        priceSlope: 0,
        graduationTarget: 0,
        lpReceiver: ethers.ZeroAddress,
        initialBuyBnbWei: 0,
      },
      { value: 0 }
    );
    const count = await factory.campaignsCount();
    const info = await factory.getCampaign(count - 1n);
    const campaignAddr = info.campaign;
    const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddr);

    // Buy a tiny amount of tokens (avoid sellout / avoid auto-finalize).
    const oneToken = ethers.parseUnits("1", 18);
    const q = await campaign.quoteBuyExactTokens(oneToken);
    const qBuf = q + 1n;
    await campaign.connect(alice).buyExactTokens(oneToken, qBuf, { value: qBuf });

    // Top up to reach graduationTarget so the manual finalize (backstop) is allowed.
    const target = await campaign.graduationTarget();
    const balNow = await ethers.provider.getBalance(campaignAddr);
    if (balNow < target) {
      await owner.sendTransaction({ to: campaignAddr, value: target - balNow });
    }

    const balanceBefore = await ethers.provider.getBalance(campaignAddr);
    const expectedFee = (balanceBefore * 200n) / 10_000n;
    const feeRecipientBefore = await ethers.provider.getBalance(await feeRecipient.getAddress());

    // Manual finalize (backstop) should apply fee formula.
    const finTx = await campaign.connect(creator).finalize(0, 0);
    const finRc = await finTx.wait();
    // Parse CampaignFinalized from receipt using the campaign interface.
    let finParsed: any = null;
    for (const log of finRc!.logs) {
      try {
        const p = campaign.interface.parseLog(log);
        if (p.name === "CampaignFinalized") {
          finParsed = p;
          break;
        }
      } catch {}
    }
    expect(finParsed).to.not.equal(null);
    expect((finParsed!.args[3] as bigint)).to.equal(expectedFee);

    const feeRecipientAfter = await ethers.provider.getBalance(await feeRecipient.getAddress());
    expect(feeRecipientAfter - feeRecipientBefore).to.equal(expectedFee);
  });

  it("DEX reserves correctness: LP deploy results in non-zero pair reserves when pair is registered", async function () {
    const { owner, creator, alice, factory, v2factory, router } = await deployCoreFixture();

    // Ensure we finalize via curve sellout (simple, deterministic).
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000"),
      curveBps: 1000, // 10% curve => 100 tokens sellout is cheap
      liquidityTokenBps: 8000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("100"), // ignore
      liquidityBps: 8000,
    });

    await factory.connect(creator).createCampaign(
      {
        name: "P",
        symbol: "P",
        logoURI: "ipfs://logo",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: 0,
        priceSlope: 0,
        graduationTarget: 0,
        lpReceiver: ethers.ZeroAddress,
        initialBuyBnbWei: 0,
      },
      { value: 0 }
    );
    const count = await factory.campaignsCount();
    const info = await factory.getCampaign(count - 1n);
    const campaignAddr = info.campaign;
    const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddr);
    const tokenAddr = await campaign.token();

    // Register an empty pair in the mock factory so MockRouter will update reserves on LP add.
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();
    await v2factory.setPair(tokenAddr, await router.WETH(), await pair.getAddress());

    // Sell out curve supply to force auto-finalize.
    const curveSupply = await campaign.curveSupply();
    await campaign.connect(alice).buyExactTokens(curveSupply, ethers.MaxUint256, { value: ethers.parseEther("10") });

    const reserves = await pair.getReserves();
    expect(reserves[0]).to.be.gt(0);
    expect(reserves[1]).to.be.gt(0);
    expect(await pair.totalSupply()).to.be.gt(0);
  });

  it("reentrancy defense: feeRecipient cannot re-enter claimPendingNative during buy", async function () {
    const { owner, creator, alice, factory } = await deployCoreFixture();

    // Keep graduation far away so buyExactBnb never auto-finalizes in this test.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000"),
      curveBps: 5000,
      liquidityTokenBps: 4000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("100"),
      liquidityBps: 8000,
    });

    const Reenter = await ethers.getContractFactory("ReenteringFeeRecipient");
    const reenter = await Reenter.deploy();

    // Point factory fee recipient to the reenter contract.
    await factory.connect(owner).setFeeRecipient(await reenter.getAddress());

    await factory.connect(creator).createCampaign(
      {
        name: "R",
        symbol: "R",
        logoURI: "ipfs://logo",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: 0,
        priceSlope: 0,
        graduationTarget: ethers.parseEther("100"),
        lpReceiver: ethers.ZeroAddress,
        initialBuyBnbWei: 0,
      },
      { value: 0 }
    );
    const count = await factory.campaignsCount();
    const info = await factory.getCampaign(count - 1n);
    const campaignAddr = info.campaign;
    const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddr);
    await reenter.setTarget(campaignAddr);

    // 1) Force escrow: feeRecipient reverts.
    // Use buyExactTokens to avoid accidentally selling out / launching due to cheap pricing.
    const oneToken = ethers.parseUnits("1", 18);
    const q1 = await campaign.quoteBuyExactTokens(oneToken);
    const q1Buf = q1 + 1n;
    await reenter.setMode(0);
    await campaign.connect(alice).buyExactTokens(oneToken, q1Buf, { value: q1Buf });
    const pending1 = await campaign.pendingNative(await reenter.getAddress());
    expect(pending1).to.be.gt(0);

    // 2) Attempt re-entrancy: receiver accepts and tries to claimPendingNative inside receive.
    const q2 = await campaign.quoteBuyExactTokens(oneToken);
    const q2Buf = q2 + 1n;
    await reenter.setMode(1);
    await campaign.connect(alice).buyExactTokens(oneToken, q2Buf, { value: q2Buf });

    // claimPendingNative should NOT succeed during buy due to ReentrancyGuard.
    expect(await reenter.lastReenterOk()).to.equal(false);

    // Pending still exists (was not claimed via re-entrancy).
    const pending2 = await campaign.pendingNative(await reenter.getAddress());
    expect(pending2).to.be.gt(0);
  });

  it("LP burn cannot be bypassed: factory ignores user lpReceiver and liquidity is minted to DEAD", async function () {
    const { owner, creator, alice, factory, router } = await deployCoreFixture();

    // Ensure finalize via sellout.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000"),
      curveBps: 1000,
      liquidityTokenBps: 8000,
      basePrice: 10n ** 12n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("100"),
      liquidityBps: 8000,
    });

    await factory.connect(creator).createCampaign(
      {
        name: "B",
        symbol: "B",
        logoURI: "ipfs://logo",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: 0,
        priceSlope: 0,
        graduationTarget: 0,
        // Try to set lpReceiver to Alice (should be ignored)
        lpReceiver: await alice.getAddress(),
        initialBuyBnbWei: 0,
      },
      { value: 0 }
    );
    const count = await factory.campaignsCount();
    const info = await factory.getCampaign(count - 1n);
    const campaignAddr = info.campaign;
    const campaign = await ethers.getContractAt("LaunchCampaign", campaignAddr);

    expect(await campaign.lpReceiver()).to.equal(DEAD);

    const curveSupply = await campaign.curveSupply();
    const tx = await campaign.connect(alice).buyExactTokens(curveSupply, ethers.MaxUint256, { value: ethers.parseEther("10") });
    const rc = await tx.wait();

    // LiquidityAdded is emitted by MockRouter; parse logs via router interface and ensure "to" == DEAD.
    let liqParsed: any = null;
    for (const log of rc!.logs) {
      try {
        const p = router.interface.parseLog(log);
        if (p.name === "LiquidityAdded") {
          liqParsed = p;
          break;
        }
      } catch {}
    }
    expect(liqParsed).to.not.equal(null);
    expect(liqParsed!.args[3]).to.equal(DEAD);
  });
});
