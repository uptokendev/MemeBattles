# Build Plan: Portfolio Metrics Cards (Total Value, Top Holding, Coins, Wallet Age)

**Idea Source**: `frontend/.grok/architect-feed/add-portfolio-metrics-command-center-public-profile.md`
**Date**: 2026-05-27
**Created By**: Architect Agent (phased-build skill)
**Status**: Draft

## Overview

This plan delivers four compact, high-signal portfolio metric cards — TOTAL VALUE (USD), TOP HOLDING (ticker + % of portfolio), COINS (count of held launchpad tokens), and WALLET AGE (human-readable platform tenure) — on two primary surfaces:

1. **Command Center Overview** (`src/pages/command-center/CommandCenterOverview.tsx`): Replace or heavily de-emphasize the large "Ranking" and "Reputation" cards (currently the first two entries in the `md:grid-cols-2` layout) with a responsive 2x2 or 4-column grid of these metrics. The existing "Balances" detail list and "League Cabinet" remain (or are slimmed as a follow-up). Data is already partially available via the `CommandCenterDataProvider` / `useCommandCenterData()` context.

2. **Public Profile** (`src/pages/PublicProfile.tsx`): Insert the identical four-card grid directly under the primary profile header section (the rounded-3xl card containing PFP/avatar, display name, address + copy, bio, RankBadgeCard, and "Open Command Center" button). This surface currently has zero holdings/balance loading.

The implementation leans heavily on **client-side derivation** as confirmed by the user: balances via (generalized) `useProfileBalances`, BNB price via existing `useBnbUsdPrice` (CoinGecko), token metadata + marketCapBnb from `fetchCampaignSummary` (already invoked inside the balances hook), and wallet age from `user_profiles.created_at` (exposed via minimal backend change) or fallback to earliest timestamps from already-loaded drafts/created coins/trades in PublicProfile.

A shared `usePortfolioMetrics` hook and reusable `PortfolioMetricsGrid` component are **recommended and scoped into the plan** for consistency and to avoid duplication. All new or updated data access strictly respects `src/lib/apiBase.ts` (apiUrl/apiFetch/apiJson) and existing patterns (getReadProvider for public on-chain reads). No heavy new backend indexers or WebSocket work.

## Success Criteria (High Level)
- Four metric cards render with plausible data on both surfaces (Command Center self-view + Public Profile for any viewer).
- Total Value correctly aggregates native BNB + held launchpad token positions in USD using existing bnbUsdPrice + marketCapBnb-derived position values.
- Top Holding identifies the max-USD position with ticker and percentage.
- Coins count reflects distinct non-zero launchpad token holdings.
- Wallet Age shows friendly labels ("3d", "2w", "1mo", "Apr 2026") with graceful fallback for brand-new wallets.
- No regressions in existing Balances list rendering, profile load times, or Command Center context consumers.
- Fully responsive dark HUD aesthetic matching `CommandCenterCard`, PublicProfile sections, and `RankBadgeCard` patterns.
- Works for zero-balance / new wallets and when no profile record exists.

## Out of Scope (Entire Effort)
- Historical portfolio performance, charts, or time-series.
- Non-launchpad tokens, external DeFi positions, or native token pricing beyond BNB.
- Real-time price updates (batch-on-load via existing hooks is sufficient).
- Raw on-chain first-tx "wallet birth" indexer (profile.created_at + activity fallbacks are the explicit fallback strategy).
- Changes to the detailed Balances list UI in Command Center Overview (keep or minor de-emphasis only).
- New dedicated backend holdings endpoint (client-side on-chain + summary enrichment only).
- Modifications to `netlify.toml` (existing `/api/*` redirect covers everything).
- Direct `fetch` bypassing `apiBase.ts` or `getReadProvider`.
- Updates to legacy Profile.tsx beyond what is required for hook reuse.
- Full test coverage beyond basic render + happy-path verification.

---

## Phases

### Phase 1: Expose Profile created_at + Align Profile Loading with Central API Layer

**Goal**: Make the reliable source of truth for wallet age (`user_profiles.created_at`) available to the frontend without a new heavy endpoint, and align the existing `fetchUserProfile` path with `apiBase.ts` rules for future-proofing.

**Frontend Work**:
- Update `src/types/profile.ts` (or extend inline) to include `createdAt?: string | null` in the `UserProfile` shape used by `PublicProfile.tsx` and `CommandCenterContext.tsx`.
- Update `src/lib/profileApi.ts`:
  - Add `createdAt` to the returned object in `fetchUserProfile`.
  - Change the direct `fetch(url, ...)` call to use `apiFetch` + `apiJson` (or at minimum `apiUrl` consistently) per AGENTS.md Rule 2. Current implementation uses `buildUrl` (apiUrl wrapper) + raw fetch; standardize the GET path.
- Update consumers that destructure profile: `src/pages/PublicProfile.tsx` (safeRank, display logic), `src/hooks/profile/useEditableProfile.ts`, `src/components/command-center/CommandCenterContext.tsx`, and `src/pages/Profile.tsx` (legacy) to tolerate the new optional field.
- Add a small pure formatter `formatWalletAge(createdAt?: string | number | null, fallbackTimestamps?: number[]): string` in `src/lib/profile/profileFormatters.ts` (extend existing `formatTimeAgo`).

**Backend/Contract Work**:
- Edit `api/profile.js` (GET handler, lines ~70-88): Add `created_at AS "createdAt"` to the SELECT from `user_profiles`. Return it in the profile payload (already present in DB per `db/SUPABASE_SCHEMA_FIX.sql` and `realtime-indexer/SUPABASE_SCHEMA_FIX.sql` and `db/migrations/002_social.sql`).
- No migration needed — column exists with DEFAULT now() since initial schema.
- Keep the POST path unchanged.

**Deliverables**:
- `GET /api/profile?chainId=...&address=...` returns `createdAt` (ISO string or null) for profiles that have records.
- `fetchUserProfile` and `UserProfile` include the field.
- No console errors or type breaks in `npm run build`.
- Manual verification: load own Command Center and a public profile that has edited displayName/bio; createdAt visible in React DevTools.

**Dependencies**: None.

**Integration Points with Other Phases**: Wallet age computation in Phase 2 will consume `profile.createdAt` when present. PublicProfile already loads profile; Command Center context already loads via `useEditableProfile`.

**Estimated Complexity**: Low (one SELECT column + type + one fetch alignment).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes — the Vite proxy in `vite.config.ts` routes `/api/profile` to the local Railway-equivalent backend; no code changes to proxy.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? Yes — the `[[redirects]]` rule for `/api/*` in `netlify.toml` (line 28-32) already covers the path; no change required.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No — we are *removing* one (the raw fetch inside `fetchUserProfile`) and standardizing on `apiFetch`/`apiJson` or the existing `apiUrl` + apiFetch pattern.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- API impact: Pure additive (extra field in existing response); no breaking change for existing callers.

### Phase 2: Create Shared `usePortfolioMetrics` Hook + Generalized Public Balance Reader

**Goal**: Provide a single source of truth for the four derived metrics that works for both self (Command Center context) and arbitrary public addresses (Public Profile), using only already-loaded data + existing public read paths.

**Frontend Work**:
- Create new file `src/hooks/profile/usePortfolioMetrics.ts` (co-located with `useProfileBalances.ts`).
  - Accepts: `{ targetAddress: string; chainId?: number; preloadedBalances?: { nativeBalance: string; tokenBalances: TokenBalanceRow[] }; preloadedProfileCreatedAt?: string | null; fallbackActivityTimestamps?: number[] }`
  - Internally:
    - Calls `useBnbUsdPrice(true)` (existing pattern from `TokenDetails.tsx`, `WarRoom.tsx`, etc.).
    - If preloadedBalances not supplied (public case), uses a new internal `fetchBalancesForAddress(targetAddress, chainId)` helper that:
      - Uses `getReadProvider(chainId)` from `src/lib/readProvider.ts` (already used in `apiBase.ts` token fallback and `launchpadClient.ts`).
      - Re-uses the campaign scan + `fetchCampaignSummary` + ERC20 `balanceOf` + native `getBalance` logic extracted/adapted from `useProfileBalances.ts` (target the provided address instead of `account`).
    - Enriches held tokens: match to summary.stats.marketCapBnb, compute positionBnb = (balanceRaw / circulating) * marketCapBnb (see `launchpadClient.ts:763-770` for circulating logic), then USD via bnb price.
    - Total Value = (native BNB parsed * bnbUsd) + sum(token USD values).
    - Top Holding: argmax by USD value → { ticker, percent: (value/total*100).toFixed(0) + '%', valueUsd }.
    - Coins: tokenBalances.length (distinct >0 launchpad tokens).
    - Wallet Age: prefer profileCreatedAt → formatWalletAge(); else min(fallbackActivityTimestamps) or "New".
  - Returns: `{ metrics: { totalValueUsd: number | null; topHolding: {...} | null; coinsCount: number; walletAgeLabel: string; }, loading: boolean, error: string | null }`
- Optionally create a thin `src/lib/portfolio.ts` for pure computation helpers (`computePositionUsd`, `deriveTopHolding`, `formatCompactUsd`) if logic grows.
- Update `src/hooks/profile/useProfileBalances.ts` JSDoc only (no behavior change) to note it remains the self-optimized path for Command Center.

**Backend/Contract Work**: None (pure client-side derivation + existing public RPC reads via `getReadProvider`).

**Deliverables**:
- `usePortfolioMetrics` hook implemented and exported.
- Internal balance reader supports arbitrary targetAddress (public profiles) without requiring a connected wallet that matches the target.
- Happy-path derivation verified for wallets with native + 1-3 tokens, zero balances, and missing profile record.
- TypeScript clean; no duplicate heavy fetches when preloaded data is passed from CommandCenterContext.

**Dependencies**: Phase 1 (for createdAt consumption).

**Integration Points with Other Phases**: Phase 3 (grid component) and Phase 4/5 (integration) consume the hook. CommandCenterContext already exposes `nativeBalance`, `tokenBalances`, `loadingBalances`, and profile — perfect for preloading to avoid double RPC calls on self-view.

**Estimated Complexity**: Medium (generalized reader logic + math; careful not to regress existing self path).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes — `getReadProvider` uses public BSC RPCs (configured in `src/lib/chainConfig.ts`); no local backend dependency for the holdings scan.
- Will this work after a Netlify deploy? Yes — identical public RPC calls; no involvement of the Railway `/api/*` redirect for the on-chain portion. BNB price still hits CoinGecko (existing external pattern).
- Any direct `fetch()` bypassing `apiBase.ts`? No new ones. The only fetches are: (a) existing `useBnbUsdPrice` (external, unchanged), (b) `fetchCampaigns`/`fetchCampaignSummary` via the launchpad client (which ultimately uses `apiBase` fallbacks + RPC), and (c) raw RPC via `getReadProvider` (the approved public read path, not our backend API).
- netlify.toml / env changes? None.
- Note on existing bypass: `PublicProfile.tsx:350` already does a direct `fetch(buildRealtimeApiUrl(...))` for activity; the new hook does **not** add to this pattern.

### Phase 3: Build Reusable `PortfolioMetricsGrid` Component

**Goal**: Extract a single, styled, responsive presentational component for the four cards so Command Center and Public Profile (and future surfaces) stay visually identical.

**Frontend Work**:
- Create `src/components/profile/PortfolioMetricsGrid.tsx` (or `src/components/metrics/PortfolioMetricsGrid.tsx` if a new folder is preferred; profile/ keeps it near `PublicProfileStatsBar.tsx` and other profile chrome).
  - Props: `{ metrics: PortfolioMetrics | null; loading?: boolean; className?: string; compact?: boolean; }`
  - Renders a `grid grid-cols-2 md:grid-cols-4 gap-3` (or 2x2 on mobile) of four cards.
  - Each card follows existing patterns:
    - Container: `rounded-2xl border border-border/50 bg-card/35 p-4 backdrop-blur-md` (or the tighter `bg-background/30 p-3` variant from PublicProfile reputation signals for density).
    - Eyebrow labels in `font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground` (matches `CommandCenterCard`, `RankBadgeCard`).
    - Prominent values in `font-retro text-2xl lg:text-3xl text-foreground`.
    - Top Holding and Total Value get slight visual weight (larger number or accent border).
    - Loading: skeleton or "..." using existing `<Skeleton>` or simple text.
    - Empty/zero states: "$0.00", "—", "0", "New" with muted subtext.
  - Use `formatCompactNumber` / new `formatUsd` helpers from `src/lib/profile/profileFormatters.ts`.
  - Dark HUD aesthetic consistency verified against `CommandCenterOverview.tsx:52-189` and `PublicProfile.tsx:385-433` header + `src/components/rank/RankBadgeCard.tsx`.
- Export types for the metrics shape from the hook file or a shared `src/types/portfolio.ts`.
- Add JSDoc + usage example comment in the component.

**Backend/Contract Work**: None.

**Deliverables**:
- `PortfolioMetricsGrid` component renders the four metrics correctly in isolation (can be dropped into Storybook or a test page).
- Visual parity between surfaces.
- Responsive (mobile 2-col, desktop 4-col or 2x2 as final tuned).
- Zero TypeScript or runtime errors on render with all combinations of data (full, partial, loading, empty).

**Dependencies**: Phase 2 (hook provides the data shape).

**Integration Points with Other Phases**: Directly consumed by Phase 4 (Command Center) and Phase 5 (Public Profile).

**Estimated Complexity**: Low (presentation only; styling re-uses 90% existing tokens).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes — pure React + Tailwind.
- Will this work after a Netlify deploy? Yes — static UI.
- Any direct fetch bypassing apiBase? No.
- netlify.toml / env? No.
- Styling risk: Must match the exact border/bg/opacity used in `CommandCenterCard.tsx:22` and PublicProfile sections to avoid visual drift.

### Phase 4: Integrate into Command Center Overview (De-emphasize Ranking + Reputation)

**Goal**: Surface the new metrics in the logged-in Command Center while following the explicit request to remove or heavily de-emphasize the current large Ranking and Reputation cards.

**Frontend Work**:
- Edit `src/pages/command-center/CommandCenterOverview.tsx`:
  - Import `usePortfolioMetrics` and `PortfolioMetricsGrid`.
  - Consume from `useCommandCenterData()` the existing `nativeBalance`, `tokenBalances`, `loadingBalances`, `profile`, `walletAddress`, `chainId`.
  - Call `usePortfolioMetrics({ targetAddress: walletAddress, preloadedBalances: { nativeBalance, tokenBalances }, preloadedProfileCreatedAt: profile?.createdAt, ... })`.
  - Replace the first two `<CommandCenterCard title="Ranking">` and `<CommandCenterCard title="Reputation">` (lines 53-116) with a single wrapper section containing `<PortfolioMetricsGrid metrics={...} loading={...} />` (or four individual small cards if grid not yet final).
  - Keep the existing "League Cabinet" and "Balances" cards in the grid (now becomes metrics grid + 2 legacy cards, or restructure to a clean 2x2 metrics + slim Balances below if desired).
  - Optional: Add a one-line "Portfolio" eyebrow or description to the metrics section matching the style of the removed cards' descriptions.
  - Preserve all existing links inside the remaining Balances token list.
- Update `src/components/command-center/CommandCenterContext.tsx` only if additional data exposure is required (prefer not; preloading already works).
- Verify no breakage for `liveRank`, `leagueCabinet`, `trophyCount` logic still used elsewhere.

**Backend/Contract Work**: None.

**Deliverables**:
- On `/profile/:wallet/command` (or default Command Center Overview), the four portfolio metrics appear in place of (or above) the old Ranking/Reputation cards.
- Data matches the balances shown in the retained "Balances" card.
- Wallet age uses profile.createdAt when present.
- Manual test: connect wallet with holdings → metrics populate; new wallet → graceful zeros; loading states visible.

**Dependencies**: Phases 2 and 3.

**Integration Points with Other Phases**: Phase 5 re-uses the exact same grid component for public consistency.

**Estimated Complexity**: Low-Medium (layout surgery on the 4-card grid; careful grid refactoring).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes — context already provides all needed values; hook uses public RPCs + cached price.
- Will this work after a Netlify deploy? Yes — identical data paths.
- Any direct fetch bypassing apiBase? No (re-uses context data + Phase 2 hook).
- netlify.toml / env? No.
- Visual/UX note: Removing two large cards frees significant vertical space; the replacement grid must not feel empty. Plan allows keeping a slim Balances summary if the 4 metrics feel too sparse.

### Phase 5: Integrate into Public Profile

**Goal**: Make the same four metrics visible to any visitor on a public profile page, using the generalized public path of the hook.

**Frontend Work**:
- Edit `src/pages/PublicProfile.tsx`:
  - Import `usePortfolioMetrics` and `PortfolioMetricsGrid`.
  - After the main header section (the `<section className="rounded-3xl border ... p-5 ...">` containing avatar + name + bio + RankBadgeCard, lines ~385-433), insert the metrics grid.
  - Call the hook with `targetAddress: profileWallet`, `chainId: activeChainId`.
  - For wallet age fallback (when !profile?.createdAt): pass `fallbackActivityTimestamps` derived from the already-loaded `createdCoins[].timeAgo` (convert), `visibleDrafts[].createdAt` or `updatedAt`, and `publicTrades[].blockTime` (earliest non-null).
  - The grid sits above the existing "Badges" + "Reputation" two-column section (or can be placed between header and badges per visual preference during implementation).
  - Loading state for metrics should not block the rest of the profile (profile, coins, drafts, activity load independently).
- No changes to the existing `PublicProfileStatsBar` (the "Coins" there is *created* count; new "COINS" metric is *held* count — they are intentionally different signals).
- Ensure the component works when the viewer has no wallet connected (the entire point of the public surface).

**Backend/Contract Work**: None.

**Deliverables**:
- Visiting `/profile/0x...` (any address) shows the four metrics under the header.
- For a wallet that has never edited a profile: age falls back to earliest visible activity timestamp.
- Data for holdings uses pure public RPC reads (no connected wallet required).
- Matches visual treatment of the Command Center integration.

**Dependencies**: Phases 2, 3, and 1 (for createdAt on profiles that have one).

**Integration Points with Other Phases**: Completes the two surfaces named in the idea document.

**Estimated Complexity**: Low (hook already handles the hard public-read case; mostly placement + fallback timestamp collection).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes.
- Will this work after a Netlify deploy? Yes.
- Any direct fetch bypassing apiBase? No (hook internals + existing profile/activity loads).
- netlify.toml / env? No.
- Performance note: Public profile already performs multiple parallel loads (created coins via fetchCampaigns + summaries, drafts, trades via realtime, badges). The metrics hook adds one more campaign scan + per-campaign balanceOf RPCs. This is acceptable per the "batch on load" non-goal; if hot, future optimization can cache summaries globally or add a lightweight backend holdings snapshot.

## Cross-Cutting Concerns

- **Shared Hook + Component Recommendation**: Yes — `usePortfolioMetrics` (Phase 2) + `PortfolioMetricsGrid` (Phase 3) are explicitly created and used on both surfaces. This satisfies the open questions in the idea document and prevents copy-paste derivation logic or divergent styling.
- **Where USD enrichment happens**: Client-side inside `usePortfolioMetrics` (or a `lib/portfolio.ts` helper), consuming summaries already fetched for balance detection. No backend change.
- **Wallet age source priority** (documented in hook): 1. `user_profiles.created_at` (after Phase 1), 2. Earliest draft/created coin/trade timestamp for the address, 3. "New".
- **Error & zero states**: Every card must render something sensible; hook returns explicit nulls/zeros; grid handles them without crashing.
- **Performance**: Preload pattern in Command Center avoids duplicate on-chain work. Public profiles accept the extra RPC cost (same as current "Created Coins" load).
- **Testing & Verification**: Each phase has explicit manual happy-path + error-state checks listed in the closeout checklist. No new unit test framework is introduced.
- **Styling**: All new UI re-uses exact classes and retro font conventions from `CommandCenterCard.tsx`, `PublicProfile.tsx` reputation signals, and `RankBadgeCard.tsx`. No new CSS files.
- **AGENTS.md Compliance**: Every phase explicitly answers the four Local vs Production questions. All our-backend calls (profile) go through the central layer after Phase 1. No netlify.toml edits.

## Future Phases / Follow-ups (not in this effort)
- Click-to-expand on "Total Value" or "Coins" to show a mini version of the existing Balances list.
- Backend snapshot endpoint for holdings to reduce public RPC chatter on popular profiles.
- "Portfolio" tab or deeper analytics inside Command Center.
- Using real-time trade events to keep the metrics fresh without full rescan.
- Exposing wallet age more broadly (e.g. in search results or leaderboards).

---
**End of Build Plan**