# Solana Phase 2 Generation Registry

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Purpose

The generation registry lets MemeWarzone deploy future Solana program generations without changing the public product model or abandoning campaigns created under older supported generations.

Exactly one generation may accept new campaign creation. Existing campaigns remain tied to their original `GenerationConfig` and snapshot that generation's immutable economics and profile commitments.

## Program-owned identity

`initialize_generation_config` accepts a stable generation ID plus policy settings, but the program derives and stores:

- `program_id = crate::id()`;
- `config_pda = the initialized GenerationConfig account`;
- `start_slot = Clock.slot`.

A client cannot claim a different program, config PDA or initialization slot.

## GenerationConfig fields

The PDA stores:

- generation ID, program ID, self config PDA and start slot;
- `devnet` or `mainnet-beta` cluster kind;
- graduation-tier allowlist mask;
- economics version and curve kind;
- token supply and decimals;
- curve-token and liquidity-token allocations;
- base price and price slope;
- buy, sell and finalize fee rates;
- creator/liquidity post-finalize split;
- Meteora or Raydium adapter identity;
- trading, finalization, treasury, DEX and oracle profile hashes;
- deployment manifest hash;
- support and active-creation flags;
- required route-authorization and authorized-trading defaults.

## Cluster and target invariants

- A devnet generation must include the 6 USD target.
- A mainnet-beta generation cannot include the 6 USD target.
- A mainnet-beta generation must include at least one approved production target.
- The recognized production targets are 15,000 USD, 30,000 USD and 50,000 USD.
- Unknown target-mask bits are rejected.
- Campaign creation rejects a target whose bit is absent from the active generation.

## Economic invariants

The current schema locks:

```text
Buy fee:                    200 bps
Sell fee:                   200 bps
Finalize fee:               200 bps
Creator after finalize:   2,000 bps
Liquidity after finalize: 8,000 bps
```

Supply, decimals, curve allocation, liquidity allocation, base price and slope are generation-owned deployment settings with on-chain range checks. Creator transactions cannot override any of these fields.

Sub-routing inside the 2% fee remains represented by approved immutable profile hashes until the final BNB production route profiles are frozen and copied to Solana.

## Generation lifecycle

`GlobalConfig.active_generation_id` records the single generation allowed to create. `set_generation_support` can activate or deactivate creation subject to the one-active-generation invariant and requires admin or generation-operator authority.

A campaign stores both its generation ID/config PDA and a full immutable policy snapshot. Future buy, sell and graduation instructions must resolve the campaign's original generation rather than the latest active generation.

## Validation coverage

Rust invariants cover:

- supported DEX adapters;
- locked authorization defaults;
- one active creation generation;
- deactivation clearing the active generation;
- devnet/mainnet tier rules;
- unknown tier bits;
- locked-fee drift;
- token-allocation overflow;
- missing operational profiles;
- target-mask resolution.

GitHub Actions builds the Anchor program, generates the IDL, verifies both artifacts and runs these invariants.

## Remaining registry work

- Backend persistence for every supported Solana generation and start slot.
- Per-generation indexer cursors and reconciliation.
- Operator payloads for controlled support/activation changes.
- Local-validator coexistence tests for old and new generations.
- Trade and graduation instructions that resolve the campaign's original generation.

The generation registry is implemented at program level but remains undeployed and `protocol_pending`.
