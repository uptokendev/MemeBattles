---
title: Attribution & Links
description: How recruiter links, codes, and user attribution should work.
---

Recruiter attribution connects new users to the recruiter who brought them into MemeWarzone.

## Recruiter links

The preferred short format is:

`https://memewar.zone/r/CODE`

The universal parameter format is:

`https://memewar.zone/?ref=CODE`

Both should resolve to the same attribution logic.

## Before wallet connect

A user may click a recruiter link before connecting a wallet.

The platform should preserve that recruiter code so attribution can still happen when the user later connects.

This avoids losing attribution just because the user browsed first and connected later.

## Creator/trader choice

When a user arrives through a recruiter link, the flow should clearly ask whether they are joining as:

- Creator
- Trader

This prevents the common mistake where referred users accidentally apply as recruiters instead of joining the recruiter’s squad.

## Overlay direction

A clean referral overlay should keep the user focused.

The page can be blurred behind the join card while the user chooses Creator or Trader.

This is better than showing the Recruiter Application popup to referred users.

## Code management

Recruiter codes should be unique.

If a recruiter edits their code and the new code is already taken, the UI should clearly explain the conflict.

## Manual corrections

Admin tools may be needed for edge cases, such as users who joined incorrectly during an earlier confusing flow.

Manual corrections should be logged and handled carefully because attribution affects payouts.
