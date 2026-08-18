# BSC mainnet (chain 56) artifacts

This directory is the signed production address sheet for BNB Smart Chain.

## Required before `npm run deploy:check-env:bsc-mainnet`

1. Fill `minimal-topaz.json` with independently verified chain-56 Topaz Router, PoolFactory, WBNB, fee, and commit provenance. Empty or testnet addresses must fail the checker.
2. Keep `TREASURY_SAFE`, route authority, and oracle addresses in the secret manager, not in this folder if they are not yet public.
3. After a successful deploy, `scripts/deploy-and-verify.ts` writes `../bscMainnet.json` and `npm run frontend:env:bsc-mainnet` writes `../bscMainnet.frontend.env`.
4. RewardDistributor is separate: `npm run deploy:reward-distributor:bsc-mainnet` writes `../bscMainnet.reward-distributor.json`.

## Provenance rule

Do not copy `../bscTestnet/minimal-topaz.json`. Chain ID must be `56`. Every contract must have bytecode on BSC mainnet before writes are enabled.
