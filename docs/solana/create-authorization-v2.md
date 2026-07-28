# Solana Detached Create Authorization V2

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

V2 supersedes the V1 payload definition for every future deployment and client implementation. V1 remains in the repository as historical design evidence only.

## Transaction model

Railway signs an authorization payload. It does not sign the creator transaction.

```text
instruction N-1: native Ed25519 verification
instruction N:   MemeWarzone create_campaign
```

The program reads the Instructions sysvar and requires the immediately preceding instruction to verify exactly one self-contained Ed25519 signature from `GlobalConfig.route_signer` over the exact V2 payload.

The replay-prevention PDA remains:

```text
["create-auth", creator, nonce]
```

## Domain

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V2
schema_version = 2
```

All integers are little-endian. Public keys and hashes are raw 32-byte values. The message contains no JSON, text delimiters or optional fields.

## Canonical byte order

```text
CREATE_AUTH_DOMAIN                       constant bytes
schema_version                           u16
program_id                               32 bytes
declared_cluster_hash                    32 bytes

generation_id                            32 bytes
generation_config_pda                    32 bytes
generation_program_id                    32 bytes
generation_self_config_pda               32 bytes
generation_start_slot                    u64
generation_cluster_kind                  u8
generation_graduation_tier_mask          u8
generation_economics_version             u16
generation_curve_kind                    u8
generation_token_total_supply            u64
generation_token_decimals                u8
generation_curve_supply_bps              u16
generation_liquidity_token_bps           u16
generation_base_price_lamports           u64
generation_price_slope_lamports          u64
generation_buy_fee_bps                   u16
generation_sell_fee_bps                  u16
generation_finalize_fee_bps              u16
generation_creator_post_finalize_bps     u16
generation_liquidity_post_finalize_bps   u16
generation_dex_adapter                   u8
generation_trade_route_profile           32 bytes
generation_finalize_route_profile        32 bytes
generation_treasury_profile              32 bytes
generation_dex_profile                   32 bytes
generation_oracle_profile                32 bytes
generation_manifest_hash                 32 bytes
generation_route_authorization_required  u8 boolean
generation_authorized_trading_required   u8 boolean

creator                                  32 bytes
risk_cluster_id                          32 bytes
creator_buy_lock_seconds                 u32
creator_buy_cap_bps                      u16
campaign_id                              32 bytes
mint                                     32 bytes
metadata_hash                            32 bytes
ticker_hash                              32 bytes
reservation_id_hash                      32 bytes
reservation_version                      u64
requested_launch_at                      i64
graduation_target_usd_micros             u64
nonce                                    32 bytes
deadline                                 i64
```

## Why the generation is fully bound

V1 bound profile values supplied in the create request. V2 removes those profile values from creator-controlled arguments. The program reads all curve, fee, DEX, treasury, oracle and route settings from the active `GenerationConfig`, reconstructs the payload and snapshots them into the campaign.

This ensures that:

- the creator cannot choose a base price, slope, fee, DEX or treasury route;
- Railway cannot authorize one economic configuration while the transaction uses another;
- changing any generation field invalidates the signature;
- the campaign permanently records its original generation economics;
- later generation cutovers do not alter existing campaigns.

## Graduation target

The payload contains the selected target, but the target is only accepted when its exact tier bit is enabled by the active generation.

- Devnet generation: must include the 6 USD tier and may include production tiers.
- Mainnet-beta generation: cannot include the 6 USD tier and must include at least one production tier.

## Immediate and scheduled launch

- `requested_launch_at = 0` resolves to the current Solana Clock timestamp.
- A scheduled value must be at least five minutes and no more than 30 days in the future.
- The accepted timestamp becomes immutable campaign state.

## Remaining boundary

V2 authorizes campaign state creation, but production create remains disabled until the program creates and controls the mint, token vault and SOL vault; the ticker-reservation backend issues the same canonical payload; and transaction-level local-validator/devnet tests prove unauthorized and replayed creates fail.