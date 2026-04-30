# DEV-FIX-API Route Map

This document tracks the API routes that the frontend expects on the `dev` branch and whether they are currently backed by a real handler or a Phase 1 alignment stub.

## Status labels

- `real`: existing production-style handler.
- `stub`: Phase 1 route-alignment handler that returns JSON-safe empty state or clear not-implemented response.
- `alias`: temporary compatibility route. Prefer the canonical route in new code.
- `internal`: protected ops route requiring an internal bearer token.

## Core existing routes

| Route | Handler | Status | Notes |
|---|---|---:|---|
| `/api/ably/token` | `frontend/api/ably/token.js` | real | Ably auth. |
| `/api/auth/nonce` | `frontend/api/auth/nonce.js` | real | Signature nonce flow. |
| `/api/campaigns` | `frontend/api/campaigns.js` | real | DB/indexer-backed campaign feed. |
| `/api/campaigns/upsert` | `frontend/api/campaigns/upsert.js` | real | Campaign index upsert. |
| `/api/comments` | `frontend/api/comments.js` | real | Token comments. |
| `/api/chat/history` | `frontend/api/chat/history.js` | real | Chat history. |
| `/api/chat/join` | `frontend/api/chat/join.js` | real | Chat join. |
| `/api/chat/realtime-token` | `frontend/api/chat/realtime-token.js` | real | Chat realtime auth. |
| `/api/chat/send` | `frontend/api/chat/send.js` | real | Chat send. |
| `/api/diagnostics` | `frontend/api/diagnostics.js` | real | Private diagnostics. |
| `/api/epochPools` | `frontend/api/epochPools.js` | real | Legacy/league pool view. |
| `/api/featured` | `frontend/api/featured.js` | real | Featured campaigns. Confirm active use before cleanup. |
| `/api/follows/*` | `frontend/api/follows/*.js` | real | Follow system. |
| `/api/league` | `frontend/api/league.js` | real | League + claim actions. |
| `/api/leaguePayouts` | `frontend/api/leaguePayouts.js` | real | League payouts. |
| `/api/leagueRoot` | `frontend/api/leagueRoot.js` | real | League merkle/root state. |
| `/api/profile` | `frontend/api/profile.js` | real | User profile. |
| `/api/profileCabinet` | `frontend/api/profileCabinet.js` | real | League cabinet/profile trophies. |
| `/api/rewards` | `frontend/api/rewards.js` | real | Legacy league rewards. Later rename/refactor to `/api/rewards/league`. |
| `/api/shareCard` | `frontend/api/shareCard.js` | real | Share card rendering. Confirm active use before cleanup. |
| `/api/status` | `frontend/api/status.js` | real | Private telemetry/status. |
| `/api/upload` | `frontend/api/upload.js` | real | Supabase Storage upload. |
| `/api/votes` | `frontend/api/votes.js` | real | Voting. |
| `/api/vote_counts` | `frontend/api/vote_counts.js` | real | Vote counts. |

## Phase 1 alignment routes

These routes now resolve to JSON instead of falling through to `Unknown API route`.

| Route | Status | Notes |
|---|---:|---|
| `/api/rewards/me` | stub | Returns zeroed wallet reward summary. |
| `/api/rewards/me/history` | stub | Returns empty reward history. |
| `/api/rewards/me/claims` | stub | Returns empty claim history. |
| `/api/rewards/me/eligibility` | stub | Returns empty eligibility items. |
| `/api/airdrops/winners` | stub | Returns empty unpublished winners list. |
| `/api/squads` | stub | Returns empty squad leaderboard. |
| `/api/squads/members` | stub | Returns empty squad member list. |
| `/api/squads/:code/summary` | stub | Returns 404 JSON until squad persistence exists. |
| `/api/recruiters` | stub | Returns empty recruiter leaderboard. |
| `/api/recruiters/:code/summary` | stub | Returns 404 JSON until recruiter persistence exists. |
| `/api/recruiters/wallet/:wallet/summary` | stub | Returns 404 JSON until recruiter persistence exists. |
| `/api/recruiters/:code/replacements` | stub | Returns empty replacements. |
| `/api/recruiters/:code/referral/capture` | stub | Acknowledges route but does not persist attribution yet. |
| `/api/attribution/wallet-connect` | stub | Returns unlinked/solo wallet state. |
| `/api/attribution/wallet/:wallet` | stub | Returns unlinked/solo wallet state. |
| `/api/routing/create-authorization` | stub | Returns 503 until real route signer is implemented. |
| `/api/routing/trade-authorization` | stub | Returns 503 until real route signer is implemented. |
| `/api/recruiter-routing/create-authorization` | alias | Temporary alias to `/api/routing/create-authorization`. |
| `/api/recruiter-routing/trade-authorization` | alias | Temporary alias to `/api/routing/trade-authorization`. |
| `/api/recruiter-signup/status` | stub | Returns signup available for non-recruiter wallet. |
| `/api/recruiter-signup/code-availability` | stub | Route wired, persistence not implemented. |
| `/api/recruiter-signup/nonce` | stub | Returns 503 until nonce storage is implemented. |
| `/api/recruiter-signup` | stub | Returns 503 until signup submission is implemented. |

## Internal reward ops routes

The frontend currently calls `/internal/rewards/*` via `buildRealtimeApiUrl`. In the Netlify function these are exposed after the API prefix is stripped, so calls through `/api/internal/rewards/*` are supported by the router. New frontend code should prefer `/api/internal/rewards/*`.

| Route after `/api` prefix strip | Status | Notes |
|---|---:|---|
| `/internal/rewards/publications` | internal stub | GET empty list, POST non-persistent echo. |
| `/internal/rewards/ops/routing` | internal stub | Zeroed routing diagnostics. |
| `/internal/rewards/ops/claim-vault` | internal stub | Empty claim vault posture. |
| `/internal/rewards/ops/epoch-status` | internal stub | Empty epoch status. |
| `/internal/rewards/ops/alerts` | internal stub | Empty alerts. |
| `/internal/rewards/ops/admin-actions` | internal stub | Empty audit trail. |
| `/internal/rewards/airdrops/draws` | internal stub | Empty draw list. |
| `/internal/rewards/airdrops/epochs/:epochId/draws/run` | internal stub | Returns 503 until draw engine exists. |

## Next implementation priorities

1. Replace `/api/routing/create-authorization` and `/api/routing/trade-authorization` stubs with real signed responses.
2. Replace attribution stubs with session/wallet persistence.
3. Replace reward summary/history/claims/eligibility stubs with DB-backed ledger reads.
4. Replace recruiter and squad stubs with DB-backed views.
5. Move frontend internal reward ops calls from `/internal/rewards/*` to `/api/internal/rewards/*` for consistency.
6. Rename/refactor legacy `/api/rewards` to `/api/rewards/league` once callers are updated.
