---
title: Treasury Structure
description: How reward routing, protocol revenue, and operating funds are kept in separate lanes.
---

Treasury structure should be simple enough to inspect and boring enough to trust.

The main rule is separation. Reward routing should not be mixed into personal wallets or vague off chain handling.

## The treasury stack

At a high level, the stack works like this:

1. the router sends value into the right destination
2. reward lanes remain separated from protocol revenue
3. protocol revenue follows treasury policy
4. operating funds move through the approved treasury path

## Why that matters

This separation reduces confusion around who controls what and how reward money differs from operating money.

It also makes it easier to explain that reward systems are not being improvised after the fact.

## What users need to know

Most users do not need every treasury detail.
They need to know that:

- reward routing is separated from protocol revenue
- treasury handling follows an approved structure
- platform funds are not supposed to flow straight into personal developer wallets

Read: **[Fee Routing](/fees/fee-routing)** and **[Weekly Distribution](/treasury/weekly-distribution)**.
