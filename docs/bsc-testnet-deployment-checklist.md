# BSC Testnet Deployment Checklist

Use this checklist for the first audit-hardened `devpostgrad` BSC testnet deployment. Do not deploy a live testnet campaign until every pre-deploy gate has passed in the deployment environment.

## 1. Pre-Deploy Regression Gate

- Confirm the branch head is the intended audited commit or a reviewed successor.
- Run `npm ci` in a clean checkout.
- Run `npm run pretestnet:check`.
- Confirm the full Hardhat suite passes, including `test/LaunchFactorySecurityLock.spec.ts`.
- Confirm `npm run size` keeps `LaunchCampaign` below the internal 23,000-byte target and under the EVM deployment limit.
- Confirm `npm run deploy:check-env:bsc-testnet` passes with the exact environment that will deploy.

Latest known gate result from 2026-07-18:

- `npm run test`: 540 passing.
- `npm run size`: all listed contracts passed; `LaunchCampaign` was 22,864 bytes and `LaunchFactory` was 15,180 bytes.
- `npm run deploy:check-env`: local hardhat environment passed with expected mock/fallback warnings.
- `npm run deploy:check-env:bsc-testnet`: blocked because real BSC testnet env values were unset.

## 2. Required BSC Testnet Inputs

Use `config/bsc-testnet.env.example` as the fill-in template for the real deployment environment. Never commit the completed file if it contains keys or private operational addresses.

- `BSC_TESTNET_RPC` points at the selected BSC testnet RPC endpoint.
- `DEPLOYER_PK` is a funded BSC testnet deployer key and is not reused for production administration.
- `TREASURY_SAFE` is the testnet treasury/admin safe or wallet; do not use default Hardhat accounts.
- `ROUTE_AUTHORITY_ADDRESS` or `ROUTE_AUTHORITY_PRIVATE_KEY` is set so route-authorized launches/trades can be configured.
- `BSCSCAN_API_KEY` is set for contract verification.
- Official Topaz testnet router, pool factory, and WBNB addresses are recorded.
- Either `GRADUATION_ORACLE_ADDRESS` is set to an existing oracle, or a real BNB/USD feed is set through `BNB_USD_PRICE_FEED`, `NATIVE_USD_PRICE_FEED`, or `GRADUATION_PRICE_FEED`.
- `GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS` is approved; the deployment script defaults to 3600 seconds when deploying a new oracle from a feed.
- TreasuryRouter, protocol revenue vault, creator registry, risk registry, and route authority addresses are finalized before campaign creation.
- Keeper and monitoring wallets are separate from owner, route signer, and reward operator keys wherever possible.

## 3. Locked Production-Style Deployment Sequence

1. Deploy and verify the Topaz/WBNB dependencies or confirm the official testnet addresses.
2. Deploy and verify the BNB/USD `GraduationOracle`, or confirm the configured existing oracle.
3. Deploy and verify treasury, reward, registry, and routing contracts.
4. Deploy `LaunchCampaign` implementation and confirm the implementation initializer is locked.
5. Deploy `LaunchFactory` with production defaults.
6. Configure route authority, registries, treasury routes, oracle, router, launch protection, and monitoring before any live campaign creation.
7. Verify `requireRouteAuthorization == true` and `requireAuthorizedTrading == true`.
8. If any campaign exists before locking, verify every campaign has `requireAuthorizedTrading == true`; correct insecure campaigns before treating the lock as complete.
9. Call `lockSecurityDefaults()` only after the deployed addresses and route authority have been verified.
10. Verify `securityDefaultsLocked == true`.
11. Verify `createCampaign()` reverts with `RouteAuthorizationRequired`.
12. Create the first campaign only through `createCampaignAuthorized()` and confirm the new campaign inherits `requireAuthorizedTrading == true`.

## 4. Testnet Acceptance Rehearsal

- Run at least two full campaigns and two graduations.
- Include one material overshoot purchase that auto-graduates atomically.
- Include one price-driven graduation triggered through `graduateIfEligible()`.
- Confirm Topaz volatile pool creation or retrieval, direct LP minting to the shared `PermanentLpLocker`, and pool registration.
- Confirm one shared locker can hold multiple graduated pool LP balances.
- Confirm final curve price, initial Topaz price, burned supply, creator reserve, locked LP, and BNB/USD overshoot are recorded.
- Generate post-graduation fees in both launched token and WBNB.
- Confirm `claimable0(locker)` and `claimable1(locker)` match keeper/indexer views.
- Harvest each pool and verify creator 80% payout plus protocol 20% TreasuryRouter routing for both assets.
- Confirm failed native or token recipient behavior cannot block the other recipient or asset.
- Confirm no launched token has buy, sell, or transfer tax behavior.

## 5. Operational Failure Drills

- Stale or invalid oracle data.
- Temporarily unavailable oracle during an ordinary buy.
- Topaz add-liquidity or pool verification failure.
- Replayed or expired route authorization signature.
- Direct trading attempt without route authorization.
- Global pause, create pause, and campaign-level pause.
- Route authority rotation.
- Registry restriction for creator launch and wallet trading.
- LP-balance mismatch, harvest failure, creator-transfer fallback, and treasury-routing mismatch.

## 6. Sign-Off Artifacts

- Deployment transaction list and verified constructor arguments.
- Contract-size report.
- `pretestnet:check` output.
- Factory production-lock verification output.
- Route authority and registry configuration snapshot.
- Topaz address verification notes.
- Graduation and harvest transaction evidence.
- Monitoring and alert configuration snapshot.
- Open follow-ups for optional Topaz pool-fee override or gauge workflow, clearly marked non-blocking for graduation.
