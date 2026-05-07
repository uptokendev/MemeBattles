# Pre-Mainnet Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the five audit-validated pre-mainnet blockers identified in the launchpad security comparison: pre-seeded pair DoS on graduation, bonding-curve overflow with large supplies, missing bounds on tier admin functions, anti-vamp ticker+logo cooldown, and per-campaign + global trading pause.

**Architecture:** Layered on top of the existing protection framework WIP (must be committed first). Five changes localized to `contracts/LaunchFactory.sol` and `contracts/LaunchCampaign.sol`. All follow established patterns: custom errors on factory, factory-only callbacks for campaign mutation, immutable per-campaign state, OZ `Ownable` for admin gating. Strict TDD: each task starts with a failing test that codifies the threat, then the minimal fix, then commit.

**Tech Stack:** Solidity 0.8.24 (Hardhat), OpenZeppelin v5, Hardhat Network Helpers, ethers v6, TypeScript test fixtures.

**Reference docs:**
- Comparison + recommendations: `docs/launchpad-security-comparison.md`
- Ackee Printr audit (W6, W15, L4, M1 directly): `ackee-blockchain-printr-protocol-report-rev.2.2.pdf`
- Salus Four.meme audit (Findings 5, 6): `Meme_audit_report_2024-07-02.pdf`

---

## Pre-step: commit the protection framework WIP

This plan assumes the in-flight protection framework changes (`contracts/LaunchFactory.sol` and `contracts/LaunchCampaign.sol` per `git status`) are committed first as their own coherent feature. None of the tasks below should be started while that work is uncommitted.

- [ ] **Step 1: Verify all existing tests pass on the WIP**

Run: `npx hardhat compile && npx hardhat test`
Expected: all tests green, including `test/ProtectionFramework.spec.ts`.

- [ ] **Step 2: Stage and commit the WIP**

```bash
git add contracts/LaunchFactory.sol contracts/LaunchCampaign.sol \
  test/LaunchCampaign.spec.ts test/LaunchFactory.spec.ts test/Launchpad.ts \
  test/Security.spec.ts test/ProtectionFramework.spec.ts
git commit -m "feat(contracts): add protection framework section 1 (tiers, no-sell, premium modes)"
```

- [ ] **Step 3: Create the hardening branch (or worktree)**

Recommended worktree:
```bash
git worktree add -b feat/pre-mainnet-hardening ../MemeBattles-hardening
cd ../MemeBattles-hardening
```

Or just a branch:
```bash
git checkout -b feat/pre-mainnet-hardening
```

---

## Task 1: C-5 — Verify pre-seeded pair attack on auto-finalize

**Goal:** Determine whether Ackee W15 ("attacker can front-run pair creation, make graduation fail") applies to our `addLiquidityETH` call. The fix depends on what we observe.

**Files:**
- Create: `test/PreSeededPair.spec.ts`

**Background:** Our [`LaunchCampaign.sol:591-593`](../../contracts/LaunchCampaign.sol#L591) comment claims pre-seeding is impossible because LaunchToken blocks pre-finalize transfers. True for the *token* side. But anyone can:
1. Call `IPancakeFactory.createPair(token, WBNB)` to create the empty pair.
2. `IERC20(WBNB).transfer(pair, X ether)` to seed one-sided WBNB into the empty pair.
3. Wait for our auto-finalize to run, where we call `router.addLiquidityETH(token, amount, 0, 0, ...)`.

The PancakeSwap router's `addLiquidity` calls `quote(amountADesired, reserveA, reserveB)`. With `reserveA = 0` (no token) but `reserveB > 0` (pre-seeded WBNB), behavior is router-implementation-dependent.

- [ ] **Step 1: Write the verification test**

Create `test/PreSeededPair.spec.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

describe("Pre-seeded pair attack on auto-finalize (Ackee W15)", () => {
  it("reveals what happens when WBNB is pre-seeded into the pair before graduation", async () => {
    const { factory, owner, creator, alice, router, mockV2Factory, wbnb } =
      await deployCoreFixture();

    // Lower curve so we can reach graduation in one buy.
    await factory.connect(owner).setConfig({
      totalSupply: ethers.parseEther("1000000"),
      curveBps: 8800,
      liquidityTokenBps: 1000,
      basePrice: 10n ** 13n,
      priceSlope: 10n ** 9n,
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 8000,
    });

    await factory.connect(creator).createCampaign({
      name: "PreSeed", symbol: "PRES", logoURI: "ipfs://x",
      xAccount: "", website: "", extraLink: "",
      basePrice: 0n, priceSlope: 0n, graduationTarget: 0n,
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: 0n,
      firstMinWalletCapWei: 0n, antiBotEnabled: false,
    });

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const tokenAddr = await campaign.token();

    // ATTACKER: pre-create the pair and seed WBNB into it.
    await mockV2Factory.createPair(tokenAddr, await wbnb.getAddress());
    const pairAddr = await mockV2Factory.getPair(tokenAddr, await wbnb.getAddress());
    await wbnb.connect(alice).deposit({ value: ethers.parseEther("5") });
    await wbnb.connect(alice).transfer(pairAddr, ethers.parseEther("5"));

    // VICTIM: trigger auto-finalize with a buy that crosses graduationTarget.
    const buyValue = ethers.parseEther("2");
    const tx = campaign.connect(alice).buyExactBnb(0, { value: buyValue });

    // Document observed behavior: does it revert? does the graduation succeed
    // with distorted LP? does it succeed at correct ratios?
    let outcome: "reverted" | "graduated" = "graduated";
    try {
      await (await tx).wait();
      const launched = await campaign.launched();
      expect(launched, "expected graduation to flip launched=true").to.eq(true);
    } catch {
      outcome = "reverted";
    }

    console.log("[W15 verification] outcome:", outcome);
    // Test passes either way — this is a discovery test.
  });
});
```

- [ ] **Step 2: Add WBNB + factory + router to the test fixture if not present**

Inspect `test/fixtures/core.ts`. If `wbnb` and `mockV2Factory` are not already returned, extend the fixture:

```typescript
// add to deployCoreFixture return value
return { factory, owner, creator, alice, bob, router, mockV2Factory, wbnb };
```

Add to fixture body (before the existing return):

```typescript
const Wbnb = await ethers.getContractFactory("MockERC20");
const wbnb = await Wbnb.deploy("Wrapped BNB", "WBNB");
```

If `MockERC20` doesn't have a `deposit()` payable function, add it or substitute with a manual `mint(alice, X)` + use the minted tokens directly.

- [ ] **Step 3: Run the verification test**

Run: `npx hardhat test test/PreSeededPair.spec.ts`
Expected: passes; check the console log to see whether `outcome` was `reverted` or `graduated`.

- [ ] **Step 4: Document the observation**

Add a comment block at the top of `test/PreSeededPair.spec.ts` summarizing what was observed:
- If `reverted`: the router's `quote()` reverts; this is a DoS, fix needed (Task 2).
- If `graduated` but reserves look distorted: LP gets unfavorable ratio, fix needed.
- If `graduated` cleanly: W15 doesn't apply to us due to MockRouter behavior — re-verify against real PancakeRouter on testnet before mainnet.

- [ ] **Step 5: Commit**

```bash
git add test/PreSeededPair.spec.ts test/fixtures/core.ts
git commit -m "test(security): add Ackee W15 pre-seeded pair verification test"
```

---

## Task 2: C-5 — Fix auto-finalize against pre-seeded pair (if Task 1 confirms exposure)

**Conditional:** Only execute this task if Task 1 demonstrated either a revert or a distorted LP.

**Files:**
- Modify: `contracts/LaunchCampaign.sol:589-608` (the `_finalize` LP-add block)
- Modify: `test/PreSeededPair.spec.ts` (extend with passing assertions)

- [ ] **Step 1: Write the fix-validation test**

Append to `test/PreSeededPair.spec.ts`:

```typescript
it("auto-finalize succeeds even when pair is pre-seeded with WBNB", async () => {
  // Same setup as Task 1 step 1, then assert graduation succeeds.
  // ... fixture + pre-seed setup identical ...

  const buyValue = ethers.parseEther("2");
  await expect(campaign.connect(alice).buyExactBnb(0, { value: buyValue }))
    .to.not.be.reverted;
  expect(await campaign.launched()).to.eq(true);
});
```

- [ ] **Step 2: Run the test to confirm it fails on current code**

Run: `npx hardhat test test/PreSeededPair.spec.ts`
Expected: the new test reverts (since current `_finalize` doesn't handle pre-seeded pairs).

- [ ] **Step 3: Implement the fix**

In `contracts/LaunchCampaign.sol`, modify the `_finalize` LP-add block at lines 589-608. Replace the existing `addLiquidityETH` call with logic that detects a pre-seeded pair and either rebalances or uses the pair's existing reserves as the deposit ratio:

```solidity
if (tokensForLp > 0 && liquidityValue > 0) {
    // Detect pre-seeded pair: if pair exists with WBNB but no tokens, sweep
    // the WBNB into our deposit so the ratio matches our intended price.
    address pair = IPancakeV2Factory(router.factory()).getPair(
        address(token), router.WETH()
    );
    if (pair != address(0)) {
        uint256 pairTokenBal = tokenInterface.balanceOf(pair);
        uint256 pairBnbBal = IERC20(router.WETH()).balanceOf(pair);
        // If WBNB is pre-seeded with no tokens, the router's quote() will
        // revert. We accept the donation (it's already in the pair) and
        // reduce our own contribution proportionally; we still set safe mins.
        // No code change needed if router handles it; otherwise sweep via
        // a low-level token donation before addLiquidityETH.
        // (Concrete fix depends on Task 1 observation; pseudocode here.)
    }

    tokenInterface.forceApprove(address(router), tokensForLp);
    (usedTokens, usedBnb, ) = router.addLiquidityETH{value: liquidityValue}(
        address(token),
        tokensForLp,
        (tokensForLp * 95) / 100,        // accept up to 5% slippage on tokens
        (liquidityValue * 95) / 100,     // accept up to 5% slippage on bnb
        lpReceiver,
        block.timestamp + 30 minutes
    );
    // ...
}
```

The exact fix depends on what Task 1 observed. Two likely options:
- **Option A (router reverts on zero-token pair):** Catch the revert and retry with `mint(pair, tokensForLp)` to bypass `addLiquidity`. Requires extracting the LP `mint` low-level pattern.
- **Option B (router accepts but distorts ratio):** Pass non-zero `amountTokenMin` / `amountETHMin` reflecting our expected price (`graduationTarget * 95 / 100` style minimums); attacker WBNB becomes a donation to LP, our user funds are protected.

Pick the option that matches Task 1's observation and implement it.

- [ ] **Step 4: Add the IPancakeV2Factory interface if needed**

If we don't already have it, append to `contracts/interfaces/IPancakeRouter02.sol` or create `contracts/interfaces/IPancakeV2Factory.sol`:

```solidity
interface IPancakeV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npx hardhat test`
Expected: all tests pass, including `test/PreSeededPair.spec.ts` (both verification and fix-validation tests).

- [ ] **Step 6: Commit**

```bash
git add contracts/LaunchCampaign.sol contracts/interfaces/ test/PreSeededPair.spec.ts
git commit -m "fix(contracts): harden auto-finalize against pre-seeded pair attack (Ackee W15)"
```

---

## Task 3: C-4 — Drop `unchecked` on bonding-curve `x*x`

**Goal:** Address Ackee L4 / W10 — silent overflow in `_area` when `totalSupply` is configured larger than ~3.4e38. Today our default is 1e27 and safe, but `setConfig` allows arbitrary values.

**Files:**
- Modify: `contracts/LaunchCampaign.sol:643-651` (the `_area` function)
- Modify: `contracts/LaunchFactory.sol:380-390` (the `_validateConfig` function)
- Create: `test/AreaOverflow.spec.ts`

- [ ] **Step 1: Write a failing test demonstrating silent overflow risk**

Create `test/AreaOverflow.spec.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

describe("Area overflow protection (Ackee L4)", () => {
  it("reverts cleanly on totalSupply that would overflow x*x in _area", async () => {
    const { factory, owner, creator } = await deployCoreFixture();

    // 1e40 total supply is far beyond any realistic meme; should be rejected.
    const tooLargeSupply = 10n ** 40n;

    await expect(
      factory.connect(owner).setConfig({
        totalSupply: tooLargeSupply,
        curveBps: 8800,
        liquidityTokenBps: 1000,
        basePrice: 10n ** 13n,
        priceSlope: 10n ** 9n,
        graduationTarget: ethers.parseEther("50"),
        liquidityBps: 8000,
      })
    ).to.be.revertedWithCustomError(factory, "ParamTooHigh");
  });

  it("sane totalSupply (1e27) still works", async () => {
    const { factory, owner } = await deployCoreFixture();
    await expect(
      factory.connect(owner).setConfig({
        totalSupply: ethers.parseEther("1000000000"), // 1e27 wei = 1B tokens
        curveBps: 8800,
        liquidityTokenBps: 1000,
        basePrice: 10n ** 13n,
        priceSlope: 10n ** 9n,
        graduationTarget: ethers.parseEther("50"),
        liquidityBps: 8000,
      })
    ).to.not.be.reverted;
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx hardhat test test/AreaOverflow.spec.ts`
Expected: first test fails (no upper bound exists yet).

- [ ] **Step 3: Add `MAX_TOTAL_SUPPLY` constant and validation in factory**

In `contracts/LaunchFactory.sol`, after the existing `MAX_GRADUATION_TARGET` constant (around line 96), add:

```solidity
// Cap totalSupply to keep x*x in LaunchCampaign._area within uint256.
// 1e30 wei tokens (1 trillion supply, 18 decimals) -> x*x max ~1e60, safe.
uint256 public constant MAX_TOTAL_SUPPLY = 1e30;
```

In `_validateConfig` (line 380-390), add a check at the top:

```solidity
function _validateConfig(LaunchConfig memory newConfig) internal pure {
    if (newConfig.totalSupply == 0) revert SupplyZero();
    if (newConfig.totalSupply > MAX_TOTAL_SUPPLY) revert ParamTooHigh();
    // ... rest unchanged ...
}
```

- [ ] **Step 4: Drop the `unchecked` block in `_area`**

In `contracts/LaunchCampaign.sol:643-651`, replace:

```solidity
function _area(uint256 x) internal view returns (uint256) {
    uint256 linear = Math.mulDiv(x, basePrice, WAD);
    uint256 square;
    unchecked {
        square = x * x;
    }
    uint256 slopeTerm = Math.mulDiv(priceSlope, square, 2 * WAD * WAD);
    return linear + slopeTerm;
}
```

with:

```solidity
function _area(uint256 x) internal view returns (uint256) {
    uint256 linear = Math.mulDiv(x, basePrice, WAD);
    uint256 square = x * x; // checked: factory caps totalSupply, x*x stays in uint256
    uint256 slopeTerm = Math.mulDiv(priceSlope, square, 2 * WAD * WAD);
    return linear + slopeTerm;
}
```

- [ ] **Step 5: Run full test suite to confirm nothing breaks**

Run: `npx hardhat test`
Expected: all tests pass, including the new `test/AreaOverflow.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add contracts/LaunchFactory.sol contracts/LaunchCampaign.sol test/AreaOverflow.spec.ts
git commit -m "fix(contracts): cap totalSupply and drop unchecked in _area (Ackee L4/W10)"
```

---

## Task 4: C-3 — Bounds on `setTierConfig`

**Goal:** Address Salus Finding 5 (no upper limit on admin-settable parameters). A compromised owner key today can set `cooldownSeconds = type(uint256).max` and DoS all creation forever, set `deploySlots = type(uint8).max` to make the slot-search loop OOG, or set `creatorNoSellBlocks = type(uint256).max` to permanently freeze creator sells for a tier.

**Files:**
- Modify: `contracts/LaunchFactory.sol` (existing `setTierConfig`)
- Modify: `test/ProtectionFramework.spec.ts` (extend with bound tests)

`TierConfig` after the protection framework lands is:
```solidity
struct TierConfig {
    uint256 cooldownSeconds;
    uint8   deploySlots;
    uint8   maxLiveCampaigns;
    uint256 creatorNoSellBlocks;
}
```

All four fields need bounds. `deploySlots` is the most important new bound — the cooldown loop iterates from 0 to `tc.deploySlots`, so an unbounded value is a hard gas-bomb.

- [ ] **Step 1: Write failing tests for each bound**

Append to `test/ProtectionFramework.spec.ts`:

```typescript
describe("setTierConfig bounds (Salus Finding 5)", () => {
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
        deploySlots: 11, // > 10 cap — the slot loop must stay bounded
        maxLiveCampaigns: 5,
        creatorNoSellBlocks: 100n,
      })
    ).to.be.revertedWithCustomError(factory, "InvalidTierConfig");
  });

  it("reverts when maxLiveCampaigns exceeds MAX_LIVE_CAMPAIGNS", async () => {
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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx hardhat test test/ProtectionFramework.spec.ts --grep 'setTierConfig bounds'`
Expected: first four tests fail (no bounds exist).

- [ ] **Step 3: Add bound constants to factory**

In `contracts/LaunchFactory.sol`, near the other `MAX_*` constants, add:

```solidity
// Bounds on tier configuration to prevent admin-key compromise from
// DoSing creation, freezing creator activity, or OOGing the slot loop
// (Salus Finding 5 equivalent).
uint256 public constant MAX_COOLDOWN = 7 days;
uint8   public constant MAX_DEPLOY_SLOTS = 10;
uint8   public constant MAX_LIVE_CAMPAIGNS_BOUND = 20;
uint256 public constant MAX_NO_SELL_BLOCKS = 100_000; // ~3.5 days at 3s blocks
```

(`MAX_LIVE_CAMPAIGNS_BOUND` rather than `MAX_LIVE_CAMPAIGNS` to avoid colliding with any existing constant.)

- [ ] **Step 4: Add the `InvalidTierConfig` error**

In the existing custom errors block, add:

```solidity
error InvalidTierConfig();
```

- [ ] **Step 5: Update `setTierConfig` with bound enforcement**

Replace the existing `setTierConfig` with:

```solidity
function setTierConfig(uint8 tier, TierConfig calldata cfg) external onlyOwner {
    if (cfg.cooldownSeconds > MAX_COOLDOWN) revert InvalidTierConfig();
    if (cfg.deploySlots > MAX_DEPLOY_SLOTS) revert InvalidTierConfig();
    if (cfg.maxLiveCampaigns > MAX_LIVE_CAMPAIGNS_BOUND) revert InvalidTierConfig();
    if (cfg.creatorNoSellBlocks > MAX_NO_SELL_BLOCKS) revert InvalidTierConfig();
    tierConfig[tier] = cfg;
    emit TierConfigUpdated(tier, cfg);
}
```

- [ ] **Step 6: Run tests**

Run: `npx hardhat test test/ProtectionFramework.spec.ts`
Expected: all tier tests pass (existing + new bound tests).

- [ ] **Step 7: Commit**

```bash
git add contracts/LaunchFactory.sol test/ProtectionFramework.spec.ts
git commit -m "fix(contracts): add bounds on setTierConfig to prevent admin DoS (Salus F5)"
```

---

## Task 5: C-2 — Anti-vamp symbol+logo cooldown

**Goal:** Address Salus Finding 6 + Printr's 48h anti-vamp feature. Block creators from minting tokens with the same `symbol + logoURI` combo as a recent legitimate launch.

**Files:**
- Modify: `contracts/LaunchFactory.sol` (add anti-vamp state, error, check, setter)
- Create: `test/AntiVamp.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `test/AntiVamp.spec.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployCoreFixture } from "./fixtures/core";

const baseReq = {
  name: "Doge",
  symbol: "DOGE",
  logoURI: "ipfs://logo",
  xAccount: "", website: "", extraLink: "",
  basePrice: 0n, priceSlope: 0n, graduationTarget: 0n,
  lpReceiver: ethers.ZeroAddress,
  initialBuyBnbWei: 0n,
  firstMinWalletCapWei: 0n, antiBotEnabled: false,
};

describe("Anti-vamp symbol+logo cooldown", () => {
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
  });

  it("admin cannot set lockout above MAX_ANTI_VAMP_LOCKOUT", async () => {
    const { factory, owner } = await deployCoreFixture();
    const max = 30 * 24 * 3600 + 1;
    await expect(factory.connect(owner).setAntiVampLockout(max))
      .to.be.revertedWithCustomError(factory, "ParamTooHigh");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx hardhat test test/AntiVamp.spec.ts`
Expected: tests fail (no anti-vamp logic exists).

- [ ] **Step 3: Add anti-vamp state and error to factory**

In `contracts/LaunchFactory.sol`:

Add error to the custom errors block:
```solidity
error AntiVampLocked();
```

Add state and constants near other `MAX_*` constants:
```solidity
uint256 public constant MAX_ANTI_VAMP_LOCKOUT = 30 days;
uint256 public antiVampLockout = 48 hours;
mapping(bytes32 => uint64) public symbolLogoLockedUntil;
```

Add event near other events:
```solidity
event AntiVampLockoutUpdated(uint256 newLockout);
```

- [ ] **Step 4: Add the lockout check in `createCampaign`**

In `createCampaign` (around line 184-208), after the empty-string checks but before the tier enforcement, insert:

```solidity
// Anti-vamp: block re-use of (symbol, logoURI) within lockout window.
bytes32 vampKey = keccak256(abi.encodePacked(req.symbol, req.logoURI));
if (block.timestamp < symbolLogoLockedUntil[vampKey]) revert AntiVampLocked();
symbolLogoLockedUntil[vampKey] = uint64(block.timestamp + antiVampLockout);
```

- [ ] **Step 5: Add the `setAntiVampLockout` admin function**

In the admin-functions section (near `setProtocolFee` around line 310), add:

```solidity
function setAntiVampLockout(uint256 newLockout) external onlyOwner {
    if (newLockout > MAX_ANTI_VAMP_LOCKOUT) revert ParamTooHigh();
    antiVampLockout = newLockout;
    emit AntiVampLockoutUpdated(newLockout);
}
```

- [ ] **Step 6: Run all tests**

Run: `npx hardhat test`
Expected: all tests pass, including new anti-vamp tests. Watch for failures in existing tests that use repeated symbol+logoURI in the same `it` block — those need updating to use unique combos per `it` (the existing `ProtectionFramework.spec.ts` uses `"TST"` + `"ipfs://logo"` repeatedly, but each test starts a fresh fixture so should be unaffected).

- [ ] **Step 7: Verify existing tests use fresh fixtures**

Inspect `test/ProtectionFramework.spec.ts` for any `it` block that calls `createCampaign` twice with the same `name` and `logoURI`. The cooldown test (line 86-100) does exactly this. Update it to use different `symbol` values for the second/third creation:

```typescript
// Original: await factory.connect(creator).createCampaign(makeReq());
// Updated:
await factory.connect(creator).createCampaign(makeReq({ symbol: "TST2" }));
// ... and TST3 for the third call
```

Re-run the test to confirm.

- [ ] **Step 8: Commit**

```bash
git add contracts/LaunchFactory.sol test/AntiVamp.spec.ts test/ProtectionFramework.spec.ts
git commit -m "feat(contracts): add anti-vamp symbol+logo cooldown (Salus F6, Printr-style)"
```

---

## Task 6: C-1a — Per-campaign trading pause flag

**Goal:** Address the per-token-pause gap (matches Four.meme's `suspendTrading(token, bool)`). Factory owner can pause buys on a single campaign without affecting others; sells stay open so holders always have an exit.

**Files:**
- Modify: `contracts/LaunchCampaign.sol` (add `paused` flag and `setPaused` factory-only function, integrate check into all four buy paths)
- Modify: `contracts/LaunchFactory.sol` (add `setCampaignPaused(address, bool)` factory function)
- Create: `test/PauseFlags.spec.ts`

- [ ] **Step 1: Write failing tests for per-campaign pause**

Create `test/PauseFlags.spec.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

describe("Per-campaign pause", () => {
  async function setup() {
    const fx = await deployCoreFixture();
    const { factory, creator, alice } = fx;

    await factory.connect(creator).createCampaign({
      name: "T", symbol: "T", logoURI: "ipfs://t",
      xAccount: "", website: "", extraLink: "",
      basePrice: 0n, priceSlope: 0n, graduationTarget: 0n,
      lpReceiver: ethers.ZeroAddress,
      initialBuyBnbWei: 0n,
      firstMinWalletCapWei: 0n, antiBotEnabled: false,
    });

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    return { ...fx, campaign };
  }

  it("only factory owner can pause a campaign", async () => {
    const { factory, campaign, alice } = await setup();
    await expect(factory.connect(alice).setCampaignPaused(await campaign.getAddress(), true))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });

  it("only factory can call setPaused on a campaign directly", async () => {
    const { campaign, alice } = await setup();
    await expect(campaign.connect(alice).setPaused(true))
      .to.be.revertedWith("ONLY_FACTORY");
  });

  it("paused campaign blocks buyExactTokens", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);

    await expect(
      campaign.connect(alice).buyExactTokens(ethers.parseEther("1"), ethers.parseEther("1"),
        { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(campaign, "CampaignPaused");
  });

  it("paused campaign blocks buyExactBnb", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWithCustomError(campaign, "CampaignPaused");
  });

  it("paused campaign still allows sellExactTokens (exit path)", async () => {
    const { factory, campaign, owner, alice } = await setup();

    // Buy first while unpaused.
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") });
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const bal = await token.balanceOf(await alice.getAddress());

    // Pause and try to sell.
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);
    await token.connect(alice).approve(await campaign.getAddress(), bal);
    await expect(campaign.connect(alice).sellExactTokens(bal, 0)).to.not.be.reverted;
  });

  it("unpausing restores buys", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), true);
    await factory.connect(owner).setCampaignPaused(await campaign.getAddress(), false);

    await expect(campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") }))
      .to.not.be.reverted;
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx hardhat test test/PauseFlags.spec.ts`
Expected: tests fail (compile error if needed methods not present, otherwise revert mismatches).

- [ ] **Step 3: Add `paused` flag and `setPaused` to `LaunchCampaign.sol`**

Add to state variables (near other booleans, e.g. after `antiBotEnabled` around line 100):

```solidity
bool public paused;

error CampaignPaused();
event PausedSet(bool paused);
```

Add the function (anywhere with the other admin-callable functions):

```solidity
function setPaused(bool v) external onlyFactory {
    paused = v;
    emit PausedSet(v);
}
```

- [ ] **Step 4: Add the paused check to all four buy paths**

In `LaunchCampaign.sol`, add `if (paused) revert CampaignPaused();` immediately after the existing `require(!launched, "campaign launched");` line in:
- `buyExactTokens` (around line 295)
- `buyExactBnb` (around line 353)
- `buyExactTokensFor` (around line 415)
- `buyExactBnbFor` (around line 465)

Do **not** add it to `sellExactTokens` — sell remains the exit path even when paused.

- [ ] **Step 5: Add `setCampaignPaused` to factory**

In `contracts/LaunchFactory.sol`, after the existing `onCampaignFinalized` (around line 345-349), add:

```solidity
/// @notice Pause or unpause buys on a specific campaign. Sells remain open.
function setCampaignPaused(address campaign, bool v) external onlyOwner {
    if (!isRegisteredCampaign[campaign]) revert NotRegistered();
    LaunchCampaign(payable(campaign)).setPaused(v);
}
```

- [ ] **Step 6: Run all tests**

Run: `npx hardhat test`
Expected: all tests pass including new pause tests.

- [ ] **Step 7: Commit**

```bash
git add contracts/LaunchCampaign.sol contracts/LaunchFactory.sol test/PauseFlags.spec.ts
git commit -m "feat(contracts): add per-campaign pause flag (sells remain open)"
```

---

## Task 7: C-1b — Global buy pause on factory

**Goal:** Single switch to halt buys across every campaign at once. Useful for incident response without iterating thousands of campaigns. Sells remain open globally.

**Files:**
- Modify: `contracts/LaunchFactory.sol` (add `globalPauseBuys` flag and setter)
- Modify: `contracts/LaunchCampaign.sol` (read factory's flag during buys)
- Modify: `test/PauseFlags.spec.ts` (extend with global pause tests)

- [ ] **Step 1: Add global pause tests**

Append to `test/PauseFlags.spec.ts`:

```typescript
describe("Global buy pause", () => {
  // ... reuse setup() from above ...

  it("global pause blocks buys on all campaigns", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await factory.connect(owner).setGlobalPauseBuys(true);

    await expect(
      campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWithCustomError(campaign, "CampaignPaused");
  });

  it("global pause does not block sells", async () => {
    const { factory, campaign, owner, alice } = await setup();
    await campaign.connect(alice).buyExactBnb(0, { value: ethers.parseEther("0.01") });
    const tokenAddr = await campaign.token();
    const token = await ethers.getContractAt("LaunchToken", tokenAddr);
    const bal = await token.balanceOf(await alice.getAddress());

    await factory.connect(owner).setGlobalPauseBuys(true);

    await token.connect(alice).approve(await campaign.getAddress(), bal);
    await expect(campaign.connect(alice).sellExactTokens(bal, 0)).to.not.be.reverted;
  });

  it("only owner can set global pause", async () => {
    const { factory, alice } = await setup();
    await expect(factory.connect(alice).setGlobalPauseBuys(true))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx hardhat test test/PauseFlags.spec.ts --grep "Global buy pause"`
Expected: tests fail.

- [ ] **Step 3: Add factory-side global pause**

In `contracts/LaunchFactory.sol`:

Add state (near the other live/pause flags):
```solidity
bool public globalPauseBuys;
event GlobalPauseBuysSet(bool paused);
```

Add setter:
```solidity
function setGlobalPauseBuys(bool v) external onlyOwner {
    globalPauseBuys = v;
    emit GlobalPauseBuysSet(v);
}
```

- [ ] **Step 4: Read factory flag from campaign buy paths**

In `contracts/LaunchCampaign.sol`, expand the `ILaunchFactory` interface (near top of file, line 13):

```solidity
interface ILaunchFactory {
    function onCampaignFinalized(address creator) external;
    function globalPauseBuys() external view returns (bool);
}
```

In each of the four buy paths, replace:

```solidity
if (paused) revert CampaignPaused();
```

with:

```solidity
if (paused || ILaunchFactory(factory).globalPauseBuys()) revert CampaignPaused();
```

- [ ] **Step 5: Run all tests**

Run: `npx hardhat test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add contracts/LaunchCampaign.sol contracts/LaunchFactory.sol test/PauseFlags.spec.ts
git commit -m "feat(contracts): add global buy pause on factory"
```

---

## Task 8: Final verification + contract size check

**Goal:** Confirm we haven't bloated `LaunchCampaign` past the 24KB limit, all tests pass, and document the final state.

- [ ] **Step 1: Run the full test suite**

Run: `npx hardhat test`
Expected: 100% pass, no warnings.

- [ ] **Step 2: Compile and check contract sizes**

Run: `npx hardhat compile && jq -r '"Runtime: \((.deployedBytecode | length - 2) / 2) bytes (\((.deployedBytecode | length - 2) / 2 / 245.76 | tostring | .[0:5])% of cap)"' artifacts/contracts/LaunchCampaign.sol/LaunchCampaign.json`

Expected: `LaunchCampaign` runtime under 22,000 bytes. If over 22,000, flag immediately — we need the cleanup work (custom errors + buy-path merge) before going further.

- [ ] **Step 3: Run typecheck on TypeScript tests**

Run: `npx tsc --noEmit -p tsconfig.json` (if tsconfig present)
Expected: no errors.

- [ ] **Step 4: Run any linters configured**

Run: `npx solhint 'contracts/**/*.sol'` (if installed)
Expected: clean.

- [ ] **Step 5: Update the launchpad-security-comparison.md document**

Mark items C-1, C-2, C-3, C-4, C-5 in `docs/launchpad-security-comparison.md` as `[x] Done`. Brief note on outcome (e.g., "C-5 verified not exploitable on MockRouter; needs re-verification on real PancakeRouter pre-mainnet").

- [ ] **Step 6: Final commit**

```bash
git add docs/launchpad-security-comparison.md
git commit -m "docs(security): mark pre-mainnet C-1..C-5 hardening complete"
```

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin feat/pre-mainnet-hardening
gh pr create --title "feat(contracts): pre-mainnet security hardening (C-1..C-5)" --body "$(cat <<'EOF'
## Summary

Addresses five audit-validated pre-mainnet blockers from `docs/launchpad-security-comparison.md`:

- C-1: Per-campaign + global buy pause flags (Four.meme `suspendTrading` parity)
- C-2: Anti-vamp ticker+logo cooldown (Salus F6, Printr-style)
- C-3: Bounds on `setTierConfig` (Salus Finding 5)
- C-4: Drop unchecked `x*x` in `_area` + cap `totalSupply` (Ackee L4/W10)
- C-5: Pre-seeded pair attack on auto-finalize (Ackee W15)

## Test plan
- [x] All existing tests pass
- [x] New tests for each finding (5 spec files)
- [x] Contract size remains under 24KB cap
- [ ] Re-verify C-5 against real PancakeRouter on BSC testnet
- [ ] Independent third-party audit before mainnet

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope for this plan

These are tracked elsewhere:

- **S-1 to S-10** (Strong recommendations): role-based ACL, `setRouter` timelock, creator payout escrow, detailed events, `abandonCampaign`, launch profiles, custom errors conversion, buy-path merge, redundant string drops, finish protection framework. Each warrants its own plan.
- **N-1 to N-8** (Nice-to-haves): post-mainnet v1.1+. Not blocking.
- **Independent audit**: external task. Coordinate after this branch merges.

## Failure-mode notes for executors

- **Task 1 might reveal C-5 doesn't apply.** That's a valid outcome. Document and skip Task 2.
- **Task 5 (anti-vamp) may break existing tests** that reuse `symbol + logoURI`. Step 7 mitigates; if more break, fix them (use unique values per `it` block).
- **Task 6/7 (pause flags) interact with the protection framework's `factory` reference**, which is mutable in clones. Ensure tests use the actual deployed factory address.
- **If `LaunchCampaign` contract size goes above 22KB at Task 8 step 2**, do not proceed to mainnet. Open follow-up plan for S-7 + S-8 (custom errors + buy-path merge) immediately.

## Definition of Done

- All five Critical items have a passing test exercising the threat
- All previous tests still pass
- `LaunchCampaign` runtime bytecode under 22KB
- Branch pushed, PR open with the test-plan checklist filled
- `launchpad-security-comparison.md` updated with outcomes
