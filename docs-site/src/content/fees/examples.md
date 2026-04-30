---
title: Fee Examples
description: Simple BNB examples for trading fees, fee routing, UpVotes, finalize routing, and graduation economics.
---

These examples use BNB amounts to keep the math easy.

Examples are simplified for clarity. Actual wallet balances can also be affected by gas, slippage, rounding, and network conditions.

## Linked trade example

If a linked standard user buys or sells with 1 BNB, the 2.00% fee is 0.0200 BNB.

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| RecruiterRewardsVault, 0.25% | 0.0025 BNB |
| Squad Pool, 0.05% | 0.0005 BNB |
| ProtocolRevenueVault, 0.95% | 0.0095 BNB |
| Total fee | 0.0200 BNB |

## Unlinked trade example

If an unlinked user buys or sells with 1 BNB, the 2.00% fee is still 0.0200 BNB.

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| Warzone Airdrops, 0.30% | 0.0030 BNB |
| ProtocolRevenueVault, 0.95% | 0.0095 BNB |
| Total fee | 0.0200 BNB |

Unlinked activity sends the unassigned recruiter and squad slices to Warzone Airdrops.

## OG trade example

If an OG-linked user buys or sells with 1 BNB:

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| OG recruiter, 0.30% | 0.0030 BNB |
| Squad Pool, 0.05% | 0.0005 BNB |
| ProtocolRevenueVault, 0.90% | 0.0090 BNB |
| Total fee | 0.0200 BNB |

The OG override comes from protocol revenue. It does not increase the user-facing fee.

## UpVote example

If a campaign receives 100 UpVotes:

| Item | Amount |
| --- | ---: |
| UpVote price | 0.003 BNB |
| UpVotes | 100 |
| Total UpVote spend | 0.300 BNB |

UpVotes are paid visibility actions. They are not a safety label and do not guarantee graduation or price performance.

## Graduation example

At the minimum 50 BNB graduation threshold:

| Item | Amount |
| --- | ---: |
| Raised liquidity | 50 BNB |
| Finalize fee, 2.00% | 1 BNB |
| Remaining after fee | 49 BNB |
| LP liquidity, 80% | 39.2 BNB |
| Creator payout, 20% | 9.8 BNB |

The 1 BNB finalize fee then routes according to the campaign attribution profile.

## Standard linked finalize example

If a standard linked campaign finalizes with a 1 BNB finalize fee:

| Destination | Share | Amount |
| --- | ---: | ---: |
| RecruiterRewardsVault | 0.30% | 0.150 BNB |
| Squad Pool | 0.05% | 0.025 BNB |
| ProtocolRevenueVault | 1.65% | 0.825 BNB |
| Total finalize fee | 2.00% | 1.000 BNB |

Finalize does not route to LeagueTreasury.

## Unlinked finalize example

If an unlinked campaign finalizes with a 1 BNB finalize fee:

| Destination | Share | Amount |
| --- | ---: | ---: |
| Warzone Airdrops | 0.35% | 0.175 BNB |
| ProtocolRevenueVault | 1.65% | 0.825 BNB |
| Total finalize fee | 2.00% | 1.000 BNB |

The unassigned recruiter and squad slices route to Warzone Airdrops.

## OG linked finalize example

If an OG-linked campaign finalizes with a 1 BNB finalize fee:

| Destination | Share | Amount |
| --- | ---: | ---: |
| RecruiterRewardsVault | 0.35% | 0.175 BNB |
| Squad Pool | 0.05% | 0.025 BNB |
| ProtocolRevenueVault | 1.60% | 0.800 BNB |
| Total finalize fee | 2.00% | 1.000 BNB |

The extra OG recruiter amount is carved out of protocol revenue, not added on top of the finalize fee.

Read next: **[Fee Routing](/fees/fee-routing)** and **[Graduation](/platform/graduation)**.