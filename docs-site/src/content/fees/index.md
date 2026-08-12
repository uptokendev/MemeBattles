---
title: Fee Model
description: The live fee envelope and what it supports across launch, rewards, and protocol operations.
---

MemeWarzone uses a visible fee model.

The goal is to keep the user facing costs understandable while the internal routing sends value into the right places.

## What the fee model covers

The fee system supports:

- creator trade earnings where active
- league funding
- recruiter and squad reward lanes
- airdrop funding lanes
- protocol revenue and treasury policy

## What matters most for users

Users should understand three things:

- the active buy and sell fee
- the active finalize policy
- the fact that reward systems are funded inside the fee envelope, not stacked on top of it

## Why the model is structured this way

If every incentive lane added its own new public fee, the product would become harder to trust and harder to explain.

The current design keeps the fee envelope readable and lets routing do the harder work behind the scenes.

Read: **[Fee Routing](/fees/fee-routing)** and **[Economic Model](/economics)**.
