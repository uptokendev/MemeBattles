---
title: Warzone BNB Airdrops
description: The weekly BNB reward system for active smaller creators and traders.
---

Warzone BNB Airdrops are weekly reward opportunities for active smaller users.

They are designed to reward real participation without letting pure whale volume dominate the pool.

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

## Creator eligibility

Creator eligibility targets active campaign builders.

Broad rules include:

- at least 1 active campaign in the week
- at least 3 BNB qualified bonding-curve buy volume
- at least 10 unique non-linked buyers
- maximum 25 BNB counted creator activity
- maximum 2 eligible campaigns per creator per week
- no creator-funded fake demand or linked-wallet buyer clusters

## Winner selection

Warzone Airdrops use weighted random selection based on capped activity score.

This means:

- activity helps
- capped activity prevents pure whale domination
- random selection keeps weekly drops exciting
- eligibility checks protect the pool

Winner count can scale with pool size.

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
