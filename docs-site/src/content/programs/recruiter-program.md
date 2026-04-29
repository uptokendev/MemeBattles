---
title: Recruiter Program
description: How recruiters bring creators and traders into MemeWarzone, earn from linked activity, build squads, and claim rewards.
---

The Recruiter Program rewards recruiters who bring real creators and traders into MemeWarzone.

Recruiters are growth operators. They onboard users, help squads stay active, and create distribution around campaigns.

## Simple version

- Recruiters get a unique code and shareable link.
- Users can become linked when they connect through a recruiter path.
- The pre-connect referral window lasts 30 days.
- A wallet can have only one active recruiter at a time.
- Switching is allowed only before first activity.
- After first activity, the recruiter link locks.
- Recruiters earn from linked activity through the existing 2.00% fee envelope.
- Recruiters do not receive an extra skim from Squad Pool.

## Who can become a recruiter

Recruiter enrollment is designed to be open at launch, with platform controls for abuse, duplicate codes, invalid submissions, and moderation.

A recruiter wallet can receive:

- a unique recruiter code
- a shareable link
- a public profile
- recruiter dashboard access
- linked creators and traders
- eligibility for recruiter rewards

If a recruiter abuses the system, becomes inactive under platform policy, or is closed by admin action, linked users can be detached according to the platform rules.

## Recruiter links

The preferred short link format is:

```txt
https://memewar.zone/r/CODE
```

The universal parameter format is:

```txt
https://memewar.zone/?ref=CODE
```

Both should resolve to the same attribution logic.

## How linking works

When a user arrives through a recruiter link, MemeWarzone captures the referral code before wallet connect.

That pre-connect referral window persists for 30 days. When the user connects a wallet, the platform can attach that wallet to the recruiter if no stronger existing state blocks the link.

A user becomes linked on wallet connect, not on first trade or first campaign.

## Switching and locking

A wallet may have only one recruiter at a time.

Switching is allowed only before first activity. After first activity, the link locks.

If an already-linked user later visits another recruiter link, the existing link should remain in place. The user should not be silently moved to the new recruiter.

This protects both sides:

- recruiters keep attribution for users they genuinely onboarded
- users cannot hop between codes to farm rewards
- reward routing stays auditable

## Creator and trader paths

A recruiter link is for onboarding creators and traders into the ecosystem.

A referred user should understand whether they are joining as:

- a creator preparing or launching campaigns
- a trader discovering and trading campaigns
- a squad member connected through recruiter attribution

A referred user is not automatically applying to become a recruiter just because they clicked a recruiter link.

## What recruiters earn

Recruiter rewards come from the existing 2.00% fee envelope.

| Linked activity | Standard recruiter | OG recruiter |
| --- | ---: | ---: |
| Buy / sell | 0.25% | 0.30% |
| Creator finalize | 0.30% | 0.35% |

OG override is carved out of protocol revenue. It does not add an extra fee for users.

Recruiters do **not** receive an additional cut from Squad Pool distributions. Squad Pool belongs to eligible squad members and is contribution-based.

## Recruiter earning examples

If a standard recruiter has linked users who generate 10 BNB of buy/sell volume:

| Item | Amount |
| --- | ---: |
| Linked buy/sell volume | 10 BNB |
| Standard recruiter share | 0.25% |
| Recruiter allocation | 0.025 BNB |

If an OG recruiter has linked users who generate 10 BNB of buy/sell volume:

| Item | Amount |
| --- | ---: |
| Linked buy/sell volume | 10 BNB |
| OG recruiter share | 0.30% |
| Recruiter allocation | 0.030 BNB |

If a linked creator finalizes at the 50 BNB threshold, the finalize fee is 1 BNB. A standard recruiter allocation is 0.150 BNB from that finalize fee. An OG recruiter allocation is 0.175 BNB from that finalize fee.

## Weekly claims

Recruiter rewards settle through weekly reward epochs.

After an epoch is processed and published, eligible recruiter rewards become claimable through the recruiter dashboard/profile flow.

The standard claim window is 7 days after epoch end. Expired recruiter rewards return to the Squad Pool path.

## Recruiter lifecycle

Recruiters can move through lifecycle states:

| State | Meaning |
| --- | --- |
| Active | Recruiter can receive attribution and rewards |
| Inactive | Recruiter may remain visible but may lose reward eligibility |
| Closed | Recruiter no longer receives new rewards |
| Detached | Linked users can become detached according to platform policy |

Inactivity, abuse, or closure can detach users from a recruiter. Detachment is tracked so dashboards can explain the current state.

## Recruiter leaderboard

Public recruiter leaderboards can show:

- recruiter code
- display name
- OG status
- active squad size
- linked creators
- linked traders
- routed activity
- reward totals where public

Leaderboard moments help turn growth work into visible status.

The main recruiter leaderboard is a public status board, not a direct prize board.

## Public profiles

Recruiter profiles can show:

- code and share link
- public squad stats
- historical performance
- linked graduations
- leaderboard rank

Private wallet-level attribution details and risk analytics should not be exposed publicly.

Read next: **[Attribution & Links](/programs/attribution-and-links)** and **[OG Recruiters](/programs/og-recruiters)**.