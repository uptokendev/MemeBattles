# Solana Phase 6 Program-Controlled Campaign Assets

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Purpose

This slice removes the last creator-supplied mint identity from campaign creation. Immediate and scheduled creates now initialize the campaign's mint, token vault and SOL vault under deterministic program control in the same creator-signed transaction.

This is required for the three locked launch paths:

- Direct Create;
- Draft Deploy Now;
- Draft Countdown Launch.

The campaign and required assets exist immediately after confirmation. A scheduled campaign remains unable to trade until Solana Clock reaches its immutable `launch_at`.

## Accounts initialized during create

| Account | Seeds | Owner / authority | Purpose |
| --- | --- | --- | --- |
| Campaign | `campaign`, campaign ID | MemeWarzone program | Immutable policy snapshot, curve accounting and PDA signing authority. |
| Mint | `campaign-mint`, campaign ID | SPL Token program; initial authority Campaign PDA | Generation-defined token mint. |
| Token vault | `token-vault`, campaign ID | SPL Token program; token authority Campaign PDA | Custody of the complete minted token supply. |
| SOL vault | `sol-vault`, campaign ID | MemeWarzone program | Campaign native-SOL custody and later bonding settlement. |
| CreateAuthorization | `create-auth`, creator, nonce | MemeWarzone program | Replay prevention and accepted authorization evidence. |

The creator pays account rent and transaction fees. There is no backend deployment wallet, relayer, keeper, activation transaction or second creator signature.

## Mint authority lifecycle

The program performs the entire mint lifecycle atomically:

1. initialize the mint with `GenerationConfig.token_decimals`;
2. set Campaign PDA as mint authority;
3. initialize the token vault with Campaign PDA as token authority;
4. mint exactly `GenerationConfig.token_total_supply` into the token vault;
5. verify supply, decimals, vault balance, vault mint and vault authority;
6. verify freeze authority is absent;
7. revoke mint authority permanently;
8. reload and verify that mint authority is `None`;
9. persist `mint_authority_revoked = true` in Campaign.

A failure at any step rolls back the entire create instruction.

## Token compartments

One program-controlled token vault holds the complete supply. Campaign stores the immutable logical compartments used by future instructions:

```text
curve_token_supply
liquidity_token_supply
reserve_token_supply
```

The reserve receives all supply not assigned to the curve or initial DEX-liquidity allocation, including integer rounding dust. No token allocation is transferred to the creator at creation.

Future bonding and graduation code must enforce:

- curve sales cannot exceed `curve_token_supply`;
- liquidity creation cannot exceed `liquidity_token_supply`;
- unsold and unused allocations follow the approved burn/lock rules;
- every token movement is signed by the Campaign PDA;
- mint authority cannot be restored.

## SOL vault boundary

The SOL vault is a program-owned Anchor account. Its creation rent and any unsolicited transfer are not protocol principal.

The internal accounting fields remain authoritative:

```text
net_raised_lamports
total_buy_volume_lamports
total_sell_volume_lamports
```

Direct SOL transfers:

- do not increment `net_raised_lamports`;
- do not advance graduation;
- do not increase sell solvency;
- do not change token balances or curve state;
- do not create rewards.

The future buy/sell slice must update the vault and internal counters atomically.

## Authorization V3

The detached authorization was upgraded to V3 because the asset identity is no longer creator supplied.

```text
MEMEWARZONE_SOLANA_CREATE_V3
schema version 3
```

The signed payload now binds the deterministic Campaign, mint, token-vault and SOL-vault addresses plus the canonical SPL Token program. It continues to bind generation economics, creator/risk state, metadata, ticker reservation, timer, target, nonce and deadline.

## Unit-test coverage

The Rust invariant suite includes:

- V3 domain and schema checks;
- deterministic, distinct asset PDA derivation;
- complete-supply allocation;
- reserve handling for integer rounding dust;
- binding of every asset address;
- binding of the canonical token program;
- existing timer, ticker, reservation, target, generation, risk and Ed25519 invariants.

## Readiness boundary

This slice is not deployment evidence. It does not yet prove the CPI flow against a local validator or devnet.

The production create gate remains closed until:

- Anchor/SBF build and generated IDL are green;
- local-validator create tests inspect actual mint and vault accounts;
- unauthorized alternate accounts fail;
- mint and freeze authorities are verified after transaction confirmation;
- the Railway V3 endpoint and generated-IDL client match the canonical payload;
- devnet Direct Create, Deploy Now and Countdown flows pass acceptance.

Solana remains `protocol_pending`.
