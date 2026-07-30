# Platform Protection Framework — Summary

## What we're building

A layered protection system that keeps MemeWarzone fair for creators while keeping scammers out. Not everything is default — enforcement scales with a creator's tier (Base / Premium / Verified).

---

## Creator Tier System

Creators earn their tier automatically based on on-chain track record. Tier is stored on-chain (`setCreatorTier()`) so it can't be bypassed. Platform admin can manually promote or demote.

| | Base (new creator) | Premium (proven) | Verified (elite) |
|---|---|---|---|
| Bond (refundable on graduation) | Low | Medium | Low/none |
| Cooldown between launches | Longest | Medium | Shortest |
| Max live campaigns | 1 | 2 | 3 |
| Max drafts | 3 | 5 | 10 |
| Creator no-sell window | Longest | Medium | Shortest |
| Premium launch modes (wallet cap, anti-bot) | No | Yes | Yes |
| Discovery boost | None | +200 trending | +400 trending |

**Tier is earned, not bought.** Metrics: clean campaigns (no early dumps), at least 1 graduation, low abandonment, organic unique buyers, account age. Not based on graduation rate — low graduation is normal on a meme launchpad.

---

## What we're adding — by layer

### 1. Contract Changes (hard enforcement, pre-mainnet)

| Feature | What it does |
|---|---|
| Creator cooldown | Minimum time between launches, per tier. Can't be bypassed. |
| Concurrent campaign cap | Max live campaigns per creator, per tier. |
| Refundable creation bond | Small BNB deposit at launch, refunded on graduation, confiscated on abandon. |
| Abandon cleanup | Anyone can trigger after timeout (e.g. 30 days no activity). Frees the creator's campaign slot, bond goes to treasury. |
| Creator no-sell window (mandatory, all tiers) | Creator wallet can't sell for N blocks after launch. Duration scales by tier — longest for Base, shortest for Verified. Not optional. |
| First-minute wallet cap (opt-in, Premium+) | Max BNB per wallet in first 60 seconds. Cumulative — can't split into small buys. |
| Anti-bot mode (opt-in, Premium+) | Max 1 buy per wallet per block + declining fee multiplier in first blocks. |

**Gas impact:** $0.04-$0.07 extra per launch. Negligible.

### 2. Trust Data (DB + indexer, 5 new tables)

| Table | What it tracks |
|---|---|
| `creator_stats` | Campaign count, graduation count, clean/flagged ratio, avg unique buyers, voter quality, computed tier |
| `wallet_links` | Creator-to-buyer BNB funding trails. Detects creator funding sock puppet wallets. Data model ready for behavioral clustering later. |
| `campaign_trust_snapshot` | Per-campaign: unique buyers, holder concentration, creator sell %, linked wallet %, vote quality, composite trust score (0-100) |
| `voter_profile` | Per-voter: diversity (how many different creators they upvote), trading activity, platform age, credibility score (0-1) |
| `campaign_drafts` | Off-chain drafts with status tracking |

**5 indexer jobs:** compute creator stats, detect wallet links, compute campaign trust, compute voter profiles, sync tiers to contract.

### 3. Campaign Trust UI (transparency)

All data shown to users. No campaigns hidden.

**Campaign page additions:**
- Creator History Card: launches, graduations, clean record, tier badge, account age
- Campaign Trust Panel: unique buyers, holder concentration, creator holding %, linked wallets detected, vote quality

**Campaign cards (grid + featured):**
- Trust badge (green/yellow/orange/red dot)
- Unique buyer count
- Creator tier icon

**Profile page additions:**
- Creator tab with all campaigns + trust scores + tier progression
- Voter credibility badge

### 4. Discovery Controls (trust-weighted ranking)

**New trending formula:**
```
trending = (volume_24h * 1000)
         + (weighted_votes_24h * 10)     // fake votes deflated
         + (unique_buyers * 50)           // organic growth rewarded
         - (linked_buyer_pct * 500)       // fake momentum penalized
         + (creator_tier * 200)           // track record rewarded
```

**Featured carousel:** Uses weighted votes (voter credibility applied). Minimum unique buyer threshold to appear.

**Delayed discovery:** New campaigns visible in "New" tab immediately, but need minimum unique buyers before appearing in Trending or Featured.

**Search:** No restrictions. Always returns everything.

### 5. Voter Credibility (self-correcting upvote system)

Upvotes are weighted by voter behavior:

| Signal | High credibility | Low credibility |
|---|---|---|
| Creator diversity | Votes spread across many creators | 90%+ votes to 1 creator |
| Trading activity | Actively buys/sells | Never traded, only votes |
| Platform age | Active for weeks | Appeared today |
| Vote pattern | Steady over time | Burst of votes in one session |
| Wallet status | Not flagged | Creator-linked wallet |

**Result:** 10 votes from active traders outweigh 50 votes from empty wallets. Fake vote campaigns are naturally suppressed without censoring anything.

### 6. Campaign Drafts (off-chain prepare mode)

Creators prepare campaigns before deploying:
1. Fill form, save as draft (free, off-chain)
2. Preview how it will look
3. Click "Go Live" — API runs pre-flight checks (cooldown, concurrent cap, balance, tier)
4. All checks pass — wallet signs the `createCampaign()` transaction
5. Draft marked as deployed

Draft limit per tier. Deployed/abandoned drafts don't count.

---

## What already exists (no changes needed)

- LP forced burn to dead address (permanent liquidity lock)
- Creator initial buy cap (max 1 BNB)
- Reentrancy guards on all value transfers
- Trading lock until graduation
- Auto-graduation triggers (curve filled or BNB target reached)
- Slippage protection on all buys/sells
- Unique buyer count tracked on-chain
- Full trade history indexed
- Vote aggregates with trending score
- User rank system (Recruit -> General)
- League anti-abuse (creator excluded from trade rankings)

---

## Build order

| # | Section | What | Depends on |
|---|---|---|---|
| 1 | Contract changes | Tiers, bonds, cooldowns, caps, premium modes | Nothing (do first, pre-mainnet) |
| 2 | Trust data model | 4 DB tables + 5 indexer jobs | Contract (tier system) |
| 3 | Campaign drafts | Draft table, API endpoints, create page refactor | Contract (preflight reads) |
| 4 | Campaign trust UI | Creator cards, trust panels, badges | Trust data (needs data to display) |
| 5 | Discovery controls | Weighted trending, featured ranking | Trust data (weighted votes, scores) |
| 6 | Premium modes UI | Opt-in mode selection in draft editor | Tiers + drafts |

---

## Configurable parameters (all TBD, fine-tuned before mainnet)

- Bond amounts per tier
- Cooldown durations per tier
- Max live campaigns per tier
- Max drafts per tier
- Trending formula weights
- Trust score weights
- Voter credibility weights
- Tier progression thresholds
- Clean campaign definition (max creator sell % in first Y minutes)
- Abandoned campaign timeout
- Min unique buyers for trending/featured
- Premium mode bounds (wallet cap range, no-sell block range, anti-bot window)

---

## Enforcement philosophy

| Type | What it means | Examples |
|---|---|---|
| Hard (contract) | Can't be bypassed, even calling contract directly | Cooldown, concurrent cap, bond, no-sell window |
| Soft (API/UI) | Enforced in app, bypassable if calling contract directly | Draft limits, discovery ranking, trust badges |
| Informational | Shown to users, no enforcement | Creator history, holder concentration, vote quality |

**Hard enforcement for rules that protect buyers.** Soft enforcement for discovery and UX. Information for everything else — let users decide.
