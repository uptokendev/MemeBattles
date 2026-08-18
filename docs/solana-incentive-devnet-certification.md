# Solana incentive devnet certification

This is the launch certification for MemeWarzone native SOL incentives. A green unit/build pipeline is required but is not sufficient. Every lane below must complete a real devnet wallet transaction through the production code path.

## Hard safety boundary

- Use Solana **devnet** only.
- Reward ledger chain id must be **102**.
- Do not point the certification deployment at mainnet RPC.
- Use small test rewards.
- Never place authority private keys in the repository.
- Do not mark `SKIP` as PASS.
- Creator LP/Meteora fee harvesting is outside this incentive suite because it has already been separately founder-certified; this runbook covers League, Trader Airdrop, Creator Airdrop, Recruiter and Squad.

## 1. Required green gates

Before funding or publishing a devnet batch, PR #107 must have green:

- Solana Anchor CI, including `mwz_rewards_treasury` build/test and IDL generation;
- Solana Incentive Settlement CI;
- Incentive certification harness preflight;
- frontend pull request proof;
- Weekly Airdrop CI;
- Secret Scan;
- Topaz Integration CI;
- Creator cooldown/security checks.

A failure or BLOCK stops the financial test.

## 2. Devnet deployment boundary

The public application remains on Solana reward chain 101. The certification deployment must explicitly set all three values:

```text
VITE_SOLANA_REWARD_CHAIN_ID=102
VITE_ENABLE_SOLANA_DEVNET_REWARDS=true
VITE_SOLANA_DEVNET_RPC=<Solana devnet RPC>
```

If either reward-chain flag is missing, the Command Center intentionally stays on 101.

Server/runtime verification must have a devnet RPC available through the existing 102 lookup, for example:

```text
SOLANA_RPC_URL_102=<Solana devnet RPC>
```

Use the database boundary intended for the test and ensure test rows are tagged `chain=102` / `chain_id=102`.

## 3. GitHub environments required before publishing batches

Create these GitHub environments if they do not yet exist:

- `airdrop-solana-devnet`
- `recruiter-solana-devnet`
- `squad-solana-devnet`

The current workflows read these exact environment secret names:

```text
REWARDS_DATABASE_URL
SOLANA_REWARDS_RPC_URL
SOLANA_REWARDS_AUTHORITY_SECRET_KEY
```

`airdrop-solana-devnet` additionally needs:

```text
AIRDROP_DRAW_SEED_SECRET
```

Set this common environment/repository variable for all three lanes:

```text
SOLANA_REWARDS_TREASURY_PROGRAM_ID=2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX
```

For a non-dry-run manual workflow dispatch, the scripts intentionally still require the matching automation guard variable to be true:

```text
SOLANA_AIRDROP_AUTOMATION_ENABLED=true
SOLANA_RECRUITER_AUTOMATION_ENABLED=true
SOLANA_SQUAD_AUTOMATION_ENABLED=true
```

Only set the variable for the lane being exercised. The workflow's `dry_run=false` is the publication switch; there is no separate `*_PUBLISH_ONCHAIN` flag in these workflows.

If the devnet RewardsConfig still has claims disabled, either enable claims explicitly before the test or, in these **devnet-only** environments, deliberately set:

```text
SOLANA_REWARDS_AUTO_ENABLE_CLAIMS=true
```

Do not carry that convenience setting into mainnet without an explicit rollout decision.

The Airdrop workflow also consumes its existing payout/eligibility variables (for example `SOLANA_AIRDROP_WEEKLY_DISTRIBUTION_BPS` and related thresholds). Use the intended devnet certification values; do not rely on a production environment implicitly.

## 4. Rewards treasury devnet prerequisite

The `mwz_rewards_treasury` program deployed at the configured devnet program id must contain the branch version being certified.

The lane bootstrap is intentionally split into small transactions so Anchor/Solana account validation stays below the SBF 4096-byte stack-frame limit. On a fresh deployment, initialize in this order and skip any PDA that already exists:

1. `initialize_route_state` — creates `route_state` and `protocol_vault` and sets the operator/native-price route state;
2. `initialize_monthly_league_vault` — creates the monthly League vault;
3. `initialize_recruiter_vault` — creates the Recruiter vault;
4. `initialize_squad_vault` — creates the Squad vault.

Do not reintroduce or use the removed one-shot `initialize_lanes` account context. All PDA seed constants and resulting addresses are unchanged; only the initialization transaction boundary changed.

Before the first claim, verify:

1. program upgrade succeeded on devnet;
2. RewardsConfig authority equals the intended devnet authority;
3. League and Airdrop vaults exist;
4. Recruiter and Squad lanes/vaults have been initialized;
5. each vault has enough distributable SOL after rent reserve;
6. claims are enabled only when the corresponding root/batch is ready;
7. no mainnet authority or mainnet RPC is being used accidentally.

Do not infer deployment from Anchor CI. CI only proves the program builds/tests.

## 5. Use one isolated certification epoch

Choose a dedicated epoch id/window that cannot collide with production. Record it as `CERT_EPOCH_ID`.

Use real materializers/publishers. Do not manually insert a fake `claimed` row to make the UI pass.

The test wallet(s) should be controlled by the team and funded with enough devnet SOL for transaction fees.

## 6. League test

1. Produce a real chain-102 League winner entitlement for the test wallet.
2. Publish and reconcile the League root through the real publisher.
3. Open the certification Command Center with the owning Solana wallet.
4. Confirm the League amount is visible and not rounded to zero.
5. Click the actual League claim control used by the app.
6. Sign with the owning wallet.
7. Record the confirmed devnet signature.
8. Verify the League vault decreases by the exact entitlement amount.
9. Verify `league_epoch_claims.signature` equals the same signature and `claimed_at` is set.
10. Refresh/reopen and confirm the prize is no longer offered as claimable.
11. Attempt the same claim again; it must not pay twice.
12. Attempt with another wallet; it must be rejected.

Add the period, epoch start, category, rank and signature to the evidence JSON.

## 7. Trader Airdrop test

1. Generate a real Trader Airdrop winner using the weekly Solana Airdrop materializer.
2. Confirm Trader and Creator awards share the single on-chain Airdrop batch/root for that epoch, distinguished by program code.
3. Publish the root and open claims.
4. Open Command Center with the winning wallet.
5. Claim through the real Airdrop card.
6. Verify confirmed transaction, expected program/account tuple, exact Airdrop vault debit and deterministic receipt PDA.
7. Verify canonical `reward_ledger` is `claimed` with the same tx hash.
8. Reopen the page and confirm the reward is no longer claimable.
9. Attempt wrong-wallet and duplicate claims and confirm rejection.

Record `rewardLedgerId` and signature in `airdropTrader` evidence.

## 8. Creator Airdrop test

Repeat the Trader Airdrop procedure using a real Creator Airdrop entitlement. The same combined epoch root is used; the leaf program code differentiates the Creator award.

Record `rewardLedgerId` and signature in `airdropCreator` evidence.

## 9. Recruiter test

1. Use an approved recruiter account with a verified Solana payout wallet.
2. Materialize/publish the real chain-102 Recruiter weekly batch.
3. Unlock Recruiter Rewards in Command Center.
4. Confirm the prepared SOL amount and payout wallet.
5. Claim through the Recruiter panel.
6. Verify `claim_recruiter` executes against the exact recruiter vault/batch/receipt accounts.
7. Verify recruiter vault debit equals the exact amount.
8. Verify:
   - `recruiter_reward_claims.status='confirmed'`;
   - its tx hash equals the chain signature;
   - source recruiter ledger rows are `claimed`;
   - matching `solana_reward_lane_claims.status='claimed'` with the same tx hash.
9. Confirm duplicate/wrong-wallet rejection.

Record recruiter claim id and signature in the evidence JSON.

## 10. Squad test + mandatory cross-session recovery

The Squad claim is the mandatory crash/reload resilience test.

1. Generate a real Squad entitlement using the current Squad scoring/cap rules and chain-102 materializer.
2. Publish the Squad root and reconcile the on-chain batch.
3. Open Command Center with the entitled wallet and confirm the Squad card/amount.
4. Click Claim Squad Rewards and sign.
5. **Wait until the Solana transaction is confirmed.** Record the signature immediately.
6. Deliberately prevent the normal `claim-record` completion by closing the browser/tab or cutting the browser request after chain confirmation and before the dashboard write completes.
7. Confirm no second transaction has been sent.
8. Open a fresh browser session and reconnect the same wallet.
9. The Claim Center must load the stale `claim_pending`/`failed` row and call the proof-only reconciliation path.
10. The server must derive the deterministic Squad receipt PDA, discover the original signature from the receipt account and run the strict normal verifier.
11. The original transaction must prove:
    - expected rewards program;
    - entitled wallet;
    - config/vault/batch/receipt tuple;
    - confirmed/finalized status;
    - exact Squad vault debit.
12. Only then may the DB repair to `claimed`.
13. Verify the canonical row keeps the **original** signature.
14. Verify `reward_audit_logs.action='claim_reconciled_onchain'` and reconciliation source is `deterministic_claim_receipt`.
15. Refresh again: the Squad reward must not be offered for retry.
16. Attempt a duplicate claim; no second payment may occur.
17. Attempt with the wrong wallet; reject before settlement.

Record the original `rewardLedgerId` and original confirmed signature in `squad` evidence. Set `operatorChecks.squadBrowserClosedAfterConfirmation=true` only after this exact drill is completed.

## 11. Run production-path evidence verifier

Copy:

```text
frontend/scripts/incentive-cert/solana-devnet-evidence.example.json
```

to a private/local evidence JSON and fill in the real IDs/signatures.

From `frontend/` run:

```bash
CERT_EXECUTE=1 \
CERT_CHAIN=solana \
CERT_SOLANA_CLUSTER=devnet \
CERT_EPOCH_ID=<isolated-test-epoch> \
CERT_ALLOW_TESTNET_EXECUTION=I_UNDERSTAND_THIS_SENDS_TEST_FUNDS \
CERT_DRIVER_MODULE=scripts/incentive-cert/solana-live-driver.mjs \
CERT_EVIDENCE_FILE=<path-to-private-evidence.json> \
DATABASE_URL=<test-db-url> \
SOLANA_RPC_URL_102=<devnet-rpc> \
node scripts/incentive-cert/run.mjs --chain=solana
```

The live driver independently re-runs the production League, Airdrop/Squad and Recruiter on-chain verifiers and checks their canonical DB state. For the Squad recovery case it additionally requires the reconciliation audit row.

`operatorChecks.wrongWalletRejected` and `operatorChecks.duplicateRejected` may be changed to `true` only after those real UI attempts are performed. They are operator evidence; the successful settlement itself is independently chain/DB verified by the driver.

## 12. PASS definition

Solana incentives are launch-certified only when:

- all PR CI gates are green;
- devnet program/config/vault prerequisites are verified;
- League real claim PASS;
- Trader Airdrop real claim PASS;
- Creator Airdrop real claim PASS;
- Recruiter real claim PASS;
- Squad real claim PASS;
- Squad cross-session deterministic-receipt recovery PASS;
- wrong-wallet rejection PASS;
- duplicate/replay rejection PASS;
- live certification report contains no `FAIL` or `BLOCK`;
- no live financial requirement is being counted as PASS from a preflight `SKIP`.

Only after that should #107 be considered for merge/mainnet rollout. Mainnet smoke testing should use tiny amounts and the same verification sequence before claims are broadly enabled.
