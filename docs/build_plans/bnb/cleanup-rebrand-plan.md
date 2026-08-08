# Track 1 — Cleanup, AI removal, MemeBattles → MemeWarzone rebrand

**Status:** A1 (Content Studio/OpenAI) done; A3 product/events rebrand largely done. **Ops host/bucket/GitHub cutover pending** — see `docs/build_plans/bnb/ops-auth-enforce-and-rebrand-cutover.md` §2.  
**Branch:** `devpostgrad`  
**Companion:** `docs/build_plans/bnb/security-remediation-plan.md`

---

## 1. Objectives

1. **Remove** product OpenAI / Content Studio / content-planner (and all related public API routes). Grok/xAI agent tooling is out of scope and is not a product dependency.
2. **Rebrand** every remaining MemeBattles / memebattles / MEMEBATTLES product surface to **MemeWarzone** / memewarzone — code, configs, defaults, operator docs, package identity, and (with ops) GitHub / Railway / Supabase names.
3. **Delete or archive** unused API modules and legacy Netlify function hosts that are not production.
4. **Clean** incorrect/stale comments on files we touch (no drive-by rewrites of unrelated history dumps).
5. **Do not break** live Netlify → Railway API, Prepare Mode, create/upload, claims, or auth signatures.

---

## 2. Current inventory (repo truth)

### 2.1 Safe to delete (no FE callers)

| Item | Path / mount |
| --- | --- |
| OpenAI variants API | `frontend/api/content-ai.js` → `/api/content-ai/generate-variants` |
| Content planner CRUD | `frontend/api/content-planner.js` → `/posts*`, `/variants*`, `/calendar`, `/schedules*`, `/content-campaigns*`, `/content-tags` |
| Server mounts | `frontend/api/server.mjs` imports + `router.all(...)` for above |
| Railway secrets | `OPENAI_API_KEY`, `OPENAI_MODEL` (operator remove after code ship) |

Confirmed: no matches under `frontend/src` for content-ai / content-planner / Content Studio nav.

### 2.2 Keep (do not treat as dead)

| Item | Why |
| --- | --- |
| `frontend/api/dev-force/stubs.js` | Misnamed; active rewards/airdrop/squad handlers |
| `frontend/api/postgrad.js` + arena/* | Feature-flagged product surface; security plan hardens it |
| `frontend/netlify/edge-functions/prepare-og.ts` | Live Twitterbot OG path |
| `frontend/netlify/no-functions/` | Forces empty functions dir in prod |
| Content DB tables | Optional later drop; removing API is enough for security/cost |

### 2.3 Rebrand buckets

| Bucket | Examples | Strategy |
| --- | --- | --- |
| Custom events | `memebattles:openWalletModal`, `txConfirmed`, reward unlock events | Atomic FE rename → `memewarzone:*` |
| localStorage / globals | `memebattles_status_token`, `__memebattles_pool` | Rename; optional one-release dual-read |
| Auth message brands | `MemeBattles Comment/Profile/League` (API + FE) | Same PR FE+BE |
| UI / diagnostics | Sponsorship copy, diagnostics HTML title | Rename |
| Demo seeds | `docs.memebattles.gg`, `x.com/_MemeBattles` | memewar.zone / @memewarzone |
| Code defaults | `SUPABASE_BUCKET` fallback `memebattles` / `MemeBattles` | Change default only after bucket exists; prefer env |
| Railway / Netlify | `memebattles-frontend-7dcf`, `memebattles-production-dca0` | Dual-host cutover |
| Root package | `launchit-bonding-curve-tests` | → `memewarzone` |
| GitHub | `uptokendev/MemeBattles` | Operator rename |
| Docs / SQL comments | Historical runbooks | Text replace; keep SEO redirect briefly |

### 2.4 Already on brand (do not regress)

- `frontend/package.json` → `memewarzone-frontend`
- `frontend/index.html` MemeWarzone / app.memewar.zone
- Nav socials: x.com/memewarzone, t.me/memewarzonehq, docs.memewar.zone

---

## 3. Compatibility rules

1. **Signed strings** (`MemeBattles Comment`, etc.) must change on client and server in **one deploy window**.
2. **Custom events** must rename emitters and listeners in **one FE PR**.
3. **Railway host renames** are ops-first: new host or custom domain live → update env + code defaults → then drop old strings.
4. **Supabase bucket**: never change code default until objects are readable from the new bucket or env points at the old one.
5. Do not rename DB table/column identifiers as part of rebrand (comments only).

---

## 4. Phased work

### Phase A0 — Freeze & operator prep

- [ ] Confirm Content Studio not used by any external tool
- [ ] List live Railway service names + Netlify env for API bases
- [ ] Decide: GitHub rename timing; Railway rename vs custom domain; bucket migrate now vs later
- [ ] Decide: archive vs keep postgrad arena modules (default: **keep**, harden in security track)

### Phase A1 — Remove OpenAI / Content Studio (ship first)

**Code**
- Delete `frontend/api/content-ai.js`, `frontend/api/content-planner.js`
- Remove imports and routes from `frontend/api/server.mjs`
- Grep repo for `content-ai`, `content-planner`, `OPENAI_API_KEY` in product code; purge product references
- Optional comment cleanup in `frontend/netlify.toml` if it mentions OpenAI on gateway

**Ops**
- Remove `OPENAI_*` from Railway frontend-api after deploy

**Out of scope**
- Dropping `content_*` SQL tables (later migration if desired)
- Scrubbing `supabase/config.toml` Studio AI key (not product surface)

**Gate**
- [ ] API starts clean
- [ ] No route registration for content paths
- [ ] Healthz 200

### Phase A2 — Unused / legacy host cleanup

- [ ] Confirm production Netlify uses empty functions dir + `/api/*` proxy only
- [ ] Remove or move to `archive/` the unused `frontend/netlify/functions/*` bundle **if** no project still packages them
- [ ] Keep edge prepare-og
- [ ] Remove empty noise dirs only if untracked/unused
- [ ] Do **not** delete arena/postgrad or `stubs.js`

**Gate**
- [ ] Netlify build still proxies API
- [ ] Prepare OG edge still injects for bots

### Phase A3 — Product code rebrand (atomic)

**Frontend `src/`**
- Rename all `memebattles:` custom events and listeners to `memewarzone:`
- Rename localStorage keys; optional dual-read old key for one release
- UI strings (e.g. SponsorshipApplication)
- Demo/default URLs in `draftPromotion.ts`
- Comments that still say MemeBattles

**API**
- `comments.js`, `profile.js`, `league.js` message brand lines → `MemeWarzone …`
- Matching FE sign message builders
- Diagnostics title/copy
- Upload/diagnostics bucket default → env-first; new default `memewarzone` only after ops ready
- `server/db.js` global rename

**Root**
- `package.json` name → `memewarzone`
- `.env.example` headers and commented hosts

**Gate**
- [ ] `rg memebattles frontend/src frontend/api` → only intentional dual-read fallbacks (if any)
- [ ] FE production build
- [ ] Smoke: open wallet modal via event, comment sign-in, profile update, league claim event refresh

### Phase A4 — Deploy config + docs

- [ ] `netlify.toml` / `frontend/netlify.toml` / prepare-og Railway defaults → new hostnames (after dual-host)
- [ ] Indexer CORS: ensure `memewar*` hosts allowed; document when to drop `memebattles` host substring allow
- [ ] Docs under `docs/`, `docs-site`: product name pass
- [ ] Keep short-lived redirect `what-is-memebattles` → introduction if needed for SEO
- [ ] SQL file header comments only

**Gate**
- [ ] Grep production config paths clean or dual-host documented
- [ ] Docs site builds

### Phase A5 — Operator renames (checklist, not all code)

1. GitHub: rename repo to MemeWarzone; update remotes and CI
2. Railway: custom domains preferred (`api.…`, indexer host); or rename services and update Netlify + local env
3. Supabase: create `memewarzone` bucket (public read as needed), migrate objects, set `SUPABASE_BUCKET`
4. Verify Netlify env: `VITE_*` / proxy targets
5. Invalidate CDN caches if asset URLs change

---

## 5. Explicit non-goals

- Renaming on-chain contract names or historical deployment artifact JSON keys that are content-addressed
- Rewriting entire `docs/superpowers` history beyond a light name pass
- Replacing OpenAI with a product Grok API (not requested)
- Dropping postgrad arena product (unless you decide archive)

---

## 6. Suggested PR split

| PR | Scope |
| --- | --- |
| C1 | A1 content-ai + content-planner removal |
| C2 | A2 legacy Netlify functions (if confirmed unused) |
| C3 | A3 events + auth brands + UI (FE+API) |
| C4 | A4 docs + config defaults after ops dual-host |
| C5 | Root package rename + `.env.example` polish |

---

## 7. Acceptance checklist

- [ ] No product OpenAI route or dependency
- [ ] No Content Studio API surface
- [ ] User-visible brand is MemeWarzone
- [ ] Auth/sign messages consistent FE/BE
- [ ] Custom events `memewarzone:*`
- [ ] Package/docs identity aligned
- [ ] Host/bucket cutover complete or dual-host documented
- [ ] Smoke: home, create/upload, prepare, profile, comments, claims shell, war room load
