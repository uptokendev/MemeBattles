# Platform Protection Framework — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Platform:** MemeWarzone (BNB Chain, pre-mainnet)

## Design Philosophy

Fair for creators, keeps scammers out. Not everything is default — enforcement is layered by creator tier. Transparency over gatekeeping: all trust data is shown to users, no campaigns are hidden.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Wallet detection | Option C: funding trail at launch, data model ready for behavioral clustering later | Catches lazy actors now, avoids overbuilding |
| Prepare mode | Off-chain drafts with per-tier limit | No wasted gas on unused drafts |
| Cooldown + concurrent cap | Hard in contract | Pre-mainnet, $0.02 extra gas, not bypassable |
| Tier system | Auto-calculated (indexer), stored on-chain via `setCreatorTier()`, manual override available | Best of both worlds: off-chain flexibility + on-chain enforcement |
| Tier metrics | Based on clean campaigns, not graduation rate | Low graduation rate is normal on a meme launchpad |
| Discovery | Transparent: show all data, weight ranking by trust, never hide campaigns | Fair for creators |
| Premium modes | Opt-in for Premium+ tier creators | Casual creators aren't burdened with complexity they don't need |
| Voter credibility | Upvotes weighted by voter behavior (diversity, trading, platform age) | Self-correcting: real votes count more, fake votes deflated |

---

## Section 1 — Contract Changes (LaunchFactory + LaunchCampaign)

All on-chain enforcement. Must be implemented pre-mainnet.

### 1.1 New State Variables in LaunchFactory

```solidity
// Tier system
mapping(address => uint8) public creatorTier;        // 0=Base, 1=Premium, 2=Verified

// Per-tier configuration
struct TierConfig {
    uint256 bondAmount;          // refundable deposit (wei)
    uint256 cooldownSeconds;     // min time between deploys
    uint8   maxLiveCampaigns;    // concurrent cap
}
mapping(uint8 => TierConfig) public tierConfig;

// Per-creator state
mapping(address => uint256) public lastDeployTime;
mapping(address => uint8)   public activeCampaignCount;

// Per-campaign bond (NOT per-creator, to handle multiple concurrent campaigns correctly)
mapping(address => uint256) public campaignBond;     // campaign address => bond amount at creation

// Campaign registry for access control on callbacks
mapping(address => bool) public isRegisteredCampaign;
```

### 1.2 Updated `CampaignRequest` Struct

```solidity
struct CampaignRequest {
    // ... existing fields (name, symbol, logoURI, etc.) ...
    uint256 initialBuyBnbWei;
    // New premium mode fields (0 = disabled, tier >= Premium required)
    uint256 firstMinWalletCapWei;
    uint256 creatorNoSellBlocks;
    bool    antiBotEnabled;
}
```

### 1.3 New Checks in `createCampaign()`

```
1.  Read creatorTier[msg.sender] -> tier
2.  Read tierConfig[tier] -> config
3.  require(block.timestamp >= lastDeployTime[msg.sender] + config.cooldownSeconds)
4.  require(activeCampaignCount[msg.sender] < config.maxLiveCampaigns)
5.  require(msg.value >= config.bondAmount + initialBuyBnbWei)
6.  // Retain bond in factory, forward remainder to campaign
7.  uint256 bondAmt = config.bondAmount;
8.  // ... clone campaign, initialize ...
9.  campaignBond[campaignAddr] = bondAmt;   // per-campaign, not per-creator
10. isRegisteredCampaign[campaignAddr] = true;
11. activeCampaignCount[msg.sender]++
12. lastDeployTime[msg.sender] = block.timestamp
13. // Pass (msg.value - bondAmt) to initial buy logic, refund excess
```

**Value flow:** Factory retains `bondAmt` in its own balance. Only `msg.value - bondAmt` is available for the initial buy. Refund calculation: `if (msg.value - bondAmt > spent) { refund remainder }`.

### 1.4 Bond Refund at Graduation (LaunchCampaign._finalize)

The existing `_finalize()` calls the factory via a new callback. Operation ordering matters since `_finalize` is triggered inside a buy transaction (auto-graduation).

```solidity
// In LaunchFactory — callable only by registered campaigns
function onCampaignFinalized(address creator) external {
    require(isRegisteredCampaign[msg.sender], "NotRegistered");
    activeCampaignCount[creator]--;
    uint256 bond = campaignBond[msg.sender];
    if (bond > 0) {
        campaignBond[msg.sender] = 0;
        (bool ok, ) = creator.call{value: bond}("");
        require(ok, "BondRefundFail");
    }
}
```

**Call order in `_finalize()`:**
1. Protocol fee deduction (existing)
2. LP provisioning via router (existing)
3. Burn unsold tokens (existing)
4. Transfer creator reserve (existing)
5. **factory.onCampaignFinalized(creator)** — NEW, after all value transfers
6. `token.enableTrading()` (existing)

The factory callback is placed after all campaign-internal value transfers to avoid re-entrancy risk. The factory sends the bond refund to the creator as a separate transfer.

**Events:** `CampaignFinalized` already exists. Factory emits new `BondRefunded(address indexed creator, address indexed campaign, uint256 amount)`.

### 1.5 Bond Confiscation on Abandon

```solidity
// Callable by ANYONE after timeout — prevents creators from getting permanently locked
function abandonCampaign(address campaign) external {
    require(isRegisteredCampaign[campaign], "NotRegistered");
    LaunchCampaign c = LaunchCampaign(payable(campaign));
    require(!c.launched(), "AlreadyFinalized");
    require(block.timestamp >= c.lastActivityTime() + abandonTimeout, "TooEarly");

    activeCampaignCount[c.creator()]--;
    uint256 bond = campaignBond[campaign];
    campaignBond[campaign] = 0;
    // Bond NOT refunded — sent to protocol treasury
    if (bond > 0) {
        (bool ok, ) = feeRecipient.call{value: bond}("");
        require(ok, "TreasuryTransferFail");
    }
    emit CampaignAbandoned(c.creator(), campaign, bond);
}
```

**Key design choice:** Callable by anyone (not just creator) after timeout. This prevents creators from getting permanently locked out of `maxLiveCampaigns` if they lose interest. A keeper bot or admin can trigger cleanup.

**Events:** New `CampaignAbandoned(address indexed creator, address indexed campaign, uint256 bondConfiscated)` — indexer listens for this to update `creator_stats.abandoned_campaigns`.

**LaunchCampaign addition:** Needs a `lastActivityTime` public variable, updated on each buy/sell. Used by `abandonCampaign()` to enforce the timeout.

### 1.6 Creator No-Sell Window (Mandatory, All Tiers)

The creator wallet cannot sell tokens for N blocks after campaign creation. This is NOT optional — it applies to every campaign. Duration scales by tier (configured via `TierConfig`):

```solidity
// In TierConfig struct (add field)
struct TierConfig {
    uint256 bondAmount;
    uint256 cooldownSeconds;
    uint8   maxLiveCampaigns;
    uint256 creatorNoSellBlocks;    // mandatory no-sell duration for this tier
}
```

Factory sets `creatorNoSellBlocks` from the creator's tier config at `createCampaign()` — the creator cannot override or disable it.

```solidity
// In LaunchCampaign.sellExactTokens()
if (msg.sender == creator && block.number < startBlock + creatorNoSellBlocks) {
    revert CreatorSellLocked();
}
```

### 1.7 Opt-in Premium Modes (LaunchCampaign)

New fields in `InitParams` (passed from `CampaignRequest` through factory), only available if tier >= 1 (Premium):

| Field | Type | What it does |
|---|---|---|
| `firstMinWalletCapWei` | uint256 | Max BNB per wallet in first 60 seconds. 0 = disabled. |
| `antiBotEnabled` | bool | If true: max 1 buy per wallet per block + declining fee multiplier in first N blocks. |

Factory validates at `createCampaign()`: if any premium field is non-zero/true, `require(creatorTier[msg.sender] >= 1)`.

### 1.7 New Owner Functions

```solidity
function setCreatorTier(address creator, uint8 tier) external onlyOwner
function setTierConfig(uint8 tier, TierConfig calldata cfg) external onlyOwner
function batchSetCreatorTier(address[] calldata creators, uint8[] calldata tiers) external onlyOwner
```

### 1.7 Gas Impact

| Scenario | Extra gas | Extra cost (BNB ~$600, 3 gwei) |
|---|---|---|
| Base creator, no opt-ins | ~21,500 | ~$0.04 |
| Premium, all modes on | ~36,700 | ~$0.07 |
| At graduation (bond refund) | ~9,600 net | ~$0.02 |
| Tier update (`setCreatorTier`) | ~25,000 | ~$0.05 (paid by platform) |

---

## Section 2 — Trust Data Model (DB + Indexer)

Data foundation for all trust signals. Everything the frontend and discovery system reads from.

### 2.1 New Table: `creator_stats`

Aggregated creator track record, updated by indexer job.

| Column | Type | Purpose |
|---|---|---|
| chain_id | int | PK with creator_address |
| creator_address | text | |
| total_campaigns | int | All campaigns ever created |
| graduated_campaigns | int | Successfully graduated |
| abandoned_campaigns | int | No trades for >48h, not graduated |
| clean_campaigns | int | No rug-flag triggered |
| flagged_campaigns | int | Creator dumped early or pattern detected |
| avg_unique_buyers | float | Average unique buyers across campaigns |
| total_volume_bnb | numeric | Cumulative volume generated |
| first_campaign_at | timestamptz | Account age signal |
| last_campaign_at | timestamptz | Recency |
| avg_voter_credibility | float | Average credibility across all campaigns' voters |
| total_weighted_votes | numeric | Sum of credibility-weighted votes received |
| vote_diversity_score | float | How diverse their voter base is |
| tier_override | smallint | Null = auto, 0/1/2 = manual override |
| computed_tier | smallint | Auto-calculated tier |
| updated_at | timestamptz | |

### 2.2 New Table: `wallet_links`

Creator-linked wallet detection (Option C foundation).

| Column | Type | Purpose |
|---|---|---|
| chain_id | int | |
| campaign_address | text | Which campaign context |
| wallet_a | text | Source wallet (usually creator) |
| wallet_b | text | Linked wallet |
| link_type | text | 'direct_funding', 'shared_source', 'circular_flow' |
| evidence_tx_hash | text | The transfer that proves the link |
| amount_wei | numeric | How much was transferred |
| detected_at | timestamptz | |
| confidence | float | 0-1 score (1.0 for direct transfers) |
| cluster_id | uuid | Nullable — reserved for behavioral clustering later |
| detection_method | text | 'funding_trail' now, 'behavioral' later |

### 2.3 New Table: `campaign_trust_snapshot`

Per-campaign trust signals, computed after each trade batch.

| Column | Type | Purpose |
|---|---|---|
| chain_id | int | PK with campaign_address |
| campaign_address | text | |
| unique_buyers | int | Distinct wallets that bought |
| linked_buyer_count | int | Buyers flagged in wallet_links |
| linked_buyer_pct | float | linked / unique ratio |
| top5_holder_pct | float | % of supply held by top 5 wallets |
| top10_holder_pct | float | % of supply held by top 10 |
| creator_holding_pct | float | Creator's current % of supply |
| creator_sold_pct | float | % of creator's initial buy that was sold |
| flagged_wallet_volume_pct | float | Volume from linked wallets / total |
| weighted_votes_24h | float | Credibility-weighted vote total |
| avg_voter_credibility | float | Average credibility of voters |
| suspicious_vote_pct | float | % of votes from credibility < 0.3 |
| first_trade_at | timestamptz | |
| trust_score | float | Composite 0-100 score (configurable weights) |
| updated_at | timestamptz | |

### 2.4 New Table: `voter_profile`

Voter credibility scoring.

| Column | Type | Purpose |
|---|---|---|
| chain_id | int | PK with voter_address |
| voter_address | text | |
| total_votes | int | All-time upvotes cast |
| unique_creators_voted | int | Distinct creators upvoted |
| unique_campaigns_voted | int | Distinct campaigns upvoted |
| creator_concentration | float | % of votes going to most-voted creator |
| has_traded | bool | Ever bought/sold on the platform |
| total_trades | int | Buy + sell count |
| has_created_campaign | bool | Ever created a campaign |
| total_volume_bnb | numeric | Trading volume |
| first_activity_at | timestamptz | First trade or vote |
| credibility_score | float | Composite 0-1 score |
| updated_at | timestamptz | |

### 2.5 Voter Credibility Score Formula

Weights configurable:

```
// Base credibility (stored in voter_profile.credibility_score — global, not per-campaign)
base_credibility = (
    diversity_score     * 0.30    // 0-1 based on unique creators / total votes
  + trading_score       * 0.30    // 0-1 based on trade count + volume
  + age_score           * 0.15    // 0-1 based on days active
  + frequency_score     * 0.15    // 0-1 penalizes burst patterns
  + creator_bonus       * 0.10    // 0.5 base + 0.5 if has_created_campaign
)

// Per-campaign effective credibility (applied at query time in campaign_trust_snapshot)
effective_credibility = base_credibility * link_penalty
// link_penalty: 0 if voter is in wallet_links for THIS campaign, 1 otherwise
```

**Note:** `voter_profile.credibility_score` stores the base score (without link_penalty). The `link_penalty` is campaign-specific and applied when computing `campaign_trust_snapshot.avg_voter_credibility`.

### 2.6 Tier Calculation Metrics

Based on clean campaigns, not graduation rate. Exact thresholds configurable.

| Metric | Measures | Base -> Premium | Premium -> Verified |
|---|---|---|---|
| Clean campaigns | No early creator dumps | >= N | >= M |
| At least 1 graduation | Can achieve it | >= 1 | >= X |
| No abandoned campaigns | Serious intent | <= N | <= M |
| Min unique buyers (avg) | Organic traction | >= N per campaign | >= M per campaign |
| Account age | Not a throwaway | >= N days | >= M days |
| No active demote override | No manual flags | Clean | Clean |

"Clean campaign" = creator wallet has not sold >X% of supply in first Y minutes. Configurable.

"Abandoned" = campaign with >48h no trades and not graduated.

### 2.7 Campaign Trust Score Formula

Composite 0-100 score stored in `campaign_trust_snapshot.trust_score`. Weights configurable:

```
trust_score = clamp(0, 100,
    50                                              // base score
  + (unique_buyers_normalized          * 15)        // 0-1: more unique buyers = higher
  - (linked_buyer_pct                  * 25)        // 0-1: more linked buyers = lower
  - (top5_holder_pct_normalized        * 15)        // 0-1: higher concentration = lower
  - (creator_sold_pct                  * 20)        // 0-1: creator dumping = lower
  + (avg_voter_credibility             * 15)        // 0-1: higher quality voters = higher
  + (creator_tier_bonus                * 10)        // 0/0.5/1: Base=0, Premium=0.5, Verified=1
)
```

### 2.8 Wallet Link Detection — Data Source & Window

The `detect-wallet-links` job uses BSC internal transactions to trace BNB funding trails. Implementation details:

- **Detection window:** First 10 minutes of campaign life (configurable), or first 20 buys, whichever comes first
- **Data source:** BSCScan Internal Transactions API (`txlistinternal`) for the creator wallet, filtered to 24h before campaign creation. This avoids the need for `trace_call` RPC support which BSC public nodes don't reliably provide.
- **Rate limiting:** BSCScan API has 5 calls/sec free tier. The job queues detections and processes them with backoff. One API call per campaign creation + one per early buy to check.
- **Fallback:** If BSCScan API is unavailable, the detection is queued for retry. Campaigns are NOT blocked — detection is informational, not gatekeeping.

### 2.9 Indexer Jobs

| Job | Trigger | Writes to |
|---|---|---|
| `compute-creator-stats` | Periodic (every 5 min) | `creator_stats` |
| `detect-wallet-links` | On CampaignCreated + early buys (first 10 min / 20 buys) | `wallet_links` |
| `compute-campaign-trust` | On trade batch processed | `campaign_trust_snapshot` |
| `compute-voter-profiles` | Periodic (every 10 min) | `voter_profile` |
| `sync-tiers-to-contract` | Periodic (every 15 min) | On-chain `creatorTier` via `batchSetCreatorTier()` |

---

## Section 3 — Campaign Trust UI

All data shown transparently. No campaigns hidden.

### 3.1 Creator History Card (Campaign Page)

Displayed next to creator name on every campaign page.

| Element | Data source |
|---|---|
| Campaigns launched | `creator_stats.total_campaigns` |
| Graduation count | `creator_stats.graduated_campaigns` |
| Clean record | `creator_stats.clean_campaigns` / `flagged_campaigns` |
| Tier badge | `creatorTier` on-chain |
| Account age | `creator_stats.first_campaign_at` |
| Avg unique buyers | `creator_stats.avg_unique_buyers` |
| Voter trust | `creator_stats.avg_voter_credibility` |

### 3.2 Campaign Trust Panel (Campaign Page)

Collapsible section below the chart.

| Element | Data source |
|---|---|
| Unique buyers | `campaign_trust_snapshot.unique_buyers` |
| Top 5 holder concentration | `campaign_trust_snapshot.top5_holder_pct` |
| Top 10 holder concentration | `campaign_trust_snapshot.top10_holder_pct` |
| Creator holding | `campaign_trust_snapshot.creator_holding_pct` |
| Creator sold | `campaign_trust_snapshot.creator_sold_pct` |
| Linked wallets detected | `campaign_trust_snapshot.linked_buyer_count` |
| Linked wallet volume | `campaign_trust_snapshot.flagged_wallet_volume_pct` |
| Vote quality | `campaign_trust_snapshot.avg_voter_credibility` |
| Suspicious votes | `campaign_trust_snapshot.suspicious_vote_pct` |

### 3.3 Trust Badge (Campaign Cards)

Color-coded badge on campaign cards in grid and featured carousel.

| Trust score range | Badge | Color |
|---|---|---|
| 80-100 | High trust | Green |
| 50-79 | Moderate | Yellow |
| 20-49 | Low trust | Orange |
| 0-19 | Very low | Red |

Informational only. No campaigns hidden.

### 3.4 Profile Page Additions

**Creator tab** — new tab on profile page:
- All campaigns list with graduated/active/abandoned status
- Per-campaign trust score
- Overall stats summary from `creator_stats`
- Current tier + progression toward next tier

**Voter credibility badge** — visible on profile:
- Credibility score from `voter_profile`
- Labels: "Active trader & voter" / "Voter only" / "New account"

### 3.5 Campaign Card Updates

Add to existing cards (minimal, not cluttered):
- Trust badge: small colored dot next to name
- Unique buyers: small text below mcap
- Creator tier: small icon next to creator name

### 3.6 New API Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/creator-stats?chainId=X&address=Y` | `creator_stats` row |
| `GET /api/campaign-trust?chainId=X&campaign=Y` | `campaign_trust_snapshot` row |
| `GET /api/voter-profile?chainId=X&address=Y` | `voter_profile` row |
| Extend `GET /api/campaigns` | Add `trust_score`, `unique_buyers` |
| Extend `GET /api/featured` | Add `trust_score`, `unique_buyers` |

---

## Section 4 — Discovery Controls

Trust signals influence ranking. No campaigns hidden.

### 4.1 Updated Trending Formula

Current:
```
trending = (vol_24h_bnb * 1000) + (votes_24h * 10)
```

New:
```
trending = (vol_24h_bnb * 1000)
         + (weighted_votes_24h * 10)
         + (unique_buyers * 50)
         - (linked_buyer_pct * 500)
         + (creator_tier * 200)
```

All weights configurable in DB.

**Where this is computed:** In the `GET /api/campaigns` SQL query (currently in `campaigns.js` line 185). The query JOINs `campaign_trust_snapshot` and `creator_stats` tables to access `weighted_votes_24h`, `unique_buyers`, `linked_buyer_pct`, and `computed_tier`. The existing `vote_aggregates.trending_score` (time-decay formula in the indexer) is replaced by this new inline computation.

### 4.2 Featured Carousel Changes

- Use `weighted_votes_24h` instead of raw votes
- Minimum unique buyer threshold to appear (configurable, e.g. 5)
- Campaigns with `trust_score < X` pushed to bottom, not removed

### 4.3 Main Grid Tab Behavior

| Tab | Sort change |
|---|---|
| Trending | New weighted formula |
| New | No change |
| Ending Soon | No change |
| Trading on DEX | No change |

### 4.4 Delayed Discovery for New Campaigns

```
Campaign created
  -> Visible in "New" tab immediately (always)
  -> Visible in "Trending" only after >= N unique buyers (configurable, e.g. 3)
  -> Eligible for "Featured" only after >= M unique buyers (configurable, e.g. 5)
```

### 4.5 Search

No restrictions. Always returns all campaigns regardless of trust score.

---

## Section 5 — Hard Enforcement (Contract Premium Modes)

Opt-in features for Premium+ creators. On-chain enforced.

### 5.1 First-Minute Wallet Cap

Limits BNB per wallet in first 60 seconds. Prevents whale/bot scooping.

```solidity
// Cumulative tracking per wallet during first minute
mapping(address => uint256) public firstMinuteSpent;

// In buyExactTokens() / buyExactBnb(), after computing actualCost:
if (firstMinWalletCap > 0 && block.timestamp < campaignStartTime + 60) {
    firstMinuteSpent[msg.sender] += actualCost;
    require(firstMinuteSpent[msg.sender] <= firstMinWalletCap, "WalletCapExceeded");
}
```

**Note:** Uses cumulative tracking (not per-tx), so splitting into multiple small buys does not bypass the cap. Checks `actualCost` (the real BNB spent), not `msg.value` (which may include excess for `buyExactTokens`).

Gas: ~7,200 extra per buy during first minute (cold SLOAD + SSTORE for new wallet, ~2,200 for warm/returning wallet).

### 5.2 Creator No-Sell Window (Mandatory — moved to Section 1.6)

This is no longer an opt-in premium mode. It is mandatory for all campaigns, with duration set by the creator's tier. See Section 1.6 for implementation details.

Gas: ~2,200 extra per sell (creator wallet only, no cost for other sellers).

**Important:** Hard rule for declared creator wallet only. Linked wallets get soft UI warnings but transactions are NOT blocked (avoids false positive enforcement).

### 5.3 Anti-Bot Launch Mode

Two mechanisms:

**Max 1 buy per wallet per block:**
```solidity
if (antiBotEnabled && block.number <= startBlock + antiBotBlocks) {
    require(lastBuyBlock[msg.sender] < block.number, "OnePerBlock");
    lastBuyBlock[msg.sender] = block.number;
}
```

**Declining fee multiplier:**
- First 3 blocks: 3x protocol fee
- Blocks 4-6: 2x protocol fee
- After: normal fee

Gas: ~22,000 extra per buy for first-time wallet during anti-bot window (cold SLOAD + SSTORE for `lastBuyBlock`), ~5,000 for returning wallet (warm storage).

### 5.4 Premium Mode Summary

| Mode | Enforced on | Bypassable | Extra gas | Duration |
|---|---|---|---|---|
| Creator no-sell (MANDATORY) | Creator wallet only | No (contract) | ~2,200/sell | N blocks (per tier) |
| First-min wallet cap (opt-in) | All buyers | No (contract) | ~7,200/buy (first-time), ~2,200 (returning) | First 60 seconds |
| Anti-bot (1 per block, opt-in) | All buyers | No (contract) | ~22,000/buy (first-time), ~5,000 (returning) | First N blocks |
| Anti-bot (fee multiplier, opt-in) | All buyers | No (contract) | 0 (fee, not gas) | First N blocks |
| Linked wallet soft flag | Linked wallets | Yes (UI only) | 0 | Same as no-sell window |

---

## Section 6 — Campaign Drafts (Off-chain Draft System)

Draft layer between form and on-chain deployment.

### 6.1 Draft Lifecycle

```
Creator fills form -> Draft saved in DB -> Preview page
                                               |
                               Creator clicks "Go Live"
                                               |
                               API runs pre-flight checks:
                                 - Draft limit not exceeded
                                 - Cooldown passed
                                 - Active campaigns < max
                                 - Wallet has enough BNB
                                               |
                               All pass -> frontend submits createCampaign() tx
                                               |
                               Tx confirmed -> draft status = "deployed"
                                               |
                               Indexer picks up CampaignCreated -> normal flow
```

### 6.2 New Table: `campaign_drafts`

| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| chain_id | int | |
| creator_address | text | |
| name | text | Token name |
| symbol | text | Ticker |
| logo_uri | text | Uploaded logo |
| description | text | Optional |
| x_account | text | Optional Twitter/X |
| website | text | Optional |
| extra_link | text | Optional Telegram/Discord |
| base_price | numeric | Custom or null for default |
| price_slope | numeric | Custom or null for default |
| graduation_target | numeric | Custom or null for default |
| initial_buy_bnb | numeric | Optional creator initial buy |
| premium_modes | jsonb | `{ firstMinWalletCap, creatorNoSellBlocks, antiBotEnabled }` |
| status | text | 'draft', 'deploying', 'deployed', 'abandoned' |
| deployed_campaign_address | text | Filled after deploy |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.3 Draft Limits Per Tier

| Creator tier | Max active drafts (configurable) |
|---|---|
| Base | e.g. 3 |
| Premium | e.g. 5 |
| Verified | e.g. 10 |

Deployed and abandoned drafts don't count toward limit.

### 6.4 API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/drafts` | Create draft (SIWE auth required) |
| `GET /api/drafts?chainId=X&creator=Y` | List creator's drafts |
| `GET /api/drafts/:id` | Get single draft |
| `PUT /api/drafts/:id` | Update draft (status must be 'draft') |
| `DELETE /api/drafts/:id` | Abandon draft |
| `POST /api/drafts/:id/preflight` | Run pre-flight checks |
| `POST /api/drafts/:id/mark-deployed` | Link draft to deployed campaign |

### 6.5 Pre-flight Checks

| Check | Source | Failure message |
|---|---|---|
| Draft exists and is yours | DB | "Draft not found" |
| Draft status = 'draft' | DB | "Draft already deployed" |
| Cooldown passed | Contract read | "Cooldown active, wait X minutes" |
| Under concurrent cap | Contract read | "Max live campaigns reached" |
| Premium modes allowed | Contract: tier check | "Premium modes require Premium tier" |
| Balance sufficient | RPC: wallet balance | "Insufficient balance, need X BNB" |

### 6.6 Frontend Changes

- Create page (`/create`) becomes a draft editor
- "Create" button saves draft instead of submitting tx
- New "My Drafts" section with status per draft
- Each draft: Edit, Preview, Go Live, Delete buttons
- "Go Live" runs preflight -> shows results -> if pass, prompts wallet signature
- Draft preview page (`/draft/:id`) for creator-only preview

**Authentication:** All draft write endpoints (POST, PUT, DELETE, mark-deployed) require SIWE-style wallet signature authentication, matching the existing pattern used by `POST /api/profile` and `POST /api/comments`. GET endpoints for own drafts require the same auth. This prevents one creator from modifying another's drafts.

---

## Deployment Strategy

Since the platform is **pre-mainnet**, the contract changes are deployed as part of the initial mainnet factory. No migration of existing campaigns is needed.

**Factory deployment:**
- Deploy new `LaunchFactory` with all Section 1 changes (tiers, bonds, cooldowns, premium modes)
- Deploy new `LaunchCampaign` implementation with premium mode support + `lastActivityTime` + factory callback
- Set initial `tierConfig` for all 3 tiers via `setTierConfig()`
- All creators start at tier 0 (Base) — the indexer promotes them as they build track record

**If testnet campaigns exist:** They are on the old factory and unaffected. The new factory starts fresh with campaign ID 0 on mainnet.

**Note on the existing `live` latch:** The factory's `bool public live` (Prepare Mode / Live Mode) is a separate concept from "Campaign Drafts" (Section 6). The `live` latch controls whether the factory accepts any campaigns at all (global kill switch). Campaign Drafts are per-creator off-chain staging. These are intentionally different concepts despite the naming overlap — the `live` latch was renamed from "Prepare Mode" in early development and is now a one-way production switch.

---

## Full Implementation Matrix

### Layer 1 — Reputation (Creator Transparency)

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Creator history on campaign page | No | DB + API + Frontend | Soft (UI) | 1 |
| Creator History Card component | No | Frontend | Soft (UI) | 1 |
| Creator tier badge | No | Contract + Frontend | Hard | 1 |
| Creator tier auto-calculation | No | Indexer + DB | Soft | 1 |
| Tier sync to contract | No | Indexer -> contract | Hard | 1 |
| Manual tier override (admin) | No | API + DB | Soft | 1 |
| Creator profile tab | No | Frontend | Soft (UI) | 1 |

### Layer 2 — Detection (Wallet Intelligence)

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Creator-linked wallet detection | No | Indexer + DB | Soft | 1 |
| Linked buyer count per campaign | No | Indexer + DB | Soft | 1 |
| Unique buyers display | Partial (on-chain) | API + Frontend | Soft (UI) | 1 |
| Top holder concentration | No | Indexer + Frontend | Soft (UI) | 1 |
| Creator holding % display | No | Indexer + Frontend | Soft (UI) | 1 |
| Voter credibility scoring | No | Indexer + DB | Soft | 1 |
| Weighted vote counts | No | DB + API | Soft | 1 |
| Composite trust score | No | Indexer + DB | Soft | 1 |
| Behavioral wallet clustering | No | Analytics pipeline | Soft | 3 |

### Layer 3 — Discovery Gating

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Weighted trending formula | No | API query | Soft | 1 |
| Featured ranking by weighted votes | No | API query | Soft | 1 |
| Min buyer threshold (trending) | No | API + DB config | Soft | 1 |
| Min buyer threshold (featured) | No | API + DB config | Soft | 1 |
| Trust badge on cards | No | Frontend | Soft (UI) | 1 |

### Layer 4 — Enforcement (Hard Rules)

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Creator cooldown | No | Contract | Hard | 1 |
| Max concurrent campaigns | No | Contract | Hard | 1 |
| Refundable creation bond | No | Contract | Hard | 1 |
| Bond confiscation on abandon | No | Contract | Hard | 2 |
| Creator no-sell window (mandatory) | No | Contract (per-tier duration) | Hard | 1 |
| First-minute wallet cap (opt-in) | No | Contract (Premium+) | Hard | 2 |
| Anti-bot launch mode (opt-in) | No | Contract (Premium+) | Hard | 2 |
| Linked wallet soft flag | No | Frontend (UI only) | Soft | 2 |

### Layer 5 — Campaign Drafts

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Off-chain draft system | No | DB + API + Frontend | Soft | 1 |
| Draft limit per tier | No | API + DB config | Soft | 1 |
| Pre-flight checks | No | API endpoint | Soft | 1 |
| Draft preview page | No | Frontend | Soft (UI) | 2 |
| Create page -> draft editor | No | Frontend refactor | Soft (UI) | 1 |

### Layer 6 — Voter Trust

| Feature | Exists | Where | Enforcement | Tier |
|---|---|---|---|---|
| Voter credibility profile | No | DB + Indexer | Soft | 1 |
| Upvote credibility check | No | Indexer job | Soft | 1 |
| Voter diversity analysis | No | Indexer job | Soft | 1 |
| Voter badge on profile | No | Frontend | Soft (UI) | 2 |
| Suspicious vote % display | No | Frontend | Soft (UI) | 2 |

---

## Build Order

| # | Section | Scope | Depends on |
|---|---|---|---|
| 1 | Contract changes | LaunchFactory + LaunchCampaign | Nothing (do first) |
| 2 | Trust data model | 4 new DB tables + 5 indexer jobs | Section 1 (tier system) |
| 3 | Campaign drafts | Draft table (5th new table), API, create page refactor | Section 1 (preflight reads contract) |
| 4 | Campaign trust UI | Creator History Card, Trust Panel, badges, profile tab | Section 2 (data) |
| 5 | Discovery controls | Updated trending, featured ranking, thresholds | Section 2 (weighted votes, trust scores) |
| 6 | Premium modes | Opt-in contract features + UI | Section 1 (tiers) + Section 3 (drafts UX) |

**Recommended order: 1 -> 2 -> 3 -> 4 -> 5 -> 6**

---

## Configurable Parameters (to fine-tune before mainnet)

All values below are examples. Final values TBD.

### Contract Parameters (owner-configurable)

| Parameter | Base | Premium | Verified |
|---|---|---|---|
| Bond amount | TBD | TBD | TBD |
| Cooldown seconds | TBD | TBD | TBD |
| Max live campaigns | TBD | TBD | TBD |
| Creator no-sell blocks (mandatory) | TBD (longest) | TBD (medium) | TBD (shortest) |

### DB/API Parameters

| Parameter | Value |
|---|---|
| Max active drafts (Base) | TBD |
| Max active drafts (Premium) | TBD |
| Max active drafts (Verified) | TBD |
| Min unique buyers for trending | TBD |
| Min unique buyers for featured | TBD |
| Trust score weights | TBD |
| Voter credibility weights | TBD |
| Trending formula weights | TBD |
| Clean campaign threshold (max creator sell % in first Y min) | TBD |
| Abandoned campaign threshold (hours no trades) | TBD |
| Tier progression thresholds | TBD |

### Premium Mode Defaults (creator-configurable within bounds)

| Parameter | Min | Max |
|---|---|---|
| First-min wallet cap | TBD | TBD |
| Creator no-sell blocks | TBD | TBD |
| Anti-bot window blocks | TBD | TBD |
| Anti-bot fee multiplier | TBD | TBD |

---

## What Already Exists (No Changes Needed)

- LP forced burn to dead address
- Creator initial buy cap (1 BNB)
- Reentrancy guards on all value transfers
- Trading lock until finalization
- Auto-graduation triggers
- Slippage protection
- Fee escrow for failed sends
- Parameter bounds validation
- Unique buyer count on-chain (`buyersCount`)
- Full trade history in `curve_trades`
- Vote aggregates with trending score
- User rank system (Recruit -> General)
- League anti-abuse (creator/fee recipient excluded from rankings)
- 25+ unique buyer requirement for fastest_finish league
