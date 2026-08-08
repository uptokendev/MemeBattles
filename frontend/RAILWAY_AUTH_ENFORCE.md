# Railway: turn on API auth enforce (after War Room smoke)

Dual-auth is already in the API. Flags default **off**. After War Trade Room looks good:

## 1) Secrets on **frontend-api** (and same token on indexer)

```text
RANK_EVENTS_TOKEN=<long-random>
DASHBOARD_OPS_KEY=<long-random>
RECRUITER_PORTAL_SESSION_SECRET=<long-random>
DASHBOARD_ADMIN_EMAILS=you@yourdomain.com
```

Indexer: set the **same** `RANK_EVENTS_TOKEN`.

## 2) Flip one flag at a time (frontend-api)

```text
API_AUTH_ENFORCE_INTERNAL=1
# smoke: Command Center claims still work (claim-record path only)

API_AUTH_ENFORCE_SECURITY_MUTATIONS=1
# smoke: GET /api/security/status still 200; unauth security POST → 401

API_AUTH_ENFORCE_USER_WRITES=1
# smoke: signed upload/follow OK; unsigned → 401

API_AUTH_ENFORCE_ARENA_MUTATIONS=1
# only if postgrad arena mutations are live
```

Rollback: set any flag back to `0`.

## 3) Do not flip until

- War Trade Room shows all coins (bonding + graduated)
- Upload, follow, claims, recruiter portal, LP fees self-read work
