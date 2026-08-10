# P1 — Solana bonding buy/sell (V4)

**Status:** Next eng phase after P0 create is live on local-validator / devnet  
**Product:** Pre-grad trade only. Post-grad = **Meteora DAMM v2 only** (see parity plan P2).  
**Branch:** `devpostgrad`

## Exit criteria

1. Authorized **buy** and **sell** on a V4 campaign (devnet or local validator).  
2. Fees use locked generation `buy_fee_bps` / `sell_fee_bps` (200 bps).  
3. `net_raised_lamports` and vault balances stay consistent; raw SOL vault transfers do not graduate.  
4. FE Token Details + War Room can quote and trade **without** legacy adapter.  
5. Unauthorized or expired route-auth rejects.

## Non-goals

- Meteora / Jupiter pre-grad routing.  
- Raydium or multi-DEX.  
- Graduation CPI (P2).

## On-chain sketch

Mirror create’s detached auth pattern (domain-separated digest, Ed25519 ix immediately before trade ix).

| Instruction | Effect |
|-------------|--------|
| `buy_tokens` | SOL in → tokens out from `token_vault`; update `sold_tokens`, `net_raised_lamports`, volumes; enforce launch timer, pause flags, creator buy lock/cap, risk. |
| `sell_tokens` | Tokens in → SOL out from `sol_vault` accounting; enforce solvency on `net_raised`; fee routing. |

Curve: generation `curve_kind` + `base_price_lamports` / `price_slope_lamports` (same snapshot on `Campaign` at create).

## Railway

New operations (names TBD): `authorize_solana_trade_v1` buy/sell with campaign id, amount, min_out, deadline, nonce. Fail-closed until env + program ID set.

## FE

- Drop any residual legacy `solanaLaunchpadAdapter` trade paths.  
- V4 IDL client for buy/sell builders.  
- Token Details / War Room: chain-aware; Solana only when campaign is base58 / Solana chain id.

## Implementation order

1. Pure curve math unit tests (Rust).  
2. `buy_tokens` + trade-auth verify on local validator.  
3. `sell_tokens` + solvency tests.  
4. Railway trade authorize + FE wire.  
5. Indexer trade events + Ably.  

## Dependencies

- Campaign + mint + vaults from `create_campaign` (done).  
- Active generation with trade unpaused for acceptance.  
- Devnet program ID + route signer (ops P0.2–P0.3) for public product path.
