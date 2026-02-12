---
title: Bonding curve (trader view)
description: How to think about entries, exits, and sizing on curve markets.
---

This page assumes you understand the mechanics from **[Core Concepts → Bonding Curve](/core-concepts/bonding-curve)**.

## 1) Curve markets are reflexive
On a bonding curve:
- buys push price up
- sells push price down

That means momentum can snowball in either direction.

## 2) Size matters more than you think
Large orders create large price impact. Two practical rules:
- Prefer **multiple smaller orders** instead of one huge order.
- Always check the quote and price impact before confirming.

## 3) Early vs late curve tactics
**Early curve**
- spreads/impact can be higher due to thinner activity
- momentum can be explosive (both up and down)

**Late curve**
- closer to graduation, attention is higher
- volatility is often higher because many traders are positioning for graduation

## 4) Slippage discipline
Slippage is not “a setting to make trades always work.” It is your protection.
- Use the lowest slippage that reliably confirms.
- If you have to use very high slippage, assume you can be filled worse than expected.

## 5) Common failure modes
- **Chasing green**: buying after big move and becoming liquidity for earlier buyers
- **Panic selling**: selling into a cascade and locking in the worst price
- **Over-sizing**: moving the curve against yourself

Next: **[UpVotes](/traders/upvotes)**.
