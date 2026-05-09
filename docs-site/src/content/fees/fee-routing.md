---
title: Fee Routing
description: The authoritative routing model for TreasuryRouter, linked users, unlinked users, OG recruiters, creator trade share, reward buckets, and protocol revenue.
---

MemeWarzone uses TreasuryRouter as the single routing entry point for fee flows.

The user-facing fee stays simple:

| Action | Fee |
| --- | ---: |
| Buy | 2.00% |
| Sell | 2.00% |
| Finalize / Graduation | 2.00% |

Recruiters, squads, airdrops, Leagues, and creator trade earnings do not add extra user fees. Routing happens inside the existing 2.00% fee envelope.

## Downstream buckets

TreasuryRouter routes into these buckets:

| Bucket | Purpose |
| --- | --- |
| Creator wallet | Receives the creator's direct 0.10% share from buys and sells on that creator's own bonding curve |
| LeagueTreasury | Funds weekly and monthly League prizes |
| RecruiterRewardsVault | Holds recruiter reward allocations |
| CommunityRewardsVault | Holds Warzone Airdrop and Squad Pool balances |
| ProtocolRevenueVault | Holds protocol revenue after reward routing |

CommunityRewardsVault tracks two internal balances:

| Internal balance | Purpose |
| --- | --- |
| warzoneAirdropBalance | Funds Warzone BNB Airdrops |
| squadPoolBalance | Funds Squad Pool rewards |

## Creator direct trade share

Creators earn **0.10% of every buy and sell** made through their own token bonding curve.

This creator trade share is paid directly to the campaign creator wallet as bonding-curve trading happens. It is not a separate user-facing fee and it is not delayed until graduation.

The creator trade share applies only to that creator's own campaign. It is separate from the creator's graduation payout, which remains 20% of remaining raised liquidity after the finalize fee.

## Route profiles

The router supports three active route profiles:

| Profile | Meaning |
| --- | --- |
| standard_linked | Wallet has active standard recruiter attribution |
| standard_unlinked | Wallet has no active recruiter attribution |
| og_linked | Wallet has active OG recruiter attribution |

The tables below show shares as percentages of trade or finalize notional. Each route sums to the 2.00% user-facing fee.

## Trade routing

For every buy and sell, 0.75% of trade notional routes to LeagueTreasury and 0.10% routes directly to the campaign creator wallet.

### Standard linked trade

| Destination | Share |
| --- | ---: |
| LeagueTreasury | 0.75% |
| Creator wallet | 0.10% |
| RecruiterRewardsVault | 0.25% |
| CommunityRewardsVault: squadPoolBalance | 0.05% |
| ProtocolRevenueVault | 0.85% |
| Total | 2.00% |

### Standard unlinked trade

| Destination | Share |
| --- | ---: |
| LeagueTreasury | 0.75% |
| Creator wallet | 0.10% |
| CommunityRewardsVault: warzoneAirdropBalance | 0.30% |
| ProtocolRevenueVault | 0.85% |
| Total | 2.00% |

Unlinked activity sends the unassigned recruiter and squad slices to Warzone Airdrops.

### OG linked trade

| Destination | Share |
| --- | ---: |
| LeagueTreasury | 0.75% |
| Creator wallet | 0.10% |
| RecruiterRewardsVault | 0.30% |
| CommunityRewardsVault: squadPoolBalance | 0.05% |
| ProtocolRevenueVault | 0.80% |
| Total | 2.00% |

The OG recruiter override adds 0.05% for the recruiter by carving it out of protocol revenue. It does not increase the user-facing fee.

## Finalize routing

Finalize uses the same 2.00% fee envelope, but it does not route to LeagueTreasury or the creator direct trade-share path.

Creators already receive their graduation payout from the post-finalize liquidity split: 20% of remaining raised liquidity after the 2.00% finalize fee.

### Standard linked finalize

| Destination | Share |
| --- | ---: |
| RecruiterRewardsVault | 0.30% |
| CommunityRewardsVault: squadPoolBalance | 0.05% |
| ProtocolRevenueVault | 1.65% |
| Total | 2.00% |

### Standard unlinked finalize

| Destination | Share |
| --- | ---: |
| CommunityRewardsVault: warzoneAirdropBalance | 0.35% |
| ProtocolRevenueVault | 1.65% |
| Total | 2.00% |

### OG linked finalize

| Destination | Share |
| --- | ---: |
| RecruiterRewardsVault | 0.35% |
| CommunityRewardsVault: squadPoolBalance | 0.05% |
| ProtocolRevenueVault | 1.60% |
| Total | 2.00% |

## Routing principles

- No new fees are added for reward systems or creator trade earnings.
- Routing happens before protocol revenue is defined.
- Creator trade earnings are paid directly from buy/sell routing on the creator's own campaign.
- Protocol revenue is the remainder after creator, League, recruiter, airdrop, and Squad Pool routing.
- Unlinked recruiter and squad slices route to Warzone Airdrops.
- OG recruiter override comes from protocol revenue, not from users.
- Claims remain claim-based instead of automatic wallet pushes, except creator direct trade share which is paid directly as part of trade routing.

Read next: **[Where Fees Go](/fees/where-fees-go)** and **[Treasury Structure](/treasury)**.
