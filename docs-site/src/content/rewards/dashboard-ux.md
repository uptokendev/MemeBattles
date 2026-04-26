---
title: Dashboard & Rewards UX
description: What users should see for pending rewards, eligibility, claims, reason codes, squads, airdrops, and recruiter rewards.
---

The dashboard and profile pages are the user's reward control center.

Public pages show competition. Private wallet views show eligibility, reward state, and claim actions.

## What users should see

A connected wallet should be able to inspect:

- pending rewards
- claimable rewards
- claimed rewards
- expired rewards
- eligibility status
- broad reason codes
- claim deadlines
- linked recruiter state
- squad state
- airdrop state

## Reward states

| State | Meaning |
| --- | --- |
| Pending | Activity has been recorded, but the epoch is not published yet |
| Claimable | The epoch is published and the wallet can claim |
| Claimed | The wallet already claimed the reward |
| Expired | The claim deadline passed |
| Rolled over | The expired amount returned to its reward path |
| Cancelled | The entry was cancelled by admin or reconciliation logic |

## Claim buttons

Claim buttons should be shown only when a wallet has a claimable reward.

The UI should make clear:

- which program is being claimed
- which epoch the claim belongs to
- the amount
- the deadline
- the transaction status

Users should only claim through official MemeWarzone pages.

## Eligibility and reason codes

Reason codes should be clear enough for honest users.

Examples include:

- below minimum weekly volume
- below minimum trade count
- below active day requirement
- own-campaign trading excluded
- no squad
- squad detached
- recruiter direct-win excluded
- repeat winner cooldown
- Battle League winner exclusion active
- suspected circular activity
- review required

The UI should not expose exact anti-abuse thresholds beyond the published rules.

## Public vs private surfaces

Public surfaces can include:

- recruiter leaderboard
- public recruiter profiles
- squad leaderboard
- public squad member ranking
- Warzone Airdrop winner pages
- League standings

Private wallet surfaces can include:

- personal eligibility status
- linked recruiter
- squad membership and detached state
- estimated rewards
- claimable balances
- claim history
- broad ineligibility reason codes
