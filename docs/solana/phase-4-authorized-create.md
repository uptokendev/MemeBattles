# Solana Phase 4 Detached Authorized Create

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Current authorization version

Detached create authorization V2 supersedes V1 for future backend and client implementation.

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V2
schema_version = 2
```

V1 remains in the repository as historical design evidence. The canonical V2 byte layout is documented in `docs/solana/create-authorization-v2.md`.

This slice does not enable public Solana create, buy, sell or graduation.

## Transaction model

Railway signs the exact authorization payload only. Railway never signs the creator transaction.

The creator submits one transaction containing:

```text
instruction N-1: native Ed25519 verification instruction
instruction N:   MemeWarzone create_campaign instruction
```

`create_campaign` reads the Instructions sysvar and enforces:

- a top-level call to the MemeWarzone program;
- the Ed25519 instruction immediately before the current instruction;
- exactly one self-contained signature;
- the configured `GlobalConfig.route_signer`;
- byte-for-byte equality with the on-chain reconstructed V2 payload;
- a fresh creator+nonce PDA;
- a non-expired deadline.

The transaction fails atomically when any condition fails.

## Creator-controlled create fields

The creator request contains only campaign-specific identity and selection values:

- campaign ID;
- mint identity, pending program-owned mint creation in the next slice;
- metadata hash;
- declared cluster hash;
- ticker hash;
- reservation ID hash and reservation version;
- immediate or scheduled launch time;
- a graduation target allowed by the active generation;
- nonce and deadline.

The creator no longer supplies curve, supply, fee, DEX, treasury, oracle or route-profile values.

## Generation-owned authorization bindings

The V2 payload binds the complete active `GenerationConfig`, including:

- generation ID, program, self config PDA and start slot;
- cluster kind and target mask;
- economics and curve versions;
- total supply and decimals;
- curve/liquidity allocations;
- base price and slope;
- buy, sell and finalize fees;
- 20/80 post-finalize creator/liquidity split;
- DEX adapter;
- trading, finalization, treasury, DEX and oracle profile hashes;
- manifest hash;
- locked authorization defaults.

Changing any generation field changes the required signature.

## Campaign snapshot

A successful create copies the immutable generation policy into the Campaign account. The campaign therefore retains its original:

- generation and manifest identity;
- cluster and target policy;
- curve and supply economics;
- fees and post-finalize split;
- DEX adapter;
- route, treasury, DEX and oracle profile commitments;
- timer, ticker reservation and creator lock/cap resolution.

Later generation cutovers cannot rewrite existing campaign economics.

## Timer rules

- `launch_at = 0` resolves to the current Solana Clock timestamp.
- A scheduled launch must be at least five minutes in the future.
- A scheduled launch may be no more than 30 days in the future.
- Future buy and sell instructions must reject trading before `campaign.launch_at`.

## Graduation-tier rules

- Devnet generations must include the 6 USD target.
- Mainnet-beta generations reject the 6 USD target on-chain.
- Approved production targets are 15,000 USD, 30,000 USD and 50,000 USD.
- Create rejects targets absent from the selected generation's mask.

## Implemented checks

- Detached Ed25519 route authorization.
- Instructions-sysvar ordering and top-level invocation checks.
- Creator+nonce replay protection.
- Deadline enforcement.
- Program/self-key/active/supported generation validation.
- Creator tier, cooldown and live-campaign checks.
- Wallet and cluster risk restrictions.
- Timer, ticker, reservation and target binding.
- Generation economics/profile binding and campaign snapshot.
- Rust invariants plus generated-IDL CI.

## Remaining before production create

- Program-created SPL mint and mint-authority guarantees.
- Program-owned token and SOL vault initialization.
- Canonical ticker-reservation tables and Railway authorization endpoint.
- TypeScript client generated from the accepted IDL and deployment manifest.
- Transaction-level unauthorized/replay tests on local validator and devnet.
- Authorized buy/sell, graduation and reward-vault instructions.
- Indexer, reconciliation and operator controls.

Solana remains `protocol_pending`.
