# Railway: API auth enforce (go-live)

Dual-auth is in the API. On **Railway / production**, unset flags now **default to ON**.
Only an explicit `0` / `false` / `off` turns a class back off (rollback).

## 1) Secrets on **frontend-api** (and same token on indexer)

```text
RANK_EVENTS_TOKEN=<long-random>
DASHBOARD_OPS_KEY=<long-random>
RECRUITER_PORTAL_SESSION_SECRET=<long-random>
DASHBOARD_ADMIN_EMAILS=you@yourdomain.com
```

Indexer: set the **same** `RANK_EVENTS_TOKEN`.

## 2) Set all enforce flags to **1** (recommended go-live)

If any variable is still `0` in Railway Variables, change it:

```text
API_AUTH_ENFORCE_INTERNAL=1
API_AUTH_ENFORCE_SECURITY_MUTATIONS=1
API_AUTH_ENFORCE_USER_WRITES=1
API_AUTH_ENFORCE_ARENA_MUTATIONS=1
```

Or **delete** the variable entirely so production default ON applies after redeploy.

After boot, frontend-api logs should include:

```text
[api/auth] enforce snapshot {"INTERNAL":true,"SECURITY_MUTATIONS":true,"USER_WRITES":true,"ARENA_MUTATIONS":true,...}
```

## 3) Smoke after flip

| Flag | Pass if |
| --- | --- |
| INTERNAL | Browser claims use `/api/rewards/me/*` only; unauth `/api/internal/*` → 401 |
| SECURITY_MUTATIONS | `GET /api/security/status` still 200; unauth security POST → 401 |
| USER_WRITES | Signed upload/follow/claim OK; unsigned → 401 |
| ARENA_MUTATIONS | Unauth arena mutations → 401 (if arena enabled) |

## 4) Rollback one class

```text
API_AUTH_ENFORCE_USER_WRITES=0
```

Redeploy / restart frontend-api.
