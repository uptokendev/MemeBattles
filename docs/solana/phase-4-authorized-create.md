# Solana Phase 4 Detached Authorized Create

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Current authorization version

Detached create authorization V3 supersedes V2 for every future backend, deployment and generated-IDL client implementation.

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V3
schema_version = 3
```

V1 and V2 remain in the repository as historical design evidence. The canonical V3 byte layout is documented in `docs/solana/create-authorization-v3.md`.

This slice does not enable public Solana create, buy, sell or graduation.

## Transaction model

Railway signs the exact authorization payload only. Railway never signs the creator transaction and never pays campaign rent.

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
- byte-for-byte equality with the on-chain reconstructed V3 payload;
- a fresh creator+nonce PDA;
- a non-expired deadline.

The transaction fails atomically when any condition or asset initialization step fails.

## Creator-controlled create fields

The creator request contains only campaign-specific identity and selection values:

- campaign ID;
- metadata hash;
- declared cluster hash;
- ticker hash;
- reservation ID hash and reservation version;
- immediate or scheduled launch time;
- a graduation target allowed by the active generation;
- nonce and deadline.

The creator no longer supplies mint identity, curve, supply, fee, DEX, treasury, oracle or route-profile values.

## Deterministic campaign assets

The V3 transaction derives and initializes:

```text
Campaign PDA:    ["campaign", campaign_id]
Mint PDA:        ["campaign-mint", campaign_id]
Token vault PDA: ["token-vault", campaign_id]
SOL vault PDA:   ["sol-vault", campaign_id]
```

The V3 payload binds each derived address and the canonical classic SPL Token program ID. Alternate campaign, mint, token-vault, SOL-vault or token-program accounts invalidate the authorization or fail Anchor constraints.

## Generation-owned authorization bindings

The V3 payload binds the complete active `GenerationConfig`, including:

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

Changing any generation or asset identity changes the required signature.

## Atomic asset initialization

A successful create:

1. initializes the classic SPL mint with generation-owned decimals;
2. uses Campaign PDA as temporary mint authority;
3. creates a Campaign-PDA-controlled token vault;
4. creates a program-owned SOL vault;
5. mints exactly the generation-owned total supply into the token vault;
6. verifies mint supply, decimals, vault balance, vault mint and vault authority;
7. verifies no freeze authority exists;
8. revokes mint authority permanently;
9. verifies mint authority is `None`;
10. records the authority revocation and asset bumps in Campaign state.

No token allocation or initial buy is transferred to the creator during creation.

## Campaign snapshot

A successful create copies the immutable generation and asset policy into the Campaign account. The campaign retains its original:

- generation and manifest identity;
- cluster and target policy;
- curve and supply economics;
- curve, liquidity and reserve token compartments;
- fees and post-finalize split;
- DEX adapter;
- route, treasury, DEX and oracle profile commitments;
- mint, token-vault and SOL-vault identities;
- mint-authority-revocation evidence;
- timer, ticker reservation and creator lock/cap resolution.

Later generation cutovers cannot rewrite existing campaign economics or assets.

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

- Detached Ed25519 route authorization V3.
- Instructions-sysvar ordering and top-level invocation checks.
- Creator+nonce replay protection.
- Deadline enforcement.
- Program/self-key/active/supported generation validation.
- Creator tier, cooldown and live-campaign checks.
- Wallet and cluster risk restrictions.
- Timer, ticker, reservation and target binding.
- Generation economics/profile binding and campaign snapshot.
- Deterministic asset-PDA and token-program binding.
- Full-supply token-compartment invariants.
- Atomic mint-authority revocation source checks.
- Pinned SBF build, generated-IDL and Rust-invariant CI lane.

## Remaining before production create

- Local-validator transaction tests that inspect real mint, token-vault and SOL-vault accounts.
- Validator proof that alternate accounts and replayed/modified authorizations fail.
- Devnet Direct Create, Deploy Now and Countdown acceptance.
- Canonical ticker-reservation tables and Railway V3 authorization endpoint.
- TypeScript client generated from the accepted IDL and deployment manifest.
- Authorized buy/sell, graduation and reward-vault instructions.
- Indexer, reconciliation and operator controls.

Solana remains `protocol_pending`.
