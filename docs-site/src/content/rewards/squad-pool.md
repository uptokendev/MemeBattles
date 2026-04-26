---
title: Squad Pool
description: How Squad Pool rewards are funded, scored, capped, distributed, and surfaced in MemeWarzone.
---

The Squad Pool is a weekly reward system for eligible members of recruiter-connected squads.

It rewards contribution. It is not an equal split.

## Relationship with recruiters

Recruiters bring creators and traders into MemeWarzone. Those linked users form the recruiter's squad while the link is active.

Recruiters can earn recruiter rewards from linked activity. Squad members can separately compete for Squad Pool rewards.

## Funding source

Squad Pool funding comes from the squad slice of linked activity:

| Activity | Squad Pool slice |
| --- | ---: |
| Linked buy / sell | 0.05% |
| Linked finalize | 0.05% |

Expired recruiter rewards and expired Squad Pool rewards can also return into the Squad Pool path.

## Member score

Each eligible member has a contribution score.

The high-level formula is:

```txt
member score = eligible trader score + eligible creator score
```

Trader score is based on capped eligible weekly trading activity. Creator score is based on capped qualified creator activity.

Only eligible activity counts. Excluded activity, self-trading, circular activity, and flagged common-control behavior can reduce the score to zero or make the wallet ineligible.

## Eligibility signals

The same broad signals used across reward eligibility can apply:

| Component | Examples |
| --- | --- |
| Trader activity | Minimum 0.25 BNB weekly volume, at least 3 trades, activity on at least 2 days, no own-campaign trades |
| Creator activity | At least 3 BNB qualified bonding-curve buy volume, at least 10 unique non-linked buyers |
| Caps | 15 BNB counted trader volume and 25 BNB counted creator activity |
| Abuse filters | No wash trading, self-trading, wallet splitting, circular activity, or linked-wallet farming |

## Squad allocation

Squads compete for the global Squad Pool using squad score.

The router and indexer compute:

1. each member's eligible score
2. each squad's raw score
3. each squad's effective score after diminishing returns
4. each squad's estimated allocation
5. each member's estimated payout inside the squad

## Diminishing returns

Diminishing returns apply at squad level.

| Squad raw score range | Weight |
| --- | ---: |
| First 100 BNB-equivalent score | 100% |
| Next 100 BNB-equivalent score | 50% |
| Above 200 BNB-equivalent score | 25% |

Diminishing returns do not change an individual member score. They only affect the squad-level allocation weight.

## Caps

Two caps keep the pool competitive:

| Cap | Rule |
| --- | --- |
| Member cap | One member can receive at most 40% of their squad allocation |
| Global squad cap | One squad can receive at most 15% of the global Squad Pool |

Any excess is redistributed where possible. Amounts that cannot be allocated safely carry over according to reward policy.

## Claims

Squad Pool rewards settle weekly.

After the weekly epoch is processed and published, eligible Squad Pool rewards become claimable through the dashboard/profile flow.

The standard claim window is 7 days after epoch end.

## Public and private views

Public squad pages can show:

- squad rank
- squad score
- estimated squad allocation
- active member count
- eligible member count
- member ranking
- exact public member score

Private profile views can show:

- current squad state
- detached state when applicable
- estimated reward
- claimable Squad Pool amount
- eligibility reason codes
