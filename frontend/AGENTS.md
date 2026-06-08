# MemeWarzone Agent Guidelines (devpostgrad branch)

This document defines **non-negotiable constraints** for all AI agents working in this repository. These rules exist to protect two critical properties:

1. Local development must continue to work reliably.
2. After every deploy to Netlify, all API calls must continue to work against the real backend.

---

## 1. Environment & Deployment Architecture

### Current Stack
- **Frontend**: Vite + React + TypeScript → deployed to **Netlify** (static)
- **Backend / API**: Node.js (Express-style routes in `/api`) → deployed to **Railway**
- **Database**: **Supabase** (accessed only through the Railway backend — never directly from the browser in production)

### How API Calls Work

| Environment     | How `/api/*` requests are routed                          | Configured in                  |
|-----------------|-----------------------------------------------------------|--------------------------------|
| **Local dev**   | Vite dev server proxies `/api` → local backend            | `vite.config.ts` (proxy)      |
| **Netlify**     | Netlify `_redirects` / `netlify.toml` proxies `/api/*` → Railway | `netlify.toml`                |

**Central API client**: All backend calls should go through:
- `src/lib/apiBase.ts` → `apiUrl()`, `apiFetch()`, `apiJson()`

These functions respect `VITE_API_BASE` / `VITE_API_BASE_URL` and `VITE_REALTIME_API_BASE`.

---

## 2. Strict Rules for All Agents

### Rule 1: Never Hardcode Localhost URLs
- **Forbidden**: Hardcoding `http://localhost`, `http://127.0.0.1`, or any local port in source code for API calls.
- This includes inside `fetch()`, `axios`, WebSocket constructors, Ably config, etc.
- Exception: Only allowed inside `vite.config.ts` for the dev proxy (and clearly marked as dev-only).

### Rule 2: Use the Central API Layer
- Prefer `apiFetch()`, `apiJson()`, and `apiUrl()` from `src/lib/apiBase.ts`.
- If you must write a direct `fetch`, it must still use `apiUrl(path)` to build the URL.
- Never bypass the central layer when calling our own backend.

### Rule 3: Local Build Must Stay Green
Any change must keep `npm run build` and local `npm run dev` working without manual environment hacks.

### Rule 4: Netlify Deploy Must Work End-to-End
After any change:
- All features that call our backend must work when the site is deployed to Netlify.
- This means the Netlify → Railway redirect in `netlify.toml` must continue to cover new routes.

### Rule 5: Environment Variables
- Client-side variables **must** be prefixed with `VITE_`.
- Never commit secrets. Use `.env.example` or documented required variables.
- When adding a new `VITE_*` variable that affects production behavior, document it and consider whether it needs to be set in the Netlify dashboard.

### Rule 6: Netlify Redirects Are Sacred
- The `[[redirects]]` rules in `netlify.toml` are part of the deployment contract.
- Do not remove or weaken the `/api/*` redirect without an explicit, reviewed plan.
- New backend routes added on Railway must be reachable through the existing `/api/*` redirect (they usually are).

### Rule 7: Netlify Is Static Content Only — No Functions Ever
- **Netlify must only ever be used for static frontend assets and the `/api/*` proxy to Railway.**
- **Creating or using Netlify Functions (including `netlify/functions/`, Edge Functions, or any serverless handlers on Netlify) is strictly forbidden.**
- All business logic, data processing, authentication, battle engines, scoring, matchmaking, War Pools, events, and any other backend work **must** live exclusively on Railway (Node.js + Express routes) + Supabase (via the Railway backend only).
- This rule exists because the production backend contract is "Netlify = static + proxy only". Any Netlify Function would bypass the Railway backend, break the architecture, and create maintenance/synchronization hell.
- If a feature seems to "need" a serverless function, the correct solution is always to implement it on Railway instead.

### Rule 7: Supabase Access
- The browser should **not** call Supabase directly in production (keys would be exposed).
- All Supabase interaction should go through the Railway backend.
- If a feature requires direct Supabase client usage, it must be explicitly justified and use properly scoped public keys + RLS.

---

## 3. When Planning Work (Especially for the Architect)

When the **Architect** persona creates a build plan, it **must** explicitly answer these questions for every phase:

- Does this change affect any API calls?
- Will the change work when running `npm run dev` locally?
- Will the change work after a Netlify deploy (i.e. when calls go through the Railway redirect)?
- Are we introducing any new direct `fetch()` calls that bypass `apiBase.ts`?
- Do we need to update `netlify.toml`, `vite.config.ts`, or environment variable documentation?

If the answer to any of the above is uncertain, the plan must include an explicit verification step.

### Post-Grad UI Polish & Consistency Guardrails (devpostgrad branch)
During PostGrad implementation the user accepted many iterative visual, structural, and usability refinements that sit **outside** the original scope in `buildplanclosoutpostgrad.md`.

**Critical:** Before any "cleanup", "simplification", "refactor", or closeout work on these surfaces, read and respect:

**`frontend/.grok/architect-feed/postgrad-out-of-scope-ui-polish-and-consistency.md`**

Key protected items include (but are not limited to):
- War Room constrained `max-w-7xl` width + whole-page scrolling (no internal `max-h` / `overflow-y-auto` on the campaign list)
- Command Center Coins unified "Launched Coins & Drafts" WarRoom-style expandable row list + metric header row + filters
- Image loading robustness (gateway ordering in `resolveImageUri` + per-page logoCache hydration effects)
- Battlefield Matrix Scanner + incoming challenges banner
- Declaration ordering discipline (source memos/hooks before any dependent effects/memos to prevent TDZ crashes)
- Visual parity patterns established between War Room rows, Command Center rows, and Featured cards (where applicable)

These were explicitly user-directed for cohesion and must not be reverted without fresh confirmation.

---

## 4. Recommended Patterns

### Good
```ts
import { apiJson } from "@/lib/apiBase";

const data = await apiJson(`/api/rewards/me`);
```

### Bad (will break on Netlify or locally)
```ts
// Hardcoded local URL
fetch("http://localhost:3001/api/rewards/me")

// Bypasses central routing
fetch(`${import.meta.env.VITE_SOMETHING}/api/xxx`)
```

### Layout & Width Consistency (ContentContainer)
Most focused/tool pages (Command Center, War Room, Create/launchpad, profiles, etc.) should use the shared `ContentContainer` for the consistent `max-w-7xl` reading width that matches the Command Center.

```tsx
import { ContentContainer } from "@/components/layout/ContentContainer";

<ContentContainer className="space-y-3 px-1 pb-10">
  {/* your page content */}
</ContentContainer>
```

**Do not** apply it to experiential/wide pages (homepage, Arena lanes, TokenDetails, Prepare hero, Leagues with cover images, etc.). Those intentionally remain wider or full-bleed.

See `frontend/.grok/architect-feed/postgrad-out-of-scope-ui-polish-and-consistency.md` for the full rationale and protected surfaces.

### Adding a New Backend Route
1. Implement it on the Railway side.
2. Call it using `apiFetch("/api/new-route")`.
3. No change needed in `netlify.toml` (the existing `/api/*` redirect covers it).
4. Test both locally and via a Netlify preview deploy.

---

## 5. Current Known Fragile Areas (as of May 2026)

- The Railway URL is currently **hardcoded** in `netlify.toml`:
  ```toml
  to = "https://memewarzonefrontend-production.up.railway.app/api/:splat"
  ```
  Consider making this configurable via Netlify environment variables in the future.

- `apiBase.ts` has special fallback logic for campaign/token details. Changes here are high-risk.

- Many legacy direct `fetch()` calls still exist. New code should not add to this debt.

---

## 6. For the Phased Build System

When using `/phased-build`:
- The Architect must include a "Local vs Production Verification" section in every build plan.
- Frontend and Backend implementers must use the central `apiBase` utilities.
- The Plan Verifier must explicitly check that no hardcoded localhost URLs were introduced and that `netlify.toml` redirects remain sufficient.

### Preferred Input Location for the Architect

The official private documentation feed for the Architect lives at:

```
.grok/architect-feed/
```

- This folder is **gitignored** and will never be pushed.
- Place well-written `.md` idea files here when you want the Architect to generate a phased plan.
- Preferred invocation: `/phased-build .grok/architect-feed/your-idea.md`
- The Architect persona has been instructed to treat files from this folder as high-quality, scoped input and to always cross-reference the rules in this `AGENTS.md` file.

---

**These rules are mandatory.** Any plan or implementation that violates them should be rejected by the Plan Verifier until corrected.

Last updated: 2026-05-27
