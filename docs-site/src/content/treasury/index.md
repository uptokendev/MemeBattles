---
title: Treasury Structure
description: How MemeWarzone separates reward routing, protocol revenue, Owners Safe policy, and Ops Safe execution.
---

MemeWarzone treasury design should be boring on purpose.

The system separates reward routing from protocol revenue and operations.

## Core principle

TreasuryRouter routes fees first.

Protocol revenue is what remains after League, recruiter, airdrop, and Squad Pool allocations.

```txt
fee amount -> TreasuryRouter -> reward buckets + ProtocolRevenueVault
ProtocolRevenueVault -> Owners Safe policy
Owners Safe -> Ops Safe and weekly distribution policy
```

## Routing layer

TreasuryRouter can route to:

| Destination | Purpose |
| --- | --- |
| LeagueTreasury | League prizes |
| RecruiterRewardsVault | Recruiter reward allocations |
| CommunityRewardsVault | Warzone Airdrops and Squad Pool balances |
| ProtocolRevenueVault | Protocol revenue remainder |

This means protocol revenue is not the full fee. It is the routed remainder.

## Owners Safe

The Owners Safe is the main treasury and governance wallet.

Direction:

- 2-of-3 multisig
- receives protocol revenue through the ProtocolRevenueVault path
- controls treasury and governance actions
- supports weekly founder distribution policy
- keeps protocol revenue out of personal developer wallets

## Ops Safe

The Ops Safe is for day-to-day execution.

Target balance: 50 BNB.

Policy direction:

- if Ops Safe is below 50 BNB, top it up from Owners Safe
- if Ops Safe is above 50 BNB, sweep excess back to Owners Safe

This gives operational flexibility without exposing the full treasury.

## Weekly payouts

Weekly treasury movement should follow a fixed policy:

1. Normalize Ops Safe.
2. Retain the configured treasury buffer.
3. Distribute the remaining configured amount to predefined payout wallets.

Read: **[Weekly Distribution](/treasury/weekly-distribution)**.

## Developer wallets

Developer EOAs can deploy contracts and prepare transactions.

They should not receive protocol revenue directly.

## Why this matters

This structure reduces:

- personal wallet custody risk
- founder disputes
- accidental treasury exposure
- operational deadlocks
- unclear revenue ownership
- contradictions between reward routing and treasury policy
