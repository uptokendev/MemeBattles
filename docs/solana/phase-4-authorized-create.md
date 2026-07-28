# Solana Phase 4 Detached Authorized Create

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Current authorization version

Detached create authorization V4 supersedes V3 for every future backend, deployment and generated-IDL client implementation.

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V4
schema_version = 4
signed_message_mode = SHA256(canonical_payload)
```

V1, V2 and V3 remain in the repository as historical design evidence. The canonical V4 format is documented in `docs/solana/create-authorization-v4.md`.

This slice does not enable public Solana create, buy, sell or graduation.

## Why V4 replaced V3

V3 bound the correct fields but carried the complete canonical payload inside the native Ed25519 instruction. Combined with the create instruction, account metas and transaction signature, that design could exceed Solana's 1,232-byte transaction limit.

V4 preserves every binding while signing only a compact 32-byte SHA-256 digest:

```text
canonical_payload = encode_all_bound_fields_in_V4_order()
authorization_digest = SHA256(canonical_payload)
route_signature = Ed25519.sign(route_signer, authorization_digest)
```

The program independently reconstructs and hashes the complete payload before comparing it to the digest verified by the native Ed25519 instruction.

## Transaction model

Railway signs the authorization digest only. Railway never signs the creator transaction and never pays campaign rent.

The creator submits one transaction containing:

```text
optional compute-budget instructions
instruction N-1: native Ed25519 verification of the 32-byte V4 digest
instruction N:   MemeWarzone create_campaign instruction
```

`create_campaign` reads the Instructions sysvar and enforces:

- a top-level call to the MemeWarzone program;
- the Ed25519 instruction immediately before the current instruction;
- exactly one self-contained signature;
- the configured `GlobalConfig.route_signer`;
- byte-for-byte equality with the on-chain reconstructed V4 digest;
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

The creator does not supply mint identity, curve, supply, fee, DEX, treasury, oracle or route-profile values.

## Deterministic campaign assets

The V4 transaction derives and initializes:

```text
Campaign PDA:    ["campaign", campaign_id]
Mint PDA:        ["campaign-mint", campaign_id]
Token vault PDA: ["token-vault", campaign_id]
SOL vault PDA:   ["sol-vault", campaign_id]
```

The V4 canonical payload binds each derived address and the canonical classic SPL Token program ID. Alternate campaign, mint, token-vault, SOL-vault or token-program accounts invalidate the authorization or fail Anchor constraints.

## Generation-owned authorization bindings

The V4 payload binds the complete active `GenerationConfig`, including:

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

Changing any generation, creator policy, reservation field or asset identity changes the required digest.

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

A successful create copies immutable generation and asset policy into the Campaign account. The campaign retains its original:

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

## Accepted local-validator coverage

Solana Local Validator Acceptance #26 passed on 2026-07-28 and proved:

- Direct Create;
- Draft Deploy Now;
- Countdown Create;
- transaction size at or below 1,232 bytes;
- exact mint supply and decimals;
- no freeze authority;
- permanent mint-authority revocation;
- Campaign-PDA token-vault custody;
- program ownership of the SOL vault;
- unchanged `net_raised_lamports` after unsolicited SOL transfer;
- wrong signer rejection;
- modified signed field rejection;
- expired authorization rejection;
- non-adjacent Ed25519 rejection;
- alternate mint rejection;
- noncanonical token-program rejection;
- creator-plus-nonce replay rejection.

```text
Accepted branch head: be5d696ead6dc5070f26175710abda858c7aed10
Workflow run ID:      30384574030
Artifact SHA-256:     a7e81eb39f088e8b42517d3ff9b3667e06113b24b79a94b8ae15ac79e009b94e
```

## Remaining before production create

- Canonical ticker-reservation tables and lifecycle service.
- Railway V4 authorization endpoint using the reviewed serializer.
- Generated-IDL TypeScript client and accepted deployment manifest.
- Devnet Direct Create, Deploy Now and Countdown acceptance.
- Authorized buy/sell, graduation and reward-vault instructions.
- Indexer, reconciliation and operator controls.
- Production program ID, authorities, multisig ceremony and locked defaults.

Local-validator acceptance closes the local create-transaction proof gate only. Solana remains `protocol_pending`.
