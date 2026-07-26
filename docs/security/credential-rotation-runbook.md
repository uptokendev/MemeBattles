# MemeWarzone Credential Rotation Runbook

## Purpose

This runbook coordinates credential rotation across MemeBattles, MemeWarzone services, and the web dashboard without breaking the shared Supabase database or either active application branch.

Never paste secret values into GitHub issues, pull requests, chat, documentation, screenshots, or logs. Record only the variable name, owning service, rotation status, and verification result.

## Rotation order

1. Create the replacement credential in the provider.
2. Add it to every dependent deployment and local environment.
3. Redeploy or restart dependent services.
4. Verify health and one real read/write operation.
5. Revoke the previous credential.
6. Record completion using variable names only.

Do not revoke an old credential before all dependent services have been updated and verified.

## Priority 0: browser-exposed tokens

The web dashboard currently reads security-sensitive values through Vite variables. Any `VITE_*` value is bundled into browser JavaScript and must be treated as public.

- `VITE_DIAGNOSTICS_TOKEN`
- `VITE_PROMOTORS_TOKEN`

Required remediation:

1. Replace token-in-query-string dashboard requests with authenticated server endpoints.
2. Verify the signed-in Supabase user server-side.
3. Check explicit MemeWarzone admin authorization server-side.
4. Remove both variables from dashboard client code and deployment configuration.
5. Rotate the backend diagnostics/promotor tokens after the new endpoints are deployed.

## Priority 1: database and Supabase

- `DATABASE_URL`
- Supabase database password
- `SUPABASE_SERVICE_ROLE_KEY` or current Supabase secret key
- Supabase JWT signing secrets, only when a planned auth migration supports safe rotation

Dependencies to verify:

- Railway API service
- BNB indexer
- Solana indexer
- reward workers
- notification workers
- scheduled jobs
- Netlify functions
- local development environments

Do not rotate the database password until every active service using the current `postgres` connection has been identified.

## Priority 1: blockchain signing credentials

- deployer private keys
- route authority private keys
- reward payout signer keys
- recruiter payout signer keys
- treasury operator keys
- oracle or root-poster keys

Before retiring a blockchain key:

1. Create a replacement wallet using an approved secure wallet process.
2. Transfer required on-chain roles to the replacement address.
3. Remove roles from the old address.
4. Move funds where applicable.
5. Confirm the old address has no remaining authority.

## Priority 2: service credentials

- RPC provider API keys
- Ably API keys
- Discord bot token
- Telegram bot token
- X OAuth credentials
- email provider credentials
- webhook signing secrets
- admin session secrets
- recruiter session secrets
- diagnostics tokens
- internal worker tokens

## Environment locations

Secrets may exist only in:

- local ignored `.env` files;
- Railway environment variables;
- Netlify environment variables;
- Supabase managed secret/configuration stores;
- GitHub Actions encrypted secrets.

Secrets must not exist in:

- tracked `.env` files;
- `.env.example` files;
- source code;
- deployment JSON manifests;
- documentation;
- screenshots;
- frontend `VITE_*` variables;
- query strings.

## Verification matrix

For each rotated variable, record privately:

| Field | Required value |
|---|---|
| Variable name | Name only |
| Provider | Supabase, Railway, Netlify, RPC provider, etc. |
| Dependent services | Service names only |
| Replacement created | Yes/No |
| Deployments updated | Yes/No |
| Smoke test passed | Yes/No |
| Previous credential revoked | Yes/No |
| Completed by/date | Operator and date |

## Required smoke tests

After each rotation group:

- public campaigns endpoint responds;
- one indexed chain event reaches the database;
- one authenticated wallet flow succeeds;
- dashboard login succeeds;
- reward worker can read required data;
- notification worker can claim and update its batch;
- storage upload succeeds through the approved server route;
- no service logs authentication or permission errors.

## Repository history cleanup gate

History rewriting begins only after all credentials found in historical commits have been rotated or positively confirmed inactive.

After rewriting history:

- force-push approved branches and tags;
- remove stale remote branches containing old blobs;
- require every developer to re-clone;
- rerun Gitleaks over full history;
- verify no tracked environment files remain.