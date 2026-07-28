# Solana Detached Create Authorization V4

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

V4 supersedes V3 for every future Railway authorization endpoint, generated client, validator test, devnet deployment and production deployment.

V1, V2 and V3 remain repository history only. They must not be used by a backend or client after V4 is accepted.

## Why V4 was required

V3 correctly bound the complete create policy, but it placed the complete canonical payload inside the native Ed25519 verification instruction.

That payload contains the generation policy, route profiles, campaign identity, derived asset addresses, ticker reservation, launch time, target, creator restrictions, nonce and deadline. Carrying the complete payload alongside the create instruction, account metas and transaction signature risks exceeding Solana's transaction-size limit.

V4 preserves every V3 binding while making the signed message compact:

```text
canonical_payload = encode_every_bound_field_in_the_V4_byte_order()
authorization_digest = SHA256(canonical_payload)
route_signature = Ed25519.sign(route_signer, authorization_digest)
```

The Ed25519 instruction therefore carries exactly 32 message bytes rather than the complete canonical payload.

## Domain

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V4
schema_version = 4
signed_message_mode = sha256_canonical_payload
```

The domain and schema version are included inside the canonical payload before hashing. A V3 signature cannot be replayed as V4.

## Transaction model

Railway signs the digest only. Railway never signs the creator transaction and never pays account rent.

```text
instruction N-1: native Ed25519 verification of the 32-byte digest
instruction N:   MemeWarzone create_campaign
```

Compute-budget instructions may appear before instruction N-1. Nothing may appear between the Ed25519 verification and `create_campaign`.

The creator remains the sole transaction signer and fee payer.

## Program verification

`create_campaign` performs these steps:

1. Reconstruct the complete V4 canonical payload from instruction arguments, active on-chain generation state, creator/risk state and supplied accounts.
2. Hash the reconstructed payload using Solana's SHA-256 hash implementation.
3. Read the Instructions sysvar.
4. Require the immediately preceding instruction to be the native Ed25519 program.
5. Require one self-contained signature with no cross-instruction offsets.
6. Require the public key to equal `GlobalConfig.route_signer`.
7. Require the verified message to equal the reconstructed 32-byte digest exactly.
8. Consume the creator-plus-nonce authorization PDA atomically with campaign creation.

A changed field produces a different canonical payload and therefore a different digest.

## Canonical payload bindings

V4 keeps the V3 field order and binds:

- V4 domain and schema version;
- MemeWarzone program ID and declared cluster hash;
- generation ID, config PDA, program ID, start slot and manifest;
- cluster kind and graduation-tier mask;
- supply, decimals and bonding-curve economics;
- buy, sell and finalize fees;
- creator/liquidity post-finalize split;
- DEX adapter;
- trading, finalization, treasury, DEX and oracle profiles;
- locked route-authorization and authorized-trading defaults;
- creator wallet and risk cluster;
- creator buy-lock duration and buy cap;
- campaign ID and deterministic Campaign PDA;
- deterministic mint, token-vault and SOL-vault PDAs;
- canonical classic SPL Token program ID;
- metadata hash;
- ticker hash, reservation ID hash and reservation version;
- requested immediate or scheduled launch timestamp;
- graduation target;
- nonce and deadline.

The byte order remains the one documented for V3, with only the domain and schema version updated to V4.

## Backend and client rules

Railway and the generated client must share one reviewed serializer implementation or prove byte-for-byte conformance against common fixtures.

They must:

- serialize integers little-endian;
- serialize public keys and hashes as raw 32-byte values;
- serialize booleans as one byte, `0` or `1`;
- hash the raw canonical payload once with SHA-256;
- sign the raw 32-byte digest, not hexadecimal, Base58, Base64 or JSON text;
- return the canonical fields, digest, signature, signer and deadline to the client;
- never accept creator-supplied generation economics or route profiles;
- never sign a full Solana transaction.

The client must construct the native Ed25519 instruction from the returned raw digest and signature, then place `create_campaign` immediately after it.

## Replay protection

The replay PDA remains:

```text
["create-auth", creator, nonce]
```

The account stores the accepted V4 digest as `message_hash`, together with the creator, signer, schema version, deadline and use timestamp.

Reusing the same creator and nonce fails even when the campaign ID or ticker is changed.

## Security properties

Signing the SHA-256 digest does not remove any field binding. The program and signer independently derive the digest from the same canonical payload.

Authorization remains dependent on:

- Ed25519 signature security;
- SHA-256 second-preimage and collision resistance;
- exact canonical serialization;
- on-chain reconstruction from trusted state;
- nonce uniqueness and deadline enforcement;
- immediate instruction ordering.

No payload field is trusted merely because it was supplied by the frontend.

## Acceptance boundary

V4 source and its serializer/test harness are not deployment evidence.

The create gate remains closed until the local-validator workflow proves:

- successful Direct Create;
- successful Draft Deploy Now;
- successful Countdown Create;
- transaction size at or below 1,232 bytes;
- exact mint supply and decimals;
- no freeze authority;
- permanent mint-authority revocation;
- Campaign-PDA token-vault custody;
- program ownership of the SOL vault;
- unchanged `net_raised_lamports` after unsolicited SOL transfer;
- wrong-signer, modified-payload, expired, reordered, alternate-account and replay rejection.

Solana remains `protocol_pending` until validator, devnet and every later launch gate is accepted.
