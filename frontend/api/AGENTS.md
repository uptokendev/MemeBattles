# Frontend API Gateway Agent Instructions

## Scope
This folder owns the local Express API gateway and API routes used by the frontend during hybrid development.

## Architecture target
The production target is:

- Netlify serves static frontend only.
- Railway serves `/api/*`, indexer, workers, auth/signature routes, uploads, writes, rewards, claims, admin logic, and Ably token issuing.
- Supabase is the source-of-truth database/storage, with safe public views/RPC only later.

## Local gateway rules
Local API runs on:

- `http://127.0.0.1:3001`.

Health routes:

- `/healthz` should return `{ "ok": true }`.
- `/health` should validate DB where applicable.

Vite should proxy `/api/*` to `127.0.0.1:3001`.

## Do not move private logic to frontend
Keep these server-side:

- Auth nonce/signature verification.
- Profile POST/write routes.
- Uploads.
- Chat send.
- Comment post.
- Voting/upvote writes.
- Reward claims.
- Admin diagnostics.
- Anti-abuse logic.
- Epoch processing.
- Airdrop selection.
- Squad/recruiter calculations.
- Ably token issuing.

## Environment safety
Never leak:

- Database URLs.
- Service role keys.
- Private RPC URLs.
- Admin tokens.
- Private keys.

## API compatibility
API migration should be invisible to users.

If changing route behavior:

- Preserve current response shape or update every consumer.
- Add route tests where available.
- Include fallback/empty states for missing indexed data.
- Keep local behavior close to production Railway behavior.
