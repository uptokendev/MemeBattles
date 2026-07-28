# Railway Solana V4 Create Authorization

Status: source implemented, deployment evidence pending.

This document describes the server-owned authorization boundary between a signed MemeWarzone Prepare Mode draft and the Solana V4 `create_campaign` instruction.

Solana remains `protocol_pending`. This endpoint is disabled by default and must not be treated as devnet or production deployment evidence.

## Route

The V4 operation reuses the existing signed draft deployment route:

```text
POST /api/drafts/:draftId/deploy
```

Request operation:

```json
{
  "operation": "authorize_solana_v4",
  "auth": "<signed draft owner credential>",
  "graduationTargetUsdMicros": "6000000",
  "launchAt": "0"
}
```

`launchAt = 0` means Draft Deploy Now. A future Unix timestamp means Countdown Create. Countdown timestamps must be at least five minutes and no more than thirty days in the future.

The endpoint is draft-backed. `direct_create` remains rejected until Direct Create first creates or acquires the same canonical draft-and-reservation evidence used by Prepare Mode.

## Authentication

The route reuses `deploy_draft` authorization and the existing draft-scoped owner-session mechanism.

Railway verifies:

- signed wallet ownership;
- draft ID binding;
- Solana chain binding;
- nonce validity and replay protection;
- connected wallet equals the draft creator;
- draft status is published and launch-ready;
- the draft has no existing on-chain campaign.

No browser role receives direct write access to the canonical ticker tables.

## Canonical ticker reservation

Authorization occurs inside a PostgreSQL transaction that locks the draft's active ticker reservation.

Railway verifies:

- reservation exists and has not expired or been released;
- reservation chain and deployment cluster match;
- reservation creator and normalized ticker match the draft;
- reservation is not already `ARMED_ONCHAIN` or `LIVE`.

Railway then:

1. increments the monotonic reservation version;
2. generates and stores a fresh 32-byte authorization nonce;
3. moves the reservation to `ARM_AUTHORIZED`;
4. stores the program, generation and schedule binding;
5. builds and signs the V4 digest;
6. appends a `solana_v4_create_authorized` audit event;
7. commits only if every validation and signature step succeeds.

A failed RPC read, account mismatch, serializer error or signing error rolls the reservation update back.

## On-chain reads

Railway derives and reads these program accounts from the configured RPC:

```text
GlobalConfig:     ["global"]
GenerationConfig: ["generation", active_generation_id]
CreatorProfile:   ["creator", creator]
RiskProfile:      ["risk", creator]
ClusterProfile:   ["cluster", risk_profile.cluster_id]
```

The backend uses dependency-free Anchor/Borsh decoders and validates each account discriminator and owner.

It refuses to sign unless:

- global creation is unpaused;
- security defaults are locked;
- route authorization and authorized trading are required;
- the configured route signer matches `GlobalConfig.route_signer`;
- the generation is active, supported and self-bound;
- generation program ID and cluster kind match Railway configuration;
- creator launch limits and cooldown pass;
- creator, wallet and risk cluster are unrestricted;
- generation graduation-tier policy permits the requested target.

## Program-controlled accounts

Railway derives and binds:

```text
Campaign PDA:           ["campaign", campaign_id]
Mint PDA:               ["campaign-mint", campaign_id]
Token vault PDA:        ["token-vault", campaign_id]
SOL vault PDA:          ["sol-vault", campaign_id]
Create authorization:   ["create-auth", creator, nonce]
Classic SPL Token ID:   TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
```

The campaign ID is deterministic for the draft, reservation, generation and deployed program. Reissuing an authorization changes the reservation version and nonce without silently selecting a second campaign identity.

## Signed payload

Railway serializes the exact accepted V4 byte order from `tests/solana/authorization-v4.cjs` and the Rust program implementation.

```text
Domain: MEMEWARZONE_SOLANA_CREATE_V4
Schema: 4
Mode:   SHA-256 of the full canonical payload
Length: exactly 32 signed message bytes
```

Railway signs the raw digest with Ed25519. It does not sign a Solana transaction and does not pay creator rent or gas.

The browser receives:

- `createArgs` in generated-IDL-compatible shape;
- the strict account map;
- digest in hexadecimal and base64;
- Ed25519 signature in base64;
- route signer public key;
- deadline and validity timestamp;
- active generation economics and profile commitments;
- program, IDL and generation-manifest evidence hashes;
- canonical ticker reservation state.

The browser must create a native Ed25519 verification instruction using the returned 32-byte digest and signature. That instruction must immediately precede `createCampaign`.

## Server-only configuration

The following variables must never use the `VITE_` prefix:

```text
SOLANA_CREATE_AUTH_ENABLED
SOLANA_RPC_URL
SOLANA_CLUSTER
SOLANA_LAUNCHPAD_PROGRAM_ID
SOLANA_ROUTE_SIGNER_PUBLIC_KEY
SOLANA_ROUTE_SIGNER_SECRET_KEY
SOLANA_CLUSTER_HASH_HEX
SOLANA_LAUNCHPAD_IDL_SHA256
SOLANA_LAUNCHPAD_PROGRAM_SHA256
SOLANA_GENERATION_MANIFEST_HASH
SOLANA_CREATE_AUTH_TTL_SECONDS
SOLANA_RPC_TIMEOUT_MS
```

The endpoint rejects placeholder program IDs unless the local-validator-only override is explicitly enabled. That override must never be enabled on Railway or a public deployment.

## Generated IDL boundary

`node scripts/check-solana-v4-idl.mjs` validates the generated Anchor IDL after every program build.

The gate requires:

- `createCampaign` instruction;
- the complete strict V4 account set;
- one `args` parameter;
- the exact ordered `CreateCampaignArgs` fields;
- all state account definitions used by Railway.

The gate writes `memewarzone_solana.v4.binding.json` next to the generated IDL and records the actual IDL SHA-256 in the workflow summary and build artifact.

## Validation lanes

`Solana Railway V4 CI` proves:

- server source syntax;
- dependency-free primitive tests;
- PDA equality with `@solana/web3.js`;
- byte-for-byte payload and digest equality with the accepted validator serializer;
- Ed25519 public-key and signature behavior;
- production frontend build.

`Solana Local Validator Acceptance` additionally proves the Railway account decoders against actual Anchor-owned GlobalConfig, GenerationConfig, CreatorProfile, RiskProfile and ClusterProfile account bytes.

## Still closed

The following remain separate gates:

- deployed devnet program ID;
- accepted versioned deployment manifest;
- configured Railway signer and RPC;
- connected-wallet devnet create transaction;
- deployment confirmation and reservation transition to `ARMED_ONCHAIN` or `LIVE`;
- bonding buys and sells;
- graduation, DEX liquidity and permanent lock;
- indexer and operator-dashboard acceptance;
- audit and production authority ceremony.
