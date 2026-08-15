# Deploy guide — Solana fee treasuries + BNB operator fill

Follow this in order. Do not skip to claims.

## Already done on Solana devnet

You do **not** need to redeploy these programs unless we change them again.

| Item | Status | Address |
|---|---|---|
| V4 launchpad | Upgraded (full Unlinked fee table) | `3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt` |
| Rewards treasury | Deployed + lanes initialized | `2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX` |
| Weekly league vault | Exists (rent only until a routed trade) | `FAKPndjQa3XppkNdk8SDGGWbZG2cPWJWhsDR2EWE9yWK` |
| Monthly league vault | Exists | `68FNNeXDMAU8XaJsNYL4VFY2YnprnE36LCncCm8uRyJg` |
| Airdrop vault | Exists | `BE9ubLmT1M1N976ABCc9DpYo4iaeRJ4DHEXLCksrGQk4` |
| Recruiter vault | Exists | `54WorKCYLiV3SGe4jcRGLBcdSvvQFggm9mgrBavAkZ53` |
| Squad vault | Exists | `HBAidAC6D51S7TAzNmMpZBAEp74Ld6tj9KnVXLH3mN55` |
| Protocol vault (test “multisig” pot) | Exists | `BvQHb6qq22ZHAVUpXaaeizBaRhGpuu5T3i8Y3ebZ2que` |
| Claims | **Off** | `claims_enabled = false` |
| Test operator | HuKfoF (normal wallet, $10k USD fill cap) | `HuKfoFUuWxC5qFZXzr5dbaX4S7w4vJUW8AHV9LD4C2J9` |

Explorer (devnet), weekly league:  
https://explorer.solana.com/address/FAKPndjQa3XppkNdk8SDGGWbZG2cPWJWhsDR2EWE9yWK?cluster=devnet

---

## What you still deploy

The on-chain programs are live. The **apps** still run old bundles, so trades do not attach the six vaults yet. Fees will not move until step 2–3 are live.

### 1. Commit and push `devpostgrad`

From the repo root, push the local treasury/V4/frontend/indexer changes.

Do **not** include: `.grok-tmp/`, `target/`, `Cargo.lock` unless you already track it, keypair JSON, or worktrees.

After push, note the commit SHA.

### 2. Railway — frontend-api (trade authorize)

This is `memebattles-frontend-7dcf` (or whichever service serves `/api/solana/trade-authorize`).

Add / confirm:

```
SOLANA_REWARDS_TREASURY_PROGRAM_ID=2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX
SOLANA_TRADE_AUTH_ENABLED=true
SOLANA_LAUNCHPAD_PROGRAM_ID=3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt
```

Redeploy the service from the new `devpostgrad` commit.

Smoke:

```bash
curl -sS "https://memebattles-frontend-7dcf.up.railway.app/api/solana/trade-status"
```

A later authorize response must include all six vaults:

`leagueVault`, `airdropVault`, `monthlyLeagueVault`, `recruiterVault`, `squadVault`, `protocolVault`

If those keys are missing, the API did not pick up the new code.

### 3. Frontend (Netlify / Railway static)

Rebuild the **frontend** from the same commit so `solanaTradeV1.ts` attaches the six remaining accounts.

Confirm `VITE_SOLANA_LAUNCHPAD_PROGRAM_ID=3JSGNiFstsSQEd98GUJduBnceXNg8kh2qWg7zEeZfmBt`.

Optional:

```
VITE_SOLANA_REWARDS_TREASURY_PROGRAM_ID=2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX
```

Hard-refresh the site after deploy (old JS will not attach vaults).

### 4. Railway — realtime-indexer

Redeploy so `finalizeEpochWinners` includes chain `101` and does not lowercase Solana wallets.

Optional env:

```
LEAGUE_CHAINS=97,56,101
```

(Default in code is already `97,56,101`.)

### 5. Prove fee routing (do this before claims)

1. Connect Phantom on Solana (unlinked wallet = default BNB factory profile).
2. Buy a small amount on a live bonding coin, then sell a bit.
3. Wait one confirmation.
4. Check explorer balances:

| Should move on an **unlinked** trade | Should stay at rent |
|---|---|
| Weekly league | Recruiter |
| Monthly league | Squad |
| Airdrop (~30 bps of the 2% envelope) | |
| Protocol vault (remainder) | |

Unlinked is: league 75 bps of volume (30/70 weekly/monthly), airdrop 30 bps, protocol ~95 bps. Recruiter/squad only move on a **linked / OG** wallet.

5. Optional operator fill (test, $10k USD cap, HuKfoF):

```bash
node scripts/solana/init-rewards-lanes.mjs   # already ran; no-op if lanes exist
# flush_operator_fill comes next as a small script if you want SOL pushed to HuKfoF
```

Until flush, protocol remainder sits in `BvQHb6qq22ZHAVUpXaaeizBaRhGpuu5T3i8Y3ebZ2que` (the test multisig pot).

### 6. Do **not** turn claims on yet

Leave `claims_enabled = false` until:

- you have seen vault balances increase from a real trade
- a week is finalized
- `set_league_epoch_root` is called

---

## BNB (testnet / later mainnet)

On-chain BNB still needs a **contract deploy**. Code is in `contracts/ProtocolRevenueVault.sol`.

After you deploy/upgrade that vault (or the router still points at the old one — upgrade in place if it is already the fee recipient):

```text
setOperatorFill(
  operator,            // test: a normal wallet; mainnet: capped operator
  overflowTreasury,    // test: another normal wallet or address(0) to keep in vault
  10000e18,            // $10,000
  bnbUsdPriceWad       // e.g. 600e18 if BNB is $600
)
```

- `overflowTreasury = 0` → leftover stays in the vault for Safe/admin withdraw (good for test).
- Mainnet: `overflowTreasury = TREASURY_SAFE` (or leave 0 and let Safe `withdraw`).

Do **not** set this on mainnet until the new vault bytecode is deployed and verified.

---

## Mainnet later (not now)

1. Same five/six PDAs on mainnet-beta (new program deploy + `initialize` + `initialize_lanes`).
2. Replace test operator with the real capped operator.
3. Set `overflow_treasury` / BNB `overflowTreasury` to the **Safe**.
4. Keep `$10,000` operator fill cap.
5. Only then enable claims.

---

## If something looks wrong

| Symptom | Cause |
|---|---|
| Vaults stay at ~0.00095 SOL after a trade | Frontend or trade-authorize is old (vaults not attached) |
| Buy/sell fails after V4 upgrade | Stale frontend sending extra `routeProfile` byte — use the current `solanaTradeV1.ts` |
| Recruiter/squad stay at rent | Wallet is unlinked — expected |
| Protocol vault empty but league moved | Only two vaults attached (old 75/50 client) — redeploy FE/API |
| Claims button works | It must not. Claims are still disabled on-chain |

---

## One-page order

1. Push git  
2. Redeploy frontend-api  
3. Redeploy frontend  
4. Redeploy indexer  
5. Buy + sell → watch the six explorers  
6. Leave claims off  
7. BNB: deploy `ProtocolRevenueVault` + `setOperatorFill` when you are ready to test that chain
