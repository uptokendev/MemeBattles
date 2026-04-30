# Phase 3 — Core Flow Smoke Test

Goal: prove the dev branch has a stable end-to-end core flow before building more reward logic.

## Scope

This phase focuses on:

1. API route availability.
2. Route-authority signer configuration.
3. Create campaign authorization.
4. Trade authorization.
5. Wallet/manual UI smoke testing for create, buy, sell, and finalize readiness.

It does not implement attribution persistence, reward math, airdrop draws, or squad scoring.

## Required environment

At least one route-authority private key must be configured on the backend runtime:

```txt
ROUTE_AUTHORITY_PRIVATE_KEY
MWZ_ROUTE_AUTHORITY_PRIVATE_KEY
ROUTE_AUTH_PRIVATE_KEY
```

The public address of this private key must match:

```solidity
LaunchFactory.routeAuthority()
```

Recommended optional env:

```txt
ROUTE_AUTH_TTL_SECONDS=600
DEFAULT_TRADE_ROUTE_PROFILE_ID=1
DEFAULT_FINALIZE_ROUTE_PROFILE_ID=1
```

Default route profile is `StandardUnlinked = 1` until attribution persistence exists.

## API smoke test

Run Netlify dev first:

```bash
cd frontend
npm run dev
```

Then, in another terminal:

```bash
cd frontend
npm run check:core-api
```

Optional with deployed API/base URL:

```bash
cd frontend
API_BASE_URL=https://your-site.netlify.app npm run check:core-api
```

Optional with real addresses:

```bash
cd frontend
API_BASE_URL=https://your-site.netlify.app \
CHECK_CHAIN_ID=97 \
CHECK_FACTORY_ADDRESS=0xYourFactory \
CHECK_WALLET_ADDRESS=0xYourWallet \
CHECK_CAMPAIGN_ADDRESS=0xYourCampaign \
npm run check:core-api
```

Expected behavior:

- Reward/recruiter/squad/airdrop routes return JSON safe empty states.
- `/api/routing/status` returns signer status and on-chain match info.
- Create/trade authorization returns `200` if signer env is configured.
- Create/trade authorization returns `503 ROUTE_AUTHORIZER_NOT_CONFIGURED` if signer env is missing.

## Route-authority verification

Check:

```txt
GET /api/routing/status?chainId=97&factoryAddress=0xYourFactory
```

Healthy response requirements:

```txt
signerConfigured: true
routeAuthority: 0x...
onchainRouteAuthority: 0x...
matchesOnchain: true
```

If `matchesOnchain` is false, create/buy/sell signatures will fail on-chain.

## Manual UI smoke test

### 1. Wallet

- Open frontend.
- Connect wallet.
- Confirm correct chain.
- If wrong chain, switch manually for now.

### 2. Create campaign

- Go to `/create`.
- Upload logo.
- Fill name/ticker.
- Optional: initial buy below 1 BNB.
- Submit.

Expected:

- `/api/upload` succeeds.
- `/api/routing/create-authorization` returns authorization.
- Wallet opens transaction confirmation.
- Transaction mines.
- Created campaign can be resolved and opened.

### 3. Buy

- Open token detail page.
- Enter a buy amount.
- Confirm transaction.

Expected:

- `/api/routing/trade-authorization` returns authorization.
- Wallet opens transaction confirmation.
- Transaction mines.
- Card/detail stats refresh after tx-confirm event or page refresh.

### 4. Sell

- Open token detail page with wallet holding tokens.
- Enter sell amount.
- Confirm transaction.

Expected:

- `/api/routing/trade-authorization` returns authorization.
- Wallet opens transaction confirmation.
- Transaction mines.

### 5. Finalize readiness

If campaign reaches graduation target or sells out:

- Auto-finalize should be triggered by buy if threshold is crossed.
- Manual finalize should still work for owner/admin flow where applicable.

Confirm events and vault balances separately in contract tests or explorer.

## Known limitations after Phase 3

- Attribution still defaults to StandardUnlinked.
- Recruiter-linked and OG-linked route profiles are not selected yet.
- Reward summary/history/claims are safe empty stubs.
- Airdrop winners and squad leaderboard are safe empty stubs.
- Wrong-chain UI enforcement is still a follow-up task.

## Phase 3 closeout checklist

```txt
[ ] npm run check:core-api passes locally against Netlify dev
[ ] /api/routing/status shows signerConfigured=true
[ ] /api/routing/status shows matchesOnchain=true
[ ] create authorization returns 200 with valid signature
[ ] trade authorization returns 200 with valid signature
[ ] create campaign succeeds on dev/testnet
[ ] buy succeeds on dev/testnet
[ ] sell succeeds on dev/testnet
[ ] no unknown API route errors during create/buy/sell/profile load
[ ] route-authority env is documented in deployment settings
```
