# MemeWarzone incentive certification

This harness separates structural/preflight proof from live financial proof.

## What a green preflight means

From `frontend/`:

```bash
node scripts/incentive-cert/self-test.mjs
node scripts/incentive-cert/run.mjs --chain=all
```

A green preflight proves that the production reward rails, deterministic Solana receipt reconciliation, strict vault-delta verification and claim idempotency markers are present. It does **not** prove that a wallet received funds.

`SKIP` is never financial proof.

## Live execution guard

Live certification is testnet/devnet only. The runner refuses BNB mainnet chain 56 and Solana `mainnet-beta`.

Required environment:

```bash
CERT_EXECUTE=1
CERT_CHAIN=solana
CERT_SOLANA_CLUSTER=devnet
CERT_EPOCH_ID=<isolated-test-epoch>
CERT_ALLOW_TESTNET_EXECUTION=I_UNDERSTAND_THIS_SENDS_TEST_FUNDS
CERT_DRIVER_MODULE=scripts/incentive-cert/solana-live-driver.mjs
CERT_EVIDENCE_FILE=<absolute-or-frontend-relative-json-file>
DATABASE_URL=<database-containing-chain-102-test-rows>
SOLANA_RPC_URL_102=<devnet-rpc>
```

The live driver verifies evidence produced by the real MemeWarzone flows. It does not fabricate entitlements, transactions or wallet signatures.

## Browser certification deployment

The normal product remains Solana chain 101. For an isolated devnet certification deployment only, set:

```bash
VITE_SOLANA_REWARD_CHAIN_ID=102
VITE_ENABLE_SOLANA_DEVNET_REWARDS=true
VITE_SOLANA_DEVNET_RPC=<devnet-rpc>
```

Both reward-chain flags are required. Without them the Command Center remains on 101.

## Live evidence

Copy `scripts/incentive-cert/solana-devnet-evidence.example.json` to a local evidence file and fill it only after the real Claim Center / Recruiter panel transactions have been confirmed.

The mandatory browser/operator sequence is documented in `../docs/solana-incentive-devnet-certification.md` from the repository root (`docs/solana-incentive-devnet-certification.md`).

The final launch criterion is stricter than CI:

1. entitlement exists from the real weekly/materialization path;
2. root is published and reconciled;
3. user sees the real Claim button;
4. the owning wallet signs;
5. Solana confirms the transaction;
6. strict server verification proves program/accounts/recipient/exact vault debit;
7. DB becomes claimed with the same signature;
8. UI refreshes;
9. wrong-wallet and duplicate attempts are rejected;
10. Squad browser-close recovery repairs the DB from the deterministic receipt without sending a second transaction.
