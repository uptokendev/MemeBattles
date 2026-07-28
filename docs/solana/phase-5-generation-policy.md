# Solana Phase 5 Generation Policy And Economics

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Purpose

This slice moves cluster policy, graduation-tier eligibility, curve parameters, supply, fees, post-finalize economics and operational profiles into `GenerationConfig`. A creator can select metadata, an approved graduation target and an immediate or scheduled launch time, but cannot select protocol economics or routing configuration.

## Generation-owned policy

`GenerationConfig` now owns:

- cluster kind (`devnet` or `mainnet-beta`);
- graduation-tier allowlist mask;
- economics schema version and curve kind;
- token supply and decimals;
- curve-token and liquidity-token allocations;
- base price and price slope;
- buy, sell and finalize fee rates;
- creator/liquidity post-finalize split;
- DEX adapter;
- trading and finalization route-profile hashes;
- treasury, DEX and oracle profile hashes;
- manifest hash;
- active-creation and support state;
- route-authorization and authorized-trading requirements.

The program derives and stores its own program ID, GenerationConfig PDA and initialization slot. These values are not accepted from the initializing client.

## Locked economic invariants

The current generation schema enforces:

```text
Buy fee:                    200 bps (2%)
Sell fee:                   200 bps (2%)
Finalize fee:               200 bps (2%)
Creator after finalize:   2,000 bps (20%)
Liquidity after finalize: 8,000 bps (80%)
```

The creator/liquidity percentages apply after the finalize fee. The creator cannot alter these values during campaign creation.

The internal distribution of the 2% trade and finalize fee is represented by approved immutable profile hashes. This slice deliberately does not hard-code recruiter, league, squad, community or protocol sub-percentages because the Solana plan requires those values to be copied from the final approved BNB production route profiles rather than inferred from older documents.

## Graduation-tier policy

The program recognizes exact integer USD-micro targets:

```text
6 USD:      6,000,000
15,000 USD: 15,000,000,000
30,000 USD: 30,000,000,000
50,000 USD: 50,000,000,000
```

Cluster rules are enforced on-chain:

- A devnet generation must include the 6 USD tier and may include the approved production tiers.
- A mainnet-beta generation may never include the 6 USD tier.
- A mainnet-beta generation must include at least one approved production tier.
- Unknown tier bits are rejected.
- Campaign creation rejects a target not present in the selected generation's mask.

Frontend or Railway flags cannot enable the 6 USD tier on mainnet-beta.

## Campaign snapshot

Campaign creation no longer accepts route, treasury, DEX or oracle profile values from the creator. The campaign snapshots the active generation's immutable:

- manifest;
- cluster and economics versions;
- curve and supply settings;
- fee settings;
- 20/80 post-finalize split;
- DEX adapter;
- route, treasury, DEX and oracle profile hashes.

This makes each campaign independently auditable and preserves its original economics when a later generation becomes active.

## Create authorization V2

The detached authorization domain is now:

```text
MEMEWARZONE_SOLANA_CREATE_V2
```

Schema version: `2`.

The signed byte payload binds the complete generation configuration in addition to the creator, risk cluster, campaign, mint, metadata, ticker reservation, timer, target, nonce and deadline. Any mutation to the generation economics or profile hashes changes the required signature.

## Tests

The Rust invariant suite covers:

- devnet requiring the 6 USD tier;
- mainnet-beta rejecting the 6 USD tier;
- production-tier acceptance;
- unknown tier-bit rejection;
- fee drift rejection;
- token-allocation overflow rejection;
- missing profile rejection;
- generation target-mask resolution;
- GenerationConfig self-key and program-ID validation;
- authorization payload changes when generation economics or profiles change.

## Remaining boundary

This slice does not yet create the SPL mint or program-owned token/SOL vaults. The mint is still supplied as an identity in the create request and must not be treated as production-safe until the next slice makes mint creation, mint authority, token vault and SOL vault ownership program-controlled.

Solana remains `protocol_pending`.