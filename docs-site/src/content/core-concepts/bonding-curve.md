---
title: Bonding Curve
description: How pricing works before graduation.
---

Before graduation, each campaign trades on a **bonding curve**: a pricing function where the token price depends on how many tokens have been bought from the curve.

## The intuition
- **Buy**: you add BNB into the curve and receive tokens → supply on the curve decreases → **price goes up**.
- **Sell**: you return tokens to the curve and receive BNB → supply on the curve increases → **price goes down**.

That means there is no traditional order book. Your trade interacts directly with the curve.

## Price impact (why big orders move the price)
Because the curve price changes as you move along it:
- Small trades move the price a little.
- Large trades can move the price a lot.

On the UI you’ll usually see an estimate for:
- expected tokens/BNB received
- price impact

## Slippage (why a trade can fail)
Your wallet submits a transaction to the chain. If the market moves before it confirms (other users trading), your expected output may change.

**Slippage tolerance** is the maximum difference you’re willing to accept between the quoted output and the final output.

- In calm markets, low slippage is usually fine.
- In fast markets, you may need slightly higher slippage.

## What “early vs late on the curve” means
- **Early curve**: cheaper price levels, usually thinner activity, momentum can build quickly.
- **Late curve**: closer to graduation, price levels are higher and moves can be sharper in both directions.

## Important trader mindset
Bonding-curve markets are **reflexive**:
- buying pushes price up (often attracting more attention)
- selling pushes price down (often triggering more selling)

Treat it as high-volatility by default.

Next: **[Graduation](/core-concepts/graduation)**.
