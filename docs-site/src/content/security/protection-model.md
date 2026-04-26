---
title: Protection Model
description: The user-facing safety, treasury, routing, claim, and transparency model for MemeWarzone.
---

MemeWarzone should not be a blind campaign market.

The protection model combines contract rules, router-enforced fee splits, visible reputation, launch limits, claim-based payouts, and user education.

## Core safety principles

Users should be able to evaluate:

- who launched a campaign
- whether the deployer has history
- how previous campaigns performed
- whether graduation happened cleanly
- whether holder concentration looks dangerous
- whether activity is broad or fake-looking
- where fees route
- which rewards are claimable

## Router-enforced splits

TreasuryRouter enforces fee routing before protocol revenue is defined.

That matters because reward allocations are not manually decided after the fact. The router sends funds into League, recruiter, airdrop, Squad Pool, and protocol revenue buckets according to route profile.

## No dev-wallet custody

Protocol revenue should not flow directly to developer wallets.

ProtocolRevenueVault feeds treasury policy, and Owners Safe/Ops Safe separation keeps operating funds away from personal wallet custody.

## Claim-based payout safety

Rewards are claim-based.

This reduces operational risk because the system can:

- process eligibility before payout
- apply anti-abuse checks
- show users what they are claiming
- avoid automatic payout spam
- keep claims auditable

## User-facing protections

Important protection categories include:

- anti-rug launch mechanics
- LP handling visibility
- finalize rules
- creator/deployer reputation
- creator cooldowns
- campaign caps
- unique buyers vs volume indicators
- top-holder concentration visibility
- suspicious activity flags
- scam-link education

## Anti-abuse

Reward systems must filter fake activity.

Wash trading, self-trading, common-control wallets, wallet splitting, circular trading, and recruiter farming loops can be excluded from rewards.

Read: **[Anti-Abuse System](/security/anti-abuse)**.

## Wording discipline

Security claims must match the actual implementation.

Do not market a feature as guaranteed unless contracts, frontend, indexing, and operations enforce it.
