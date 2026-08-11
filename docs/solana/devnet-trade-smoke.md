# Solana devnet trade smoke (operator guide)

Plain-language guide to go from **create works** to **buy + sell works** on Solana devnet.  
You do not need deep Solana knowledge — follow the order below.

**BNB is untouched.** Only Solana program pauses, Railway Solana env vars, and Solana wallets are involved.

Related:

- Program deploy / bootstrap: [`docs/solana-devnet-deployment-runbook.md`](../solana-devnet-deployment-runbook.md)
- Env template: [`frontend/.env.solana.example`](../../frontend/.env.solana.example)
- Operator CLI: `tests/solana/devnet-trade-ops.cjs`
- Case-sensitive addresses: `db/migrations/20260811_000001_solana_campaigns_address_case.sql`

---

## Mental model (three switches)

| Switch | Where | Safe default | Trade needs |
|--------|--------|--------------|-------------|
| Program binary | On-chain program ID | Create-only until upgraded | `buy_tokens` + `sell_tokens` present |
| Pause flags | GlobalConfig | buy/sell **paused** | `unpause-trade` |
| Railway trade auth | `SOLANA_TRADE_AUTH_ENABLED` | `false` | `true` after the two above |

If any switch is off, TokenDetails trade will fail (by design).

Known devnet IDs (see `deployments/solana-devnet.protocol-state.json`):

- Program: `3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt`
- GlobalConfig: `B9NnmsXRQkZDr9LWwTnTU86mb26Uc5zp7G5gxdb6Jg5U`
- Explorer: https://explorer.solana.com/?cluster=devnet

---

## Operator CLI

Requires the same operator keypair used for bootstrap (admin/pauser):

```bash
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_LAUNCHPAD_PROGRAM_ID="3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt"
export SOLANA_OPERATOR_KEYPAIR="$HOME/.config/memewarzone/solana-devnet/deployer.json"
```

| Command | What it does |
|---------|----------------|
| `npm --prefix tests/solana run devnet:trade-ops -- status` | Read pause flags + whether IDL has buy/sell + full checklist |
| `npm --prefix tests/solana run devnet:trade-ops -- checklist` | Print checklist only (no RPC) |
| `npm --prefix tests/solana run devnet:trade-ops -- sync-creator <WALLET>` | CreatorProfile + RiskProfile (needed for Push Live) |
| `npm --prefix tests/solana run devnet:trade-ops -- sync-risk <WALLET>` | RiskProfile only (buyer wallets) |
| `npm --prefix tests/solana run devnet:trade-ops -- unpause-trade` | buy/sell **on**; graduation/claims stay **paused** |
| `npm --prefix tests/solana run devnet:trade-ops -- pause-trade` | Restore safe buy/sell paused |

Dry-run (no transactions):

```bash
npm --prefix tests/solana run devnet:trade-ops -- unpause-trade --dry-run
```

**Warning:** `npm --prefix tests/solana run devnet:bootstrap` re-applies the canonical manifest (`buyPaused: true`, `sellPaused: true`). Do **not** re-bootstrap during an open trade smoke window.

---

## Ordered smoke path

### 0. One-time prep

1. Apply DB migration if not already on the shared DB:
   - `db/migrations/20260811_000001_solana_campaigns_address_case.sql`
2. Fund three **devnet** wallets with SOL:
   - Operator/deployer (you already have this)
   - **Creator** (makes the meme)
   - **Buyer** (must be a different wallet — creators cannot buy for ~24h after create)
3. Push latest `devpostgrad` (vault persistence + trade-auth) to Railway/frontend hosts.

### 1. Program has buy/sell

If `status` says IDL is missing `buy_tokens` / `sell_tokens`:

1. Rebuild and upgrade the program (same program ID) — see deployment runbook.
2. Confirm:

   ```bash
   node -e "const i=require('./target/idl/memewarzone_solana.json'); console.log(i.instructions.map(x=>x.name).filter(n=>/buy|sell/i.test(n)))"
   ```

3. Update Railway `SOLANA_LAUNCHPAD_PROGRAM_SHA256` and `SOLANA_LAUNCHPAD_IDL_SHA256`.

### 2. Profiles

```bash
npm --prefix tests/solana run devnet:trade-ops -- sync-creator <CREATOR_BASE58>
npm --prefix tests/solana run devnet:trade-ops -- sync-risk <BUYER_BASE58>
```

### 3. Create smoke (can stop here if only testing create)

Railway (server only, never `VITE_`):

- `SOLANA_CREATE_AUTH_ENABLED=true`
- RPC, program ID, route signer public + secret, cluster hash, IDL/program/manifest hashes
- `DRAFT_PUSH_LIVE_ENABLED=true`

Frontend:

- `VITE_SOLANA_RPC`, `VITE_SOLANA_LAUNCHPAD_PROGRAM_ID`
- `VITE_DRAFT_PUSH_LIVE_ENABLED=true`
- API base → Railway

Then: Prepare Mode (chain 101) → publish → **Push Live** → token page `/token/<mint>?chainId=101`.

### 4. Open trade window

```bash
npm --prefix tests/solana run devnet:trade-ops -- unpause-trade
```

Railway:

```text
SOLANA_TRADE_AUTH_ENABLED=true
```

Frontend safety UI (Netlify / Vite):

```text
# Unset or true: do not block Buy/Sell overlay once trade code is deployed.
# Explicit false re-locks the safety UI (API hard gate still applies).
VITE_SOLANA_TRADE_LIVE=true
```

If the safety panel still shows **“Bonding buy/sell not live yet (P1)”**, the **static frontend is stale** — redeploy Netlify/Vite from `devpostgrad`. Railway `SOLANA_TRADE_AUTH_ENABLED=true` alone does not update the SPA bundle.

Confirm API honesty (should say `protocolLive: true` after unpause + auth):

```bash
curl -sS https://memebattles-frontend-7dcf.up.railway.app/api/solana/trade-status | jq .
```

### 5. Trade smoke (as buyer)

1. Open the token page with the **buyer** wallet on devnet.
2. Buy tab → enter `0.01` (Solana path treats this as **SOL**, even if a label still says BNB).
3. Confirm wallet tx: Ed25519 verify immediately before `buy_tokens`.
4. Check [explorer](https://explorer.solana.com/?cluster=devnet) — success, tokens in wallet.
5. Sell tab → sell some tokens → Ed25519 + `sell_tokens`.

### 6. Close trade window

```bash
npm --prefix tests/solana run devnet:trade-ops -- pause-trade
```

Optionally set `SOLANA_TRADE_AUTH_ENABLED=false` on Railway.

---

## Failure cheat sheet

| Symptom | Fix |
|---------|-----|
| `SOLANA_TRADE_AUTH_DISABLED` | Set Railway `SOLANA_TRADE_AUTH_ENABLED=true` |
| `BuysPaused` / `SellsPaused` | `unpause-trade` |
| Unknown / invalid instruction | Upgrade program; refresh IDL hashes |
| Creator buy lock | Use a different buyer wallet |
| Profile missing | `sync-creator` / `sync-risk` |
| `SOLANA_TRADE_VAULTS_UNRESOLVED` | Re-Push Live / mark-deploy so `campaigns.meta.solana` is filled |
| Token not found / wrong case | Apply address-case migration; do not lowercase Solana base58 |
| Create works, trade fails after bootstrap | Bootstrap re-paused buy/sell — run `unpause-trade` again |

---

## Curve economics (BNB parity) — economics v2

### BNB factory (source of truth)
- `totalSupply` = **1B tokens**
- `basePrice` / `priceSlope` with **WAD** area math (`LaunchCampaign._area`)
- Early 0.01 BNB buys **millions** of tokens; progress bar moves

### Solana bug (v1) — what went wrong
V1 priced **per raw unit** (`cost = n * base`). With 6 decimals and `base=1000`, one whole token ≈ **1 SOL**. Competitors and BNB never work that way.

### Solana fix (v2) — BNB-style
Program `ECONOMICS_VERSION_V2`: same area formula as BNB with `scale = 10^decimals`.

| Param | Value |
|-------|--------|
| economicsVersion | **2** |
| tokenTotalSupply | **1e15** (1B @ 6 dec) |
| curveSupplyBps | **8400** (match BNB 84%) |
| basePriceLamports | **1** (1 lamport per whole token at start) |
| priceSlopeLamports | **850** (BNB factory slope) |

Expected: **0.01 SOL → ~millions of tokens**, sold % visible on the bar.

Manifest: `config/solana/devnet-generation-v1.json` (v2-bnb-parity seed).

### Ops activate (required for new creates)
1. Upgrade program (buy/sell use v1|v2 branch by `campaign.economics_version`)
2. `initialize_generation_config` for generation seed `memewarzone-solana-devnet-generation-v2-bnb-parity`
3. Set generation active / support
4. `unpause-trade` (do **not** re-bootstrap mid-smoke without re-unpause)
5. Direct-deploy a **new** mint — old TESTSOL stays v1 museum piece

### FE
Quotes + progress use `economicsVersion` + live Campaign fields.

## BNB isolation check

After Solana smoke:

1. Open a known BNB testnet token page (chain 97).
2. Confirm it still loads and does not use Solana wallets for EVM trades.
3. Do not change BNB factory or Topaz env vars while testing Solana.
