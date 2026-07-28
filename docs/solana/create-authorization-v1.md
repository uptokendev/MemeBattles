# Solana Detached Create Authorization V1

Status: implemented in the refreshed Solana foundation branch, still gated from merge and deployment.

## Why this exists

The earlier create foundation required the Railway route authority to be a transaction signer. That would force the backend to co-sign the creator transaction and is not the production model.

V1 uses a detached Ed25519 authorization instead:

1. Railway builds the exact domain-separated payload below.
2. Railway signs only that payload with the configured route-signing key.
3. The creator transaction places a native Ed25519 verification instruction immediately before `create_campaign`.
4. `create_campaign` reads the Instructions sysvar, proves the current instruction is a top-level call to this program, reads the immediately preceding instruction, and checks the verified signer and payload bytes.
5. The program initializes a nonce PDA. Reusing the same creator/nonce pair therefore fails atomically.

Railway never signs the full Solana transaction.

## Required transaction order

```text
instruction N-1: Ed25519 signature verification
instruction N:   MemeWarzone create_campaign
```

The Ed25519 instruction must:

- contain exactly one signature;
- contain its signer, signature and message in the same Ed25519 instruction;
- use the configured `GlobalConfig.route_signer` public key;
- contain the exact payload bytes described below;
- contain no account metas.

Cross-instruction offset references are rejected. A verification instruction elsewhere in the transaction is not accepted.

## Payload encoding

All integers use little-endian encoding. Public keys and hashes are raw 32-byte values. There are no text delimiters or JSON fields.

```text
CREATE_AUTH_DOMAIN                     variable fixed constant bytes
schema_version                         u16
program_id                             32 bytes
declared_cluster_hash                  32 bytes
generation_id                          32 bytes
generation_config_pda                  32 bytes
generation_manifest_hash               32 bytes
generation_dex_adapter                 u8
creator                                32 bytes
risk_cluster_id                        32 bytes
creator_buy_lock_seconds               u32
creator_buy_cap_bps                    u16
campaign_id                            32 bytes
mint                                   32 bytes
metadata_hash                          32 bytes
ticker_hash                            32 bytes
reservation_id_hash                    32 bytes
reservation_version                    u64
requested_launch_at                    i64
graduation_target_usd_micros           u64
trade_route_profile                    32 bytes
finalize_route_profile                 32 bytes
treasury_profile                       32 bytes
dex_profile                            32 bytes
oracle_profile                         32 bytes
nonce                                  32 bytes
deadline                               i64
```

Current constants:

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V1
schema_version = 1
```

The program derives creator lock time from the accepted launch time plus the current tier-owned lock duration. The creator cannot submit a different lock value.

## Immediate and scheduled launches

`requested_launch_at = 0` means immediate launch. The stored `launch_at` becomes the current Solana Clock timestamp.

A non-zero scheduled launch must be:

- at least five minutes in the future;
- no more than 30 days in the future.

The accepted `launch_at` is stored immutably in the campaign account. Future buy and sell instructions must enforce `Clock.unix_timestamp >= campaign.launch_at`.

## Graduation tiers

This slice accepts the production targets as exact USD-micro integers:

- 15,000 USD;
- 30,000 USD;
- 50,000 USD.

The 6 USD devnet tier remains intentionally rejected until `GenerationConfig` owns an explicit cluster/tier allowlist. It must never be enabled through a frontend or backend-only flag, because that could leak the test tier onto mainnet-beta.

## Campaign fields added by this slice

The campaign foundation now stores:

- declared cluster hash;
- ticker hash;
- reservation ID hash and version;
- immutable launch time;
- immutable graduation target;
- separate trade and finalize route profiles;
- treasury, DEX and oracle profiles;
- creator buy lock end;
- creator buy cap basis points;
- net-raised accounting foundation.

## Replay and mutation protection

The authorization fails when any bound value changes, including:

- program or generation;
- creator or creator risk cluster;
- campaign or mint;
- metadata or ticker;
- reservation identity or version;
- timer or graduation target;
- route, treasury, DEX or oracle profile;
- creator tier lock/cap resolution;
- nonce or deadline.

The nonce PDA seed is:

```text
["create-auth", creator, nonce]
```

Its stored record includes the signer, deadline, consumption timestamp and hash of the accepted payload.

## Remaining merge gates

This authorization slice does not make campaign creation production-ready. The following still remain:

- generation-owned curve economics;
- explicit cluster kind and tier-mask enforcement, including the 6 USD devnet tier;
- mint creation and authority guarantees;
- program-owned token and SOL vault initialization;
- canonical ticker-reservation database and backend authorization endpoint;
- generated IDL and versioned deployment manifest;
- local-validator and devnet integration tests.
