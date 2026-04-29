---
title: Epochs & Prizes
description: How weekly and monthly League timing, prize pools, payouts, rollovers, and claims work.
---

Leagues run in fixed epochs.

Fixed timing makes competition easier to understand, easier to broadcast, and easier to verify after winners are published.

## Simple version

| Epoch | Timing | Purpose |
| --- | --- | --- |
| Weekly | Monday 00:00 UTC to next Monday 00:00 UTC | Frequent battles and regular winner moments |
| Monthly | 1st day 00:00 UTC to next 1st day 00:00 UTC | Bigger finals and higher-status competition |

League prize capacity is funded by LeagueTreasury. From every buy and sell, **0.75% of trade notional** routes to LeagueTreasury.

## Weekly epoch

Weekly epochs run:

```txt
Monday 00:00 UTC to next Monday 00:00 UTC
```

Weekly Leagues are designed for frequent competition and regular content moments.

Weekly epochs help create:

- new standings
- new winners
- new campaign stories
- new social posts
- new reasons for traders and communities to return

## Monthly epoch

Monthly epochs run:

```txt
1st day of the month 00:00 UTC to 1st day of the next month 00:00 UTC
```

Monthly Leagues are designed to feel bigger and more prestigious than weekly battles.

Monthly winners should become stronger public status moments for creators, traders, and communities.

## Prize funding

League prizes are funded by platform activity.

From every buy and sell:

| Destination | Share |
| --- | ---: |
| LeagueTreasury | 0.75% |

This means League prize capacity can grow as trading volume grows.

The core flywheel is:

1. trading creates LeagueTreasury inflow
2. League prizes create competition
3. competition creates attention and content
4. attention brings more trading activity

## Monthly Top 5 split

The monthly Top 5 prize split is:

| Rank | Share |
| --- | ---: |
| 1st | 40% |
| 2nd | 25% |
| 3rd | 15% |
| 4th | 12% |
| 5th | 8% |

### Example

If a monthly category has a 10 BNB prize pool:

| Rank | Share | Example payout |
| --- | ---: | ---: |
| 1st | 40% | 4.0 BNB |
| 2nd | 25% | 2.5 BNB |
| 3rd | 15% | 1.5 BNB |
| 4th | 12% | 1.2 BNB |
| 5th | 8% | 0.8 BNB |

## Weekly prizes

Weekly prizes are designed to be frequent and realistic at launch, then scale with platform volume and LeagueTreasury inflow.

Weekly prize rules may vary by category, available pool size, and launch configuration. The important rule is that winners and payout logic should be explainable after publication.

Public winner pages should make clear:

- which epoch the result belongs to
- which League category was used
- which campaign or wallet won
- what the payout was
- whether any rollover was applied
- whether the result is final or still pending publication

## Claims and expiry

League and reward claims should have clear windows.

For the unified reward ledger, the standard claim deadline is **7 days after epoch end**.

Eligible users should claim only through official MemeWarzone dashboard or profile pages.

Read: **[Epochs & Claims](/rewards/epochs-and-claims)**.

## Rollover logic

Some categories, especially Perfect Run, can roll over if no valid winner exists.

Rollover logic should be public so users know why a prize did or did not pay out.

A rollover can happen when:

- no campaign qualifies
- the category requires a valid winner and none exists
- activity is excluded by review
- the prize cannot be safely allocated under the published rules

If a rollover happens, the winner page or League page should explain the broad reason without exposing private review thresholds.

Read: **[League Categories](/leagues/categories)**.