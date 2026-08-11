# P1 — Solana bonding buy/sell (V4)

**Status:** Program ixs + Railway trade-auth + TokenDetails wire landed in repo.  
**Still ops for live devnet trade:** program upgrade (IDL must list buy/sell), GlobalConfig unpause, `SOLANA_TRADE_AUTH_ENABLED=true`.  
**Product:** Pre-grad trade only. Post-grad = **Meteora DAMM v2 only** (see parity plan P2).  
**UX:** exact SOL in for buy; exact tokens in for sell.  
**Branch:** `devpostgrad`

**Operator smoke guide:** [`devnet-trade-smoke.md`](./devnet-trade-smoke.md)  
**Operator CLI:** `npm --prefix tests/solana run devnet:trade-ops -- status`

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

- Create: `POST` draft deploy `authorize_solana_v4` — `SOLANA_CREATE_AUTH_ENABLED`  
- Trade: `POST /api/solana/trade-authorize` — **`SOLANA_TRADE_AUTH_ENABLED`** (fail-closed until true)  
- Reuses route signer + program id + RPC; signs only the 32-byte trade digest  
- Env template: `frontend/.env.solana.example`

## FE

- `frontend/src/lib/solanaTradeV1.ts` — authorize + Ed25519 + buy/sell submit  
- Token Details Solana branch — exact SOL-in / tokens-in  
- Safety adapter: `VITE_SOLANA_TRADE_LIVE` (status only)  
- Vaults: `campaigns.meta.solana` + trade-auth RPC fallback  

## Implementation order

1. Pure curve math unit tests (Rust).  
2. `buy_tokens` + trade-auth verify on local validator.  
3. `sell_tokens` + solvency tests.  
4. Railway trade authorize + FE wire. **(landed)**  
5. Operator unpause/risk CLI + env docs. **(landed)**  
6. Indexer trade events + Ably.  
7. Devnet acceptance: upgrade + unpause + smoke. **(ops)**  

## Dependencies

- Campaign + mint + vaults from `create_campaign` (done).  
- Active generation with trade unpaused for acceptance (`devnet:trade-ops unpause-trade`).  
- Devnet program ID + route signer (ops P0.2–P0.3) for public product path.
