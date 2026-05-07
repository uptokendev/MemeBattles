# Platform Protection Framework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add layered buyer protection to MemeWarzone: contract-enforced tier system with bonds/cooldowns, trust data pipeline, wallet link detection, voter credibility scoring, trust-aware discovery, campaign drafts, and premium launch modes.

**Architecture:** 7 sequential build sections following dependency order. Section 1 (contracts) is Solidity/Hardhat. Section 2 (trust data) is PostgreSQL migrations + Node.js indexer jobs. Section 3 (drafts) is DB + Express API + React frontend. Sections 4-5 (UI + discovery) are React + API modifications. Section 6 (premium modes) completes the contract + UI integration.

**Tech Stack:** Solidity (Hardhat), PostgreSQL (Supabase), Node.js/TypeScript (indexer), Express.js (API on Netlify), React/TypeScript (frontend), Ably (realtime), ethers.js (Web3)

**Spec:** `docs/superpowers/specs/2026-04-08-platform-protection-framework-design.md`
**Summary:** `docs/protection-framework-summary.md`

---

## Section 1: Contract Changes (LaunchFactory + LaunchCampaign)

### Task 1.1: Add TierConfig struct and tier state to LaunchFactory

**Files:**
- Modify: `contracts/LaunchFactory.sol:32-88` (add after existing state variables)

- [ ] **Step 1: Add TierConfig struct and new state variables**

After the existing `LaunchConfig` struct (line 40), add:

```solidity
struct TierConfig {
    uint256 bondAmount;
    uint256 cooldownSeconds;
    uint8   maxLiveCampaigns;
    uint256 creatorNoSellBlocks;
}

mapping(address => uint8) public creatorTier;
mapping(uint8 => TierConfig) public tierConfig;
mapping(address => uint256) public lastDeployTime;
mapping(address => uint8) public activeCampaignCount;
mapping(address => uint256) public campaignBond;
mapping(address => bool) public isRegisteredCampaign;
uint256 public abandonTimeout;
```

- [ ] **Step 2: Add new events**

```solidity
event BondRefunded(address indexed creator, address indexed campaign, uint256 amount);
event CampaignAbandoned(address indexed creator, address indexed campaign, uint256 bondConfiscated);
event TierConfigUpdated(uint8 indexed tier, TierConfig config);
event CreatorTierUpdated(address indexed creator, uint8 tier);
```

- [ ] **Step 3: Add new errors**

```solidity
error CooldownActive();
error MaxLiveCampaignsReached();
error InsufficientBond();
error NotRegistered();
error AlreadyFinalized();
error AbandonTooEarly();
error PremiumTierRequired();
```

- [ ] **Step 4: Compile to verify no syntax errors**

Run: `npx hardhat compile`
Expected: Successful compilation

- [ ] **Step 5: Commit**

```bash
git add contracts/LaunchFactory.sol
git commit -m "feat(contracts): add TierConfig struct and tier state variables to LaunchFactory"
```

---

### Task 1.2: Add owner functions for tier management

**Files:**
- Modify: `contracts/LaunchFactory.sol` (add after existing owner functions ~line 264)

- [ ] **Step 1: Add setTierConfig function**

```solidity
function setTierConfig(uint8 tier, TierConfig calldata cfg) external onlyOwner {
    tierConfig[tier] = cfg;
    emit TierConfigUpdated(tier, cfg);
}

function setCreatorTier(address creator, uint8 tier) external onlyOwner {
    require(tier <= 2, "InvalidTier");
    creatorTier[creator] = tier;
    emit CreatorTierUpdated(creator, tier);
}

function batchSetCreatorTier(
    address[] calldata creators,
    uint8[] calldata tiers
) external onlyOwner {
    require(creators.length == tiers.length, "LengthMismatch");
    for (uint256 i = 0; i < creators.length; i++) {
        require(tiers[i] <= 2, "InvalidTier");
        creatorTier[creators[i]] = tiers[i];
        emit CreatorTierUpdated(creators[i], tiers[i]);
    }
}

function setAbandonTimeout(uint256 timeout) external onlyOwner {
    abandonTimeout = timeout;
}
```

- [ ] **Step 2: Compile**

Run: `npx hardhat compile`
Expected: Successful compilation

- [ ] **Step 3: Commit**

```bash
git add contracts/LaunchFactory.sol
git commit -m "feat(contracts): add tier management owner functions"
```

---

### Task 1.3: Modify createCampaign() with tier enforcement and bond logic

**Files:**
- Modify: `contracts/LaunchFactory.sol:155-244` (createCampaign function)

- [ ] **Step 1: Add tier checks at the start of createCampaign()**

Insert after line 163 (`if (bytes(req.logoURI).length == 0) revert LogoEmpty();`):

```solidity
// Tier enforcement
TierConfig memory tc = tierConfig[creatorTier[msg.sender]];
if (tc.cooldownSeconds > 0 && lastDeployTime[msg.sender] > 0) {
    if (block.timestamp < lastDeployTime[msg.sender] + tc.cooldownSeconds)
        revert CooldownActive();
}
if (tc.maxLiveCampaigns > 0) {
    if (activeCampaignCount[msg.sender] >= tc.maxLiveCampaigns)
        revert MaxLiveCampaignsReached();
}
if (tc.bondAmount > 0) {
    if (msg.value < tc.bondAmount + req.initialBuyBnbWei)
        revert InsufficientBond();
}

// Premium mode tier gate
if (req.firstMinWalletCapWei > 0 || req.antiBotEnabled) {
    if (creatorTier[msg.sender] < 1) revert PremiumTierRequired();
}
```

- [ ] **Step 2: Update CampaignRequest struct to include premium fields**

Modify the existing struct (line 55-67) to add:

```solidity
uint256 firstMinWalletCapWei;
bool    antiBotEnabled;
```

- [ ] **Step 3: Add bond retention and state tracking after clone creation**

After `tokenAddr = address(LaunchCampaign(payable(clone)).token());` (line 201), add:

```solidity
// Track bond and state
if (tc.bondAmount > 0) {
    campaignBond[campaignAddr] = tc.bondAmount;
}
isRegisteredCampaign[campaignAddr] = true;
activeCampaignCount[msg.sender]++;
lastDeployTime[msg.sender] = block.timestamp;
```

- [ ] **Step 4: Update initial buy value flow**

Modify the initial buy section (lines 220-234) so only `msg.value - tc.bondAmount` is available:

```solidity
uint256 availableForBuy = msg.value - tc.bondAmount;
uint256 spent = 0;
if (req.initialBuyBnbWei > 0) {
    if (req.initialBuyBnbWei > MAX_CREATOR_INIT_BUY) revert InitBuyTooLarge();
    if (availableForBuy < req.initialBuyBnbWei) revert InitBuyValue();

    (, uint256 totalSpent) = LaunchCampaign(payable(campaignAddr))
        .buyExactBnbFor{value: req.initialBuyBnbWei}(msg.sender, 0);
    spent = totalSpent;
}
if (availableForBuy > spent) {
    (bool ok, ) = msg.sender.call{value: availableForBuy - spent}("");
    if (!ok) revert RefundFail();
}
```

- [ ] **Step 5: Pass no-sell and premium fields to InitParams**

Add `creatorNoSellBlocks: tc.creatorNoSellBlocks`, `firstMinWalletCapWei: req.firstMinWalletCapWei`, `antiBotEnabled: req.antiBotEnabled` to the `InitParams` struct construction (lines 170-196).

- [ ] **Step 6: Compile**

Run: `npx hardhat compile`
Expected: Successful compilation

- [ ] **Step 7: Commit**

```bash
git add contracts/LaunchFactory.sol
git commit -m "feat(contracts): add tier enforcement, bond logic, and premium mode gating to createCampaign"
```

---

### Task 1.4: Add onCampaignFinalized callback and abandonCampaign to LaunchFactory

**Files:**
- Modify: `contracts/LaunchFactory.sol` (add new functions)

- [ ] **Step 1: Add onCampaignFinalized callback**

**IMPORTANT:** The bond refund must NOT revert on failure — if the creator is a contract that rejects BNB, a revert would brick the entire graduation (since _finalize is triggered inside a buy tx). Use escrow pattern instead.

```solidity
mapping(address => uint256) public pendingBondRefund;

function onCampaignFinalized(address creator) external nonReentrant {
    if (!isRegisteredCampaign[msg.sender]) revert NotRegistered();
    isRegisteredCampaign[msg.sender] = false;
    activeCampaignCount[creator]--;
    uint256 bond = campaignBond[msg.sender];
    if (bond > 0) {
        campaignBond[msg.sender] = 0;
        (bool ok, ) = creator.call{value: bond}("");
        if (!ok) {
            // Escrow instead of revert — creator can claim later
            pendingBondRefund[creator] += bond;
        }
        emit BondRefunded(creator, msg.sender, bond);
    }
}

function claimPendingBond() external {
    uint256 amount = pendingBondRefund[msg.sender];
    require(amount > 0, "NoPending");
    pendingBondRefund[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    require(ok, "ClaimFail");
}
```
```

- [ ] **Step 2: Add abandonCampaign function**

```solidity
function abandonCampaign(address campaign) external {
    if (!isRegisteredCampaign[campaign]) revert NotRegistered();
    LaunchCampaign c = LaunchCampaign(payable(campaign));
    if (c.launched()) revert AlreadyFinalized();
    if (block.timestamp < c.lastActivityTime() + abandonTimeout) revert AbandonTooEarly();

    address creator = c.creator();
    activeCampaignCount[creator]--;
    uint256 bond = campaignBond[campaign];
    campaignBond[campaign] = 0;
    if (bond > 0) {
        (bool ok, ) = feeRecipient.call{value: bond}("");
        if (!ok) revert RefundFail();
    }
    emit CampaignAbandoned(creator, campaign, bond);
}
```

Note: Factory already has `receive() external payable {}` (line 134). No need to add it again.

- [ ] **Step 3: Compile**

Run: `npx hardhat compile`
Expected: Successful compilation

- [ ] **Step 5: Commit**

```bash
git add contracts/LaunchFactory.sol
git commit -m "feat(contracts): add onCampaignFinalized callback and abandonCampaign"
```

---

### Task 1.5: Modify LaunchCampaign for no-sell window, premium modes, and factory callback

**Files:**
- Modify: `contracts/LaunchCampaign.sol:17-39` (InitParams), `:41-83` (state vars), `:260-353` (buy functions), `:457-486` (sell function), `:508-569` (_finalize)

**IMPORTANT:** LaunchCampaign does NOT have a `creator` public variable. The creator is stored via `Ownable._transferOwnership(params.creator)` and accessed as `owner()`. However, `owner()` can be transferred, while the creator identity must be immutable for trust/protection purposes. We add a separate immutable `creator` variable.

- [ ] **Step 1: Extend InitParams struct with new fields**

Add to the `InitParams` struct (lines 17-39):

```solidity
uint256 creatorNoSellBlocks;
uint256 firstMinWalletCapWei;
bool    antiBotEnabled;
```

- [ ] **Step 2: Add new state variables**

After existing state variables (line 83):

```solidity
// Creator identity (immutable — distinct from owner() which can be transferred)
address public creator;

// Protection state
uint256 public creatorNoSellBlocks;
uint256 public startBlock;
uint256 public campaignStartTime;
uint256 public lastActivityTime;

// Premium modes
uint256 public firstMinWalletCap;
bool public antiBotEnabled;
uint256 public constant ANTI_BOT_BLOCKS = 6;
mapping(address => uint256) public firstMinuteSpent;
mapping(address => uint256) public lastBuyBlock;
```

Note: `factory` already exists at line 47 — do not duplicate.

- [ ] **Step 3: Initialize new fields in initialize()**

In the `initialize` function, add:

```solidity
creator = p.creator;
creatorNoSellBlocks = p.creatorNoSellBlocks;
firstMinWalletCap = p.firstMinWalletCapWei;
antiBotEnabled = p.antiBotEnabled;
startBlock = block.number;
campaignStartTime = block.timestamp;
lastActivityTime = block.timestamp;
```

- [ ] **Step 4: Add no-sell check to sellExactTokens()**

At the start of `sellExactTokens()` (line 457), add:

```solidity
if (msg.sender == creator && creatorNoSellBlocks > 0) {
    require(block.number >= startBlock + creatorNoSellBlocks, "CreatorSellLocked");
}
```

- [ ] **Step 5: Add premium mode checks to buy functions**

In both `buyExactTokens()` (line 260) and `buyExactBnb()` (line 308), after fee calculation, add:

```solidity
// First-minute wallet cap (cumulative, uses campaignStartTime set in initialize)
if (firstMinWalletCap > 0 && block.timestamp < campaignStartTime + 60) {
    firstMinuteSpent[msg.sender] += costNoFee;
    require(firstMinuteSpent[msg.sender] <= firstMinWalletCap, "WalletCapExceeded");
}

// Anti-bot: 1 buy per wallet per block
if (antiBotEnabled && block.number <= startBlock + ANTI_BOT_BLOCKS) {
    require(lastBuyBlock[msg.sender] < block.number, "OnePerBlock");
    lastBuyBlock[msg.sender] = block.number;
}
```

- [ ] **Step 6: Update lastActivityTime on every buy/sell**

In both buy functions and sell function, add after successful execution:

```solidity
lastActivityTime = block.timestamp;
```

- [ ] **Step 7: Add factory callback to _finalize()**

In `_finalize()` (line 508), after the creator payout (line 566) and before `token.enableTrading()` (line 570), add:

```solidity
// Notify factory: decrement active count, refund bond
ILaunchFactory(factory).onCampaignFinalized(creator);
```

This requires adding an interface. Create a minimal interface:

```solidity
interface ILaunchFactory {
    function onCampaignFinalized(address creator) external;
}
```

- [ ] **Step 8: Add anti-bot fee multiplier logic**

In the `_feeSplit()` function or inline in buy functions:

```solidity
uint256 feeMultiplier = 1;
if (antiBotEnabled && block.number <= startBlock + ANTI_BOT_BLOCKS) {
    uint256 blocksSinceLaunch = block.number - startBlock;
    feeMultiplier = blocksSinceLaunch < 3 ? 3 : blocksSinceLaunch < 6 ? 2 : 1;
}
uint256 adjustedFeeBps = protocolFeeBps * feeMultiplier;
```

- [ ] **Step 9: Compile**

Run: `npx hardhat compile`
Expected: Successful compilation

- [ ] **Step 10: Commit**

```bash
git add contracts/LaunchCampaign.sol
git commit -m "feat(contracts): add no-sell window, premium modes, lastActivityTime, factory callback"
```

---

### Task 1.6: Write contract tests

**Files:**
- Create: `test/ProtectionFramework.spec.ts` (matches existing `.spec.ts` convention)
- Modify: `test/LaunchFactory.spec.ts` (update CampaignRequest fixtures with new fields)

- [ ] **Step 0: Update existing test fixtures with new CampaignRequest fields**

All existing tests in `test/LaunchFactory.spec.ts` construct `CampaignRequest` without the new fields. Add `firstMinWalletCapWei: 0, antiBotEnabled: false` to all existing request fixtures so they compile after the struct change.

Run: `npx hardhat test` to verify existing tests still pass.

- [ ] **Step 1: Write test for tier config and cooldown enforcement**

```typescript
describe("Protection Framework", () => {
  it("should revert createCampaign when cooldown not passed", async () => {
    // Set tierConfig for tier 0 with 1 hour cooldown
    // Create campaign successfully
    // Attempt second campaign immediately -> expect revert CooldownActive
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx hardhat test test/ProtectionFramework.spec.ts`
Expected: FAIL (test infrastructure may need setup)

- [ ] **Step 3: Write tests for max live campaigns**

```typescript
it("should revert when max live campaigns reached", async () => {
  // Set maxLiveCampaigns = 1
  // Create campaign 1 -> success
  // Create campaign 2 -> expect revert MaxLiveCampaignsReached
});
```

- [ ] **Step 4: Write tests for bond handling**

```typescript
it("should retain bond in factory and refund on graduation", async () => {
  // Set bondAmount = 0.1 ether
  // Create campaign with msg.value = bondAmount + initialBuy
  // Verify factory balance increased by bondAmount
  // Trigger graduation
  // Verify bond returned to creator
});

it("should confiscate bond on abandon after timeout", async () => {
  // Create campaign with bond
  // Advance time past abandonTimeout
  // Call abandonCampaign
  // Verify bond sent to feeRecipient, not creator
  // Verify activeCampaignCount decremented
});
```

- [ ] **Step 5: Write tests for creator no-sell window**

```typescript
it("should block creator sells during no-sell window", async () => {
  // Create campaign with creatorNoSellBlocks = 100
  // Creator buys tokens via initial buy
  // Creator tries to sell at block startBlock + 50 -> revert
  // Advance past window -> sell succeeds
});
```

- [ ] **Step 6: Write tests for premium modes**

```typescript
it("should revert premium modes for base tier", async () => {
  // Tier 0 creator tries firstMinWalletCap > 0 -> revert PremiumTierRequired
});

it("should enforce first-minute wallet cap cumulatively", async () => {
  // Premium creator creates with firstMinWalletCap = 0.5 ether
  // Buyer buys 0.3 ether -> ok
  // Same buyer buys 0.3 ether -> revert WalletCapExceeded (total 0.6 > 0.5)
});

it("should enforce one buy per block in anti-bot mode", async () => {
  // Create with antiBotEnabled
  // Buyer buys in block N -> ok
  // Same buyer buys in block N -> revert OnePerBlock
  // Different buyer buys in block N -> ok
});
```

- [ ] **Step 7: Run all tests**

Run: `npx hardhat test test/ProtectionFramework.spec.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add test/ProtectionFramework.spec.ts test/LaunchFactory.spec.ts
git commit -m "test(contracts): add protection framework tests and update existing fixtures"
```

---

## Section 2: Trust Data Model (DB + Indexer)

### Task 2.1: Create database migration for trust tables

**Files:**
- Create: `db/migrations/20260408_000001_trust_data_model.sql`

- [ ] **Step 1: Write migration with all 4 trust tables**

```sql
-- creator_stats: aggregated creator track record
CREATE TABLE IF NOT EXISTS creator_stats (
    chain_id        int          NOT NULL,
    creator_address text         NOT NULL,
    total_campaigns     int      NOT NULL DEFAULT 0,
    graduated_campaigns int      NOT NULL DEFAULT 0,
    abandoned_campaigns int      NOT NULL DEFAULT 0,
    clean_campaigns     int      NOT NULL DEFAULT 0,
    flagged_campaigns   int      NOT NULL DEFAULT 0,
    avg_unique_buyers   float    NOT NULL DEFAULT 0,
    total_volume_bnb    numeric  NOT NULL DEFAULT 0,
    first_campaign_at   timestamptz,
    last_campaign_at    timestamptz,
    avg_voter_credibility float  NOT NULL DEFAULT 0,
    total_weighted_votes  numeric NOT NULL DEFAULT 0,
    vote_diversity_score  float  NOT NULL DEFAULT 0,
    tier_override   smallint,
    computed_tier   smallint     NOT NULL DEFAULT 0,
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, creator_address),
    CHECK (creator_address = lower(creator_address))
);

-- wallet_links: creator-linked wallet detection
CREATE TABLE IF NOT EXISTS wallet_links (
    chain_id         int          NOT NULL,
    campaign_address text         NOT NULL,
    wallet_a         text         NOT NULL,
    wallet_b         text         NOT NULL,
    link_type        text         NOT NULL,
    evidence_tx_hash text         NOT NULL,
    amount_wei       numeric      NOT NULL DEFAULT 0,
    detected_at      timestamptz  NOT NULL DEFAULT now(),
    confidence       float        NOT NULL DEFAULT 1.0,
    cluster_id       uuid,
    detection_method text         NOT NULL DEFAULT 'funding_trail',
    CHECK (campaign_address = lower(campaign_address)),
    CHECK (wallet_a = lower(wallet_a)),
    CHECK (wallet_b = lower(wallet_b)),
    CHECK (link_type IN ('direct_funding', 'shared_source', 'circular_flow')),
    PRIMARY KEY (chain_id, campaign_address, wallet_a, wallet_b)
);
CREATE INDEX IF NOT EXISTS idx_wallet_links_wallet_b
    ON wallet_links (chain_id, wallet_b);

-- campaign_trust_snapshot: per-campaign trust signals
CREATE TABLE IF NOT EXISTS campaign_trust_snapshot (
    chain_id             int          NOT NULL,
    campaign_address     text         NOT NULL,
    unique_buyers        int          NOT NULL DEFAULT 0,
    linked_buyer_count   int          NOT NULL DEFAULT 0,
    linked_buyer_pct     float        NOT NULL DEFAULT 0,
    top5_holder_pct      float        NOT NULL DEFAULT 0,
    top10_holder_pct     float        NOT NULL DEFAULT 0,
    creator_holding_pct  float        NOT NULL DEFAULT 0,
    creator_sold_pct     float        NOT NULL DEFAULT 0,
    flagged_wallet_volume_pct float   NOT NULL DEFAULT 0,
    weighted_votes_24h   float        NOT NULL DEFAULT 0,
    avg_voter_credibility float       NOT NULL DEFAULT 0,
    suspicious_vote_pct  float        NOT NULL DEFAULT 0,
    first_trade_at       timestamptz,
    trust_score          float        NOT NULL DEFAULT 50,
    updated_at           timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, campaign_address),
    CHECK (campaign_address = lower(campaign_address))
);

-- voter_profile: voter credibility scoring
CREATE TABLE IF NOT EXISTS voter_profile (
    chain_id              int          NOT NULL,
    voter_address         text         NOT NULL,
    total_votes           int          NOT NULL DEFAULT 0,
    unique_creators_voted int          NOT NULL DEFAULT 0,
    unique_campaigns_voted int         NOT NULL DEFAULT 0,
    creator_concentration float        NOT NULL DEFAULT 0,
    has_traded            boolean      NOT NULL DEFAULT false,
    total_trades          int          NOT NULL DEFAULT 0,
    has_created_campaign  boolean      NOT NULL DEFAULT false,
    total_volume_bnb      numeric      NOT NULL DEFAULT 0,
    first_activity_at     timestamptz,
    credibility_score     float        NOT NULL DEFAULT 0.5,
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, voter_address),
    CHECK (voter_address = lower(voter_address))
);
CREATE INDEX IF NOT EXISTS idx_voter_profile_credibility
    ON voter_profile (chain_id, credibility_score);
```

- [ ] **Step 2: Apply migration to local DB**

Run: `psql $DATABASE_URL -f db/migrations/20260408_000001_trust_data_model.sql`
Expected: CREATE TABLE x4, CREATE INDEX x3

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20260408_000001_trust_data_model.sql
git commit -m "feat(db): add trust data model tables (creator_stats, wallet_links, campaign_trust_snapshot, voter_profile)"
```

---

### Task 2.2: Implement compute-creator-stats indexer job

**Files:**
- Create: `realtime-indexer/src/jobs/computeCreatorStats.ts`

- [ ] **Step 1: Write the job**

The job queries `campaigns` and `curve_trades` tables, aggregating per-creator stats. Key logic:
- Count total/graduated/abandoned campaigns per creator
- Compute "clean" vs "flagged" based on creator sell behavior in first Y minutes
- Calculate average unique buyers across campaigns
- Determine `computed_tier` based on configurable thresholds
- Use UPSERT into `creator_stats`

The job should export a `computeCreatorStats(pool, chainId)` function.

Reference existing job pattern: `realtime-indexer/src/jobs/finalizeEpochWinners.ts`

- [ ] **Step 2: Register job in package.json scripts**

Add: `"cron:compute-creator-stats": "tsx src/jobs/computeCreatorStats.ts"`

- [ ] **Step 3: Test locally**

Run: `npm run cron:compute-creator-stats`
Expected: Job runs, upserts rows into `creator_stats`

- [ ] **Step 4: Commit**

```bash
git add realtime-indexer/src/jobs/computeCreatorStats.ts realtime-indexer/package.json
git commit -m "feat(indexer): add compute-creator-stats periodic job"
```

---

### Task 2.3: Implement compute-voter-profiles indexer job

**Files:**
- Create: `realtime-indexer/src/jobs/computeVoterProfiles.ts`

- [ ] **Step 1: Write the job**

Queries `votes`, `curve_trades`, `campaigns`, and `wallet_links`. Per voter:
- Count unique creators/campaigns voted
- Calculate `creator_concentration` (max votes to single creator / total votes)
- Check trading activity from `curve_trades`
- Check campaign creation from `campaigns`
- Compute `credibility_score` using the formula from spec Section 2.5
- UPSERT into `voter_profile`

- [ ] **Step 2: Register in package.json**

Add: `"cron:compute-voter-profiles": "tsx src/jobs/computeVoterProfiles.ts"`

- [ ] **Step 3: Test locally**

Run: `npm run cron:compute-voter-profiles`
Expected: Job runs, upserts rows

- [ ] **Step 4: Commit**

```bash
git add realtime-indexer/src/jobs/computeVoterProfiles.ts realtime-indexer/package.json
git commit -m "feat(indexer): add compute-voter-profiles periodic job"
```

---

### Task 2.4: Implement compute-campaign-trust indexer job

**Files:**
- Create: `realtime-indexer/src/jobs/computeCampaignTrust.ts`

- [ ] **Step 1: Write the job**

Per active campaign, computes:
- `unique_buyers`: COUNT DISTINCT wallet FROM curve_trades WHERE side='buy'
- Holder balances: SUM(buy amounts) - SUM(sell amounts) per wallet, compute top 5/10 concentration
- `creator_holding_pct` and `creator_sold_pct` from creator's buy/sell history
- `linked_buyer_count`/`pct` by joining `wallet_links`
- `weighted_votes_24h` by joining `votes` with `voter_profile.credibility_score`, applying `link_penalty` per campaign
- `trust_score` using formula from spec Section 2.7
- UPSERT into `campaign_trust_snapshot`

- [ ] **Step 2: Register in package.json**

Add: `"cron:compute-campaign-trust": "tsx src/jobs/computeCampaignTrust.ts"`

- [ ] **Step 3: Test locally**

Run: `npm run cron:compute-campaign-trust`

- [ ] **Step 4: Commit**

```bash
git add realtime-indexer/src/jobs/computeCampaignTrust.ts realtime-indexer/package.json
git commit -m "feat(indexer): add compute-campaign-trust job"
```

---

### Task 2.5: Implement detect-wallet-links indexer job

**Files:**
- Create: `realtime-indexer/src/jobs/detectWalletLinks.ts`

- [ ] **Step 1: Write the job**

Triggered logic (called from the main indexer loop after processing CampaignCreated and early buys):
- On CampaignCreated: fetch creator's outbound BNB transfers from last 24h via BSCScan API (`txlistinternal`)
- Store recipient addresses
- On each buy in first 10 minutes: check if buyer address is in the stored recipients
- If match: INSERT into `wallet_links` with `link_type = 'direct_funding'`, `confidence = 1.0`

Include BSCScan API rate limiting (max 5 calls/sec), retry queue, and graceful fallback if API unavailable.

- [ ] **Step 2: Integrate detection trigger into main indexer**

In `realtime-indexer/src/indexer.ts`, after processing `CampaignCreated` events and after processing buy events for campaigns younger than 10 minutes, call the detection function.

- [ ] **Step 3: Test locally with a known campaign**

Run indexer and verify `wallet_links` table is populated for test campaigns.

- [ ] **Step 4: Commit**

```bash
git add realtime-indexer/src/jobs/detectWalletLinks.ts realtime-indexer/src/indexer.ts
git commit -m "feat(indexer): add wallet link detection via BSCScan funding trail"
```

---

### Task 2.6: Implement sync-tiers-to-contract indexer job

**Files:**
- Create: `realtime-indexer/src/jobs/syncTiersToContract.ts`

- [ ] **Step 1: Write the job**

- Query `creator_stats` for all creators where `computed_tier` (or `tier_override` if set) differs from the last known on-chain tier
- Batch creators into groups of 50
- Call `factory.batchSetCreatorTier(addresses, tiers)` using platform operator private key
- Log gas costs and results
- Track last sync state to avoid redundant calls

Requires environment variables: `FACTORY_ADDRESS_{chainId}`, `TIER_SYNC_OPERATOR_PK`

- [ ] **Step 2: Register in package.json**

Add: `"cron:sync-tiers-to-contract": "tsx src/jobs/syncTiersToContract.ts"`

- [ ] **Step 3: Commit**

```bash
git add realtime-indexer/src/jobs/syncTiersToContract.ts realtime-indexer/package.json
git commit -m "feat(indexer): add sync-tiers-to-contract periodic job"
```

---

## Section 3: Campaign Drafts (DB + API + Frontend)

### Task 3.1: Create campaign_drafts migration

**Files:**
- Create: `db/migrations/20260408_000002_campaign_drafts.sql`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE IF NOT EXISTS campaign_drafts (
    id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id                int          NOT NULL,
    creator_address         text         NOT NULL,
    name                    text         NOT NULL,
    symbol                  text         NOT NULL,
    logo_uri                text,
    description             text,
    x_account               text,
    website                 text,
    extra_link              text,
    base_price              numeric,
    price_slope             numeric,
    graduation_target       numeric,
    initial_buy_bnb         numeric,
    premium_modes           jsonb        NOT NULL DEFAULT '{}',
    status                  text         NOT NULL DEFAULT 'draft',
    deployed_campaign_address text,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now(),
    CHECK (creator_address = lower(creator_address)),
    CHECK (status IN ('draft', 'deploying', 'deployed', 'abandoned'))
);
CREATE INDEX IF NOT EXISTS idx_campaign_drafts_creator
    ON campaign_drafts (chain_id, creator_address, status);
```

- [ ] **Step 2: Apply migration**

Run: `psql $DATABASE_URL -f db/migrations/20260408_000002_campaign_drafts.sql`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20260408_000002_campaign_drafts.sql
git commit -m "feat(db): add campaign_drafts table"
```

---

### Task 3.2: Create drafts API endpoints

**Files:**
- Create: `frontend/api/drafts.js`

- [ ] **Step 1: Write the drafts API handler**

Express router with 7 endpoints matching spec Section 6.4. All write endpoints require SIWE auth (follow pattern from `frontend/api/profile.js`). Key logic:
- `POST /api/drafts` — validate fields, check draft count limit based on creator tier, insert
- `GET /api/drafts?chainId=X&creator=Y` — list drafts for authenticated creator
- `GET /api/drafts/:id` — single draft, verify ownership
- `PUT /api/drafts/:id` — update if status='draft', verify ownership
- `DELETE /api/drafts/:id` — set status='abandoned', verify ownership
- `POST /api/drafts/:id/preflight` — run all pre-flight checks (spec Section 6.5): cooldown, concurrent cap, tier eligibility, balance check via RPC
- `POST /api/drafts/:id/mark-deployed` — set status='deployed', link campaign address, optimistic locking on status

- [ ] **Step 2: Register route in the Netlify function**

Add route to `frontend/netlify/functions/api.mjs`

- [ ] **Step 3: Test endpoints locally**

Run local dev server, test each endpoint with curl.

- [ ] **Step 4: Commit**

```bash
git add frontend/api/drafts.js frontend/netlify/functions/api.mjs
git commit -m "feat(api): add campaign drafts CRUD and preflight endpoints"
```

---

### Task 3.3: Create trust data API endpoints

**Files:**
- Create: `frontend/api/creator-stats.js`
- Create: `frontend/api/campaign-trust.js`
- Create: `frontend/api/voter-profile.js`

- [ ] **Step 1: Write creator-stats endpoint**

`GET /api/creator-stats?chainId=X&address=Y` — query `creator_stats` table, return row.

- [ ] **Step 2: Write campaign-trust endpoint**

`GET /api/campaign-trust?chainId=X&campaign=Y` — query `campaign_trust_snapshot` table, return row.

- [ ] **Step 3: Write voter-profile endpoint**

`GET /api/voter-profile?chainId=X&address=Y` — query `voter_profile` table, return row.

- [ ] **Step 4: Register all routes**

Add to `frontend/netlify/functions/api.mjs`

- [ ] **Step 5: Commit**

```bash
git add frontend/api/creator-stats.js frontend/api/campaign-trust.js frontend/api/voter-profile.js frontend/netlify/functions/api.mjs
git commit -m "feat(api): add creator-stats, campaign-trust, voter-profile endpoints"
```

---

### Task 3.4: Extend campaigns and featured API with trust data

**Files:**
- Modify: `frontend/api/campaigns.js` (line ~185 where trending_score is computed)
- Modify: `frontend/api/featured.js`

- [ ] **Step 1: Update campaigns.js SQL query**

JOIN `campaign_trust_snapshot` and `creator_stats` tables. Replace inline trending calculation with:

```sql
(coalesce(ts.weighted_votes_24h, b.votes_24h, 0) * 10
 + coalesce(b.vol_24h_bnb, 0) * 1000
 + coalesce(ts.unique_buyers, 0) * 50
 - coalesce(ts.linked_buyer_pct, 0) * 500
 + coalesce(cs.computed_tier, 0) * 200
) as trending_score
```

Add `ts.trust_score`, `ts.unique_buyers` to SELECT.

Add unique buyer threshold for trending tab: `AND (tab != 'trending' OR coalesce(ts.unique_buyers, 0) >= $minBuyersTrending)`

- [ ] **Step 2: Update featured.js SQL query**

Same JOIN pattern. Use `weighted_votes_24h` for sorting. Add minimum unique buyer threshold.

- [ ] **Step 3: Test with curl**

Run: `curl "localhost:8888/api/campaigns?chainId=97&tab=trending"`
Verify response includes `trust_score` and `unique_buyers` fields.

- [ ] **Step 4: Commit**

```bash
git add frontend/api/campaigns.js frontend/api/featured.js
git commit -m "feat(api): integrate trust data into campaigns and featured endpoints"
```

---

### Task 3.5: Refactor Create page to draft editor

**Files:**
- Modify: `frontend/src/pages/Create.tsx`

- [ ] **Step 1: Change form submission to save draft instead of direct contract call**

Replace the existing `createCampaign` contract call with:
1. POST to `/api/drafts` to save draft
2. Show "My Drafts" list below the form
3. Add "Go Live" button per draft that calls `/api/drafts/:id/preflight` then triggers contract interaction

- [ ] **Step 2: Add My Drafts section**

Fetch drafts from `GET /api/drafts?chainId=X&creator=Y` on page load. Display list with status, edit/delete/go-live actions.

- [ ] **Step 3: Add preflight check UI**

When "Go Live" clicked: call preflight endpoint, display results (pass/fail per check), if all pass prompt wallet signature for `createCampaign()`.

- [ ] **Step 4: Call mark-deployed after successful tx**

After `createCampaign()` tx confirms, call `POST /api/drafts/:id/mark-deployed` with the campaign address.

- [ ] **Step 5: Test the full flow**

Create draft -> verify in DB -> Go Live -> preflight passes -> deploy -> verify draft status = 'deployed'

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Create.tsx
git commit -m "feat(frontend): refactor Create page to draft editor with preflight checks"
```

---

## Section 4: Campaign Trust UI

### Task 4.1: Create Creator History Card component

**Files:**
- Create: `frontend/src/components/token/CreatorHistoryCard.tsx`

- [ ] **Step 1: Build the component**

Fetches from `GET /api/creator-stats?chainId=X&address=Y`. Displays:
- Total campaigns, graduation count, clean/flagged record
- Tier badge (Base/Premium/Verified icon)
- Account age
- Average unique buyers
- Voter trust quality

Follow existing component patterns in `frontend/src/components/token/`.

- [ ] **Step 2: Integrate into TokenDetails page**

Modify `frontend/src/pages/TokenDetails.tsx` — add `<CreatorHistoryCard>` next to creator name/address display.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/token/CreatorHistoryCard.tsx frontend/src/pages/TokenDetails.tsx
git commit -m "feat(frontend): add Creator History Card to campaign page"
```

---

### Task 4.2: Create Campaign Trust Panel component

**Files:**
- Create: `frontend/src/components/token/CampaignTrustPanel.tsx`

- [ ] **Step 1: Build the component**

Fetches from `GET /api/campaign-trust?chainId=X&campaign=Y`. Collapsible panel showing:
- Unique buyers, top 5/10 holder concentration
- Creator holding %, creator sold %
- Linked wallets detected, linked wallet volume %
- Vote quality, suspicious vote %

- [ ] **Step 2: Integrate into TokenDetails page**

Add below the chart section as a collapsible panel.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/token/CampaignTrustPanel.tsx frontend/src/pages/TokenDetails.tsx
git commit -m "feat(frontend): add Campaign Trust Panel to campaign page"
```

---

### Task 4.3: Add trust badges to campaign cards

**Files:**
- Modify: `frontend/src/components/home/CampaignCard.tsx`

- [ ] **Step 1: Add trust badge**

Small colored dot based on trust_score (green/yellow/orange/red). Add `unique_buyers` text below mcap. Add creator tier icon next to creator name.

The `CampaignCardVM` type (line 13) needs extending with `trustScore`, `uniqueBuyers`, `creatorTier` fields.

- [ ] **Step 2: Update FeaturedCampaigns component**

Modify `frontend/src/components/home/FeaturedCampaigns.tsx` — same badge additions to featured carousel items.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/home/CampaignCard.tsx frontend/src/components/home/FeaturedCampaigns.tsx
git commit -m "feat(frontend): add trust badges and unique buyer count to campaign cards"
```

---

### Task 4.4: Add Creator tab and voter badge to Profile page

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`
- Create: `frontend/src/components/profile/CreatorTab.tsx`
- Create: `frontend/src/components/profile/VoterBadge.tsx`

- [ ] **Step 1: Build CreatorTab component**

Lists all campaigns by this creator with status (active/graduated/abandoned), trust score per campaign, overall stats summary, tier + progression.

- [ ] **Step 2: Build VoterBadge component**

Shows credibility score, voting diversity, trading activity. Labels: "Active trader & voter" / "Voter only" / "New account".

- [ ] **Step 3: Integrate into Profile page**

Add "Creator" tab alongside existing tabs (Balances, Activity, Followers). Add VoterBadge to profile header area.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/profile/CreatorTab.tsx frontend/src/components/profile/VoterBadge.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(frontend): add Creator tab and voter credibility badge to Profile page"
```

---

## Section 5: Discovery Controls

### Task 5.1: Trending formula is already updated in Task 3.4

The SQL changes in `campaigns.js` and `featured.js` (Task 3.4) already implement the new trending formula with trust data JOINs. This task is about adding the configurable thresholds.

**Files:**
- Create: `db/migrations/20260408_000003_discovery_config.sql`

- [ ] **Step 1: Create config table for discovery thresholds**

```sql
CREATE TABLE IF NOT EXISTS platform_config (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_config (key, value) VALUES
    ('min_buyers_trending', '3'),
    ('min_buyers_featured', '5'),
    ('trending_weights', '{"volume": 1000, "weighted_votes": 10, "unique_buyers": 50, "linked_penalty": 500, "tier_bonus": 200}'),
    ('trust_score_weights', '{"base": 50, "unique_buyers": 15, "linked_penalty": 25, "concentration_penalty": 15, "creator_sell_penalty": 20, "voter_quality": 15, "tier_bonus": 10}'),
    ('voter_credibility_weights', '{"diversity": 0.30, "trading": 0.30, "age": 0.15, "frequency": 0.15, "creator_bonus": 0.10}')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply migration**

Run: `psql $DATABASE_URL -f db/migrations/20260408_000003_discovery_config.sql`

- [ ] **Step 3: Update campaigns.js and featured.js to read thresholds from platform_config**

Replace hardcoded values with config lookups (cache in memory, refresh every 5 min).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260408_000003_discovery_config.sql frontend/api/campaigns.js frontend/api/featured.js
git commit -m "feat(discovery): add configurable thresholds for trending and featured ranking"
```

---

## Section 6: Premium Modes UI

### Task 6.1: Add premium mode selection to draft editor

**Files:**
- Modify: `frontend/src/pages/Create.tsx`

- [ ] **Step 1: Add premium modes section to draft form**

Conditional section visible only when creator tier >= Premium:
- Toggle: "First-minute wallet cap" with BNB input
- Toggle: "Anti-bot mode" on/off
- Info text explaining each mode

Store selections in `premium_modes` jsonb field of the draft.

- [ ] **Step 2: Pass premium modes to createCampaign() call**

When "Go Live" is triggered, include `firstMinWalletCapWei` and `antiBotEnabled` in the `CampaignRequest` struct sent to the contract.

- [ ] **Step 3: Display active premium modes on campaign page**

Modify `frontend/src/pages/TokenDetails.tsx` — show badges/labels when premium modes are active (read from campaign contract state).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Create.tsx frontend/src/pages/TokenDetails.tsx
git commit -m "feat(frontend): add premium mode selection to draft editor and campaign page display"
```

---

## Integration & Deployment

### Task 7.1: Update indexer to listen for new contract events

**Files:**
- Modify: `realtime-indexer/src/indexer.ts`
- Modify: `realtime-indexer/src/abis.ts`

- [ ] **Step 1: Add CampaignAbandoned event to ABI and topic filters**

Update the factory ABI in `abis.ts` to include `CampaignAbandoned`. Add topic to the factory scan in `indexer.ts`.

- [ ] **Step 2: Handle CampaignAbandoned in indexer**

On CampaignAbandoned: update `campaigns` table (set `is_active = false`), trigger `compute-creator-stats` recomputation for the affected creator.

- [ ] **Step 3: Add trust data to Ably real-time patches**

In `realtime-indexer/src/leagueFeed.ts`, include `trust_score` and `unique_buyers` in `campaign_patch` events so the frontend grid updates in real-time.

- [ ] **Step 4: Commit**

```bash
git add realtime-indexer/src/indexer.ts realtime-indexer/src/abis.ts realtime-indexer/src/leagueFeed.ts
git commit -m "feat(indexer): handle CampaignAbandoned event and add trust data to real-time patches"
```

---

### Task 7.2: Schedule periodic jobs

**Files:**
- Modify: `realtime-indexer/src/server.ts` (or deployment config)

- [ ] **Step 1: Add periodic job scheduling**

In the indexer's main loop or via separate cron configuration:
- `compute-creator-stats`: every 5 minutes
- `compute-voter-profiles`: every 10 minutes
- `compute-campaign-trust`: every 5 minutes (or triggered after trade batch)
- `sync-tiers-to-contract`: every 15 minutes

Follow existing cron pattern from `package.json` scripts.

- [ ] **Step 2: Add health checks for new jobs**

Extend `/health` endpoint to report last-run timestamps for each job.

- [ ] **Step 3: Commit**

```bash
git add realtime-indexer/src/server.ts realtime-indexer/package.json
git commit -m "feat(indexer): schedule periodic trust computation and tier sync jobs"
```

---

### Task 7.3: Deploy contracts to testnet

- [ ] **Step 1: Write deployment script**

Create `scripts/deploy-protection.ts` that:
1. Deploys new `LaunchCampaign` implementation
2. Deploys new `LaunchFactory` with all protection features
3. Calls `setTierConfig` for tiers 0, 1, 2 with initial values
4. Calls `setAbandonTimeout` with initial value
5. Calls `enableLive()`

- [ ] **Step 2: Deploy to BSC testnet**

Run: `npx hardhat run scripts/deploy-protection.ts --network bsc-testnet`

- [ ] **Step 3: Update environment variables**

Update `FACTORY_ADDRESS_97` and `FACTORY_START_BLOCK_97` in indexer and frontend configs.

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy-protection.ts
git commit -m "feat(deploy): add protection framework deployment script"
```

---

## Summary

| Section | Tasks | Key files |
|---|---|---|
| 1. Contracts | 1.1-1.6 | `contracts/LaunchFactory.sol`, `contracts/LaunchCampaign.sol`, `test/ProtectionFramework.spec.ts` |
| 2. Trust data | 2.1-2.6 | `db/migrations/20260408_000001_*`, `realtime-indexer/src/jobs/compute*.ts`, `realtime-indexer/src/jobs/detect*.ts`, `realtime-indexer/src/jobs/sync*.ts` |
| 3. Drafts + API | 3.1-3.5 | `db/migrations/20260408_000002_*`, `frontend/api/drafts.js`, `frontend/api/creator-stats.js`, `frontend/api/campaign-trust.js`, `frontend/api/voter-profile.js`, `frontend/src/pages/Create.tsx` |
| 4. Trust UI | 4.1-4.4 | `frontend/src/components/token/CreatorHistoryCard.tsx`, `frontend/src/components/token/CampaignTrustPanel.tsx`, `frontend/src/components/home/CampaignCard.tsx`, `frontend/src/pages/Profile.tsx` |
| 5. Discovery | 5.1 | `db/migrations/20260408_000003_*`, `frontend/api/campaigns.js`, `frontend/api/featured.js` |
| 6. Premium UI | 6.1 | `frontend/src/pages/Create.tsx`, `frontend/src/pages/TokenDetails.tsx` |
| 7. Integration | 7.1-7.3 | `realtime-indexer/src/indexer.ts`, `realtime-indexer/src/abis.ts`, `scripts/deploy-protection.ts` |
