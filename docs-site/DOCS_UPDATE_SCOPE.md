🧱 DOCS UPDATE — BUILD SCOPE
🎯 Objective

Bring docs.memewar.zone fully in sync with:

Current architecture (TreasuryRouter + buckets)
Full incentive system (Recruiter, Airdrops, Squad Pool)
Real product positioning (competitive ecosystem, not just launchpad)
Actual user flows + reward mechanics
📦 SCOPE STRUCTURE

We split this into 4 workstreams:

Core Architecture Rewrite
Feature Documentation (3 systems)
User & Product Layer
Trust Layer (security, anti-abuse, transparency)
🧩 WORKSTREAM 1 — CORE ARCHITECTURE
1.1 Fee Routing System (NEW PAGE)

Goal: Replace outdated “fees → treasury” explanation

Must include:
TreasuryRouter as single entry point
Downstream vaults:
LeagueTreasury
RecruiterRewardsVault
CommunityRewardsVault
Airdrops
Squad Pool
ProtocolRevenueVault
Include routing tables:
Trade (linked vs unlinked)
Finalize (linked vs unlinked)
OG recruiter override
Include principles:
No new fees added
Routing happens before protocol revenue
Unlinked flows → Airdrops
1.2 Updated Treasury Page

Goal: Align old Owners Safe model with new routing

Changes:
Clarify:
ProtocolRevenueVault → Owners Safe
Keep:
Weekly payouts
Ops Safe logic
Add:
“Protocol revenue is remainder after routing”
1.3 Economic Model Page (UPDATE)

Merge:

Trading fees
UpVotes
Finalize mechanics

Add:

Incentive redistribution (Leagues, Airdrops, Squad Pool)
⚔️ WORKSTREAM 2 — FEATURE SYSTEMS (CORE OF UPDATE)
2.1 Recruiter Program Page (NEW)
Sections:
What is a recruiter
How linking works
30-day persistence
lock after first activity
Earnings:
0.25% trade
0.30% finalize
OG recruiter bonus
Claim system (weekly)
Recruiter lifecycle:
inactivity → closure → detachment
Add:
Recruiter leaderboard explanation
Public profiles
2.2 Warzone BNB Airdrops Page (NEW)
Sections:
What Airdrops are
Funding source:
unlinked recruiter + squad fees
Weekly system:
50% traders
50% creators
Include:
Eligibility rules:
volume caps
trade/activity requirements
Anti-abuse filtering
Weighted random selection
Cooldowns
UX layer:
eligibility visibility
claim process
winner pages
2.3 Squad Pool Page (NEW)
Sections:
What Squad Pool is
Relationship with recruiters
Core mechanics:
Contribution-based rewards (NOT equal split)
Member score formula
Weekly distribution
Advanced rules:
40% member cap
15% squad cap
Diminishing returns
UX:
squad leaderboard
member ranking (exact score)
estimated rewards
2.4 Leagues Page (UPDATE)
Add:
How leagues are funded (0.75% trade routing)
How they connect to:
squads
trading activity
Weekly + monthly structure
🔄 WORKSTREAM 3 — PRODUCT & USER LAYER
3.1 “How MemeWarzone Works” (NEW CORE PAGE)

This is CRITICAL.

Build a clear flow:
Creator launches campaign
Traders enter bonding curve
Activity generates fees
Fees route into:
leagues
recruiters
airdrops
squads
Weekly epoch closes
Users claim rewards

👉 This explains the system in 1 place.

3.2 Campaign System (RENAME + UPDATE)

Replace “Launchpad”

Include:
bonding curve
graduation
LP creation (80/20 split)
finalize fee
3.3 Epoch & Rewards System (NEW)
Explain:
Weekly epochs (Monday reset)
Claim windows (7 days)
Expiry + rollover rules
Unified reward logic
3.4 User Dashboard / Rewards UX (NEW)
Explain what users see:
pending rewards
eligibility status
claim buttons
reason codes
🔐 WORKSTREAM 4 — TRUST LAYER
4.1 Security Page (UPDATE)
Add:
No dev wallet custody
Router-enforced splits
Multisig treasury
Claim-based payouts
4.2 Anti-Abuse System (NEW PAGE)
High-level only:
No wash trading rewards
No self-trading rewards
Wallet clustering
Exclusion rules

👉 Don’t expose logic, but show seriousness

4.3 Transparency Page (NEW)
Public:
leaderboards (recruiter, squad)
airdrop winners
Private:
user dashboards
reward breakdowns
🧠 WORKSTREAM 5 — POSITIONING FIX (CRITICAL)
Update ALL pages:

Replace:

❌ “memecoin launchpad”

With:

✅ “competitive on-chain ecosystem”

Add section:
“Why MemeWarzone is different”
Not one-time launches
Recurring competition
Self-funding incentives
Community-driven outcomes
🧾 DELIVERABLES
New Pages (8–10)
Fee Routing System
Recruiter Program
Warzone Airdrops
Squad Pool
How It Works
Epoch System
Anti-Abuse
Transparency
(optional) Dashboard UX
Updated Pages
Treasury
Launchpad → Campaign System
Leagues
Economics
✅ CLOSEOUT CHECKLIST

Use this as your “everything is aligned” gate.

🧱 Architecture
 TreasuryRouter fully documented
 All routing paths explained (linked/unlinked/OG)
 Vault structure documented correctly
 Protocol revenue definition corrected
⚔️ Incentive Systems
 Recruiter Program fully documented
 Airdrop system fully documented
 Squad Pool fully documented
 All reward percentages match implementation
 Claim-based system explained everywhere
🔄 Product Understanding
 “How it works” page exists
 Full ecosystem flow explained clearly
 Campaign system updated (no “launchpad” language)
 Leagues connected to overall system
🧠 User Clarity
 Reward flow understandable for new users
 Dashboard/reward UX explained
 Eligibility + claim logic documented
 No conflicting explanations across pages
🔐 Trust & Credibility
 Security model updated
 Anti-abuse system documented (high-level)
 Transparency features explained
 No outdated treasury claims
📊 Consistency
 All % values consistent across all pages
 Terminology unified:
recruiter
squad
epoch
campaign
 No legacy logic (old router / old treasury) remains
🚀 Positioning
 “Launchpad” language removed or reframed
 Ecosystem/flywheel clearly explained
 Incentives framed as core, not add-ons
🧪 Final Validation
 A new user can understand:
how to earn
how rewards work
how system sustains itself
 A dev can understand:
routing
architecture
 An investor can understand:
revenue model
growth loops

Best approach: treat it as a docs product update, not only content editing.

Recommended workflow
1. Freeze the source of truth first

Create one internal file:

docs-content-source-of-truth.md

This should contain the final approved logic for:

fee routing
Recruiter Program
Warzone BNB Airdrops
Squad Pool
epochs / claims
treasury wording
security / anti-abuse
user flows

No page should be updated directly before this is clean.

2. Audit the current docs system

Check:

where docs pages live
how navigation/sidebar is generated
whether pages are markdown, MDX, JSON, TS objects, or CMS-driven
whether routes are static or dynamic
whether there are reusable components for:
callouts
tables
diagrams
FAQ blocks
warnings

Goal: know whether this is mainly a content update or also a docs-engine update.

3. Build a new docs map

Before editing content, define the new structure:

Start Here
- What is MemeWarzone?
- How MemeWarzone Works
- Campaigns / Launches
- Leagues

Rewards & Incentives
- Recruiter Program
- Squad Pool
- Warzone BNB Airdrops
- Epochs & Claims

Tokenomics & Routing
- Fees
- TreasuryRouter
- Vaults & Reward Buckets
- Treasury Policy

Security & Trust
- Security Model
- Anti-Abuse System
- Transparency

For Creators
- Launch a Campaign
- Graduation Payouts

For Traders
- Trading
- Rewards
- Leaderboards

For Recruiters
- Become a Recruiter
- Recruiter Dashboard
- OG Recruiters
4. Update the docs engine only where needed

Likely needed:

sidebar/nav update
new page routes
table rendering improvements
reusable percentage/routing table component
callout component for “Important”
maybe diagram support

Keep docs content separate from layout logic as much as possible.

5. Rewrite in phases

Do not update everything randomly.

Use this order:

Homepage / intro
How it works
Fee routing
Recruiter Program
Squad Pool
Airdrops
Epochs & claims
Treasury
Security / anti-abuse
FAQ

This prevents contradictions.

6. Add validation rules

Because your docs have many percentages, add a simple checklist or script to search for outdated numbers/phrases.

Search for old/problem terms:

League-only router
all fees go to Owners Safe
launchpad
dev wallet
manual payout
0.75% only
auto distribution

And verify all values:

2% buy fee
2% sell fee
2% finalize fee
0.75% league
0.25% recruiter
0.30% finalize recruiter
0.05% squad
0.95% protocol
1.65% protocol finalize
OG +0.05%
Best practical approach for Codex

Give Codex this task in 3 batches:

Batch 1 — Docs audit

“Inspect the docs system, map routes/content/sidebar, and list all current pages plus where content lives.”

Batch 2 — Structure update

“Add the new docs navigation and placeholder pages without changing final content yet.”

Batch 3 — Content update

“Replace outdated content with approved new docs pages and remove contradictions.”

I found the repo as uptokendev/MemeBattles on main. Next I’m checking how docs-site stores pages and navigation so I can match the existing system instead of forcing a new format.

Antwoord van app is ontvangen

The docs are a Vite/React markdown system: pages load from src/content/**/*.md, while navigation is hardcoded in src/content/sidebar.ts. I’m going to update that structure and add the missing ecosystem pages around rewards, routing, epochs, and trust.

Antwoord van app is ontvangen

I can do this, but I hit one hard limitation in the current tool access: the GitHub connector can read and create/update files one by one, but it does not expose a repo tree/listing endpoint. Code search is also not indexed for this repo right now, so I could inspect known files but not reliably enumerate every existing markdown page.

What I confirmed:

Repo: uptokendev/MemeBattles
Branch: main
Docs app: docs-site
Tech: Vite + React + React Markdown
Pages are loaded from docs-site/src/content/**/*.md
Navigation is hardcoded in docs-site/src/content/sidebar.ts
Routes are handled dynamically by DocPage.tsx
Existing docs already have partial pages for introduction, fees, treasury, recruiter, airdrops, etc., but they need stronger alignment with the newer incentive/routing scope.

Best next approach for Codex/build:

Docs-site update scope
Batch A — Docs inventory and source of truth

Codex should run locally in the repo:

cd docs-site
find src/content -type f -name "*.md" | sort
sed -n '1,220p' src/content/sidebar.ts
npm run build

Then create:

docs-site/src/content/internal/docs-update-scope.md

This file should contain:

authoritative routing table
recruiter rules
OG recruiter override
Squad Pool rules
Warzone Airdrop rules
epochs and claims policy
treasury wording correction
closeout checklist

This page can either be excluded from nav or kept as an internal review page.

Batch B — Navigation update

Update:

docs-site/src/content/sidebar.ts

Recommended nav structure:

Start here
- Introduction
- How MemeWarzone Works
- Getting Started
- Prepare Mode
- Roadmap

Platform basics
- Campaign Lifecycle
- Bonding Curve
- Graduation
- UpVotes
- Leagues
- War Room Chat

Rewards & Incentives
- Recruiter Program
- Squad Pool
- Warzone BNB Airdrops
- Epochs & Claims

For creators
- Creator Overview
- Create a Campaign
- Creator Earnings
- Creator Growth Loop

For traders
- Trader Overview
- Trading Basics
- UpVotes for Traders
- Claiming Rewards

For recruiters
- Program Overview
- Attribution & Links
- Dashboard & Payouts
- OG Recruiters

Fees & treasury
- Fee Model
- Fee Routing
- Where Fees Go
- Treasury Structure
- Weekly Distribution

Security & trust
- Protection Model
- Anti-Abuse
- Transparency
- Avoid Scams
- Risk Disclosure
- Incident Response

FAQ
- FAQ
- Glossary
- Ranking System & Profiles
Batch C — New pages to add

Create these markdown files:

docs-site/src/content/how-memewarzone-works.md
docs-site/src/content/rewards/squad-pool.md
docs-site/src/content/rewards/warzone-airdrops.md
docs-site/src/content/rewards/epochs-and-claims.md
docs-site/src/content/programs/og-recruiters.md
docs-site/src/content/fees/fee-routing.md
docs-site/src/content/security/anti-abuse.md
docs-site/src/content/security/transparency.md
Batch D — Existing pages to update

Update these existing files:

docs-site/src/content/introduction.md
docs-site/src/content/fees.md
docs-site/src/content/fees/where-fees-go.md
docs-site/src/content/treasury.md
docs-site/src/content/leagues.md
docs-site/src/content/leagues/airdrops.md
docs-site/src/content/programs/recruiter-program.md
docs-site/src/content/programs/attribution-and-links.md
docs-site/src/content/programs/dashboard-and-payouts.md
docs-site/src/content/traders/claiming-rewards.md
docs-site/src/content/security/protection-model.md
docs-site/src/content/ranking-system.md
docs-site/src/content/glossary.md
Ready-to-paste content pack

Below is the actual content Codex should add.

src/content/how-memewarzone-works.md
---
title: How MemeWarzone Works
description: The full battlefield loop: campaigns, trading, UpVotes, Leagues, recruiters, airdrops, squads, fee routing, and weekly claims.
---

MemeWarzone is not only a meme launchpad. It is a competitive on-chain ecosystem where campaigns, traders, recruiters, squads, Leagues, and reward pools all feed into one recurring battlefield.

The goal is simple: every real action should help the system grow.

Creators launch. Traders trade. Communities UpVote. Recruiters bring new fighters. Squads compete. Fees route into rewards. Weekly epochs close. Users claim.

## The battlefield loop

The core loop is:

1. A creator prepares or launches a campaign.
2. Traders buy and sell through the bonding curve.
3. Communities push campaigns through UpVotes and social activity.
4. Trading fees route into League, recruiter, squad, airdrop, and protocol buckets.
5. Weekly and monthly Leagues create recurring competition.
6. Recruiters earn from linked creators and traders.
7. Squad members share Squad Pool rewards based on contribution.
8. Smaller active users can qualify for Warzone BNB Airdrops.
9. Rewards are claimed through dashboard/profile flows.
10. The next epoch starts and the war continues.

This turns meme launches from one-time events into recurring battles.

## The main actors

| Role | What they do | What they can earn |
| --- | --- | --- |
| Creators | Launch campaigns and build communities | Creator graduation payout, visibility, League wins |
| Traders | Trade campaigns and support winners | Trading upside, League prizes, airdrops, Squad Pool rewards |
| Recruiters | Bring creators and traders into MemeWarzone | Recruiter rewards from linked activity |
| Squads | Groups of linked creators and traders | Squad Pool rewards and leaderboard status |
| Communities | Push campaigns through attention and activity | Visibility, status, rewards, momentum |

## Campaigns

Campaigns start on a bonding curve. Traders buy into campaigns before graduation. When a campaign reaches the graduation threshold, the finalize process creates liquidity and pays the creator according to the graduation rules.

Campaigns are the base layer of MemeWarzone. Everything else exists to make campaign activity more competitive, more visible, and more rewarding.

## UpVotes

UpVotes are paid discovery.

They give campaigns a transparent way to compete for visibility. Instead of hidden listings or backroom boosts, campaigns can gain attention through visible UpVote activity.

UpVotes are part of the attention layer of MemeWarzone.

## Leagues

Leagues create recurring competition.

Weekly and monthly League epochs turn campaign activity into scheduled battles with winners, rankings, and prize moments.

Leagues are funded from platform activity. A fixed share of each buy and sell routes to the League Treasury, so stronger platform activity can create stronger prize pools.

## Recruiters

Recruiters help grow the battlefield.

A recruiter can bring creators and traders into MemeWarzone through attribution links. Once a wallet is linked and becomes active, the recruiter can earn from that linked activity.

Recruiters are not paid from an extra fee. Their rewards come from the existing fee routing model.

## Squad Pool

The Squad Pool rewards eligible squad members.

A squad is connected to recruiter-driven growth. Eligible creators and traders inside a squad can share weekly Squad Pool rewards based on contribution.

The split is not equal. It is based on eligible activity score.

## Warzone BNB Airdrops

Warzone BNB Airdrops are designed for active smaller users.

When activity is not linked to a recruiter or squad, the unlinked reward slices can flow into the Airdrop bucket. That lets solo users and smaller fighters compete for weekly reward chances.

Airdrops use eligibility rules, caps, cooldowns, and anti-abuse checks.

## Weekly epochs and claims

Most reward systems run on weekly epochs.

The standard weekly close is Monday 00:00 UTC. After an epoch closes, rewards become claimable through the dashboard/profile flow.

Rewards are claim-based, not automatic payouts to every wallet. This keeps the system cleaner, easier to audit, and safer to operate.

## Why this matters

Most launchpads focus on launch speed.

MemeWarzone focuses on repeat activity:

- creators have a reason to keep pushing
- traders have a reason to return
- recruiters have a reason to onboard quality users
- squads have a reason to stay active
- smaller users have a reason to participate
- the platform has recurring content moments every week

That is the MemeWarzone flywheel.
src/content/fees/fee-routing.md
---
title: Fee Routing
description: The authoritative fee-routing model for MemeWarzone: TreasuryRouter, reward buckets, linked users, unlinked users, OG recruiters, and protocol revenue.
---

MemeWarzone uses one routing model for the battlefield.

The goal is to keep user-facing fees simple while allowing platform activity to fund multiple reward systems.

No extra fee is added for recruiters, squads, airdrops, or Leagues. The existing fee envelope is routed into the correct buckets.

## User-facing fees

The core platform fees are:

| Action | Fee |
| --- | ---: |
| Buy | 2.00% |
| Sell | 2.00% |
| Finalize / Graduation | 2.00% |

The finalize fee is charged from raised liquidity before LP creation and creator payout.

## TreasuryRouter

The TreasuryRouter is the single routing entry point for protocol fee flows.

It routes fee amounts into downstream buckets:

| Bucket | Purpose |
| --- | --- |
| LeagueTreasury | Funds weekly and monthly League prizes |
| RecruiterRewardsVault | Holds recruiter reward allocations |
| CommunityRewardsVault | Holds Warzone Airdrop and Squad Pool balances |
| ProtocolRevenueVault | Holds protocol revenue after reward routing |

The CommunityRewardsVault tracks two internal balances:

| Internal balance | Purpose |
| --- | --- |
| warzoneAirdropBalance | Funds Warzone BNB Airdrops |
| squadPoolBalance | Funds Squad Pool rewards |

## Standard trade routing

For every buy and sell, the total fee remains 2.00%.

### Linked recruiter + linked squad

| Destination | Share of trade notional |
| --- | ---: |
| LeagueTreasury | 0.75% |
| RecruiterRewardsVault | 0.25% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 0.95% |
| Total | 2.00% |

### No recruiter and no squad

| Destination | Share of trade notional |
| --- | ---: |
| LeagueTreasury | 0.75% |
| Warzone Airdrops | 0.30% |
| ProtocolRevenueVault | 0.95% |
| Total | 2.00% |

The unlinked recruiter slice and unlinked squad slice both route into Warzone Airdrops.

## Standard finalize routing

For campaign graduation/finalize, the total finalize fee remains 2.00%.

### Linked recruiter + creator in squad

| Destination | Share of raised liquidity |
| --- | ---: |
| RecruiterRewardsVault | 0.30% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 1.65% |
| Total | 2.00% |

### No recruiter and creator not in squad

| Destination | Share of raised liquidity |
| --- | ---: |
| Warzone Airdrops | 0.35% |
| ProtocolRevenueVault | 1.65% |
| Total | 2.00% |

## OG recruiter override

OG recruiters are an early recruiter class.

They receive an additional 0.05% on linked trade activity and an additional 0.05% on linked finalize activity.

This extra reward comes from ProtocolRevenueVault share. It does not increase the user-facing fee.

### OG-linked trade

| Destination | Share of trade notional |
| --- | ---: |
| LeagueTreasury | 0.75% |
| OG Recruiter | 0.30% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 0.90% |
| Total | 2.00% |

### OG-linked finalize

| Destination | Share of raised liquidity |
| --- | ---: |
| OG Recruiter | 0.35% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 1.60% |
| Total | 2.00% |

## Protocol revenue

Protocol revenue is the remainder after reward routing.

That means “protocol revenue” does not mean every fee goes directly to the treasury first. The router first sends the League, recruiter, airdrop, and squad portions to their correct buckets. The remainder becomes protocol revenue.

ProtocolRevenueVault is then controlled by the treasury structure.

## Important rules

- No reward system adds a new fee on top of the existing 2% fee.
- OG recruiter overrides reduce protocol share only.
- Unlinked recruiter and squad slices fund Warzone Airdrops.
- Squad Pool never adds an extra recruiter skim.
- League share remains 0.75% of every buy and sell.
- Finalize routing must not change creator payout or LP creation math.
src/content/rewards/squad-pool.md
---
title: Squad Pool
description: How MemeWarzone rewards eligible squad members through contribution-based weekly Squad Pool distributions.
---

The Squad Pool is a weekly reward system for eligible squad members.

It rewards creators and traders who contribute real activity inside a squad. The goal is to make squads more than referral groups. A strong squad should be an active fighting unit that helps creators, traders, and recruiters grow together.

## What funds the Squad Pool

The Squad Pool is funded from existing platform fees.

No extra fee is added to users.

When activity is linked to a squad, a small part of the existing trade or finalize fee routes into the Squad Pool.

| Activity | Squad Pool share |
| --- | ---: |
| Buy / Sell with linked squad | 0.05% |
| Finalize with creator in squad | 0.05% |

If there is no squad, that unassigned squad slice routes to Warzone Airdrops instead.

## Who can participate

A wallet must be assigned to a squad to participate in Squad Pool rewards.

Solo users do not access Squad Pool rewards. Their unassigned reward path helps fund Warzone BNB Airdrops.

A wallet can belong to only one squad at a time.

## Weekly eligibility

Only eligible members share in that week’s Squad Pool distribution.

Eligibility is based on real qualified activity and anti-abuse checks.

### Trader component

Trader activity can count when the wallet meets the weekly trader rules:

- minimum 0.25 BNB weekly volume
- maximum 15 BNB counted volume
- at least 3 trades
- activity on at least 2 different days
- no own-campaign trading
- no wash, self, linked-wallet, or circular abuse

### Creator component

Creator activity can count when the wallet meets the weekly creator rules:

- at least 1 active campaign in the week
- at least 3 BNB qualified bonding-curve buy volume
- at least 10 unique non-linked buyers
- maximum 25 BNB counted creator activity
- maximum 2 eligible campaigns per creator per week

## Member score

Squad Pool is contribution-based.

It is not an equal split.

A member score is built from capped eligible trader activity plus capped eligible creator activity.

```txt
member score = capped eligible trader volume + capped eligible creator activity

A member’s payout is based on their share of eligible squad score.

member payout = member score / total eligible squad score × squad distributable member pool
Member cap

No eligible member may receive more than 40% of that squad’s weekly distributable Squad Pool.

If one member exceeds the cap, the excess is redistributed pro rata among the remaining eligible members, subject to the same cap.

This prevents one wallet from capturing the entire squad reward.

Squad cap

No squad may receive more than 15% of the total weekly global Squad Pool.

If a squad exceeds the cap, the excess is redistributed pro rata among remaining eligible squads, subject to the same cap.

This keeps the global reward system competitive and avoids one squad dominating the entire pool too easily.

Diminishing returns

Squad allocation uses soft diminishing returns at squad level:

Squad score range	Weight
First 100 squad score	100%
Next 100 squad score	50%
Everything above 200	25%

Diminishing returns apply at squad allocation level only.

They do not apply to individual member scoring and they do not apply to recruiter earnings.

Claims

Squad Pool rewards settle weekly.

After the weekly epoch closes, eligible rewards become claimable through the dashboard/profile flow.

Unclaimed Squad Pool rewards follow the unified claim policy and return back into the Squad Pool path if they expire.

Public transparency

Public squad pages and leaderboards can show:

squad rank
squad score
squad volume
member ranking
exact member score

Private wallet-level attribution details and internal risk analytics are not exposed publicly.


---

## `src/content/rewards/warzone-airdrops.md`

```md
---
title: Warzone BNB Airdrops
description: The weekly BNB reward system designed to give active smaller creators and traders a real shot at rewards.
---

Warzone BNB Airdrops are weekly reward opportunities for active smaller users.

They are designed to reward real participation, not only whales. The system uses eligibility rules, capped activity, cooldowns, and anti-abuse checks to keep rewards focused on genuine fighters.

## What funds Warzone Airdrops

Warzone Airdrops are funded by unlinked reward slices.

When activity has no linked recruiter or no linked squad, those unassigned portions route into the Warzone Airdrop balance.

This keeps the fee model useful even when users are solo.

## Weekly reward buckets

Warzone Airdrops use one combined weekly reward system with two buckets:

| Bucket | Share |
| --- | ---: |
| Traders | 50% |
| Creators | 50% |

A wallet may qualify as both a creator and a trader in the same epoch if it meets both sets of rules.

## Trader eligibility

Trader eligibility targets active smaller traders.

A trader must generally meet:

- minimum 0.25 BNB weekly volume
- maximum 15 BNB counted volume
- at least 3 trades
- active on at least 2 different days
- no own-campaign trades
- no wash trading, self-trading, common-control trading, or linked-wallet farming
- only completed on-platform trades count

The cap does not stop a user from trading more. It only limits how much activity counts toward airdrop scoring.

## Creator eligibility

Creator eligibility targets active campaign builders.

A creator must generally meet:

- at least 1 active campaign in the week
- at least 3 BNB qualified bonding-curve buy volume
- at least 10 unique non-linked buyers
- maximum 25 BNB counted creator activity per week
- maximum 2 eligible campaigns per creator per week

Creator activity must be real. Creator-funded fake demand, circular wallets, and linked-wallet buyer clusters can be excluded.

## Winner selection

Warzone Airdrops use tiered weighted random logic based on capped activity score.

This means:

- activity helps
- capped activity prevents pure whale domination
- random selection keeps the system exciting
- eligibility checks protect the reward pool

Winner count can scale with pool size.

## Cooldowns

A wallet may not win Warzone Airdrops in back-to-back weeks.

The cooldown is 2 weeks.

Battle League winners may also be excluded from Airdrops until the monthly League epoch is over. This helps spread rewards across more fighters.

## Recruiters and linked users

Recruiters themselves cannot directly win Warzone Airdrops.

However, users linked to recruiters are not punished just because they are linked. Linked users can still qualify if they meet the rules.

## Claims

Airdrop rewards are claim-based.

After the weekly epoch closes and winners are published, winners can claim through the dashboard/profile flow.

Expired unclaimed Airdrop rewards return to the Airdrop treasury.

## Public transparency

The system should expose:

- public winner pages
- user eligibility status
- claim status
- broad ineligibility reason codes

Detailed anti-abuse thresholds and clustering logic remain private to prevent farming.
src/content/rewards/epochs-and-claims.md
---
title: Epochs & Claims
description: How MemeWarzone weekly reward epochs close, how claims work, and what happens to expired rewards.
---

MemeWarzone rewards are organized around epochs.

Epochs make the system predictable. Everyone knows when activity counts, when rewards are calculated, and when claims open.

## Weekly epoch close

Weekly epochs close at:

```txt
Monday 00:00 UTC

After the epoch closes, the system can process:

recruiter rewards
Warzone BNB Airdrops
Squad Pool rewards
League-related reward states
Claim-based rewards

MemeWarzone uses claim-based rewards.

Rewards are not automatically pushed to every wallet. Instead, eligible users claim through the dashboard/profile flow.

This is cleaner because it:

avoids unnecessary payout spam
keeps reward settlement auditable
lets users see what they are claiming
allows eligibility and anti-abuse checks to be applied before payout
reduces operational risk
Claim window

The standard claim window is 7 days.

Users should claim rewards from their profile or dashboard after an epoch closes.

Unclaimed rewards

Unclaimed rewards follow a unified expiry policy.

During the grace period, unclaimed rewards remain visible as pending or claimable depending on the reward state.

Reminder emails may be sent after long periods of no claim activity.

Expiry destinations

If rewards expire, they return to the appropriate reward path:

Reward type	Expiry destination
Recruiter rewards	Squad Pool
Squad Pool rewards	Squad Pool
Warzone Airdrops	Airdrop treasury

This keeps idle rewards inside the ecosystem instead of leaving them permanently stranded.

Eligibility visibility

Users should be able to see:

whether they are eligible
what rewards are pending
what rewards are claimable
whether a claim expired
broad reason codes if they are ineligible

Reason codes should be clear enough to help honest users understand the result, but not detailed enough to reveal anti-abuse thresholds.

Why epochs matter

Epochs turn platform activity into recurring moments.

Every week creates:

new winners
new squad rankings
new recruiter stats
new airdrop chances
new content beats
new reasons to return

That recurring rhythm is a core part of MemeWarzone.


---

## `src/content/programs/og-recruiters.md`

```md
---
title: OG Recruiters
description: The early recruiter class with enhanced routing rewards for linked activity.
---

OG Recruiters are an early recruiter class inside MemeWarzone.

They receive the standard recruiter reward plus an additional OG override on linked activity.

## Standard recruiter rewards

Standard recruiters can earn from linked users:

| Activity | Standard recruiter share |
| --- | ---: |
| Linked buy / sell activity | 0.25% |
| Linked creator finalize activity | 0.30% |

These rewards come from the existing platform fee model. They do not add an extra user fee.

## OG override

OG Recruiters receive an extra 0.05% on linked trading and finalize activity.

| Activity | OG recruiter share |
| --- | ---: |
| Linked buy / sell activity | 0.30% |
| Linked creator finalize activity | 0.35% |

The extra 0.05% is carved out of protocol revenue.

It is not added on top of the 2% user-facing fee.

## OG trade routing

For OG-linked trading activity:

| Destination | Share |
| --- | ---: |
| LeagueTreasury | 0.75% |
| OG Recruiter | 0.30% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 0.90% |
| Total | 2.00% |

## OG finalize routing

For OG-linked finalize activity:

| Destination | Share |
| --- | ---: |
| OG Recruiter | 0.35% |
| Squad Pool | 0.05% |
| ProtocolRevenueVault | 1.60% |
| Total | 2.00% |

## Why OG status exists

OG status rewards early recruiters who help build the first wave of creators, traders, and squads before the full battlefield matures.

It is meant to recognize early growth work without increasing fees for users.
src/content/security/anti-abuse.md
---
title: Anti-Abuse System
description: How MemeWarzone protects rewards, rankings, Leagues, airdrops, and Squad Pool distributions from farming and fake activity.
---

MemeWarzone rewards are for real activity.

Because the platform includes Leagues, recruiter rewards, airdrops, and Squad Pool distributions, the system must aggressively filter fake or circular behavior.

## What the system protects

Anti-abuse checks can apply to:

- League eligibility
- Warzone BNB Airdrops
- Squad Pool scoring
- recruiter rewards
- public rankings
- claim eligibility
- campaign activity metrics

## Excluded behavior

The system may exclude activity connected to:

- self-trading
- wash trading
- circular trading
- common-control wallets
- wallet splitting
- creator-funded fake demand
- recruiter-linked farming loops
- repeated no-market back-and-forth activity
- own-campaign trading where not allowed
- linked-wallet buyer clusters
- suspicious activity designed mainly to farm rewards

## Two-layer enforcement

MemeWarzone uses two levels of enforcement.

### 1. Reward exclusion

Reward exclusion can be aggressive.

If activity looks ineligible, suspicious, circular, or farmed, it can be excluded from reward scoring.

This protects the reward pools.

### 2. Sanctions or account action

Punitive action should use a higher confidence threshold.

A wallet may be excluded from rewards without necessarily being banned or sanctioned.

## Public vs private logic

MemeWarzone can publish broad exclusion categories.

It should not publish exact thresholds, clustering logic, scoring weights, or trigger combinations.

That protects the system from being reverse-engineered by farmers.

## Reason codes

Users should see broad reason codes when they are ineligible.

Examples:

- insufficient weekly activity
- below minimum trade count
- activity cap reached
- own-campaign trading excluded
- suspected linked-wallet activity
- suspicious circular trading
- cooldown active
- winner exclusion active

Reason codes should help honest users improve without giving farmers a playbook.

## Why this matters

A reward system without anti-abuse becomes a farming system.

MemeWarzone is built to reward creators, traders, recruiters, and squads who bring real activity to the battlefield.
src/content/security/transparency.md
---
title: Transparency
description: What MemeWarzone makes public, what users can see privately, and what remains protected to prevent reward farming.
---

MemeWarzone is built around visible competition and clear reward flows.

Transparency matters because users need to understand how rankings, rewards, claims, and treasury flows work.

At the same time, some anti-abuse logic must remain private so the system cannot be farmed.

## Public information

Public surfaces can include:

- campaign pages
- UpVote activity
- League standings
- League winners
- public recruiter profiles
- recruiter leaderboard
- squad leaderboard
- squad public member ranking
- exact public member score
- Warzone Airdrop winner pages
- broad reward rules
- broad anti-abuse categories

## User-private information

A connected user should be able to see their own:

- linked recruiter
- squad status
- pending rewards
- claimable rewards
- claim history
- eligibility status
- broad ineligibility reason codes
- estimated Squad Pool reward
- dashboard/profile reward breakdown

This information helps users understand their own position without exposing unnecessary private analytics publicly.

## Admin-only information

Some data should remain admin-only:

- wallet-level attribution internals
- risk scoring
- clustering logic
- anti-abuse thresholds
- review queues
- manual override tools
- dispute handling data
- detailed per-recruit analytics where privacy matters

## Why not publish everything?

Publishing exact farming thresholds would make the reward system easier to exploit.

The goal is to be transparent about the rules and outcomes while protecting the detection logic that keeps rewards fair.

## Transparency principle

Users should understand:

- how to participate
- how to qualify
- where fees go
- when rewards are processed
- how to claim
- why they may be ineligible

Farmers should not be able to calculate the exact minimum exploit path.
Closeout checklist for the docs update

Add this either as an internal page or as an issue checklist.

# MemeWarzone Docs Update Closeout Checklist

## Repo / build

- [ ] `docs-site` builds successfully with `npm run build`
- [ ] No broken markdown imports
- [ ] No broken sidebar routes
- [ ] All new pages render correctly
- [ ] Prev/next navigation works after sidebar update
- [ ] Mobile sidebar still works
- [ ] Search finds the new pages

## Navigation

- [ ] Sidebar includes “How MemeWarzone Works”
- [ ] Sidebar includes Reward & Incentive pages
- [ ] Sidebar includes Fee Routing
- [ ] Sidebar includes Anti-Abuse
- [ ] Sidebar includes Transparency
- [ ] Recruiter Program section includes OG Recruiters
- [ ] Old pages still reachable or aliased

## Product positioning

- [ ] Docs no longer position MemeWarzone as only a launchpad
- [ ] Docs describe MemeWarzone as a competitive on-chain ecosystem
- [ ] Launchpad language is reframed as campaign system / campaign lifecycle
- [ ] Full flywheel is explained clearly

## Fee and routing accuracy

- [ ] Buy fee documented as 2.00%
- [ ] Sell fee documented as 2.00%
- [ ] Finalize fee documented as 2.00%
- [ ] League share documented as 0.75% of buy/sell
- [ ] Standard recruiter trade share documented as 0.25%
- [ ] Standard recruiter finalize share documented as 0.30%
- [ ] Squad Pool share documented as 0.05%
- [ ] Standard protocol trade remainder documented as 0.95%
- [ ] Standard protocol finalize remainder documented as 1.65%
- [ ] OG recruiter trade share documented as 0.30%
- [ ] OG recruiter finalize share documented as 0.35%
- [ ] OG protocol trade remainder documented as 0.90%
- [ ] OG protocol finalize remainder documented as 1.60%
- [ ] Unlinked recruiter/squad slices documented as routing to Airdrops
- [ ] Docs clearly state no extra fee is added for reward systems

## Treasury

- [ ] TreasuryRouter documented as single fee-routing entry point
- [ ] LeagueTreasury documented
- [ ] RecruiterRewardsVault documented
- [ ] CommunityRewardsVault documented
- [ ] warzoneAirdropBalance documented
- [ ] squadPoolBalance documented
- [ ] ProtocolRevenueVault documented
- [ ] Treasury page clarifies protocol revenue is remainder after reward routing
- [ ] Owners Safe / Ops Safe policy does not conflict with router model

## Recruiter Program

- [ ] Recruiter Program page explains what recruiters do
- [ ] 30-day pre-connect referral persistence documented
- [ ] Wallet links on connect documented
- [ ] Link lock after first activity documented
- [ ] Recruiter rewards documented
- [ ] OG Recruiter override documented
- [ ] Public recruiter profiles documented
- [ ] Recruiter leaderboard documented
- [ ] Recruiter dashboard and claims documented
- [ ] Inactivity / closure / detachment behavior documented

## Squad Pool

- [ ] Squad Pool page exists
- [ ] Squad Pool funding documented
- [ ] Squad-only access documented
- [ ] Member score formula documented
- [ ] Contribution-based payout documented
- [ ] 40% member cap documented
- [ ] 15% squad cap documented
- [ ] Diminishing returns documented
- [ ] Weekly claims documented
- [ ] Public squad leaderboard documented
- [ ] Exact member score visibility documented

## Warzone BNB Airdrops

- [ ] Airdrop page exists
- [ ] Funding from unlinked slices documented
- [ ] 50% trader / 50% creator split documented
- [ ] Trader eligibility documented
- [ ] Creator eligibility documented
- [ ] Weighted random winner selection documented
- [ ] 2-week cooldown documented
- [ ] Recruiter exclusion from direct winning documented
- [ ] Public winner page documented
- [ ] Claim behavior documented

## Epochs and claims

- [ ] Monday 00:00 UTC weekly epoch close documented
- [ ] Claim-based reward model documented
- [ ] 7-day claim window documented
- [ ] Expiry destinations documented
- [ ] Eligibility status and reason codes documented
- [ ] Claim UX is consistent across pages

## Security and trust

- [ ] Security page mentions no dev-wallet custody
- [ ] Router-enforced splits documented
- [ ] Claim-based payout safety documented
- [ ] Anti-abuse page exists
- [ ] Wash/self/circular trading exclusions documented
- [ ] Public/private transparency boundaries documented
- [ ] Sensitive thresholds kept private

## Final review

- [ ] New user can understand how to participate
- [ ] Creator can understand how to launch and earn
- [ ] Trader can understand how to trade and qualify
- [ ] Recruiter can understand links, rewards, and dashboard
- [ ] Investor can understand the fee/reward flywheel
- [ ] Developer can understand router/vault architecture
- [ ] No page contradicts another page

This gives you the full build scope plus the main page content. The only reason I did not directly push all files is that the connector could not enumerate the repo tree, and I don’t want to blindly overwrite unknown existing pages or miss required route aliases.

Use this:

Codex task:

Update the custom docs system in `docs-site` on the `main` branch.

Use the uploaded/project docs and the existing docs-site structure as source of truth. The goal is to bring docs.memewar.zone in sync with the current MemeWarzone product scope: TreasuryRouter reward buckets, Recruiter Program, OG Recruiters, Squad Pool, Warzone BNB Airdrops, epochs/claims, fee routing, anti-abuse, transparency, and updated ecosystem positioning.

First inspect:
- `docs-site/src/content/sidebar.ts`
- all markdown files under `docs-site/src/content`
- the docs loader/components to understand routing

Then implement:
1. Update sidebar/navigation.
2. Add missing pages:
   - How MemeWarzone Works
   - Fee Routing
   - Squad Pool
   - Warzone BNB Airdrops
   - Epochs & Claims
   - OG Recruiters
   - Anti-Abuse
   - Transparency
3. Update existing pages that conflict with the new model:
   - Introduction
   - Fee Model
   - Where Fees Go
   - Treasury Structure
   - Leagues
   - Recruiter Program
   - Attribution & Links
   - Dashboard & Payouts
   - Claiming Rewards
   - Protection Model
   - Ranking System
   - Glossary
4. Make sure all percentages are consistent:
   - Buy fee: 2%
   - Sell fee: 2%
   - Finalize fee: 2%
   - League: 0.75% of buy/sell
   - Standard recruiter trade: 0.25%
   - Standard recruiter finalize: 0.30%
   - Squad Pool: 0.05%
   - Standard protocol trade remainder: 0.95%
   - Standard protocol finalize remainder: 1.65%
   - OG recruiter trade: 0.30%
   - OG recruiter finalize: 0.35%
   - OG protocol trade remainder: 0.90%
   - OG protocol finalize remainder: 1.60%
5. Add a docs closeout checklist as an internal markdown page or issue checklist.
6. Run `npm run build` inside `docs-site` and fix any errors.

Do not redesign the docs system unless required. Keep the existing markdown/frontmatter/sidebar se