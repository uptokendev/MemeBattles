# Frontend Agent Instructions

## Main rule
Local frontend must look and behave like production unless Patrick explicitly asks for a redesign.

Do not replace production UI to fix data bugs. Patch the data layer first.

## Preserve these surfaces
- `src/pages/TokenDetails.tsx` original UI.
- Home feed.
- Campaign grid.
- Create flow.
- Prepare/draft pages.
- Public profile pages.
- UpVote dialog.
- Comments.
- Wallet connect behavior.

## API base pattern
Production-critical frontend API calls should use:

- `apiFetch()`.
- `apiUrl()`.
- `apiJson()`.

from:

- `src/lib/apiBase.ts`.

Behavior:

- If `VITE_API_BASE_URL` is set, calls go to the absolute API base.
- If not set, calls stay same-origin like `/api/campaigns`.

This supports local Vite proxy and production Railway migration.

## Local dev command
Use normal local development:

```bash
npm run dev:hybrid
```

Expected:

- API: `http://127.0.0.1:3001`.
- Web: `http://127.0.0.1:5173`.
- Vite proxies `/api/*` to `127.0.0.1:3001`.

Do not use `npm run dev:vite` as the default unless the API is already running.

## TokenDetails rules
The Token Details page must remain the original UI.

Correct parity fix:

- Keep original UI.
- Fix data lookup underneath.
- Use `launchpadClientHybrid.ts` behavior where applicable.
- Merge on-chain campaigns with DB/API campaigns.
- Hydrate stale DB logo URLs from contract when needed.

Token chart / trades:

- Token chart uses `/api/activity/trades?campaignAddress=<campaign>&chainId=97`.
- Public profile activity uses `/api/activity/trades?wallet=<wallet>&chainId=97`.
- Do not confuse wallet filtering with campaign filtering.

## Ably local behavior
Local Ably should be non-blocking unless explicitly enabled.

Only enable locally when:

- `ABLY_API_KEY` is set.
- `VITE_ENABLE_LOCAL_ABLY=1` or equivalent auth base is configured.

Do not let missing local Ably secrets break normal frontend debugging.

## Secrets
Never expose server secrets in frontend code or `VITE_*` variables.

Forbidden in browser bundles:

- `DATABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `PRIVATE_KEYS`.
- `ADMIN_TOKENS`.
- `RPC_PRIVATE_URLS`.
- `DIAGNOSTICS_TOKEN`.

## Smoke checklist
Before claiming frontend work is done, consider the affected items from this minimum smoke list:

- Homepage loads.
- Featured campaigns load.
- Campaign grid loads.
- Draft row loads or shows correct empty state.
- Token details page loads.
- Token chart loads.
- Recent trades load.
- Token image loads or valid fallback appears.
- Public profile loads.
- Public profile activity loads.
- UpVote dialog opens.
- Comments load.
- Wallet connect still works.
- No new fatal console errors.

If you cannot run a browser smoke test, say so and give exact steps for Patrick to run.
