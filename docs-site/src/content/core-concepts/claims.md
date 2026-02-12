---
title: Claims
description: How rewards are collected by eligible wallets.
---

A **claim** is an on-chain action that transfers rewards to the wallet that earned them.

## Who can claim
Only the wallet that earned a reward can claim it. This is intentional:
- it prevents “redirected payouts”
- it reduces admin involvement

## When you can claim
Claims are available once an epoch (league) is finalized or a reward event is available.

## How claiming works
1. Connect the wallet that earned the reward
2. Open the league / claims section
3. Click **Claim** and confirm in your wallet
4. Wait for confirmation — rewards will arrive after the tx is mined

## Common issues
- **Wrong wallet connected**: switch to the earning wallet
- **Epoch not finalized**: claims will appear after cutoff/finalization
- **Tx fails**: check you have enough BNB for gas
