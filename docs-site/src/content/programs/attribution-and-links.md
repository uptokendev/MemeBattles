---
title: Attribution & Links
description: How recruiter attribution works from the share path into the connected wallet flow.
---

Attribution connects a user to the recruiter who brought them in.

It gives the product a clean way to track who opened the route without turning the user flow into a confusing maze.

## How the share path works

A recruiter can use a direct share path or a parameter based link.
Both should lead to the same attribution result inside the product.

## What happens before wallet connect

A user can arrive first and connect later.
The product should preserve that path long enough for the later wallet connection to complete under the same recruiter route.

## What happens after wallet connect

When the wallet connects, the platform can attach the account to the captured recruiter path if the route is valid and the account is not already locked to another recruiter state.

## Why the lock matters

The lock exists to keep routing auditable and to stop easy hopping between codes once a user has already become active.

## Best rule

Use one clear share path and keep the onboarding message simple.
If a user enters through the wrong route, fix the confusion early before activity begins.

Read: **[Recruiter Program](/programs/recruiter-program)**.
