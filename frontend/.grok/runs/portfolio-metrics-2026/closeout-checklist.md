# Closeout Checklist: Portfolio Metrics Cards (Total Value, Top Holding, Coins, Wallet Age)

**Linked Build Plan**: `build-plan.md` (in same folder)
**Purpose**: This is the **immutable contract** for the Plan Verifier and any implementer. Every item is binary (pass/fail) and independently verifiable by an agent who did not write the code. Only mark complete when reality exactly matches the approved plan.

---

## Phase 1: Expose Profile created_at + Align Profile Loading with Central API Layer — Closeout Criteria

### Backend Deliverables
- [ ] `api/profile.js` GET handler SELECT now includes `created_at AS "createdAt"` (exact column alias) and the field appears in the returned `profile` object when a record exists.
- [ ] Response for an address with a profile record contains `createdAt` as an ISO8601 timestamptz string (or null); 404/empty profile path still works.
- [ ] No other columns, auth logic, or POST behavior changed.

### Frontend Deliverables
- [ ] `src/lib/profileApi.ts` `fetchUserProfile` returns `createdAt` in the `UserProfile` object (or the type is updated to include `createdAt?: string | null`).
- [ ] The GET implementation inside `fetchUserProfile` now uses `apiFetch` (or `apiJson`) + `apiUrl` from `@/lib/apiBase` instead of raw `fetch` (verifiable by code inspection + grep for the old pattern).
- [ ] `src/types/profile.ts` (or the inline type in profileApi) documents the new optional `createdAt` field.
- [ ] `src/lib/profile/profileFormatters.ts` contains a new or extended `formatWalletAge` function with documented priority (createdAt → fallback timestamps → "New").
- [ ] All direct consumers (`PublicProfile.tsx`, `useEditableProfile.ts`, `CommandCenterContext.tsx`, `Profile.tsx`) compile and tolerate the new field without runtime errors.

### Cross-cutting & Verification
- [ ] `npm run build` succeeds with zero new TypeScript errors on changed files.
- [ ] Manual verification (dev): Load Command Center for a wallet that has saved a profile → `profile.createdAt` present in React DevTools / console.
- [ ] Manual verification (dev): Load a public profile page for the same wallet → createdAt flows through.
- [ ] Local dev (`npm run dev`) works end-to-end for profile load.
- [ ] After simulated Netlify deploy (or actual preview), profile load still returns createdAt (calls go through Railway redirect in `netlify.toml`).
- [ ] No new direct `fetch` bypassing `apiBase.ts` was introduced in Phase 1 files.
- [ ] `netlify.toml` and `vite.config.ts` are untouched for this phase.
- [ ] Phase sign-off: Verifier confirms 100% of above items via code read + live test in both environments.

---

## Phase 2: Create Shared `usePortfolioMetrics` Hook + Generalized Public Balance Reader — Closeout Criteria

### Hook & Logic Deliverables
- [ ] New file `src/hooks/profile/usePortfolioMetrics.ts` exists and exports `usePortfolioMetrics` (or equivalent named hook) with documented props including `targetAddress`, optional `preloadedBalances`, `preloadedProfileCreatedAt`, and `fallbackActivityTimestamps`.
- [ ] Hook returns the exact shape documented in the plan: `{ metrics: { totalValueUsd, topHolding: {ticker, percent, ...} | null, coinsCount, walletAgeLabel }, loading, error }`.
- [ ] An internal `fetchBalancesForAddress(targetAddress, chainId)` (or equivalent) exists that uses `getReadProvider(chainId)` from `@/lib/readProvider` + `fetchCampaigns`/`fetchCampaignSummary` + ERC20/native balance reads **for the target address** (not the connected `account`).
- [ ] USD derivation logic correctly uses `marketCapBnb` from summary stats + bnb price (verifiable by unit test or manual calc on a known holding).
- [ ] Preload path from Command Center context avoids duplicate on-chain calls (inspect call sites).
- [ ] Zero-balance wallet, wallet with only native BNB, and wallet with 3+ tokens all produce plausible numbers (no NaN, no crashes).

### Type & Helper Deliverables
- [ ] Shared types for the metrics shape are exported (either from the hook file or `src/types/portfolio.ts` / `src/types/profile.ts`).
- [ ] Pure helpers (`computePositionUsd`, `deriveTopHolding`, etc.) are in `src/lib/portfolio.ts` or clearly inside the hook with JSDoc.

### Verification
- [ ] `npm run build` and `npm run dev` show zero errors or console warnings attributable to the new hook.
- [ ] Manual test (no wallet connected): Drop a test component calling `usePortfolioMetrics({ targetAddress: "0x..." })` on a page → holdings and age load using public RPC only.
- [ ] Manual test (self-view): Command Center context preloaded data produces identical Total Value / Coins as a fresh hook call.
- [ ] Wallet age "New" / short age / absolute date formats render for the three priority cases.
- [ ] Top Holding percent is never >100 or negative; Total Value is non-negative.
- [ ] No regression in existing `useProfileBalances` behavior for Command Center or legacy Profile page (side-by-side render test).
- [ ] Local dev and Netlify-path (Railway) both work for the hook (price + RPC paths are environment-agnostic).
- [ ] No new `fetch` calls to our backend that bypass `apiBase.ts` (external CoinGecko in `useBnbUsdPrice` is pre-existing and allowed).
- [ ] `netlify.toml` untouched.
- [ ] Phase sign-off: Verifier has exercised public profile + self Command Center flows and confirmed derivation math on at least two real wallets.

---

## Phase 3: Build Reusable `PortfolioMetricsGrid` Component — Closeout Criteria

### Component Deliverables
- [ ] New file `src/components/profile/PortfolioMetricsGrid.tsx` (or documented alternate location) exists and exports a default or named component accepting `metrics`, `loading`, `className`, `compact`.
- [ ] Component renders exactly four cards (Total Value, Top Holding, Coins, Wallet Age) in a `grid-cols-2 md:grid-cols-4` (or equivalent responsive) layout.
- [ ] Styling matches plan: `rounded-2xl` / `rounded-xl`, `border-border/50`, `bg-card/35` or `bg-background/30`, `font-retro`, `text-[10px] uppercase tracking-[0.18em]` eyebrows, prominent values, accent treatment on Total/Top where specified.
- [ ] All four empty/zero/loading states render without console errors or broken layout (e.g. "$0.00", "—", "0", "New").
- [ ] JSDoc at top of file includes a usage example with the exact props shape from Phase 2.

### Integration & Polish
- [ ] Component is importable from both Command Center pages and Public Profile without circular deps.
- [ ] No new global CSS or Tailwind config changes required.
- [ ] `npm run build` produces no errors or size warnings attributable to this component.

### Verification
- [ ] Visual inspection (dev + prod build): Component looks consistent when rendered inside a `CommandCenterCard` wrapper and when placed naked under the PublicProfile header.
- [ ] Responsive test: On viewport <768px shows 2-col; >=768px shows 4-col (or 2x2 as final tuned).
- [ ] Local dev and Netlify deploy both display the component identically (static UI).
- [ ] No `fetch` or env changes introduced by this phase.
- [ ] Phase sign-off: Verifier confirms pixel-level style match to reference cards in `CommandCenterOverview.tsx:138-188` (Balances) and `PublicProfile.tsx:533-541` (reputation signals) plus `RankBadgeCard.tsx`.

---

## Phase 4: Integrate into Command Center Overview (De-emphasize Ranking + Reputation) — Closeout Criteria

### Layout & Removal Deliverables
- [ ] `src/pages/command-center/CommandCenterOverview.tsx` no longer renders the full large "Ranking" card (the one with 160-180px badge image + progress bar) or renders it in a clearly de-emphasized slim form (per plan discretion during implementation).
- [ ] "Reputation" card (the "No data yet" placeholder with 4 signal boxes) is removed or heavily de-emphasized.
- [ ] In their place (or as the dominant top section of the grid) appears `<PortfolioMetricsGrid metrics={...} />` (or equivalent 4-card layout) populated from `useCommandCenterData()` + `usePortfolioMetrics` with preloaded balances.
- [ ] The remaining two cards ("League Cabinet" and "Balances") continue to render with original behavior and data (token list links still work).
- [ ] Page header description may be lightly updated to mention "portfolio" if it was previously only referencing ranking/reputation.

### Data Wiring Deliverables
- [ ] Metrics values on Command Center exactly match (within rounding) the native + token amounts shown in the retained Balances card for the same connected wallet.
- [ ] Wallet Age uses `profile.createdAt` from context when present (Phase 1).
- [ ] Loading states from `loadingBalances` and hook are wired and visible during initial load.

### Verification
- [ ] `npm run dev`: Visit Command Center Overview for a connected wallet with holdings → four metrics appear, data correct, no console errors.
- [ ] Same flow after `npm run build` + static preview or Netlify deploy.
- [ ] Zero-balance connected wallet shows graceful zeros/"New" without layout shift or crashes.
- [ ] Existing `useCommandCenterData` consumers (other Command Center tabs) are unaffected (no context shape change required).
- [ ] Local vs Production: Both environments show identical metrics (public RPC + preloaded data paths).
- [ ] No new bypass fetches or netlify changes.
- [ ] Phase sign-off: Verifier has compared metrics vs raw Balances card numbers on at least one wallet with mixed native + tokens; confirmed Ranking/Reputation visual de-emphasis.

---

## Phase 5: Integrate into Public Profile — Closeout Criteria

### Placement & Data Deliverables
- [ ] `src/pages/PublicProfile.tsx` renders `<PortfolioMetricsGrid ... />` (or equivalent) immediately below the primary header card (the rounded-3xl containing avatar, name, address copy, bio, RankBadgeCard) and above the existing Badges + Reputation two-column section.
- [ ] Hook is called with `targetAddress = profileWallet` and `chainId = activeChainId`.
- [ ] When `profile?.createdAt` is absent, wallet age falls back to earliest timestamp derived from the page's already-loaded `createdCoins`, `visibleDrafts`, or `publicTrades` (verifiable in code).
- [ ] Metrics load independently; the rest of Public Profile (created coins, drafts, activity, badges) continues to function.
- [ ] Works with no wallet connected (pure public view).

### Verification
- [ ] Manual test (dev + prod build): Visit `/profile/<any-valid-address>` (including addresses never seen before and addresses with profiles) → four cards appear under header with plausible data or graceful zeros.
- [ ] For a wallet with no profile record + no activity: shows "New" or sensible fallback.
- [ ] Holdings numbers for a public profile match what `useProfileBalances` (or manual on-chain check) would return for that address.
- [ ] No regression in any existing PublicProfile section load or navigation.
- [ ] Local dev works (public RPC path); Netlify deploy works (same path, no Railway dependency for holdings).
- [ ] No new direct backend fetches bypassing apiBase (the one existing realtime trades fetch remains untouched).
- [ ] `netlify.toml` and `vite.config.ts` untouched.
- [ ] Phase sign-off: Verifier has tested at least three distinct public profiles (self-owned with holdings, third-party with activity, brand-new address) in both local and deployed environments; confirmed visual placement and data correctness.

---

## Global / Final Closeout (Only After All Phases)

- [ ] Every individual phase above has an independent passing verifier report (or explicit "all items verified" sign-off in this file).
- [ ] Full end-to-end: Command Center Overview shows correct portfolio metrics for the connected user; any Public Profile shows correct metrics for the viewed address (including cross-check that self-view via public route matches Command Center numbers).
- [ ] No regressions spotted in: Command Center Balances list, PublicProfile created coins / activity / badges, profile editing flow, `npm run build`, or TypeScript.
- [ ] All temporary debug code, console.logs added during implementation, and unused imports removed.
- [ ] Final clean `npm run build` succeeds; `npm run dev` starts without errors.
- [ ] `netlify.toml` is byte-for-byte identical to pre-plan version.
- [ ] No new environment variables (VITE_*) were added.
- [ ] Documentation: Inline JSDoc on hook + component + any updated formatters is present and accurate.
- [ ] Final verifier sign-off: "100% of plan + checklist items pass. Ready for production deploy."

**Note to Verifier**: You may only mark the Global section complete after you have personally executed the verification steps for Phases 1–5 (or confirmed prior phase sign-offs + spot-checked the integrated flows). Any deviation from the approved build-plan.md must be recorded as a blocker.

---
**Checklist Version**: 2026-05-27 (matches build plan date)
**End of Closeout Checklist**