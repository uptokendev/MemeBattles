---
title: Attribution & Links
description: How recruiter links, 30-day referral windows, wallet linking, lock rules, and detachment work.
---

Recruiter attribution connects new users to the recruiter who brought them into MemeWarzone.

## Recruiter links

The preferred short format is:

```txt
https://memewar.zone/r/CODE
```

The universal parameter format is:

```txt
https://memewar.zone/?ref=CODE
```

Both should resolve to the same attribution logic.

## Before wallet connect

A user may click a recruiter link before connecting a wallet.

MemeWarzone preserves that recruiter code for a 30-day pre-connect window so attribution can still happen when the user later connects.

This avoids losing attribution just because the user browsed first and connected later.

## Wallet linking

When the user connects, the platform can link the wallet to the captured recruiter if:

- the recruiter code is valid
- the recruiter is active
- the wallet does not already have a locked recruiter link
- the wallet is not blocked by abuse or admin state

## Lock after first activity

After the wallet has first eligible platform activity, the recruiter link locks.

This protects both sides:

- recruiters keep attribution for users they genuinely onboarded
- users cannot hop between codes to farm rewards
- reward routing stays auditable

## Creator/trader choice

When a user arrives through a recruiter link, the flow should make clear that they are joining as a creator or trader, not applying to become a recruiter.

This prevents referred users from entering the wrong flow.

## Code management

Recruiter codes should be unique.

If a recruiter edits their code and the new code is already taken, the UI should clearly explain the conflict.

## Manual corrections

Admin tools may be needed for edge cases, such as users who joined incorrectly during an earlier confusing flow.

Manual corrections should be logged carefully because attribution affects routing and payouts.

## Detachment

A wallet can detach from a recruiter when platform policy requires it, such as recruiter closure, inactivity, abuse review, or admin correction.

Detached state should be visible to the affected wallet in private dashboard/profile views.
