# Solana Phase 6 Program-Controlled Campaign Assets

Status date: 2026-07-28
Branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67

## Purpose

This slice removes creator-supplied mint identity from campaign creation. Immediate and scheduled creates initialize the campaign's mint, token vault and SOL vault under deterministic program control in the same creator-signed transaction.

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
| CreateAuthorization | `create-auth`, creator, nonce | MemeWarzone program | Replay prevention and accepted V4 authorization evidence. |

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

## Authorization V4

V4 preserves the complete generation, creator, reservation and asset bindings while signing only a compact SHA-256 digest of the canonical payload.

```text
MEMEWARZONE_SOLANA_CREATE_V4
schema version 4
signed message: SHA256(canonical payload), 32 bytes
```

The signed payload binds the deterministic Campaign, mint, token-vault and SOL-vault addresses plus the canonical SPL Token program. It also binds generation economics, creator/risk state, metadata, ticker reservation, timer, target, nonce and deadline.

## Source-level invariant coverage

The Rust invariant suite includes:

- V4 domain and schema checks;
- deterministic, distinct asset PDA derivation;
- complete-supply allocation;
- reserve handling for integer rounding dust;
- binding of every asset address;
- binding of the canonical token program;
- timer, ticker, reservation, target, generation, risk and Ed25519 invariants;
- generation economics/profile mutation invalidating the digest.

## Accepted local-validator transaction proof

Solana Local Validator Acceptance #26 passed on 2026-07-28.

The accepted run created and inspected real local-validator accounts for:

- Direct Create;
- Draft Deploy Now;
- Countdown Create.

It verified:

- the mint account is owned by the classic SPL Token program;
- mint supply equals the generation-owned total supply;
- mint decimals equal the generation configuration;
- freeze authority is absent;
- mint authority is permanently revoked;
- the token vault is owned by the SPL Token program;
- token-vault authority is the Campaign PDA;
- token-vault balance equals the complete minted supply;
- the SOL vault is owned by the MemeWarzone program;
- Campaign records the deterministic asset addresses and token compartments;
- an unsolicited SOL transfer changes only the raw vault balance and not `net_raised_lamports`;
- alternate mint and noncanonical token-program substitutions fail;
- modified, expired, misordered, wrong-signer and replayed authorizations fail.

```text
Accepted branch head: be5d696ead6dc5070f26175710abda858c7aed10
Workflow run ID:      30384574030
Artifact:             memewarzone-solana-validator-ff7ed2d8b3ab83af7dc60ef272d289b016273734
Artifact SHA-256:     a7e81eb39f088e8b42517d3ff9b3667e06113b24b79a94b8ae15ac79e009b94e
```

## Readiness boundary

The local create-asset gate is closed, but this slice is not devnet or deployment evidence.

Production create remains blocked until:

- the canonical ticker-reservation service exists;
- Railway V4 authorization and the generated-IDL client match the canonical serializer;
- an accepted versioned deployment manifest identifies the deployed program and IDL hashes;
- devnet Direct Create, Deploy Now and Countdown flows pass acceptance;
- bonding buy/sell, graduation and reward-vault instructions are implemented;
- production authorities, multisig and locked security defaults are configured.

Solana remains `protocol_pending`.
