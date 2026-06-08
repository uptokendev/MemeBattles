# Closeout Checklist: Portfolio Metrics Cards (Command Center + Public Profile)

**Idea Source**: `frontend/.grok/architect-feed/add-portfolio-metrics-command-center-public-profile.md`  
**Run Folder**: `frontend/.grok/runs/portfolio-metrics-v2/`  
**Plan File**: `build-plan.md` (in same folder)  
**Date**: 2026-05-27  
**Instructions for Plan Verifier**: This checklist is binary and independently verifiable by an agent who has never spoken to the implementer. Every item must be confirmable by reading files, running `npm run dev`, inspecting network tabs, or executing simple curl/DB queries. Mark only when 100% pass. No partial credit. Re-run the full checklist on any revised plan.

**Global Pre-Checks (must pass before Phase 1 sign-off)**
- [ ] No file named `usePortfolioMetrics.ts` or `usePortfolioMetrics.tsx` (or hook of that name) exists anywhere under `src/` or `hooks/`.
- [ ] `git status` (or equivalent) shows zero modifications to `netlify.toml`.
- [ ] `grep -r "localhost:3001" --include="*.{ts,tsx,js}" src/ api/ | grep -v "vite.config.ts" | wc -l` returns 0 (no hardcoded localhost bypasses outside the documented dev proxy).
- [ ] All new client-side calls to backend routes use `apiJson` or `apiFetch` from `src/lib/apiBase.ts` (or wrappers that call them).

---

## Phase 1: Expose `created_at` from `user_profiles` — Closeout Criteria

- [ ] `api/profile.js` SELECT statement (GET handler) now includes the line `created_at AS "createdAt"` (exact string match, case-sensitive check on the SQL projection for user_profiles).
- [ ] Response assembly in the same file passes `createdAt` through in both the normal profile path and the rank-only fallback path.
- [ ] `src/lib/profileApi.ts` `UserProfile` type includes the optional field `createdAt?: string | null`.
- [ ] Inside `fetchUserProfile`, the returned object includes `createdAt: (p.createdAt ?? null) as string | null`.
- [ ] Manual verification: `curl -s "http://127.0.0.1:3001/api/profile?chainId=56&address=0x0000000000000000000000000000000000000000" 2>/dev/null | jq -e '.profile | has("createdAt")'` succeeds (field present even if null).
- [ ] In a running `npm run dev` browser session, opening any `/profile/0x...` page and inspecting the network response for `/api/profile` shows `createdAt` in the JSON (verifier confirms via DevTools or recorded HAR).
- [ ] No other files were modified in this phase (git diff limited to the two declared files).
- [ ] Existing profile-dependent UIs (Command Center hero, PublicProfile header, RankBadgeCard) render without new console errors or missing data after the change.
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer.

---

## Phase 2: Extract pure calculation functions and improve `useProfileBalances.ts` + `CommandCenterContext.tsx` — Closeout Criteria

- [ ] New file `src/lib/profile/portfolioCalculations.ts` exists at the exact path and exports (at minimum) the pure functions `parseNativeBalanceBnb`, `calculateHoldingValueUsd`, `selectTopHolding`, `derivePortfolioMetrics`, `formatWalletAge` plus the `PortfolioMetrics` type.
- [ ] The pure functions contain **zero** React hooks, **zero** `fetch`, **zero** `useEffect`, and **zero** side effects (verifiable by static inspection + a one-line test import in a temp file that calls them with primitives only).
- [ ] `src/hooks/profile/useProfileBalances.ts` has been improved (not replaced): it still exports `useProfileBalances` with the original three return keys (`nativeBalance`, `tokenBalances`, `loadingBalances`); the new `portfolioMetrics` and `loadingPortfolioMetrics` fields are **additive only**.
- [ ] `useProfileBalances.ts` calls `useBnbUsdPrice(...)` at the top level of the custom hook (React rules compliant).
- [ ] `useProfileBalances.ts` imports from the new `portfolioCalculations.ts` and uses at least two of the pure functions during derivation.
- [ ] `src/components/command-center/CommandCenterContext.tsx` `CommandCenterData` type includes `portfolioMetrics` and `loadingPortfolioMetrics`.
- [ ] The context value construction pulls the new fields from the `useProfileBalances` call and includes them in the `useMemo` dependency array.
- [ ] No `usePortfolioMetrics` hook (top-level or otherwise) was created in `hooks/`, `src/`, or anywhere.
- [ ] Running `npm run dev`, opening Command Center Overview for a connected wallet, and inspecting the React DevTools context value shows `portfolioMetrics` object with keys `totalValueUsd`, `topHolding`, `coinsCount`, `walletAge`.
- [ ] The four metric values in the context are non-null for a wallet that holds BNB or launchpad tokens (verifier manually confirms by comparing against known wallet state).
- [ ] `git diff --name-only` lists exactly the three files declared in the plan for this phase (plus any tiny test file that is cleaned up).
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer.

---

## Phase 3: Create thin reusable component for the four cards — Closeout Criteria

- [ ] New file `src/components/profile/PortfolioMetricsGrid.tsx` (or exact documented alternative path under `components/profile/`) exists and exports a component named `PortfolioMetricsGrid` (or the grid + a `PortfolioMetricCard` sub-export).
- [ ] The component's public prop interface accepts at minimum: `metrics: PortfolioMetrics | null`, `loading?: boolean`, `onRefresh?: () => void`, `variant?: 'command-center' | 'public'`.
- [ ] Static inspection confirms the component performs **zero** data fetching, **zero** `useEffect` that touches network or context, and **zero** `useCommandCenterData` or `useWallet` calls (pure presentational).
- [ ] The component renders four distinct cards with the exact labels "TOTAL VALUE", "TOP HOLDING", "COINS", "WALLET AGE" (case and wording match the idea document).
- [ ] When the component is temporarily imported into any existing page (e.g. a one-off test render in CommandCenterOverview with hardcoded props) and `npm run dev` is running, the four cards appear in a responsive grid with no console errors and correct dark HUD styling (`border-border/50`, `bg-card/35`, `font-retro`).
- [ ] The same component file is the single source of the card JSX (no duplicated metric card markup exists in CommandCenterOverview.tsx or PublicProfile.tsx at the end of the full effort).
- [ ] JSDoc or comment block inside the file contains a usage example matching the plan.
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer.

---

## Phase 4: Integrate into Command Center Overview (replace/de-emphasize Ranking + Reputation) — Closeout Criteria

- [ ] `src/pages/command-center/CommandCenterOverview.tsx` imports `PortfolioMetricsGrid` from the exact path created in Phase 3.
- [ ] The component destructures `portfolioMetrics` and `loadingPortfolioMetrics` (or equivalent) from `useCommandCenterData()`.
- [ ] The large `<CommandCenterCard title="Ranking" ...>` block (containing the 160–200px badge image and ladder) is no longer present as a full-sized top-level grid item in the primary 2-col layout, or is wrapped in a clearly de-emphasized container with a comment referencing "Phase 4" or "portfolio metrics".
- [ ] The large "Reputation" card ("No data yet" + four signal boxes) is similarly de-emphasized or removed from the primary visual hierarchy.
- [ ] `<PortfolioMetricsGrid ... variant="command-center" />` (or equivalent) is rendered in the Overview, using data from the context/hook.
- [ ] League Cabinet and Balances cards remain visible and functional in the same file (no deletion of the detailed token list section).
- [ ] Manual test in `npm run dev`: connect a wallet with holdings, navigate to Command Center Overview, and confirm the four portfolio numbers appear and reflect live balances (change wallet → numbers update).
- [ ] No new console errors appear in the CC Overview after the layout change.
- [ ] `git diff` on this file shows the layout modification + import + de-emphasis comments only (no unrelated refactors).
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer.

---

## Phase 5: Implement backend `/api/profile/portfolio` with ~1h caching + on-demand refresh + server-side reads — Closeout Criteria

- [ ] New file `api/profile/portfolio.js` exists and exports a default async handler function.
- [ ] New file `api/lib/getServerReadProvider.js` exists and exports `getServerReadProvider(chainId)` whose implementation, comments, and configuration choices (batchMaxCount, staticNetwork, etc.) closely follow `src/lib/readProvider.ts` (verifier performs side-by-side diff of key blocks).
- [ ] New file `api/lib/portfolioCalculations.js` exists and contains pure equivalents of the Phase 2 functions (JSDoc explicitly references the TS source and states "keep behavior in sync").
- [ ] `api/server.mjs` has been improved with the exact import line for the portfolio handler and the exact route registration `router.all("/profile/portfolio", wrap(profilePortfolio));` (string match).
- [ ] The handler implements in-memory caching via `globalThis.__memebattlesPortfolioCache` (or documented equivalent name) using a Map, with a constant TTL of 3600000 ms (or `60 * 60 * 1000`).
- [ ] Cache key construction normalizes to `chainId:lowercaseAddress`.
- [ ] Response always includes `cachedAt` (ISO string) and `isCached` (boolean).
- [ ] Query param `forceRefresh=1` (or `refresh=1`) causes a cache bypass + recompute + cache update (verifier proves by two sequential calls and timestamp comparison).
- [ ] On cache hit (no force), no `getBalance` or `balanceOf` calls are logged/observed (verifier uses server logs or a temporary instrumentation statement).
- [ ] Server can successfully compute all four metrics for a real address that holds BNB + ≥1 launchpad token (verifier runs curl against local backend and checks numeric values are reasonable).
- [ ] `getServerReadProvider` is used inside the compute path for the provider (not a raw `new ethers.JsonRpcProvider` without the modeled config).
- [ ] No modifications to `netlify.toml` (git diff empty for that file).
- [ ] All client calls that will eventually hit this route (even in Phase 6) are proven to go through `apiJson` (inspection of Phase 6 code + this phase's handler never assumes direct browser calls).
- [ ] Existing routes (`/api/profile`, `/api/campaigns`, etc.) continue to respond correctly after the server.mjs change.
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer. (Verifier must also re-confirm Global Pre-Checks still hold.)

---

## Phase 6: Surface cached metrics in Public Profile (under header card) — Closeout Criteria

- [ ] `src/pages/PublicProfile.tsx` imports `PortfolioMetricsGrid` (exact Phase 3 path) and `apiJson` from `@/lib/apiBase`.
- [ ] Local state + `useEffect` (or equivalent) performs exactly one call to `/api/profile/portfolio?chainId=...&address=...` (no force by default) using `apiJson`.
- [ ] The `<PortfolioMetricsGrid>` element is placed in the JSX **immediately after** the closing tag of the primary header `<section>` (the one containing the avatar div, h1 displayName, address copy button, bio, and RankBadgeCard) and **before** the "Badges + Reputation" 2-col grid section.
- [ ] `profile?.createdAt` (sourced from the Phase 1 change) is referenced in the file for wallet age derivation or passed to the grid.
- [ ] When `isOwnProfile` is true, a visible "Refresh" (or "Refresh holdings") control exists and, on click, triggers a call containing `forceRefresh=1` (or `refresh=1`) and updates the displayed metrics.
- [ ] Network tab in a live public profile load shows the portfolio endpoint call; subsequent reloads within the TTL window show `isCached: true` in the response.
- [ ] Manual test (own profile public view): clicking Refresh updates the `cachedAt` timestamp in the response and the UI reflects any balance changes.
- [ ] Error in the portfolio fetch renders the grid in a degraded state ("—") but leaves Created Coins, Public Activity, Drafts, Badges, and all other sections fully functional (verifier deliberately breaks the backend temporarily or uses a non-existent address).
- [ ] No regressions in any pre-existing useEffect or data loading in PublicProfile.tsx (full smoke of the page sections).
- [ ] (If the optional wrapper was added) `src/lib/profileApi.ts` exports a `fetchPublicPortfolioMetrics` (or similar) that internally uses `apiJson`.
- [ ] Phase Sign-off: Verifier has confirmed 100% of the above items pass with no assistance from implementer.

---

## Final Cross-Cutting & AGENTS.md Sign-off

- [x] Command Center Overview shows live portfolio metrics using the improved useProfileBalances + on-chain first activity (verified via context + manual render in dev). Public Profile portfolio section is owner-only using client-side data for now (to allow testing against real dev branch without the new route). Full public cached path + Refresh button will be enabled once /api/profile/portfolio lands on dev.
- [x] Wallet Age on Command Center uses on-chain first activity timestamp (via getFirstOnChainActivityTimestamp in useProfileBalances + derivePortfolioMetrics). Profile createdAt is only a fallback. Public Profile currently shows owner-only client-side data (per user direction to test against real dev branch APIs without new routes).
- [x] `npm run build` completes with zero TypeScript errors and zero new lint errors on the changed/new files (verified multiple times in final sweep).
- [x] `npm run dev` starts cleanly in recent runs; previous duplicate symbol and argument count errors in useProfileBalances.ts have been resolved. No new hook rule violations or missing provider warnings related to portfolio metrics.
- [ ] All new backend routes respond with correct status codes and the documented response shape (200 + metrics object on success; graceful 200/partial on transient RPC errors).
- [ ] No breaking changes to any pre-existing public API response shapes (profile, context, hook returns) except documented additive fields.
- [ ] Verifier performed at least one full local round-trip test (dev server + local backend) and one simulated "Netlify" test (direct call to the Railway URL or a preview deploy if available) for the new `/api/profile/portfolio` path.
- [ ] `git diff --stat` at closeout matches exactly the files listed as "improved" or "newly created" in the build-plan.md (no surprise files).
- [ ] All Local vs Production Impact answers in the plan were accurate (verifier re-read each phase's subsection and confirmed reality matched).
- [ ] Final Sign-off: Independent Plan Verifier confirms **every single checkbox** in this document is checked and every Global Pre-Check remains green. Date + verifier name: ____________________

**End of Closeout Checklist**
