# Deployment Readiness

This checklist keeps local rehearsal, BSC testnet, and legacy visibility separate. Do not deploy to BSC testnet until every preflight item below is green.

## Current Build Lane

- Continue contract, script, and verification work on `devpostgrad` without pushing to testnet by default.
- Keep the legacy drafts and already-deployed testnet token references visible on the branch. Do not delete, move, or rename legacy contract artifacts as part of the Phase 1 deploy path unless a separate migration task explicitly calls for it.
- Treat new deployment scripts as the canonical path for the new protocol contracts only. Legacy contracts remain historical/reference artifacts.

## Local Hardhat Rehearsal

Local rehearsal may use mocks and the first Hardhat account for convenience.

```bash
npm run deploy:check-env
npm run deploy:verify
npm run verify:route-authority
```

Expected local behavior:

- Missing router envs are allowed because the local deploy can use mock Topaz contracts.
- Missing graduation oracle/feed envs are allowed because the local deploy can use `MockUsdPriceFeed`.
- `TREASURY_SAFE` and `ROUTE_AUTHORITY_ADDRESS` may use the first Hardhat account only for local rehearsal.
- Standalone `verify:deployment` against `hardhat` only works inside the same process that deployed, or against a persistent node such as `localhost`; a fresh in-process Hardhat run has no prior deployed code.

## BSC Testnet Preflight

Before any BSC testnet deploy, run:

```bash
npm run deploy:check-env:bsc-testnet
```

This must pass before running deploy commands. It intentionally fails when:

- `BSC_TESTNET_RPC` is missing.
- `DEPLOYER_PK` is missing or is a default Hardhat private key.
- `TREASURY_SAFE` is missing or is a default Hardhat account.
- `ROUTE_AUTHORITY_ADDRESS` is missing, unless `ROUTE_AUTHORITY_PRIVATE_KEY` is supplied for signing checks.
- `ROUTE_AUTHORITY_ADDRESS` is a default Hardhat account.
- No real Topaz/router address is configured.
- No real `GRADUATION_ORACLE_ADDRESS`, `BNB_USD_PRICE_FEED`, `NATIVE_USD_PRICE_FEED`, or `GRADUATION_PRICE_FEED` is configured.
- Mock deploy flags are enabled.

Only after this preflight is clean should the BSC testnet deploy command be used:

```bash
npm run deploy:verify:bsc-testnet
```

Then verify the saved deployment:

```bash
npm run verify:deployment:bsc-testnet
npm run verify:route-authority:bsc-testnet
```

## Required Real-Network Values

Use real testnet-controlled values for:

- `BSC_TESTNET_RPC`
- `DEPLOYER_PK`
- `TREASURY_SAFE`
- `ROUTE_AUTHORITY_ADDRESS`
- `TOPAZ_ROUTER` or another supported router env
- `GRADUATION_ORACLE_ADDRESS` or a real native/USD price feed env

Optional lanes stay paused unless explicitly configured:

- League payout and claim operators/caps
- Recruiter payout operator/caps

## Final Local Gates Before Testnet

Run these on `devpostgrad` before the first real testnet attempt:

```bash
npm test
npm run size
npm run deploy:check-env:bsc-testnet
```

The deploy should wait if tests fail, contract size exceeds the internal target, route authority preflight fails, or the BSC testnet env still points at local Hardhat defaults.
