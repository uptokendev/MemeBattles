# Ops cutover — (1) auth enforce & (2) rebrand hosts

**Branch:** `devpostgrad`  
**Date:** 2026-08-08  
**Code status:** dual-auth already in product; enforce flags default **off**. Product rebrand of events/strings largely done; Railway/GitHub/Supabase names still legacy.

Do these in order. Do **not** flip enforce flags until the smoke checklist below is green on the live branch.

---

## 1) Auth enforce (security remaining)

### 1.1 Pre-flight smoke (must be green first)

| Check | Pass if |
| --- | --- |
| Avatar / logo upload | 200 (signed ok) |
| Follow campaign / draft | 200 |
| Command Center claims intent/record | Uses `/api/rewards/me/*` only — no browser `/api/internal/*` |
| Launchpad security status GETs | Still public 200 |
| Recruiter portal | Works with session secret set |
| LP fees self-read `?creator=` | 200 on chain 56/97 |

### 1.2 Railway secrets (frontend-api)

Set if missing:

```text
RANK_EVENTS_TOKEN=<long random>          # or INTERNAL_API_TOKEN
DASHBOARD_OPS_KEY=<long random>          # ops dual-auth
RECRUITER_PORTAL_SESSION_SECRET=<long random>
# Admin allowlist for dashboard JWT paths already used by dashboard
DASHBOARD_ADMIN_EMAILS=you@...
```

Indexer must use the **same** `RANK_EVENTS_TOKEN` for `/internal/*`.

### 1.3 Flip order (one flag at a time)

```text
# After smoke green, on frontend-api:
API_AUTH_ENFORCE_INTERNAL=1
# → retest claims (must stay on claim-record)

API_AUTH_ENFORCE_SECURITY_MUTATIONS=1
# → unauth POST /api/security/creator/.../tier must 401
# → GET /api/security/status still 200

API_AUTH_ENFORCE_USER_WRITES=1
# → unsigned upload/follow/claim must 401; signed 200

API_AUTH_ENFORCE_ARENA_MUTATIONS=1
# → only if postgrad arena mutations are used in prod
```

Rollback any flag to `0` if a product path breaks.

### 1.4 Do not enable yet without FE proof

- User writes require working wallet sign path (already wired for upload/follows/claims).
- Internal require workers/ops to send `Authorization: Bearer <RANK_EVENTS_TOKEN>` or `x-rank-events-token`.

---

## 2) Rebrand cutover (hosts / bucket / GitHub)

### 2.1 Already done in code

- Custom events → `memewarzone:*`
- Auth message brands → MemeWarzone
- Root package name → memewarzone
- Content Studio / OpenAI product API removed

### 2.2 Still operator-owned (do not rename blindly)

| Surface | Current example | Action |
| --- | --- | --- |
| GitHub repo | `uptokendev/MemeBattles` | Rename when ready; update clone URLs |
| Railway frontend-api | `memebattles-frontend-7dcf.up.railway.app` | Prefer **custom domain** first |
| Railway indexer | `memebattles-production-dca0.up.railway.app` | Prefer **custom domain** first |
| Netlify env | `VITE_FRONTEND_API_BASE`, `VITE_TOKEN_API_BASE` | Point at new hosts after DNS |
| Supabase bucket default | `memebattles` | Keep env override; create `memewarzone` bucket then switch `SUPABASE_BUCKET` |

### 2.3 Safe sequence

1. Attach custom domains (e.g. `api.memewar.zone`, `indexer.memewar.zone`) to Railway services.  
2. Update Netlify `VITE_*` bases → redeploy frontend.  
3. Smoke full product on new hosts.  
4. Only then rename Railway services / GitHub (optional cosmetics).  
5. Supabase: create new public bucket → migrate objects → set `SUPABASE_BUCKET` → keep old bucket until verified.

### 2.4 Do not break

- Signed auth messages that already say **MemeWarzone** (already shipped).  
- Dual-read localStorage for status token if any old clients remain.  
- OG edge `prepare-og` path and corp headers.

---

## 3) League notes (2026-08-08)

| Rule | Implementation |
| --- | --- |
| Weekly ≠ monthly | Separate `period` windows on indexer |
| Biggest Hit ranks | **One row per campaign** (max buy in that epoch) |
| Top Earner | Wallet PnL; **own-campaign trades excluded**; other campaigns count |
| Prize pot | Derived live from `curve_trades` league fee share. USD via `BNB_USD_PRICE` env **or** public BNBUSDT spot (see `frontend/api/lib/bnbUsdPrice.js`). |
| Recruiter League | **Strict weekly/monthly epoch only** (`leagueRecruiter.js`) — no all-time carryover. |

---

## 4) Next after this cutover

- ~~Crowd Favorite votes category~~ (done)  
- ~~Recruiter league epoch scoring~~ (done — weekly/monthly window only)  
- ~~League prize pot / USD path~~ (BNB always; USD env or spot)  
- Remove dual-auth legacy open paths (S6) after enforce is stable  
- Optional: pin `BNB_USD_PRICE` on mainnet for ops-controlled settlement estimates  
