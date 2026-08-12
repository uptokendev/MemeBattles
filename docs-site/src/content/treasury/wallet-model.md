---
title: Wallet model (Owners/Ops)
description: Owners Safe and Ops Safe structure.
---

The wallet model exists to keep control, operations, and reward handling in separate lanes.

That separation is one of the simplest trust controls in the stack.

## Owners Safe

The Owners Safe is the main treasury control point.

Its job is to hold the higher authority over protocol funds and treasury policy instead of routing value straight into personal wallets.

## Ops Safe

The Ops Safe is the execution lane.

Its job is to support normal operating movement without exposing the full treasury to day to day handling.

## Why two lanes matter

This split helps reduce:

- personal custody risk
- confused ownership of protocol funds
- accidental treasury exposure
- blurred lines between reward money and operating money

## What users need to know

Most users do not need every treasury procedure.
They need to know that operations and core treasury control are not supposed to be the same wallet.

That design is deliberate.
It makes review easier and mistakes harder to hide.

Read: **[Treasury Structure](/treasury)** and **[Weekly Distribution](/treasury/weekly-distribution)**.
