# Track 2 — Security audit remediation (no FE/BE breakage)

**Status:** Dual-auth shipped on `devpostgrad` (S0–S5). **Enforce flags still off by default.** Cutover steps: `docs/build_plans/bnb/ops-auth-enforce-and-rebrand-cutover.md`.  
**Branch:** `devpostgrad`  
**Source audit:** session security audit (Critical/High/Medium)  
**Companion:** `docs/build_plans/bnb/cleanup-rebrand-plan.md` (remove Content Studio first → drops C4 surface)

---

## 1. Objectives

1. Close all **Critical** and **High** findings from the HTTP/API security audit without breaking launchpad, claims, prepare, upload, or indexer ops.
2. Reuse existing auth primitives; prefer phased dual-auth → enforce → remove legacy.
3. Keep **public** product reads and route-authority signing model intact.
4. Ensure the **browser never depends on unauthenticated `/api/internal/*`**.

---

## 2. Design principles

### 2.1 Reuse these mechanisms

| Mechanism | Where | Use for |
| --- | --- | --- |
| Supabase admin Bearer | `frontend/api/dashboard/_auth.js` | Security mutations, sensitive admin GETs, arena ops |
| Wallet action auth | Pattern from `dev-force/draft-auth.js` | Upload, follows, claims, self upsert, arena user actions |
| Internal token | Indexer `requireInternalAuth` / `RANK_EVENTS_TOKEN` | `/api/internal/*`, service-to-service |
| Ops key | `DASHBOARD_OPS_KEY` / `OPS_READ_KEY` | Automation dual-auth (harvest, scripts) |

### 2.2 Stay public (product)

- `GET /api/security/status`
- `GET /api/security/creator/:wallet/profile`
- `GET /api/security/creator/:wallet/launch-eligibility` (and similar preflight GETs)
- `POST /api/routing/create-authorization` + trade-authorization (server routeAuthority + preflight; **not** admin-gated)
- Ably token for **subscribe** scopes
- Arena / rewards / follows **GETs**

### 2.3 Compatibility

- Env flags default **off** until FE for that class is deployed, then **on**:
  - `API_AUTH_ENFORCE_INTERNAL`
  - `API_AUTH_ENFORCE_SECURITY_MUTATIONS`
  - `API_AUTH_ENFORCE_USER_WRITES`
  - `API_AUTH_ENFORCE_ARENA_MUTATIONS`
- Internal routes: when enforce on and token missing → **503 fail-closed** (indexer parity), never open-by-misconfig.
- Prefer wallet credentials in **JSON body** (draft style) to avoid CORS/proxy header churn.
- Ensure `railwayProxy.js` continues to forward `authorization`, `x-rank-events-token`, `x-ops-key`.

### 2.4 Target end-state

```
Public:        security eligibility GETs, routing status, ably subscribe,
               follows/rewards/arena GETs

Wallet signed: upload, follows POST, claim-intent, claim-record,
               campaigns upsert (self), arena user mutations

Admin Bearer:  security mutations (+ sensitive lists), arena ops, dashboard

Ops/internal:  /api/internal/*, indexer /internal/*

Server signer: routing create/trade authorization (+ rate limit)
```

---

## 3. Critical call-site constraint (claims)

`frontend/src/lib/rewardDistributor.ts` today:

- `POST /api/rewards/me/claim-intent` (wallet string only)
- Claim complete/fail → **`POST /api/internal/rewards/batches`** (no auth)

**If internal is locked before FE migrates to `/api/rewards/me/claim-record`, Command Center claims break.**

Order is mandatory: **FE claim-record first → then enforce internal.**

---

## 4. Phased implementation

### Phase S0 — Shared helpers (no enforcement)

**Work**
- Add `frontend/api/lib/requireInternalAuth.js` (Bearer or `x-rank-events-token`; optional `INTERNAL_API_TOKEN` alias)
- Add `requireWalletActionAuth` generalized from draft-auth (shared actions registry)
- Document env flags in `.env.example`
- CORS/proxy header audit only

**Gate**
- [ ] Helpers unit-testable / import clean
- [ ] No behavior change in production paths

### Phase S1 — Claims path + internal lock (P0)

**S1a FE (ship first)**
- Change `recordRewardClaimTx` / `recordRewardClaimFailure` to use `/api/rewards/me/claim-record` (gateway), not `/api/internal/rewards/batches`
- Keep request shape compatible with existing claim-record handler
- Update any docs (`docs/rewards/launch-claim-handoff.md`)

**S1b BE**
- Dual-auth on all `/api/internal/*` in `server.mjs` handlers (`reward-batch-ops.js`, stubs, etc.)
- When `API_AUTH_ENFORCE_INTERNAL=1`: require token; missing env → 503
- Workers/scripts: add token header

**Deploy order**
1. FE S1a  
2. BE dual-auth (still accept legacy if flag off)  
3. Set `RANK_EVENTS_TOKEN` / enforce on staging, then prod  
4. Confirm no browser traffic to internal  

**Gate**
- [ ] Testnet claim intent → wallet tx → claim-record updates ledger
- [ ] Unauth internal POST → 401 when enforced
- [ ] Worker with token still publishes/pauses batches
- [ ] Solana still 409 `SOLANA_CLAIMS_DISABLED`

### Phase S2 — Security control plane

**Mutations (admin or ops-key)**
- Creator tier / restrict / manual-review
- Cluster / wallet restrict
- Contracts + Solana action queue (incl. pause-campaign)
- Recruiter payouts admin (if mounted)
- Indexer `/api/security/rewards/*` POST

**Sensitive GETs (admin)**
- Audit log, full creators/clusters/manual-review queues, admin rewards overview if exposed publicly

**Public GETs (unchanged)**
- status, creator profile, launch-eligibility

**Audit integrity**
- Actor identity from verified Supabase admin email, not client `x-admin-email`

**Tooling**
- Update `frontend/scripts/check-security-api-smoke.mjs` for auth on POSTs

**Gate**
- [ ] Launchpad create preflight still works without admin session
- [ ] Unauth security POST → 401/403 when enforced
- [ ] Admin Bearer POST succeeds; audit row has real admin identity

### Phase S3 — User writes (wallet auth)

| Endpoint | Action name (example) | FE files |
| --- | --- | --- |
| claim-intent / claim-record | `claim_intent`, `claim_record` | `rewardDistributor.ts`, Command Center claims |
| follows POST | `follow_user`, `follow_campaign` | `followApi.ts` |
| upload | `upload_avatar`, `upload_logo` | Create, DraftPromotionSetup, CommandCenterRecruiter, useEditableProfile |
| campaigns/upsert | `campaign_upsert` or internal token | `launchpadClient.ts` (best-effort; indexer may own later) |

**Optional follow-up (same phase or S3.1)**
- claim-record: verify `txHash` on-chain before status `claimed`
- topaz-trades POST: wallet auth or receipt verify

**Dual-auth**
- Flag `API_AUTH_ENFORCE_USER_WRITES=0` until FE signs everywhere, then flip.

**Gate**
- [ ] Create logo upload + avatar upload work with signature
- [ ] Follow/unfollow cannot spoof another wallet
- [ ] Claim-intent for another wallet’s IDs fails
- [ ] Spoofed campaigns upsert without creator proof fails when enforced

### Phase S4 — Arena mutations

- User mutations (open battle, war-pool support): wallet auth
- Ops mutations (transition, league advance, rebalance): admin/ops
- GETs remain public
- Prefer fail-closed on POSTs even when UI flags are off

**Gate**
- [ ] With postgrad UI off: no user impact
- [ ] Unauth arena POST → 401 when enforced

### Phase S5 — Soft hardening (High/Medium)

| Item | Fix |
| --- | --- |
| Ably live publish | Require chat session or wallet for publish capability; rate-limit token mint |
| Route-auth open mint | Rate limit by IP + wallet; metrics; optional later ownership proof (not blocking) |
| Server harvest | Require ops key whenever server PK is used; no open chain-97 harvest if key present |
| Diagnostics / opsKey in query | Prefer headers; document deprecation of query secrets |
| Recruiter session secret | Fail closed if unset outside `NODE_ENV=development` (remove hard-coded default in prod) |
| Global rate limit | Lightweight IP limit on upload, auth mints, ably |
| God-token hygiene | Document rotation; optional split `INTERNAL_API_TOKEN` vs rank events later |

**Gate**
- [ ] League/token ably subscribe still works
- [ ] Live channel invalid names still 400
- [ ] Create/trade authorization still succeeds for eligible wallets
- [ ] Harvest automation still works with ops key

### Phase S6 — Remove dual-auth branches

- [ ] Delete legacy unauthenticated write paths
- [ ] Grep: no browser `/api/internal/` fetches
- [ ] All enforce flags on in prod
- [ ] Security smoke + claim smoke green
- [ ] Short re-audit checklist signed off

---

## 5. Audit coverage map

| Finding | Phase |
| --- | --- |
| C1 Unauth security mutations | S2 |
| C2 Unauth internal rewards | S1 |
| C3 Claim without wallet proof | S1 + S3 |
| C4 Content AI / planner | Track 1 A1 (remove) |
| C5 Campaigns upsert | S3 |
| C6 Indexer security rewards ops | S2 |
| C7 Admin rewards reads | S2 |
| H1 Public upload | S3 |
| H2 Route-auth without ownership | S5 (rate limit) |
| H3 Arena unauth | S4 |
| H4 Harvest open path | S5 |
| H5 RANK_EVENTS god-token | S5 hygiene |
| H6 Topaz trade inject | S3 optional |
| H7 Follows forgery | S3 |
| H8 Secrets in query string | S5 |
| M1 Ably live publish | S5 |
| M2 Default session secret | S5 |
| M3 No global rate limit | S5 |
| M4–M8 CORS / body size / timing-safe | S5 as time allows |

---

## 6. Suggested PR split

| PR | Scope | Break risk if mis-ordered |
| --- | --- | --- |
| S0 | Shared auth helpers | None |
| S1a | FE claim-record only | Low |
| S1b | Internal dual-auth + enforce docs | High if before S1a |
| S2 | Security admin gates + smoke | Low (no product POST UI) |
| S3a | FE wallet auth for claims/follows/upload | Medium |
| S3b | BE enforce user writes | High if before S3a |
| S4 | Arena | Low while flags off |
| S5 | Soft hardening | Medium (ably/rate limits) |
| S6 | Remove dual-auth | Medium — only after metrics clean |

---

## 7. Regression smoke (every phase)

- [ ] `GET /healthz` gateway + indexer
- [ ] Launchpad: security status + creator profile (no admin cookie)
- [ ] Create / draft logo upload
- [ ] Routing create-authorization + deploy path
- [ ] Token details + war room load
- [ ] Command Center: coins (client harvest), claims
- [ ] Profile edit + avatar
- [ ] Follow campaign/user
- [ ] Indexer internal with token
- [ ] Netlify proxy preserves Authorization / ops headers when used

---

## 8. Explicit non-goals

- Replacing routeAuthority server signing with full SIWE for every trade (UX-breaking)
- Full WAF / enterprise IAM product
- On-chain contract changes for PermanentLpLocker (already “anyone can harvest”)
- External pen-test engagement (optional later)

---

## 9. Acceptance (track done)

- [ ] All Critical audit items closed or accepted with documented residual
- [ ] All High items closed or residual accepted (route-auth residual = rate-limited open mint)
- [ ] No unauthenticated privileged write on public gateway
- [ ] Browser claims use public claim-record + wallet auth
- [ ] Launchpad and Command Center smoke green on testnet
- [ ] Dual-auth removed; enforce flags permanent
