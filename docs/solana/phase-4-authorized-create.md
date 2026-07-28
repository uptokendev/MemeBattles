# Solana Phase 4 Detached Authorized Create Foundation

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
PR: #67

## What this slice adds

This slice replaces the historical route-authority transaction co-signing concept with detached Ed25519 authorization and moves the valid Solana foundation onto the current `devpostgrad` integration base.

It does not enable public Solana create, buy, sell or graduation flows.

| Path | Purpose |
| --- | --- |
| `programs/memewarzone_solana/src/lib.rs` | Wires `create_campaign` into the Anchor program and supplies global, generation, creator, risk and cluster state. |
| `programs/memewarzone_solana/src/authorized_create.rs` | Adds campaign/create-authorization PDAs, detached Ed25519 verification, timer/ticker/reservation/target/profile binding, replay protection and Rust tests. |
| `docs/solana/create-authorization-v1.md` | Defines the exact binary payload, transaction order and remaining gates. |
| `.github/workflows/solana-anchor-ci.yml` | Builds the Anchor program and runs Rust invariant tests in GitHub Actions. |

The old prototype frontend adapter, frontend authorization helper and `dev-fix` Solana transaction backend were not ported because they manually encode protocol layouts and no longer match the corrected authorization design.

## Authorization model

Railway signs a domain-separated payload only. Railway does not sign the creator transaction.

The creator submits one transaction containing:

```text
instruction N-1: native Ed25519 verification instruction
instruction N:   MemeWarzone create_campaign instruction
```

`create_campaign` reads the Instructions sysvar and requires:

- a top-level call to the MemeWarzone program;
- the Ed25519 instruction immediately before the current instruction;
- exactly one self-contained signature;
- the public key configured as `GlobalConfig.route_signer`;
- byte-for-byte equality with the on-chain reconstructed payload;
- a fresh creator+nonce PDA.

The transaction fails atomically if the signature is invalid, the payload differs, the deadline is expired or the nonce PDA already exists.

## Signed and stored launch bindings

The payload binds:

- program and declared cluster;
- generation ID, config PDA, manifest and DEX adapter;
- creator, current risk cluster, tier lock duration and creator buy cap;
- campaign, mint and metadata;
- ticker hash;
- reservation ID hash and reservation version;
- immediate or scheduled launch time;
- graduation target;
- separate trade and finalize route profiles;
- treasury, DEX and oracle profiles;
- nonce and deadline.

The accepted campaign account stores the immutable launch time, graduation target, ticker/reservation binding, route profiles and creator lock/cap resolution.

## Timer rules in this slice

- `launch_at = 0` means immediate launch and resolves to the current Solana Clock timestamp.
- A scheduled launch must be at least five minutes in the future.
- A scheduled launch may be no more than 30 days in the future.
- Future trading instructions must reject buys and sells before `campaign.launch_at`.

## Graduation-tier boundary

This slice accepts the exact production tiers:

- 15,000 USD;
- 30,000 USD;
- 50,000 USD.

The 6 USD devnet target is intentionally rejected until `GenerationConfig` owns an explicit cluster kind and graduation-tier mask. A frontend or backend environment variable is not sufficient protection for the test tier.

## Implemented requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Fresh integration base | Implemented | Branch is based directly on the current `devpostgrad`, not merged from the divergent historical PR. |
| Detached route authorization | Implemented | Ed25519 precompile plus Instructions-sysvar verification; no Railway transaction co-signer. |
| Replay protection | Implemented | `CreateAuthorization` uses `[create-auth, creator, nonce]`. |
| Deadline enforcement | Implemented | Expired authorizations are rejected before state is written. |
| Active generation check | Implemented | Generation must be supported, active for creation and match the global active generation. |
| Creator eligibility | Implemented | Restriction, manual review, live-count limit and cooldown checks. |
| Wallet and cluster risk | Implemented | Restricted or mismatched wallet/cluster profiles fail creation. |
| Timer binding | Implemented | Immediate and scheduled launch values are signed and stored. |
| Ticker reservation binding | Implemented on-chain shape | Ticker hash plus reservation ID/version are signed and stored; canonical database endpoint remains pending. |
| Graduation target binding | Implemented for production tiers | Devnet-only 6 USD policy remains pending in generation config. |
| Route-profile binding | Implemented | Trade/finalize, treasury, DEX and oracle profiles are independently bound. |
| GitHub Actions build/test | Implemented | Anchor build and Rust invariant suite run in the Solana-only workflow. |

## Still pending before merge or deployment

- generation-owned curve and fee economics;
- explicit generation cluster kind and graduation-tier mask;
- devnet-only 6 USD tier;
- mint creation and mint-authority guarantees;
- program-owned token and SOL vault initialization;
- canonical ticker-reservation tables and authorization endpoint;
- generated IDL and versioned deployment manifest;
- TypeScript client built from the IDL and manifest;
- local-validator and devnet integration tests;
- buy, sell, graduation and reward-vault instructions;
- indexer, reconciliation and admin controls.

## Gate status

The Solana launchpad remains `protocol_pending`. This slice is a secure foundation, not a public-launch switch.
