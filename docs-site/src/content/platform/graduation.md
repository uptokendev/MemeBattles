---
title: Graduation
description: What happens when a MemeWarzone campaign reaches the 50 BNB graduation threshold.
---

Graduation is the transition from bonding-curve campaign to post-graduation liquidity.

The graduation threshold is 50 BNB.

## What happens at graduation

When a campaign graduates:

1. The campaign reaches the 50 BNB threshold.
2. A 2.00% finalize fee is taken from raised liquidity before LP.
3. TreasuryRouter routes the finalize fee.
4. The remaining amount is split.
5. 80% goes to LP liquidity.
6. 20% goes to the creator payout.
7. The campaign enters the DEX stage.

## Minimum graduation example

At the 50 BNB threshold:

| Step | Amount |
| --- | ---: |
| Raised liquidity | 50 BNB |
| Finalize fee, 2.00% | 1 BNB |
| Remaining after fee | 49 BNB |
| LP liquidity, 80% of remaining | 39.2 BNB |
| Creator payout, 20% of remaining | 9.8 BNB |

## Finalize routing

Finalize uses the same 2.00% user-facing fee envelope.

| Profile | Recruiter | Squad Pool | Airdrops | Protocol revenue |
| --- | ---: | ---: | ---: | ---: |
| Standard linked | 0.30% | 0.05% | 0.00% | 1.65% |
| Standard unlinked | 0.00% | 0.00% | 0.35% | 1.65% |
| OG linked | 0.35% | 0.05% | 0.00% | 1.60% |

Finalize does not route to LeagueTreasury.

## Why this structure exists

Graduation should reward creators without draining the entire campaign.

The 80/20 split is designed to:

- give the token real liquidity after graduation
- reward creators for successful campaign execution
- keep economics predictable
- avoid unclear off-chain payout negotiations

## After graduation

After graduation, the campaign is no longer only a bonding-curve campaign. It becomes a post-graduation market with LP liquidity and broader trading behavior.
