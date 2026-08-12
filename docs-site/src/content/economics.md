---
title: Economic Model
description: How MemeWarzone combines creator trade earnings, trading fees, UpVotes, finalize mechanics, reward routing, treasury policy, and recurring incentives.
---

MemeWarzone economics are built around a simple idea: normal platform activity should fund the competitive ecosystem.

The system does not add separate user fees for creators, recruiters, squads, airdrops, or Leagues. It routes the existing fee envelope into the correct buckets.

## Core numbers

| Mechanic | Value |
| --- | ---: |
| Buy fee | 2.00% |
| Sell fee | 2.00% |
| Creator direct trade share | 0.10% of buys and sells on the creator's own bonding curve |
| Finalize fee | 2.00% |
| UpVote price | 0.003 BNB |
| Graduation target | Active by deployment |
| Post finalize distribution | Active launch liquidity and creator payout policy by deployment |
| Post graduation platform route fee | 0.05% when traded through MemeWarzone |

## Trading fees

Every buy and sell has a 2.00% fee.

That 2.00% can route into:

- creator wallet direct trade share
- LeagueTreasury
- RecruiterRewardsVault
- CommunityRewardsVault for Warzone Airdrops
- CommunityRewardsVault for Squad Pool
- ProtocolRevenueVault

The exact route depends on whether the wallet has active recruiter attribution and whether the recruiter is an OG recruiter.

## Creator trade earnings

Creators receive **0.10% of every buy and sell** made through their own token bonding curve.

This is paid directly to the campaign creator wallet as trading happens. It is not a separate fee on top of the 2.00% buy and sell fee.

Creator trade earnings are separate from the creator payout released at graduation.

## UpVotes

UpVotes cost 0.003 BNB.

They are paid discovery actions. They help campaigns compete for attention but do not mean the platform endorses a campaign.

On future chains, UpVotes should keep BNB equivalent pricing while users pay in that chain's native token.

## Finalize mechanics

When a campaign graduates, a 2.00% finalize fee is taken from raised liquidity before launch liquidity and creator payout are calculated.

The remaining raised liquidity is then distributed between launch liquidity and the creator payout according to the active deployment policy.

Use the live readiness and economics references for the current target and distribution values.

## Post graduation trading

Graduation does not end MemeWarzone's relationship with a campaign.

When users continue trading a graduated token through the MemeWarzone interface or routing path, the platform can earn a **0.05%** platform route fee.

This fee is platform route based. It is not a permanent token tax built into the token itself.

## Incentive redistribution

MemeWarzone uses routing to keep incentives recurring:

| System | Funding source |
| --- | --- |
| Creators | 0.10% of buys and sells on their own bonding curve, plus the creator payout released at graduation under the active deployment policy |
| Leagues | 0.75% of buy and sell notional |
| Recruiter Program | Linked recruiter trade and finalize slices |
| Squad Pool | Linked squad slice or expired recruiter and squad rewards |
| Warzone BNB Airdrops | Unlinked recruiter and squad slices and expired airdrops |
| Protocol revenue | Remainder after creator and reward routing |
| Post graduation platform route | 0.05% when graduated tokens are traded through MemeWarzone |

## Protocol revenue

Protocol revenue is the remainder after TreasuryRouter has routed creator, League, recruiter, airdrop, and Squad Pool allocations.

ProtocolRevenueVault can then feed the Owners Safe and weekly treasury policy. That keeps incentive routing separate from operating revenue.

## Flywheel

The economic loop is:

1. Campaign activity creates fees.
2. Fees route into creator earnings, rewards, and protocol revenue.
3. Rewards create weekly competition and claim moments.
4. Competition brings users back.
5. More users create more campaign activity.
6. Strong campaigns can graduate and keep trading through MemeWarzone.

The model is meant to make incentives core to the ecosystem, not a side promotion.
