---
title: Treasury Structure
description: How MemeWarzone keeps protocol revenue and operational funds separated.
---

MemeWarzone treasury design should be boring on purpose.

Protocol revenue should not flow directly to personal wallets or developer wallets.

## Core principle

All protocol revenue goes to the **Owners Safe** first.

From there, weekly policy determines how funds are retained, moved to operations, or distributed.

## Two-wallet model

| Wallet | Purpose |
| --- | --- |
| Owners Safe | Treasury, governance, protocol revenue, major control. |
| Ops Safe | Infrastructure, tools, subscriptions, small marketing, day-to-day costs. |

## Owners Safe

The Owners Safe is the main treasury and governance wallet.

Direction:

- 2-of-3 multisig
- receives protocol revenue
- controls treasury and governance actions
- controls League treasury admin/vault authority where applicable
- supports weekly founder distribution policy

## Ops Safe

The Ops Safe is for day-to-day execution.

Target balance: **50 BNB**.

Policy direction:

- if Ops Safe is below 50 BNB, top up from Owners Safe
- if Ops Safe is above 50 BNB, sweep excess back to Owners Safe

This gives operational flexibility without exposing the full treasury.

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
