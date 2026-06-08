# Architect Summary: Portfolio Metrics Command Center + Public Profile

**Run Folder**: `frontend/.grok/runs/portfolio-metrics-2026/`
**Idea**: `frontend/.grok/architect-feed/add-portfolio-metrics-command-center-public-profile.md`
**Date**: 2026-05-27

## Key Findings from Exploration
- **Command Center Overview** (`src/pages/command-center/CommandCenterOverview.tsx` + `CommandCenterContext.tsx`): Already loads native + token balances via `useProfileBalances`, liveRank, leagueCabinet, profile. The two large cards (Ranking with big badge + progress, Reputation "No data yet") are the explicit candidates for replacement per the idea.
- **Public Profile** (`src/pages/PublicProfile.tsx`): Rich data loading (profile via `fetchUserProfile`, created coins via launchpad, drafts, activity via realtime, badges) but **zero holdings/balance data**. Primary header section (lines ~385-433) is the exact insertion point.
- **Balances Hook** (`src/hooks/profile/useProfileBalances.ts`): Excellent foundation (on-chain via ethers + campaign summaries). Critical limitation: always queries the connected `account`, not an arbitrary `viewedAddress`. Public profiles require a generalized reader using `getReadProvider` (already in `src/lib/readProvider.ts` and used in `apiBase.ts`).
- **Pricing** (`src/hooks/useBnbUsdPrice.ts`): Mature, cached, used widely (TokenDetails, WarRoom, Campaign grids). External CoinGecko fetch is pre-existing and acceptable.
- **Wallet Age**: `user_profiles.created_at` exists in DB (confirmed in `db/migrations/002_social.sql`, all SUPABASE_SCHEMA_FIX.sql files) but is **not selected or returned** by `api/profile.js` GET. Profile API + `fetchUserProfile`/`UserProfile` must be extended. Fallbacks (earliest draft/coin/trade) are already loaded in PublicProfile.
- **API Layer**: `src/lib/apiBase.ts` is the law. Current `fetchUserProfile` uses a partial bypass (raw fetch + apiUrl); Phase 1 fixes this. No netlify.toml changes ever needed for /api routes.
- **Styling**: Strong existing patterns in `CommandCenterCard.tsx`, PublicProfile reputation signals, `RankBadgeCard.tsx`, and `profileFormatters.ts`.

## Plan Highlights
- **5 small, verifiable phases** with mandatory "Local vs Production Impact" subsections in every phase (per AGENTS.md §3 and persona).
- **Strong recommendation implemented**: New shared `usePortfolioMetrics` hook (`src/hooks/profile/usePortfolioMetrics.ts`) + `PortfolioMetricsGrid` component (`src/components/profile/PortfolioMetricsGrid.tsx`).
- **Minimal backend**: Only exposing `created_at` in the existing `/api/profile` response (no new routes, no migrations).
- **Client-side derivation everywhere**: Position USD math from marketCapBnb + bnb price + balance fractions (leveraging work already done inside `launchpadClient.ts` and the balances hook).
- **Public holdings solved**: Generalized read-only balance fetcher using `getReadProvider` so metrics work with zero connected wallet.
- **De-emphasis of Ranking/Reputation**: Explicitly scoped in Phase 4 with visual + layout guidance.
- **AGENTS.md compliance**: Zero localhost hardcodes, all own-backend traffic via apiBase after Phase 1, no netlify changes, local dev + Netlify/Railway parity verified per phase.

## Risks & Mitigations Called Out
- Balance hook coupling to connected account → mitigated by new generalized reader (does not touch existing hook behavior).
- RPC load on public profiles → acceptable per idea "batch on load"; documented as future optimization.
- Visual density after removing two large cards → Phase 4 allows keeping slim Balances if the 4-metric grid feels sparse.

## Generated Artifacts
- `build-plan.md` — Full phased plan with exact file paths, component/hook names, and Local vs Production answers.
- `closeout-checklist.md` — Binary, verifier-executable checklist (one section per phase + global gate).
- This summary.

The plan is ready for user review / approval. A junior-to-mid engineer should be able to execute any single phase with zero clarifying questions.

**Next Step Recommendation**: User reviews both artifacts. Upon approval, kick off with `/phased-build` coordination or direct assignment of Phase 1 to a Frontend + Backend pair.
