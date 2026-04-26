---
title: Fee Model
description: The main MemeWarzone fee numbers and how the fee envelope funds routing, rewards, and protocol revenue.
---

MemeWarzone uses simple visible fees.

The user-facing numbers stay stable while TreasuryRouter handles the internal routing.

## Main numbers

| Fee / mechanic | Value |
| --- | ---: |
| Buy fee | 2.00% |
| Sell fee | 2.00% |
| Finalize fee | 2.00% |
| UpVote price | 0.003 BNB |
| Graduation threshold | 50 BNB |
| Post-finalize split | 80% LP / 20% creator payout |

## Trading fees

Every buy and sell has a 2.00% fee.

From every buy and sell, 0.75% of trade notional routes to LeagueTreasury. The remaining 1.25% routes based on the wallet's attribution profile:

- linked standard recruiter
- unlinked
- linked OG recruiter

Read: **[Fee Routing](/fees/fee-routing)**.

## Finalize fee

When a campaign graduates, a 2.00% finalize fee is taken from raised liquidity before LP creation and creator payout calculation.

Finalize routing can fund recruiter rewards, Squad Pool, Warzone Airdrops, and protocol revenue. It does not route to LeagueTreasury.

## UpVote fee

An UpVote costs 0.003 BNB.

UpVotes are paid visibility actions. They are not refundable and do not mean the platform endorses a campaign.

## Why fees exist

Fees support:

- League prize pools
- recruiter rewards
- Squad Pool rewards
- Warzone BNB Airdrops
- protocol revenue
- treasury operations, audits, infrastructure, and growth

Reward systems do not add extra user fees. They are funded by routing the existing fee envelope.
