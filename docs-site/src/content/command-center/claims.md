---
title: Claims Console
description: How claimable, pending, failed, and expired reward states work inside Command Center.
---

Claims Console is the payout board for the connected wallet.

It groups reward rows by state so you can see what is ready now, what is already moving, and what needs no action.

## Claim states

- Claimable means you can submit the claim now.
- Pending means a claim request is already in flight.
- Failed means the last attempt did not clear.
- Expired means the claim window closed.
- Empty means there is no reward ready on that lane.

## Claim order

Move in this order:

1. read the state
2. confirm the wallet and chain
3. claim only the rows marked claimable
4. recheck the board after confirmation

## Chain status

BNB claims are active.
Solana reward records can appear before Solana claim buttons are enabled.

That distinction matters. A reward record is not the same thing as a live claim path.

## When something looks wrong

Start with the state label.
Do not assume funds are missing just because a row is not claimable yet.

Read: **[Epochs & Claims](/rewards/epochs-and-claims)** and **[Reward Dashboard](/rewards/dashboard-ux)**.
