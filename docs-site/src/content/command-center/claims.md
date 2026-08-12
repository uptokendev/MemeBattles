---
title: Claims Console
description: How claimable, pending, failed, and expired reward states work inside Command Center.
---

Claims Console is the payout control board.

It groups reward rows by type and shows the exact state the wallet can act on.

## Claim states

- Claimable means the wallet can submit a claim now.
- Pending means a claim action is already in motion.
- Failed means the last claim attempt did not clear.
- Expired means the claim window closed.
- Empty means no reward is ready on that lane.

## What to do

Move in this order:

1. Read the state label.
2. Confirm the wallet and chain.
3. Claim only the rows that are actually claimable.
4. Recheck the board after the chain confirms.

## Chain note

BNB claims are active.
Solana claims are tracked but not enabled.

That means a Solana reward row can exist as a record without exposing a live claim button.

## Reason discipline

The board can show broad reason signals.
It should not expose anti abuse thresholds or internal enforcement logic.

If a row is not claimable, read the state first. Do not assume the funds are missing.

Read: **[Epochs & Claims](/rewards/epochs-and-claims)** and **[Reward Dashboard](/rewards/dashboard-ux)**.
