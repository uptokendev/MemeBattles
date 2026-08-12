---
title: Fee Model
description: The main MemeWarzone fee numbers and how the fee envelope funds creator trade earnings, routing, rewards, and protocol revenue.
---

MemeWarzone uses simple visible fees.

The user facing numbers stay stable while TreasuryRouter handles the internal routing.

## Main numbers

| Fee / mechanic | Value |
| --- | ---: |
| Buy fee | 2.00% |
| Sell fee | 2.00% |
| Creator direct trade share | 0.10% of buys and sells on the creator's own bonding curve |
| Finalize fee | 2.00% |
| UpVote price | 0.003 BNB |
| Graduation target | Active by deployment |
| Post finalize distribution | Active launch liquidity and creator payout policy |
| Post graduation platform route fee | 0.05% when traded through MemeWarzone |

## Trading fees

Every buy and sell has a 2.00% fee.

From every buy and sell:

- 0.75% of trade notional routes to LeagueTreasury
- 0.10% routes directly to the campaign creator wallet
- the remaining 1.15% routes based on the wallet's attribution profile

Attribution profiles include:

- linked standard recruiter
- unlinked
- linked OG recruiter

Read: **[Fee Routing](/fees/fee-routing)**.

## Creator trade share

Creators receive 0.10% of every buy and sell on their own token bonding curve.

This is inside the existing 2.00% buy and sell fee. It is not an extra fee added on top.

## Finalize fee

When a campaign graduates, a 2.00% finalize fee is taken from raised liquidity before launch liquidity and creator payout calculation.

Finalize routing can fund recruiter rewards, Squad Pool, Warzone Airdrops, and protocol revenue. It does not route to LeagueTreasury and does not use the creator direct trade share path.

## UpVote fee

An UpVote costs 0.003 BNB.

UpVotes are paid visibility actions. They are not refundable and do not mean the platform endorses a campaign.

## Post graduation route fee

When users trade a graduated token through the MemeWarzone interface or routing path, the platform can earn a 0.05% route fee.

This is a platform route fee, not a permanent token tax.

## Why fees exist

Fees support:

- direct creator trade earnings
- League prize pools
- recruiter rewards
- Squad Pool rewards
- Warzone BNB Airdrops
- protocol revenue
- treasury operations, audits, infrastructure, and growth

Reward systems and creator trade earnings do not add extra user fees. They are funded by routing the existing fee envelope.
