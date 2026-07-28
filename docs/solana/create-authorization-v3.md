# Solana Detached Create Authorization V3

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

V3 supersedes V2 for every future deployment, Railway authorization endpoint and generated-IDL client. V1 and V2 remain in the repository as historical design evidence only.

## Transaction model

Railway signs an authorization payload. It never signs the creator transaction and never pays deployment rent.

```text
instruction N-1: native Ed25519 verification
instruction N:   MemeWarzone create_campaign
```

The creator signs one transaction. The `create_campaign` instruction creates the campaign, mint, token vault, SOL vault and replay-prevention account atomically.

The program reads the Instructions sysvar and requires the immediately preceding instruction to verify exactly one self-contained Ed25519 signature from `GlobalConfig.route_signer` over the exact V3 payload.

The replay-prevention PDA remains:

```text
["create-auth", creator, nonce]
```

## Domain

```text
CREATE_AUTH_DOMAIN = MEMEWARZONE_SOLANA_CREATE_V3
schema_version = 3
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
campaign_pda                             32 bytes
mint_pda                                 32 bytes
token_vault_pda                          32 bytes
sol_vault_pda                            32 bytes
token_program_id                         32 bytes
metadata_hash                            32 bytes
ticker_hash                              32 bytes
reservation_id_hash                      32 bytes
reservation_version                      u64
requested_launch_at                      i64
graduation_target_usd_micros             u64
nonce                                    32 bytes
deadline                                 i64
```

## Deterministic asset addresses

The creator no longer supplies a mint address. All core campaign assets are derived by the program:

```text
Campaign PDA:   ["campaign", campaign_id]
Mint PDA:       ["campaign-mint", campaign_id]
Token vault:    ["token-vault", campaign_id]
SOL vault:      ["sol-vault", campaign_id]
```

The authorization binds every derived address and the canonical SPL Token program ID. Substituting any campaign, mint, token vault, SOL vault or token program changes the signed payload and causes the transaction to fail.

## Asset initialization guarantees

The create instruction:

1. creates the SPL mint with decimals from `GenerationConfig`;
2. assigns the Campaign PDA as initial mint authority;
3. creates one SPL token vault controlled by the Campaign PDA;
4. creates one program-owned SOL vault PDA;
5. mints exactly `GenerationConfig.token_total_supply` into the token vault;
6. verifies mint supply, decimals, vault mint, vault authority and vault balance;
7. verifies that no freeze authority exists;
8. permanently revokes mint authority in the same transaction;
9. records the authority-revocation result in Campaign state.

No tokens are sent to the creator during create. No creator initial buy occurs.

## Token allocation accounting

The complete minted supply remains in the program-controlled token vault. Campaign state records immutable logical allocations:

```text
curve_tokens     = floor(total_supply * curve_supply_bps / 10,000)
liquidity_tokens = floor(total_supply * liquidity_token_bps / 10,000)
reserve_tokens   = total_supply - curve_tokens - liquidity_tokens
```

Any integer rounding remainder stays in `reserve_tokens`. Future buy, sell and graduation instructions must preserve these compartments and may move tokens only through Campaign-PDA-signed CPI calls.

## SOL vault accounting

The SOL vault is a program-owned PDA initialized during create. Its raw lamport balance includes rent and may also receive unsolicited direct transfers.

The graduation and sell-solvency source of truth remains:

```text
Campaign.net_raised_lamports
```

Raw SOL-vault balance is never allowed to advance graduation, expand sell capacity or change curve state.

## Remaining boundary

V3 provides program-controlled campaign assets at source-code and generated-IDL level. Public create remains disabled until:

- local-validator transaction tests prove all account constraints and authority revocation;
- devnet deployment and create acceptance succeed;
- the canonical ticker-reservation service issues the exact V3 payload;
- the generated-IDL TypeScript client constructs the correct transaction;
- a versioned deployment manifest binds program, IDL and generation evidence.
