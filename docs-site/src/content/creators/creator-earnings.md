---
title: Creator Earnings
description: How creators can earn from direct bonding-curve trade share, successful MemeWarzone graduations, visibility, and long-term reputation.
---

Creators have two direct on-platform earning paths in the current MemeWarzone model:

1. **Direct bonding-curve trade earnings** from buys and sells on their own campaign.
2. **Graduation payout** when their campaign reaches the graduation threshold and finalizes.

MemeWarzone is designed so creators can earn while a campaign is active and also earn meaningful value when they bring enough demand to graduate.

## Direct bonding-curve trade earnings

Creators receive **0.10% of every buy and sell** made through their own token bonding curve.

This creator trade share:

- is paid directly to the campaign creator wallet
- comes from the existing 2.00% buy/sell fee envelope
- does not add a separate user-facing fee
- applies during the bonding-curve phase
- is separate from recruiter rewards, Squad Pool, LeagueTreasury, Airdrops, and protocol revenue
- is separate from the creator graduation payout

## Creator trade share example

If a creator's campaign generates 100 BNB of bonding-curve buy/sell notional before graduation:

| Item | Amount |
| --- | ---: |
| Bonding-curve trade notional | 100 BNB |
| Creator direct trade share | 0.10% |
| Creator direct trade earnings | 0.100 BNB |

This means a creator can earn from real trading activity even before the campaign graduates.

## Graduation threshold

A campaign graduates at 50 BNB.

At graduation, a 2.00% finalize fee is taken before the remaining amount is split.

## Creator payout formula

At graduation:

1. Raised liquidity reaches the threshold.
2. Finalize fee is taken and routed.
3. Remaining liquidity is split:
   - 80% to LP
   - 20% to creator payout

## Minimum graduation example

At 50 BNB raised:

| Item | Amount |
| --- | ---: |
| Raised liquidity | 50 BNB |
| Finalize fee, 2.00% | 1 BNB |
| Remaining | 49 BNB |
| Creator payout, 20% | 9.8 BNB |
| LP liquidity, 80% | 39.2 BNB |

The creator's 20% graduation payout is separate from any 0.10% direct trade earnings already earned during bonding-curve trading.

## Finalize routing

The 2.00% finalize fee routes through TreasuryRouter.

Depending on attribution profile, it can fund recruiter rewards, Squad Pool, Warzone Airdrops, and protocol revenue.

Finalize does not route to LeagueTreasury and does not use the creator direct trade-share path.

Read: **[Fee Routing](/fees/fee-routing)**.

## Why creators are paid

Creators are not just deployers.

A strong creator brings:

- narrative
- content
- community
- traffic
- attention
- campaign energy
- launch preparation
- post-launch momentum

The 0.10% direct trade share rewards creators for keeping their own bonding-curve market active. The graduation payout rewards successful campaign execution while still leaving most remaining liquidity for LP.

## Repeat campaigns

Future versions of reputation and profile systems should make creator history visible.

That means each campaign can affect the next one. Responsible creators can build credibility over time.
