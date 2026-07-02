# BNB Launch Verification Runbook

This runbook is the repeatable evidence path for Phase 1 BNB launch closure. Run it from the repository root on the `devpostgrad` branch.

## Required Environment

Set these before target-chain verification:

- `BSC_TESTNET_RPC` or the RPC for the selected Hardhat network
- `DEPLOYER_PK`
- `LAUNCH_FACTORY_ADDRESS` or `FACTORY_ADDRESS`
- `ROUTE_AUTHORITY_ADDRESS` or `ROUTE_AUTHORITY_PRIVATE_KEY`
- `BSCSCAN_API_KEY` when contract verification is part of the deployment pass

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
- Pause and unpause a campaign for buys and sells
- Verify frontend ABI files are regenerated after the final compile

Public launch remains blocked until the local contract gate, route authority gate, deployment configuration evidence, and operator drill checklist all pass.
