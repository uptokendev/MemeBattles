# Solana devnet go-live status

**Updated:** 2026-08-12  
**Branch:** `devpostgrad`  
**Bar:** Same product as BNB when the user switches chain + wallet (create → TokenDetails → buy/sell → votes → later league/recruiter).

This document is the operator checklist after the economics-v2 cutover. Refresh hashes after every program upgrade / generation switch:

```bash
npm --prefix tests/solana run print:railway-create-auth
```

---

## 1. What was done (code + chain)

### On-chain (devnet program `3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt`)

| Item | Status | Detail |
|------|--------|--------|
| Program buy/sell ixs | Done | `buy_tokens` / `sell_tokens` in deployed binary |
| Program extend + upgrade | Done | Slot **483029655**; data length ~995k |
| Economics **v2** (BNB-parity curve) | Done | WAD-style pricing: base/slope per whole token ÷ `10^decimals` |
| Active generation | Done | Seed `memewarzone-solana-devnet-generation-v2-bnb-parity` |
| Generation PDA | Done | `5PFDbbm4VD7t42sa7CabZhn1BN3FmXnhHTLbW2khhqiB` |
| Generation id hex | Done | `734ee571f7ca1dce3f37880e680845e9e8aa7d98b0d936cc6c67f19715006d33` |
| Economics params | Done | version **2**, supply **1e15** (1B @ 6 dec), base **1**, slope **0**, curve **84%** |
| Buy/sell unpaused | Done | global/create/buy/sell = false; graduation/claims still paused |
| Old v1 generation | Deactivated | Must not be used for new creates |

**Expected early buy:** ~0.01 SOL → ~millions of tokens (~1% of curve), not ~0.001 tokens.

### Frontend / API (repo)

| Item | Status | Notes |
|------|--------|--------|
| TokenDetails SOL labels (`nativeUnit`) | Done | No BNB copy on Solana pages |
| Solana trade wire (`solanaTradeV1`) | Done | Authorize + Ed25519 + buy/sell |
| Solana quotes + progress from Campaign | Done | Includes SOL/USD for $ graduation target |
| Safety honesty (`/api/solana/trade-status`) | Done | Railway auth + on-chain pauses |
| UP Vote dual path | Done | SOL transfer + `/api/solana/vote-ingest` |
| Buffer polyfills for browser web3 | Done | `polyfills` + vite-plugin-node-polyfills |
| Netlify stale-chunk / MIME fix | Done | `/assets/*` 404 + chunk reload + static create imports |
| Netlify build CSS path | Done | `prepare-title-fix.css` (not `form`) |
| Direct deploy vaults on mark-deploy | Done | tokenVault/solVault/campaignId |
| Direct deploy ephemeral rail cleanup | Done (this pass) | Archive create-rail if fail **before** on-chain; private visibility |
| TokenDetails prefer campaign PDA URL | Done (this pass) | Mint is `?mint=`; mint is not decoded as Campaign |
| Local trade feed for chart | Partial | Optimistic points after buy/sell; no full indexer yet |

### Create modes (product rules)

| Mode | User experience | Backend today |
|------|-----------------|---------------|
| **Draft** | Save → Prepare/promotion → Push Live | Explicit draft row + reservation |
| **Direct** | One button → wallet create → TokenDetails | Still uses an **ephemeral create-rail** (draft-keyed create-auth + ticker reservation). User must **not** see Prepare. Failures **before** on-chain success **archive** the rail. |

> **Open product debt:** true draftless create-auth (no draft row at all) needs `campaignId` derivation without `draftId` and reservation APIs that are not draft-scoped. Tracked as P2.

---

## 2. Environments and values (devnet)

### Program / cluster

| Key | Value |
|-----|--------|
| Program ID | `3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt` |
| RPC | `https://api.devnet.solana.com` |
| Operator / deployer | `HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9` |
| Route signer pubkey | `7hKQd798Z1ERmRUhm7shmstB1V13FQNnDLqtYjZBuJUz` |
| GlobalConfig | `B9NnmsXRQkZDr9LWwTnTU86mb26Uc5zp7G5gxdb6Jg5U` |
| Cluster | `solana-devnet` (clusterKind **1**) |

### Railway API (create-auth + trade-auth) — **server only, never `VITE_`**

Set on **memebattles-frontend-7dcf** (or current API host), then redeploy API:

```bash
SOLANA_CREATE_AUTH_ENABLED=true
SOLANA_TRADE_AUTH_ENABLED=true
DRAFT_PUSH_LIVE_ENABLED=true

SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_LAUNCHPAD_PROGRAM_ID=3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt
SOLANA_ROUTE_SIGNER_PUBLIC_KEY=7hKQd798Z1ERmRUhm7shmstB1V13FQNnDLqtYjZBuJUz
SOLANA_ROUTE_SIGNER_SECRET_KEY=<existing secret — do not commit>

# MUST match on-chain active GenerationConfig.manifestHash (v2 gen)
SOLANA_GENERATION_MANIFEST_HASH=0b5c374c2ecfed1dc77d458a2c0e83ba44a340a893a2e8fdfb29ce9064f4d06c

# After program upgrade slot 483029655
SOLANA_LAUNCHPAD_PROGRAM_SHA256=beab7e1f5e99efdb1dda2a45174c91534164b2ab43ca4ed08035317ea81efbe8
SOLANA_LAUNCHPAD_IDL_SHA256=702eb07ae510b6a4d1d7b268528c5c8fc33b26b155a78439f56cb0b84bd255e5
```

Also required for ops (already used historically):

- `DATABASE_URL`, Supabase upload vars (logo)
- `SOLANA_CLUSTER` / cluster hash if your deploy template requires them

### Frontend (Netlify `memewarzonedev` / Vite)

```bash
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_SOLANA_LAUNCHPAD_PROGRAM_ID=3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt
VITE_SOLANA_CLUSTER=solana-devnet
VITE_DRAFT_PUSH_LIVE_ENABLED=true
VITE_SOLANA_TRADE_LIVE=true
VITE_FRONTEND_API_BASE=https://memebattles-frontend-7dcf.up.railway.app
VITE_ENABLE_TEST_GRADUATION_THRESHOLD=true
# Optional
# VITE_SOLANA_VOTE_TREASURY_ADDRESS=HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9
```

### Operator wallets (examples already synced)

| Role | Wallet | Command |
|------|--------|---------|
| Creator | `9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H` | `sync-creator` |
| Buyer | `2AMfRaxS9182AESwWRz2TrvUxPqXaUot4wV1oAvjsTrB` | `sync-risk` |
| Operator | `HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9` | deployer / vote treasury default |

```bash
npm --prefix tests/solana run devnet:trade-ops -- sync-creator <WALLET>
npm --prefix tests/solana run devnet:trade-ops -- sync-risk <BUYER>
npm --prefix tests/solana run devnet:trade-ops -- status
```

---

## 3. Checklist

### Done

- [x] V4 authorized create (Push Live + Direct button path)
- [x] Program buy/sell + unpause
- [x] Economics v2 active generation (BNB-scale supply / cheap early fills)
- [x] Trade-auth API + FE trade path
- [x] SOL UI labels on TokenDetails
- [x] UP Vote SOL rail + ingest route
- [x] Safety status from trade-status
- [x] Netlify build/chunk fixes
- [x] Railway manifest mismatch diagnosed (must set hash above)
- [x] Direct: archive ephemeral create-rail if fail before on-chain
- [x] Direct: navigate to **campaign PDA** (not mint-only decode)
- [x] Ignore 82-byte mint accounts in curve decoder

### Open / partial

- [ ] **True draftless Direct** (zero draft row; create-auth without `draftId`)
- [ ] Confirm every Direct success **always** upserts `campaigns` + logo (mark-deploy hard-fail UX)
- [ ] Full **trade indexer + Ably** history for Solana (chart currently local + seed)
- [ ] Graduation / Meteora (P2)
- [ ] League + claims for Solana epochs
- [ ] Airdrops / recruiter / squad Solana parity
- [ ] Featured heat from Solana votes at scale
- [ ] Do not re-run `devnet:bootstrap` mid-trade (re-pauses from manifest)

### Smoke path (new mint only)

1. Railway env updated + API redeployed (especially `SOLANA_GENERATION_MANIFEST_HASH`).
2. Netlify FE on latest `devpostgrad`.
3. `sync-creator` on creator wallet.
4. Create → **Direct deploy** (not Draft) → hard-refresh if needed.
5. Token page shows logo + name from registry; URL uses **campaign PDA** + `?mint=`.
6. Buyer wallet (≠ creator) → buy 0.01 SOL → millions of tokens, progress moves.
7. Sell partial; UP Vote once.

### Known broken examples

| Mint / page | Issue |
|-------------|--------|
| Pre-v2 TESTSOL-style mints | Locked to **economics v1** (expensive tokens) |
| `Eatzbv8yCVCG6kzRJkjoxaLK1eVroRG9mPUyEVNwL9xS` | **Mint** account (82 bytes). Must resolve **campaign PDA** + registry row for logo/curve |

---

## 4. Do not

- Re-bootstrap during an open trade smoke without re-`unpause-trade`.
- Lowercase Solana base58 addresses.
- Point create-auth at the **indexer** host (use frontend-api).
- Expect old mints to pick up v2 economics.

---

## 5. Related docs

- `docs/solana/devnet-trade-smoke.md` — operator trade window
- `docs/solana/bnb-parity-build-plan.md` — full product phases
- `docs/solana/p1-bonding-trade.md` — buy/sell design
- `config/solana/devnet-generation-v1.json` — v2 generation manifest (filename historical)
- `tests/solana/print-railway-create-auth-env.cjs` — print live Railway vars from chain
