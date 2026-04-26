---
title: Economic Model
description: How MemeWarzone combines trading fees, UpVotes, finalize mechanics, reward routing, treasury policy, and recurring incentives.
---

MemeWarzone economics are built around a simple idea: normal platform activity should fund the competitive ecosystem.

The system does not add separate user fees for recruiters, squads, airdrops, or Leagues. It routes the existing fee envelope into the correct buckets.

## Core numbers

| Mechanic | Value |
| --- | ---: |
| Buy fee | 2.00% |
| Sell fee | 2.00% |
| Finalize fee | 2.00% |
| UpVote price | 0.003 BNB |
| Graduation threshold | 50 BNB |
| Post-finalize split | 80% LP / 20% creator payout |

## Trading fees

Every buy and sell has a 2.00% fee.

That 2.00% can route into:

- LeagueTreasury
- RecruiterRewardsVault
- CommunityRewardsVault for Warzone Airdrops
- CommunityRewardsVault for Squad Pool
- ProtocolRevenueVault

The exact route depends on whether the wallet has active recruiter attribution and whether the recruiter is an OG recruiter.

## UpVotes

UpVotes cost 0.003 BNB.

They are paid discovery actions. They help campaigns compete for attention but do not mean the platform endorses a campaign.

## Finalize mechanics

When a campaign graduates, a 2.00% finalize fee is taken from raised liquidity before LP creation and creator payout.

The remaining raised liquidity is split:

| Destination | Share of remaining liquidity |
| --- | ---: |
| LP liquidity | 80% |
| Creator payout | 20% |

At the 50 BNB graduation threshold, the 2.00% finalize fee is 1 BNB. The remaining 49 BNB splits into 39.2 BNB LP liquidity and 9.8 BNB creator payout.

## Incentive redistribution

MemeWarzone uses routing to keep incentives recurring:

| System | Funding source |
| --- | --- |
| Leagues | 0.75% of buy and sell notional |
| Recruiter Program | Linked recruiter trade and finalize slices |
| Squad Pool | Linked squad slice or expired recruiter/squad rewards |
| Warzone BNB Airdrops | Unlinked recruiter/squad slices and expired airdrops |
| Protocol revenue | Remainder after reward routing |

## Protocol revenue

Protocol revenue is the remainder after TreasuryRouter has routed League, recruiter, airdrop, and Squad Pool allocations.

ProtocolRevenueVault can then feed the Owners Safe and weekly treasury policy. That keeps incentive routing separate from operating revenue.

## Flywheel

The economic loop is:

1. Campaign activity creates fees.
2. Fees route into rewards and protocol revenue.
3. Rewards create weekly competition and claim moments.
4. Competition brings users back.
5. More users create more campaign activity.

The model is meant to make incentives core to the ecosystem, not a side promotion.
