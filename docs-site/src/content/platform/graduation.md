---
title: Graduation
description: What happens when a MemeWarzone campaign reaches its active graduation target.
---

Graduation is the transition from bonding curve campaign to post graduation liquidity.

The graduation target is defined by the active deployment policy.

## What happens at graduation

When a campaign graduates:

1. The campaign reaches the active graduation target.
2. A 2.00% finalize fee is taken from raised liquidity before launch liquidity is set.
3. TreasuryRouter routes the finalize fee.
4. The remaining amount is split under the active deployment policy.
5. Launch liquidity is created from the configured share of the remainder.
6. The creator payout is released from the configured share of the remainder.
7. The campaign enters the DEX stage.

## Reference note

Use the current economics and readiness references for the live target and distribution values. Those numbers can change by deployment and should not be treated as permanent doctrine.

## Finalize routing

Finalize uses the same 2.00% user facing fee envelope.

| Profile | Recruiter | Squad Pool | Airdrops | Protocol revenue |
| --- | ---: | ---: | ---: | ---: |
| Standard linked | 0.30% | 0.05% | 0.00% | 1.65% |
| Standard unlinked | 0.00% | 0.00% | 0.35% | 1.65% |
| OG linked | 0.35% | 0.05% | 0.00% | 1.60% |

Finalize does not route to LeagueTreasury.

## Why this structure exists

Graduation should reward creators without draining the entire campaign.

The live distribution policy is designed to:

- give the token real liquidity after graduation
- reward creators for successful campaign execution
- keep economics predictable
- avoid unclear off chain payout negotiations

## After graduation

After graduation, the campaign is no longer only a bonding curve campaign. It becomes a post graduation market with launch liquidity and broader trading behavior.
