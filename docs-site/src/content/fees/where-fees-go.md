---
title: Where Fees Go
description: How MemeWarzone routes fees across Leagues, recruiters, airdrops, squads, protocol revenue, and treasury policy.
---

MemeWarzone fees support the whole battlefield, not only the protocol owner.

The important principle is:

```txt
protocol revenue = fee remainder after reward routing
```

## Trading fees

Every buy and sell has a 2.00% fee.

That fee can route into:

- LeagueTreasury
- RecruiterRewardsVault
- CommunityRewardsVault: warzoneAirdropBalance
- CommunityRewardsVault: squadPoolBalance
- ProtocolRevenueVault

## League Treasury

From every buy and sell, 0.75% of trade notional routes to LeagueTreasury.

This creates the League flywheel:

1. trading volume creates League inflow
2. League prizes create competition
3. competition creates content and attention
4. attention brings more trading volume

## Recruiter rewards

When a wallet has active recruiter attribution, part of eligible activity routes to RecruiterRewardsVault.

| Activity | Standard recruiter | OG recruiter |
| --- | ---: | ---: |
| Buy / sell | 0.25% | 0.30% |
| Finalize | 0.30% | 0.35% |

OG override comes from protocol revenue. It does not increase the user-facing fee.

## Squad Pool and Airdrops

When a wallet is linked, 0.05% of buy/sell and finalize notional routes to the Squad Pool balance.

When a wallet is unlinked, the unassigned recruiter and squad slices route to the Warzone Airdrop balance instead.

| Flow | Destination |
| --- | --- |
| Linked squad slice | Squad Pool |
| Unlinked recruiter slice | Warzone Airdrops |
| Unlinked squad slice | Warzone Airdrops |

## Protocol revenue

ProtocolRevenueVault receives the remainder after League, recruiter, airdrop, and Squad Pool routing.

That revenue can then move into Owners Safe policy and weekly treasury distribution. It should not flow directly to personal developer wallets.

Read: **[Treasury Structure](/treasury)**.
