---
title: Where does revenue go?
description: Plain-English revenue flow from protocol → treasury → payouts.
---

## Step 1 — Revenue goes to Owners Safe
Owners Safe is a **2-of-3 multisig** treasury wallet. No personal wallets receive protocol fees directly.

## Step 2 — Ops Safe stays at 50 BNB
Ops Safe is capped runway for operations:
- if below 50 → top up
- if above 50 → sweep excess back

## Step 3 — Weekly distribution
On a fixed weekly cadence:
1) normalize Ops Safe to 50  
2) retain treasury buffer %  
3) distribute remaining % to founder payout wallets

We avoid on-chain auto-splitting to individuals for safety and flexibility.
