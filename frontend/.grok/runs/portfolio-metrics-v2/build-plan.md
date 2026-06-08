# Build Plan: Portfolio Metrics Cards (Command Center + Public Profile)

**Idea Source**: `frontend/.grok/architect-feed/add-portfolio-metrics-command-center-public-profile.md`  
**Date**: 2026-05-27  
**Status**: Draft for review  
**Architect**: Grok (phased-build persona)  
**Key Constraints (from AGENTS.md + idea)**: Improve (do not replace) `useProfileBalances.ts` — no new top-level hook such as `usePortfolioMetrics`. Extract pure functions for backend reuse. Public profiles use server-side ~1h TTL holdings cache + on-demand refresh. Use existing `getReadProvider()` pattern (via modeled server equivalent) for server on-chain reads. Expose `created_at` (already in DB). Command Center: freshest data via improved hook. Public Profile: cached backend data. Placement: CC Overview (replace/de-emphasize large Ranking + Reputation cards), Public Profile (directly under main PFP/bio/rank header card). Maximize reuse of `CommandCenterContext.tsx`, `launchpadClient`, `warRoomMetrics.ts` patterns, `profileApi.ts`, `apiBase.ts`, existing RPC/env resolution. All client API calls via `apiJson`/`apiFetch` from `src/lib/apiBase.ts`. No hardcoded localhost. No `netlify.toml` changes.

## Overview
This plan delivers four compact Pump.fun-style portfolio metric cards (TOTAL VALUE, TOP HOLDING, COINS, WALLET AGE) on two surfaces while strictly following the "improve existing" directive. 

The work centers on:
- Improving `src/hooks/profile/useProfileBalances.ts` (and its consumer `src/components/command-center/CommandCenterContext.tsx`) to derive metrics client-side for the owner (Command Center) using fresh on-chain reads + existing `useBnbUsdPrice.ts` + `fetchCampaignSummary` data.
- Extracting pure, reusable calculation functions into a new dedicated module (frontend + mirrored for backend).
- Implementing a thin presentational grid component for the four cards.
- Adding a backend endpoint that performs equivalent holdings discovery + derivation but with simple in-memory caching (globalThis Map, ~1h TTL) + `?forceRefresh=1` on-demand path. Server reads follow the exact configuration and safety choices from `src/lib/readProvider.ts` (via a new `api/lib/getServerReadProvider.js` modeled 1:1 on it, using the RPC resolution precedent from `api/dev-fix/route-auth.js` and `api/league.js`).
- Exposing `created_at` via the existing `/api/profile` path (primary source for wallet age).
- Wiring: CC Overview de-emphasizes the heavy Ranking/Reputation cards in favor of the metrics grid (Balances and League Cabinet remain). Public Profile inserts the same grid directly under the primary header section.

All phases are small, independently verifiable, and include the mandatory Local vs Production Impact subsection (per AGENTS.md §3 and persona rules). No new top-level hooks. No direct `fetch` bypassing `apiBase.ts`. Existing `/api/*` Netlify redirect is sufficient for the new route.

**Out of Scope** (per idea document): Full historical performance/charts, non-launchpad tokens, real-time WS prices, heavy new indexer, changes to detailed Balances list in Command Center Coins or Overview "Balances" card, new DB tables for cache (in-memory is sufficient).

**Success Criteria** (overall): 
- Four cards render with correct values in both locations using the specified data sources (fresh hook vs cached endpoint).
- `created_at` flows through profile responses and is used for age.
- Cache strategy demonstrably reduces repeated RPCs for public views (TTL + force path verified).
- 100% AGENTS.md compliance (verified via checklist).
- Thin component reused in both surfaces; pure fns shared in spirit between client and server.

## Phases

### Phase 1: Expose `created_at` from `user_profiles` (and update profile contract)
**Goal**: Make the existing DB column available in the public profile payload so wallet age can be computed consistently without new queries or fallbacks. This is a pure additive improvement with zero risk to existing callers.

**Frontend Work**:
- Improve `src/lib/profileApi.ts`: add `createdAt?: string | null` to `UserProfile` type; include it in the normalization inside `fetchUserProfile`.
- (No other frontend changes required in this phase; consumers will pick it up automatically.)

**Backend/Contract Work**:
- Improve `api/profile.js`: in the GET handler SELECT, add `created_at AS "createdAt"` to the `user_profiles` projection. Pass it through in the response object (including the fallback rank-only path). No INSERT/POST changes needed (column uses DB default).

**Deliverables**:
- Updated `src/lib/profileApi.ts` (type + mapping)
- Updated `api/profile.js` (SELECT + response assembly)
- No new files

**Dependencies**: None (column already exists per deep research + idea)

**Estimated Complexity**: Low

#### Local vs Production Impact
- Will this work with `npm run dev` locally? Yes — Vite proxy routes `/api/profile` to local backend (see `vite.config.ts`). The improved SELECT runs against the same Supabase instance used in prod.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? Yes — existing `[[redirects]]` rule for `/api/*` in `netlify.toml` covers `/api/profile` with no modification required.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No. All profile reads continue to flow through `fetchUserProfile` (which already uses `apiUrl` internally; future callers should prefer `apiJson`).
- Do we need to touch `netlify.toml` or environment variable handling? No. No new `VITE_*` vars. No schema migration (additive column exposure only).

**Measurable Success Criteria**:
- `curl -s "http://127.0.0.1:3001/api/profile?chainId=56&address=0x..." | jq '.profile.createdAt'` returns a valid ISO timestamp (or null) on local backend.
- In browser devtools on `/profile/0x...` (public), the response for `/api/profile` contains `createdAt` in the profile object.
- Existing profile features (Command Center hero, PublicProfile header, RankBadgeCard, etc.) continue to function with no console errors or missing data.
- `git diff` shows only the two files above changed (no source deletions).

### Phase 2: Extract pure calculation functions and improve `useProfileBalances.ts` + `CommandCenterContext.tsx`
**Goal**: Extend the existing balances hook (per explicit directive: "Improve the existing `useProfileBalances.ts`. Do not create a new top-level hook like usePortfolioMetrics.") to also return derived portfolio metrics for the Command Center (freshest data path). Extract the calculation logic as pure functions so the identical derivation can be reused (mirrored) on the backend in Phase 5.

**Frontend Work**:
- Create (new) `src/lib/profile/portfolioCalculations.ts` containing pure functions extracted/adapted from `useProfileBalances.ts` logic + `warRoomMetrics.ts` + `FeaturedCampaigns` patterns:
  - `parseNativeBalanceBnb(nativeBalance: string): number`
  - `calculateHoldingValueUsd(balanceFormatted: string, marketCapBnb: number | undefined, bnbUsd: number): number`
  - `selectTopHolding(holdings: Array<{ticker: string, valueUsd: number}>): {ticker: string, percentOfPortfolio: number, valueUsd: number} | null`
  - `derivePortfolioMetrics(params: { nativeBnb: number; tokenHoldingsWithValues: Array<...>; bnbUsd: number; createdAt: string | null | undefined }): PortfolioMetrics`
  - `formatWalletAge(createdAt?: string | null): string`
  - Type `PortfolioMetrics = { totalValueUsd: number | null; topHolding: ... | null; coinsCount: number; walletAge: string }`
- Improve `src/hooks/profile/useProfileBalances.ts`: 
  - Import and call `useBnbUsdPrice` (top of hook, enabled when address present).
  - Enhance the existing effect (or add post-processing) to also compute metrics using the already-fetched `summaries` (which contain `stats.marketCapBnb` and `metrics.currentPrice`) + raw `tokenBalances` + native + bnbUsd + profile createdAt (passed in or via context later).
  - Return additional fields: `portfolioMetrics: PortfolioMetrics | null`, `loadingPortfolioMetrics: boolean` (can reuse `loadingBalances` for simplicity).
  - Keep all existing return values unchanged (non-breaking).
- Improve `src/components/command-center/CommandCenterContext.tsx`:
  - Add `portfolioMetrics` and `loadingPortfolioMetrics` to the `CommandCenterData` type (sourced from the hook).
  - Destructure the new values from the `useProfileBalances` call.
  - Include them in the `value` memo and dependency array.
  - Re-export the `PortfolioMetrics` type from the calculations module for consumers.

**Backend/Contract Work**: None in this phase (pure frontend derivation + extraction for later reuse).

**Deliverables**:
- New: `src/lib/profile/portfolioCalculations.ts` (pure fns + types; heavily commented with "Keep in sync with api/lib/portfolioCalculations.js")
- Improved: `src/hooks/profile/useProfileBalances.ts` (added derivation + bnb price integration)
- Improved: `src/components/command-center/CommandCenterContext.tsx` (surface new fields; update type)

**Dependencies**: Phase 1 (for `createdAt` availability in profile objects consumed by CC)

**Estimated Complexity**: Medium (careful not to change hook contract or introduce new top-level hook)

#### Local vs Production Impact
- Will this work with `npm run dev` locally? Yes — entirely client-side React hook + existing `useBnbUsdPrice` (CoinGecko) + `useLaunchpad` data already used in CC. No backend calls added.
- Will this work after a Netlify deploy? Yes — identical bundle behavior; no API surface change.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No. `useBnbUsdPrice` uses its own external Coingecko call (pre-existing pattern); all MemeWarzone data continues through launchpadClient (which uses `apiFetch` internally for campaigns).
- Do we need to touch `netlify.toml` or environment variable handling? No. No new VITE_ vars (reuses existing BNB price polling flag if set).

**Measurable Success Criteria**:
- `useProfileBalances` return type (via context) now includes `portfolioMetrics` with exactly the four keys and `topHolding` shape defined in the new calculations module. No `usePortfolioMetrics` hook exists anywhere.
- In Command Center (local dev), the four metric values update when the wallet or viewed address changes, using live `tokenBalances` + summaries + BNB price.
- Pure functions in `portfolioCalculations.ts` are unit-testable in isolation (no side effects, no React).
- `CommandCenterContext.tsx` compiles and CC pages load without runtime errors or lost existing data (nativeBalance, tokenBalances, etc. still present).
- Console shows no duplicate hook calls or infinite loops.

### Phase 3: Create thin reusable component for the four cards
**Goal**: Deliver a single, thin, presentational component that both surfaces can reuse verbatim, guaranteeing visual and behavioral consistency. Follows existing HUD card patterns (`CommandCenterCard.tsx`, PublicProfile section classes, `warRoomMetrics.ts` formatters).

**Frontend Work**:
- Create (new) `src/components/profile/PortfolioMetricsGrid.tsx` (or `src/components/shared/PortfolioMetricsGrid.tsx` — recommend under profile/ for co-location with other profile primitives).
  - Thin API: `export function PortfolioMetricsGrid({ metrics, loading, onRefresh, className, variant = 'default' }: Props)`
  - Props: `metrics: PortfolioMetrics | null`, `loading?: boolean`, `onRefresh?: () => void` (for public owner refresh), `variant?: 'command-center' | 'public'`
  - Internals: responsive grid (1-col mobile, 2-col sm, 4-col md+); four cards using consistent classes (`rounded-2xl border border-border/50 bg-card/35 p-4`, `font-retro`, accent highlights for Total Value / Top Holding).
  - Each card: uppercase retro label (TOTAL VALUE / TOP HOLDING / COINS / WALLET AGE), large prominent value, subtle sub-detail (e.g. "12.4% of portfolio" for top, formatted age).
  - Graceful states: loading skeletons or "—", error/empty handled by parent.
  - No data fetching, no context usage — pure presentational (max reuse).
- Optionally export a smaller `PortfolioMetricCard` primitive if the grid is just a layout wrapper (recommended for future flexibility).
- Add inline JSDoc + usage example in the file.

**Backend/Contract Work**: None.

**Deliverables**:
- New: `src/components/profile/PortfolioMetricsGrid.tsx` (and any sub-component)
- No changes to existing components yet

**Dependencies**: Phase 2 (reuses `PortfolioMetrics` type)

**Estimated Complexity**: Low-Medium (visual fidelity to idea + HUD aesthetic)

#### Local vs Production Impact
- Will this work with `npm run dev` locally? Yes — pure UI component; can be tested with hardcoded props in Storybook or a temp test page.
- Will this work after a Netlify deploy? Yes — static build only.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No (component performs zero fetches).
- Do we need to touch `netlify.toml` or environment variable handling? No.

**Measurable Success Criteria**:
- File exists at the exact recommended path and exports the documented component with the exact prop interface.
- When rendered with sample metrics data (e.g. via a one-off test in a CC page), the four cards appear in a responsive grid with correct labels and values, no console errors, and matching dark HUD styling.
- Component contains zero `useEffect`, zero `fetch`, zero context hooks (verifiable by code inspection).
- Screenshot or manual render test shows Total Value and Top Holding visually prominent.

### Phase 4: Integrate into Command Center Overview (replace/de-emphasize Ranking + Reputation)
**Goal**: Surface the freshest portfolio metrics (via the improved hook + context) in the owner's private view. De-emphasize the large Ranking/Reputation cards per stakeholder direction while preserving League Cabinet and Balances for this iteration.

**Frontend Work**:
- Improve `src/pages/command-center/CommandCenterOverview.tsx`:
  - Import `PortfolioMetricsGrid` and the type.
  - Destructure `portfolioMetrics, loadingPortfolioMetrics` (plus existing `nativeBalance`, `tokenBalances`, `loadingBalances`, `liveRank` etc.) from `useCommandCenterData()`.
  - Replace or heavily de-emphasize the two large `<CommandCenterCard title="Ranking">` and `title="Reputation">` blocks (e.g. move them to a collapsed section, reduce their height dramatically, or comment "De-emphasized in favor of Portfolio Metrics — see Phase 4 plan").
  - In their place (or in a new full-width section above League/Balances), render `<PortfolioMetricsGrid metrics={portfolioMetrics} loading={loadingPortfolioMetrics} variant="command-center" />`.
  - Keep the existing "Balances" card (detailed list) as-is or lightly integrate (e.g. "Total Value" card could be clickable to scroll to it) — per non-goals.
  - Ensure responsive grid behavior and dark HUD aesthetic match.
- Minor: import `formatCompactUsd` or similar from the calculations module if helpful for labels.

**Backend/Contract Work**: None.

**Deliverables**:
- Improved: `src/pages/command-center/CommandCenterOverview.tsx` (layout change + consumption of new context fields)

**Dependencies**: Phase 2 (data in context) + Phase 3 (component)

**Estimated Complexity**: Low (mostly deletion/de-emphasis + one component drop-in)

#### Local vs Production Impact
- Will this work with `npm run dev` locally? Yes — pure render + context consumption change inside existing CC shell.
- Will this work after a Netlify deploy? Yes.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.

**Measurable Success Criteria**:
- On `/profile/0x.../command/overview` (local + prod), the four metric cards render using live `portfolioMetrics` from the improved hook (values change on wallet switch or balance-affecting tx).
- The large Ranking badge image block and Reputation "No data yet" card are no longer the dominant vertical elements in the top grid (verifiable by DOM inspection or screenshot); League Cabinet + Balances cards remain visible.
- No regression in existing CC data (liveRank, leagueCabinet, token list, etc.).
- Component is the only place the four cards are defined (no duplicated JSX in Overview).

### Phase 5: Implement backend `/api/profile/portfolio` with ~1h caching + on-demand refresh + server-side reads
**Goal**: Provide a dedicated, cache-protected endpoint that any public profile (or future consumer) can call for the four metrics without forcing every visitor to pay the full on-chain scan cost. Command Center owners continue to get fresh data via the client hook (Phase 2/4). Caching strategy is simple, observable, and matches existing globalThis singleton patterns in the codebase.

**Backend/Contract Work** (primary):
- Create (new) `api/lib/getServerReadProvider.js`: exports `getServerReadProvider(chainId)` that mirrors `src/lib/readProvider.ts` as closely as possible:
  - Same `batchMaxCount: 1`, `batchStallTime: 0`, `staticNetwork`.
  - RPC selection logic adapted from `api/dev-fix/route-auth.js:getRpcUrl` + `api/league.js` (support `BSC_RPC_HTTP_${chainId}`, `VITE_PUBLIC_RPC_${chainId}`, fallbacks to public seeds).
  - JSDoc: "Server equivalent of src/lib/readProvider.ts — keep config choices in sync."
- Create (new) `api/lib/portfolioCalculations.js`: pure JS versions of the functions from Phase 2 (identical math; JSDoc cross-reference to the TS source).
- Create (new) `api/profile/portfolio.js` (default export async handler):
  - Parse `chainId`, `address` (reuse `isAddress`, `getQuery` from `../server/http.js`).
  - Define `const PORTFOLIO_CACHE_TTL_MS = 60 * 60 * 1000;`
  - Use `globalThis.__memebattlesPortfolioCache = globalThis.__memebattlesPortfolioCache || new Map()` (precedent: arena*Store, db.js pool).
  - Key: `${chainId}:${address.toLowerCase()}`.
  - Support `forceRefresh` (truthy query param or `?refresh=1`).
  - On cache hit + fresh + !force: return `{ ...cached.metrics, cachedAt: ..., isCached: true }`.
  - On miss / stale / force:
    1. Fetch BNB/USD (CoinGecko) with its own tiny in-mem TTL cache (or compute inline).
    2. Query `pool` directly for launchpad tokens on the chain (columns: campaign_address, token_address, symbol, name, logo_uri — reuse patterns from `api/campaigns.js`).
    3. Obtain server provider = `getServerReadProvider(chainId)`.
    4. Native BNB balance via `provider.getBalance`.
    5. For each candidate token: `new Contract(tokenAddr, ERC20_MIN_ABI, provider).balanceOf(address)`; keep only >0 (attach DB metadata).
    6. For pricing/value: use DB market data where present or perform minimal on-chain reads (currentPrice / totalSupply) using patterns from `launchpadClient.ts` (server-adapted). Compute USD via the pure calc fns.
    7. Query `user_profiles` for `created_at` (reuse loadRankState pattern).
    8. Call `derivePortfolioMetrics` (from local calculations module).
    9. Store result + `fetchedAt` in cache.
    10. Return with `isCached: false`, `cachedAt`.
  - Graceful degradation on any RPC failure (return partial data or clear error; never 500 the whole public profile).
  - Logging at `[api/profile/portfolio]`.
- Improve `api/server.mjs`:
  - Add import: `import profilePortfolio from "./profile/portfolio.js";`
  - Add route: `router.all("/profile/portfolio", wrap(profilePortfolio));`
  - (Place alphabetically near the existing `/profile` route for maintainability.)

**Frontend Work** (minimal):
- None required for the endpoint itself (client consumption in Phase 6). Optionally add a tiny client helper in `src/lib/profileApi.ts` if desired (e.g. `fetchPublicPortfolioMetrics` using `apiJson`).

**Deliverables**:
- New: `api/lib/getServerReadProvider.js`
- New: `api/lib/portfolioCalculations.js`
- New: `api/profile/portfolio.js`
- Improved: `api/server.mjs` (import + route registration only)
- Updated docs? (optional: add note in `docs/API_ROUTE_MAP.md`)

**Dependencies**: Phase 1 (created_at), Phase 2 (pure fns spec)

**Estimated Complexity**: High (on-chain + cache + server provider parity) — but isolated to new files + one registration line

#### Local vs Production Impact (Critical)
- Will this work with `npm run dev` locally? Yes — the local backend process (started via `node api/server.mjs` or equivalent Railway local) loads the new handler. Requires local env to supply RPC URLs (BSC_RPC_HTTP_56 etc. or VITE_PUBLIC_RPC_* fallbacks — same as current `route-auth.js` and league payouts). The Vite proxy covers `/api/profile/portfolio`.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? Yes — the route `/api/profile/portfolio` is covered by the single existing `[[redirects]]` rule `from = "/api/*"`. No `netlify.toml` edit required or permitted in this plan.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No — the **only** new client calls (Phase 6) will use `apiJson("/api/profile/portfolio?...")`. Backend-internal fetches (CoinGecko for BNB price) are acceptable and follow existing patterns (no MemeWarzone API calls bypass).
- Do we need to touch `netlify.toml` or environment variable handling? **No**. The plan explicitly forbids it. New env vars for Railway (if any extra RPC keys) are documented in the implementation but are optional fallbacks only.

**Caching Strategy (Explicit)**:
- In-memory `globalThis` Map (process-lifetime, resets on Railway restart — acceptable for 1h TTL).
- TTL = 3600000 ms.
- Keyed by chain+address (normalized).
- `?forceRefresh=1` (or `refresh=1`) bypasses TTL for that request, recomputes, and updates the cache entry. Recommended for owner "Refresh" actions only (public visitors never force).
- Response always includes `cachedAt` (ISO) and `isCached` boolean for observability/debug.
- This directly addresses the stakeholder request to "reduce RPC calls" for public profiles while keeping Command Center owners on the fresh client path.

**Measurable Success Criteria**:
- `GET /api/profile/portfolio?chainId=56&address=0x...` returns 200 with the four metric fields (numbers or nulls) + `cachedAt` + `isCached`.
- Second identical call (within 1h, no force) returns `isCached: true` and identical numbers (verifiable via timestamp diff < 5s).
- Call with `?forceRefresh=1` returns `isCached: false` and a newer `cachedAt`.
- Server logs show on-chain reads (getBalance + balanceOf) **only** on miss/force, never on hot cache hits.
- `getServerReadProvider` produces a provider that can successfully `getBalance` (test via diagnostics or direct call).
- No change to `netlify.toml`; `git diff` on that file is empty.
- Existing `/api/profile` and other routes unaffected.

### Phase 6: Surface cached metrics in Public Profile (under header card)
**Goal**: Complete the public surface using the cached backend data. Insert the reusable grid directly under the primary profile header per the placement spec. Leverage the now-exposed `createdAt` for age.

**Frontend Work**:
- Improve `src/pages/PublicProfile.tsx`:
  - Import `apiJson` from `@/lib/apiBase` and `PortfolioMetricsGrid` (plus type).
  - Add local state: `portfolioMetrics`, `loadingPortfolio`, `portfolioError`.
  - Add `useEffect` (or augment existing profile load effect) that calls `await apiJson(\`/api/profile/portfolio?chainId=${activeChainId}&address=${profileWallet}\`)` (no force by default).
  - If `isOwnProfile`, expose an optional small "Refresh" button (next to "Public Profile" badge or in the metrics area) that calls the same URL with `&forceRefresh=1`, updates state, and shows toast on success.
  - Render `<PortfolioMetricsGrid metrics={portfolioMetrics} loading={loadingPortfolio} onRefresh={isOwnProfile ? refreshFn : undefined} variant="public" />` immediately after the closing `</section>` of the main header card (the one containing avatar, displayName, address copy, bio, RankBadgeCard) and before the "Badges + Reputation" 2-col grid.
  - Use `profile?.createdAt` (from Phase 1) as a fallback/secondary source inside the component or parent for wallet age display.
  - Error handling: on portfolio fetch failure, render the grid in a degraded "—" state but do not break the rest of the public profile (existing sections continue).
  - Remove or deprecate any temporary direct on-chain holdings code if present for this view (none currently; created coins remain separate).
- (Optional tiny) Improve `src/lib/profileApi.ts` with a thin wrapper `fetchPublicPortfolioMetrics(chainId, address, { forceRefresh }?)` that uses `apiJson` — recommended for cleanliness and future-proofing.

**Backend/Contract Work**: None (endpoint already delivered).

**Deliverables**:
- Improved: `src/pages/PublicProfile.tsx` (state + fetch + placement + refresh affordance for owners)
- (Recommended) Improved: `src/lib/profileApi.ts` (optional thin fetch wrapper)

**Dependencies**: Phase 1 (createdAt), Phase 3 (grid), Phase 5 (endpoint + cache)

**Estimated Complexity**: Medium (integration + careful placement + owner-only refresh)

#### Local vs Production Impact
- Will this work with `npm run dev` locally? Yes — `apiJson` resolves via Vite proxy to local backend (which must have the Phase 5 handler + DB + RPC env loaded). Public profile at `/profile/0x...` works end-to-end.
- Will this work after a Netlify deploy? Yes — `apiJson` builds the URL via `apiUrl`; the call hits the Railway redirect (existing rule covers `/api/profile/portfolio`). Full public profile experience identical to local.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No — the new call (and any wrapper) uses `apiJson` exclusively. Existing `fetch(buildRealtimeApiUrl(...))` in the same file for activity is pre-existing (out of scope for this change).
- Do we need to touch `netlify.toml` or environment variable handling? No. No new VITE_ vars.

**Measurable Success Criteria**:
- On any public profile page (`/profile/0x...`), the four metric cards appear directly below the main header section (PFP + name + bio + rank badge) and above "Badges".
- Values are populated from the backend cache endpoint (network tab shows single `/api/profile/portfolio` call; `isCached` observable).
- When viewing own profile publicly (`isOwnProfile=true`), a "Refresh" control is visible and functional: clicking it triggers a call containing `forceRefresh=1` (or equivalent), updates the displayed numbers/timestamp, and does not affect other sections.
- `createdAt` from the profile object is available and used (directly or indirectly) for the Wallet Age card when no fresher on-chain signal exists.
- No regressions in Created Coins, Public Activity, Drafts, or any other section of PublicProfile.tsx (manual smoke of 3–4 sections).
- Zero new direct fetches bypassing `apiBase`.

## Cross-Phase Notes & Recommendations
- **Thin reusable component**: `PortfolioMetricsGrid` (Phase 3) is the single source of truth for the four cards. Both CommandCenterOverview and PublicProfile import and render it — no duplicated JSX.
- **Pure functions**: The calculations module (Phase 2) + server mirror (Phase 5) is the explicit reuse mechanism requested. Any future backend holdings logic or additional UIs should import from these.
- **AGENTS.md Compliance**: Every phase explicitly addresses the four questions. All new client code uses `apiJson`/`apiFetch`. The single new backend route requires zero netlify.toml or vite.config.ts changes.
- **Verification Discipline**: Each phase has binary, independent-verifier-friendly success criteria. Plan Verifier must run the closeout checklist without the implementer present.
- **Rollback**: All changes are additive or narrow improvements. Removing the grid render or the portfolio route has no data-loss impact.
- **Future Extensibility**: The cache can later be promoted to a DB table (e.g. `user_portfolio_cache`) with a simple sweeper if 1h in-mem proves insufficient; the endpoint contract stays stable.

**End of Build Plan**
