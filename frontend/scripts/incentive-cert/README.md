# MemeWarzone Incentive Certification

Launch-gate harness for financial reward settlement on BNB and Solana.

## Scope

The gate covers league rewards, weekly trader/creator airdrops, recruiter rewards, squad rewards, unified claims, duplicate/concurrent claims, interrupted-payment recovery, reward history/reconciliation, and BNB/Solana isolation.

Creator LP fee harvesting is intentionally excluded from this launch blocker: BNB/Topaz and Solana/Meteora harvesting were already manually verified end-to-end by the founder.

## Safe commands

From `frontend/`:

```bash
node --check scripts/incentive-cert/config.mjs
node --check scripts/incentive-cert/report.mjs
node --check scripts/incentive-cert/source-audit.mjs
node --check scripts/incentive-cert/run.mjs
node scripts/incentive-cert/self-test.mjs
node scripts/incentive-cert/run.mjs --chain=bnb
node scripts/incentive-cert/run.mjs --chain=solana
node scripts/incentive-cert/run.mjs --chain=all
```

The `run.mjs` commands are preflight-only by default. They scan the real source and create a PASS/BLOCK/SKIP report without moving funds.

## Live execution safety

Actual settlement execution requires all of:

```bash
CERT_EXECUTE=1
CERT_EPOCH_ID=CERT-2026-08-16-001
CERT_ALLOW_TESTNET_EXECUTION=I_UNDERSTAND_THIS_SENDS_TEST_FUNDS
CERT_DRIVER_MODULE=/absolute/path/to/production-path-driver.mjs
```

BNB defaults to testnet chain ID 97 and refuses mainnet chain ID 56. Solana defaults to `devnet` and refuses `mainnet-beta`.

`CERT_DRIVER_MODULE` is deliberately external to the generic runner: it must call the existing production settlement/claim code. The certification harness must never become a second implementation of financial business logic.

## Launch rule

Any `FAIL` or `BLOCK` means financial incentives are not certified. A `SKIP` in preflight means the on-chain operation was not executed; it is not evidence of a successful payment.

Core invariants:

1. 50 concurrent requests for one entitlement yield exactly one external payment and one claimed record.
2. If a chain transfer succeeds and the API crashes before DB finalization, retry reconciles the original transaction and never pays twice.
3. A BNB entitlement cannot be claimed through Solana and a Solana entitlement cannot be claimed through BNB.
