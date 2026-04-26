---
title: Fee Examples
description: Simple BNB examples for trading fees, fee routing, UpVotes, and graduation economics.
---

These examples use BNB amounts to keep the math easy.

## Linked trade example

If a linked standard user buys with 1 BNB, the 2.00% fee is 0.0200 BNB.

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| RecruiterRewardsVault, 0.25% | 0.0025 BNB |
| Squad Pool, 0.05% | 0.0005 BNB |
| ProtocolRevenueVault, 0.95% | 0.0095 BNB |
| Total fee | 0.0200 BNB |

## Unlinked trade example

If an unlinked user buys with 1 BNB, the 2.00% fee is still 0.0200 BNB.

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| Warzone Airdrops, 0.30% | 0.0030 BNB |
| ProtocolRevenueVault, 0.95% | 0.0095 BNB |
| Total fee | 0.0200 BNB |

## OG trade example

If an OG-linked user buys with 1 BNB:

| Destination | Amount |
| --- | ---: |
| LeagueTreasury, 0.75% | 0.0075 BNB |
| OG recruiter, 0.30% | 0.0030 BNB |
| Squad Pool, 0.05% | 0.0005 BNB |
| ProtocolRevenueVault, 0.90% | 0.0090 BNB |
| Total fee | 0.0200 BNB |

## UpVote example

If a campaign receives 100 UpVotes:

| Item | Amount |
| --- | ---: |
| UpVote price | 0.003 BNB |
| UpVotes | 100 |
| Total UpVote spend | 0.300 BNB |

## Graduation example

At the minimum 50 BNB graduation threshold:

| Item | Amount |
| --- | ---: |
| Raised liquidity | 50 BNB |
| Finalize fee, 2.00% | 1 BNB |
| Remaining after fee | 49 BNB |
| LP liquidity, 80% | 39.2 BNB |
| Creator payout, 20% | 9.8 BNB |

If the campaign is standard linked, the 1 BNB finalize fee routes as 0.15 BNB recruiter, 0.025 BNB Squad Pool, and 0.825 BNB protocol revenue.
