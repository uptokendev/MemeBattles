# BNB Launch Verification Runbook

This runbook is the repeatable evidence path for Phase 1 BNB launch closure. Run it from the repository root on the `devpostgrad` branch.

## Required Environment

Set these before target-chain verification:

- `BSC_TESTNET_RPC` or the RPC for the selected Hardhat network
- `DEPLOYER_PK`
- `LAUNCH_FACTORY_ADDRESS` or `FACTORY_ADDRESS`
- `ROUTE_AUTHORITY_ADDRESS` or `ROUTE_AUTHORITY_PRIVATE_KEY`
- `ETHERSCAN_API_KEY` when Etherscan V2 contract verification is part of the deployment pass

For the API-side security schema and contract sync worker, also set these in the `frontend` runtime environment:

- `DATABASE_URL`
- `CONTRACT_SYNC_PRIVATE_KEY` or `BNB_CONTRACT_SYNC_PRIVATE_KEY`
- `CONTRACT_SYNC_RPC_URL` or `BSC_RPC_HTTP_97` / `BSC_RPC_HTTP_56`
- `FACTORY_ADDRESS`, `CREATOR_REGISTRY_ADDRESS`, and `RISK_REGISTRY_ADDRESS`
- `CONTRACT_SYNC_CHAIN_ID`, when not using BSC testnet chain `97`

Keep production values in the deployment secret store, not in committed files.

## Local Contract Gate

```bash
npm install
npm run compile
npm test
npm run compile:frontend-abis
```

The `bnb-launch-safety.test.ts` suite must pass before launch sign-off. It exercises:

- factory live and create-pause gates
- creator manual review, cooldown, live-limit, and cluster launch blocks
- restricted wallet trade blocks
- direct trading block when route authorization is required
- campaign buy/sell pause controls
- creator buy lock and cap controls
- create route authorization signed by the configured authority only

## Route Authority Gate

Verify that the backend route signer matches `LaunchFactory.routeAuthority` on the target chain:

```bash
LAUNCH_FACTORY_ADDRESS=0x... \
ROUTE_AUTHORITY_ADDRESS=0x... \
npm run verify:route-authority:bsc-testnet
```

If only the private key is available in the execution environment, use:

```bash
LAUNCH_FACTORY_ADDRESS=0x... \
ROUTE_AUTHORITY_PRIVATE_KEY=... \
npm run verify:route-authority:bsc-testnet
```

A mismatch blocks public launch because create/trade route signatures would be accepted by the backend but rejected on-chain, or the reverse.

## Security Schema Gate

After applying `frontend/supabase/migrations/20260702111000_security_and_payout_schema.sql`, verify the API sees every launch-critical security and payout table:

```bash
cd frontend
npm run check:security-schema
```

This must pass before dashboard actions, preflight decisions, route authorization logs, contract sync jobs, or payout reconciliation are treated as launch evidence.

## Security API Smoke Gate

Run the read-only security smoke check against the deployed API or a local API server:

```bash
cd frontend
API_BASE_URL=https://your-api.example.com npm run check:security-api
```

The smoke check verifies JSON responses and expected status codes for:

- `/api/security/status`
- creator, cluster, manual review, mass deployer, audit log, and sync-job reads
- launch create/buy/sell preflights
- routing status plus create/trade authorization readiness

To include queue-writing admin checks, explicitly opt in:

```bash
cd frontend
SECURITY_SMOKE_MUTATE=1 API_BASE_URL=https://your-api.example.com npm run check:security-api
```

Only use mutating smoke checks against a staging or drill environment, because they create security audit records and contract sync jobs.

## Command Center Security Ops Gate

Open the authenticated creator Command Center and verify the new Security Ops section is reachable:

```text
/profile/<connected-wallet>/command/security
```

The page must load the same security API surfaces checked by the smoke gate and must show:

- global risk posture and pause state
- BNB contract sync status and queued/failed jobs
- emergency BNB factory pause/unpause controls
- campaign pause controls for full, buy, sell, and graduation pauses
- creator tier, manual-review, creator restriction, and wallet restriction controls
- cluster restriction controls
- manual review queue, mass deployer alerts, audit log, and watched creators

For staging evidence, queue one reversible action from the page, confirm it appears in `/api/security/contracts/sync-jobs?chain=bnb`, run the worker, then confirm the job becomes `confirmed` with a transaction hash.

## Frontend Safety Adapter Gate

Open a live bonding token page and verify the route-level trading safety panel renders on desktop:

```text
/token/<campaign-address>
```

The panel must use the launchpad adapter layer and show:

- BNB launchpad status and route-authorization readiness
- buy and sell preflight states from `/api/launchpad/preflight-buy` and `/api/launchpad/preflight-sell`
- campaign pause, buy-pause, sell-pause, graduation-pause, creator lock, wallet risk, and cluster warnings when present
- blocked reasons for restricted wallets, restricted clusters, paused campaigns, missing wallet connection, or missing campaign address
- an honest Solana placeholder that blocks protocol actions until the Solana program adapter is actually live

Do not expose Solana create/trade buttons as real protocol actions until the Solana adapter is backed by deployed programs, tests, route authorization, and smoke evidence.

## Contract Sync Worker Gate

Dashboard/API contract actions write queued rows to `public.contract_sync_jobs`. Run the BNB worker to execute those queued jobs on-chain and write the resulting `tx_hash` plus final status back to the database:

```bash
cd frontend
npm run worker:contract-sync
```

The worker currently supports BNB jobs for:

- factory global/create pause changes
- campaign pause, buy-pause, sell-pause, and graduation-pause changes
- creator tier, restriction, and manual-review state sync
- wallet risk/restriction and wallet-cluster sync
- cluster risk/restriction sync

For launch evidence, queue one representative job for each operator flow, run the worker, then confirm each row is `confirmed` with a `tx_hash` in `/api/security/contracts/sync-jobs?chain=bnb`.

## Deployment Configuration Evidence

Record these addresses for the launch packet:

- `LaunchFactory`
- `LaunchCampaign` implementation used by the factory
- `CreatorRegistry`
- `RiskRegistry`
- `TreasuryRouter`
- fee recipient / league receiver
- route authority signer address
- RPC/network/chain ID
- frontend ABI sync commit

Also confirm:

- `CreatorRegistry.launchRecorder(LaunchFactory) == true`
- `LaunchFactory.creatorRegistry()` points to the deployed `CreatorRegistry`
- `LaunchFactory.riskRegistry()` points to the deployed `RiskRegistry`
- `LaunchFactory.routeAuthority()` matches the backend signer
- `LaunchFactory.live()` and pause flags match the intended launch state

## Operator Drill Checklist

Before sign-off, run these actions against the target environment and capture transaction hashes or test output:

- Create a campaign as an eligible creator
- Block a creator under manual review
- Block a creator in an oversized cluster
- Block a restricted wallet from buying
- Require authorized trading and prove direct buy/sell fails
- Run the read-only security API smoke check
- Open Command Center Security Ops and verify status, queues, controls, and audit data render
- Open a token page and verify the frontend trading safety panel renders correct buy/sell preflight state
- Run mutating security smoke checks in staging and verify sync jobs are queued
- Queue one reversible action from Security Ops and verify the sync job appears
- Pause and unpause a campaign for buys and sells
- Run the BNB contract sync worker and verify queued jobs become confirmed with tx hashes
- Verify frontend ABI files are regenerated after the final compile

Public launch remains blocked until the local contract gate, route authority gate, security schema gate, security API smoke gate, Command Center Security Ops gate, Frontend Safety Adapter gate, contract sync worker gate, deployment configuration evidence, and operator drill checklist all pass.
