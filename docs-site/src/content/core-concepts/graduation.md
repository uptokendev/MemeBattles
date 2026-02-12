---
title: Graduation
description: What happens when a campaign reaches the graduation target.
---

**Graduation** is the moment a campaign transitions from “bonding curve trading” to “post-graduation liquidity.”

## Why graduation exists
Bonding curves are great for early price discovery, but long-term trading is typically better on an AMM-style pool with deep liquidity.

Graduation is the bridge between those two phases.

## The graduation target
A campaign graduates when it reaches a defined funding/progress threshold (currently **50 BNB**).

> Parameter note: thresholds can be adjusted per season. Always rely on what the UI shows for the campaign you’re viewing.

## What happens at graduation (high level)
1. The bonding curve phase ends (the “primary” curve market is finalized).
2. A finalize action is executed that sets up post-graduation liquidity.
3. The campaign can continue trading in the broader market.

## Finalize fee and split (simple)
At graduation there is a **finalize fee** (currently **2%**).

After the fee, the graduated liquidity is split:
- **80%** goes to liquidity (LP)
- **20%** goes to the creator

This creates a clear incentive for creators to push for graduation while still ensuring meaningful liquidity for traders.

Next: **[UpVotes](/core-concepts/upvotes)**.
