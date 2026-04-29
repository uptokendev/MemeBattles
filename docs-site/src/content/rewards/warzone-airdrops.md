---
title: Warzone BNB Airdrops
description: The weekly BNB reward system for active smaller creators and traders.
---

Warzone BNB Airdrops are weekly reward opportunities for active smaller users.

They are designed to reward real participation without letting pure whale volume dominate the pool.

## Simple version

- Warzone BNB Airdrops run weekly.
- The pool is split into 50% trader airdrops and 50% creator airdrops.
- Users do not need to be in a squad to qualify.
- Recruiter-linked users can still qualify if they meet the rules.
- Recruiter wallets cannot directly win airdrops.
- Winners are selected with capped, weighted random logic.
- Rewards are claim-based.

## Funding source

Warzone Airdrops are funded by unlinked reward slices.

When activity has no active recruiter attribution, the recruiter and squad portions that would have gone to linked reward paths route into `warzoneAirdropBalance` inside CommunityRewardsVault.

Expired airdrop rewards also return to the airdrop treasury path.

## Weekly buckets

Warzone Airdrops use two weekly programs:

| Program | Share of airdrop pool |
| --- | ---: |
| Trader airdrop | 50% |
| Creator airdrop | 50% |

A wallet can qualify for both programs in the same epoch if it satisfies both sets of rules.

### Pool example

If the weekly airdrop pool has 4 BNB:

| Program | Share | Example pool |
| --- | ---: | ---: |
| Trader airdrop | 50% | 2 BNB |
| Creator airdrop | 50% | 2 BNB |

The final number of winners can scale with pool size and launch configuration.

## Trader eligibility

Trader eligibility targets active smaller traders.

Broad rules include:

- minimum 0.25 BNB weekly volume
- maximum 15 BNB counted volume
- at least 3 trades
- activity on at least 2 different days
- no own-campaign trades
- no wash trading, self-trading, common-control trading, or wallet splitting
- only completed on-platform trades count

The cap does not stop a user from trading more. It only limits how much activity counts toward airdrop scoring.

### Trader checklist

A trader should ask:

| Question | Why it matters |
| --- | --- |
| Did I reach 0.25 BNB weekly volume? | Minimum participation gate |
| Did I make at least 3 trades? | Prevents one-action farming |
| Was I active on at least 2 days? | Rewards repeated activity |
| Did I avoid own-campaign trades? | Own-campaign trades can be excluded |
| Did I stay under the counted cap? | Only up to 15 BNB counts for scoring |

## Creator eligibility

Creator eligibility targets active campaign builders.

Broad rules include:

- at least 1 active campaign in the week
- at least 3 BNB qualified bonding-curve buy volume
- at least 10 unique non-linked buyers
- maximum 25 BNB counted creator activity
- maximum 2 eligible campaigns per creator per week
- no creator-funded fake demand or linked-wallet buyer clusters

### Creator checklist

A creator should ask:

| Question | Why it matters |
| --- | --- |
| Did I have at least 1 active campaign this week? | Creator participation gate |
| Did the campaign reach 3 BNB qualified buy volume? | Minimum activity gate |
| Did it attract 10 unique non-linked buyers? | Helps filter fake demand |
| Did I stay within the 2-campaign weekly cap? | Prevents spam launching |
| Was the demand real? | Fake or linked-wallet demand can be excluded |

## Winner selection

Warzone Airdrops use weighted random selection based on capped activity score.

This means:

- activity helps
- capped activity prevents pure whale domination
- random selection keeps weekly drops exciting
- eligibility checks protect the pool

Winner count can scale with pool size.

### Weighted draw example

Imagine three eligible trader wallets after caps:

| Wallet | Capped activity score | Relative draw weight |
| --- | ---: | ---: |
| A | 1 | Lower |
| B | 5 | Medium |
| C | 10 | Higher |

Wallet C has a better chance than Wallet A, but Wallet C is not guaranteed to win. The draw is weighted, not a direct highest-volume payout.

## Cooldowns and exclusions

A wallet may not win Warzone Airdrops in back-to-back weeks. The cooldown checks the two prior weekly epochs.

Active Battle League winners can also be excluded until the monthly League epoch is over.

Recruiter wallets cannot directly win Warzone Airdrops. Users linked to recruiters are not punished just because they are linked; they can still qualify if they meet the rules.

## Claims

Airdrop rewards are claim-based.

After the weekly epoch closes and winners are published, winners can claim through the dashboard/profile flow.

The standard claim window is 7 days after epoch end.

## Public transparency

Public pages can show:

- winner pages
- draw status
- program type
- winner rank
- payout amount
- activity score

Private profile views can show:

- eligibility status
- broad reason codes
- claimable airdrop amount
- claim history

Detailed anti-abuse thresholds and clustering logic stay private.

Read next: **[Epochs & Claims](/rewards/epochs-and-claims)** and **[Reward Dashboard](/rewards/dashboard-ux)**.