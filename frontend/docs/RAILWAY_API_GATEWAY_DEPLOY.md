# Railway API Gateway Deployment Checklist

This document tracks the migration step where the existing frontend API gateway (`frontend/api/server.mjs`) is deployed to Railway, while Netlify stays as frontend/static hosting until parity is proven.

## Goal

Production target:

```txt
Netlify static frontend
  -> Railway API gateway (`frontend/api/server.mjs`)
  -> Supabase DB/storage + realtime-indexer routes
```

Local test target:

```txt
Vite localhost frontend
  -> local API gateway (`127.0.0.1:3001`)
  -> Supabase DB/storage + Railway realtime-indexer proxy
```

Do not remove Netlify Functions or Netlify `/api/*` redirects until this Railway gateway passes the readiness checklist and the frontend has been tested locally.

## Railway service

Create a new Railway service from the repo using:

- Root directory: `frontend`
- Config file: `frontend/railway.json`
- Start command: `npm run api:start`
- Health check path: `/healthz`

The API server listens on `process.env.PORT` when Railway provides it, otherwise it falls back to `3001` locally.

## Required env vars

Copy the same values used by local `.env.local` / current Netlify production where applicable:

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=UPMEME
PG_SSL_ALLOW_SELF_SIGNED=1
ABLY_API_KEY=
RAILWAY_INDEXER_URL=https://memebattles-production.up.railway.app
RAILWAY_API_BASE_URL=https://memebattles-production.up.railway.app
API_RAILWAY_PROXY=1
VITE_REALTIME_API_BASE=https://memebattles-production.up.railway.app
VITE_TARGET_CHAIN_ID=97
VITE_FACTORY_ADDRESS_97=
VITE_BSC_TESTNET_RPC=
VITE_BSC_MAINNET_RPC=
VITE_VOTE_TREASURY_ADDRESS_97=0x58386c97B7AaE0738d50730cC59de8191eD1c816
VITE_TREASURY_VAULT_ADDRESS_97=0xc9d3e1174983314490B32a7929ac82421E4e5707
STATUS_TOKEN=
DIAGNOSTICS_TOKEN=
DRAFT_PUSH_LIVE_ENABLED=
VITE_DRAFT_PUSH_LIVE_ENABLED=
```

Optional routing signer envs when testing authorized create/trade routing:

```env
ROUTE_AUTHORITY_PRIVATE_KEY=
MWZ_ROUTE_AUTHORITY_PRIVATE_KEY=
ROUTE_AUTH_PRIVATE_KEY=
ROUTE_AUTH_TTL_SECONDS=600
DEFAULT_TRADE_ROUTE_PROFILE_ID=1
DEFAULT_FINALIZE_ROUTE_PROFILE_ID=1
```

## Local readiness gate

Before deploying the Railway API gateway, local hybrid must pass:

```bash
cd frontend
npm run dev:hybrid
npm run check:api-migration
npm run build
```

Expected:

```txt
All migration readiness checks returned expected JSON statuses.
```

## Railway readiness gate

After the Railway gateway is deployed, run the same readiness check against the Railway API URL:

```powershell
$env:API_BASE_URL="https://YOUR-RAILWAY-API-GATEWAY.up.railway.app"
npm run check:api-migration
```

Expected:

```txt
All migration readiness checks returned expected JSON statuses.
```

Use a real campaign address for final validation of realtime token summary/trades:

```powershell
$env:CHECK_CAMPAIGN_ADDRESS="0xREAL_CAMPAIGN_ADDRESS"
$env:API_BASE_URL="https://YOUR-RAILWAY-API-GATEWAY.up.railway.app"
npm run check:api-migration
```

## Netlify static-only switch conditions

Only after local and Railway checks pass:

1. Set frontend production env so browser API calls use Railway:

```env
# Main app API gateway: profile, drafts, prepare mode, upload, routing, accounts.
VITE_API_BASE_URL=https://memewarzonefrontend-production.up.railway.app

# Existing token/realtime/indexer Railway service.
VITE_REALTIME_API_BASE=https://memebattles-production.up.railway.app

# Ably auth can be served by the frontend API gateway.
VITE_ABLY_AUTH_BASE=https://memewarzonefrontend-production.up.railway.app
```

2. Test with a Netlify deploy preview.
3. Confirm browser Network tab uses Railway API URLs, not `/.netlify/functions/api`.
4. Only then remove Netlify Function routing / make Netlify static-only.

## Do not touch during this migration

These were restored and should remain behavior-compatible with `main` unless there is a proven API-contract issue:

- `frontend/src/pages/TokenDetails.tsx`
- `frontend/src/hooks/useCurveTrades.ts`
- `frontend/src/components/token/CurvePriceChart.tsx`
- TokenDetails price math
- Existing on-chain contract reads
