# Idea: Portfolio Metrics Cards (Total Value, Top Holding, Coins, Wallet Age)

## Background
Pump.fun-style quick portfolio overview is a strong signal for both the owner (in Command Center) and visitors (on Public Profile).

We want four compact metric cards:
- **TOTAL VALUE** — Aggregated USD value of native BNB + all held launchpad tokens.
- **TOP HOLDING** — The single largest position by USD value, showing token ticker + % of total portfolio.
- **COINS** — Count of distinct launchpad tokens the wallet currently holds.
- **WALLET AGE** — How long the wallet has been active (primarily from `user_profiles.created_at`).

**Key directive from stakeholders**: Maximize reuse of existing systems. Improve what we already have (`useProfileBalances`, `getReadProvider`, profile APIs, etc.). Do not create new hooks or major abstractions unless truly necessary. For public profiles, use server-side caching with ~1h refresh to keep on-chain calls reasonable.

Most raw balance data is already collected via `useProfileBalances.ts`. Pricing via `useBnbUsdPrice.ts`. Campaign market data via `launchpadClient`. `created_at` already exists in the DB.

## Goals
- Surface the four metrics in two surfaces:
  1. **Command Center → Overview tab**: Replace the current large "Ranking" + "Reputation" cards (user considers them overkill) with a clean 2x2 or 4-column grid of these portfolio metrics. Keep or move the existing "Balances" detail if useful.
  2. **Public Profile**: Insert the same four cards directly under the primary profile header card (the one containing PFP, display name, address, bio, rank badge, etc.).
- Compute USD values client-side where possible (using existing BNB price + token data).
- Make Top Holding and Total Value the most prominent.
- Ensure the cards are responsive and match our existing dark HUD aesthetic.
- Avoid new heavy backend work if the data can be derived from what we already load.

## Non-Goals / Out of Scope (for this effort)
- Full historical portfolio performance / charts.
- Including non-launchpad tokens or external DeFi positions.
- Real-time price WebSockets (batch on load is acceptable).
- Wallet age from raw first on-chain tx if it requires a new heavy indexer endpoint (fallback to profile creation date or first draft/coin activity is acceptable initially).
- Changing the existing detailed Balances list in Command Center (we can keep it or de-emphasize it).

## Placement Details
**Command Center Overview (`CommandCenterOverview.tsx`)**:
- Remove or heavily de-emphasize the current large "Ranking" and "Reputation" cards (they take significant vertical space for limited value in the current "this version" of the UI).
- In their place, introduce a responsive grid of the four new metric cards.
- Optionally keep a slim version of the existing "Balances" card below or integrate the detailed list into one of the new cards (e.g. click "Total Value" expands holdings).

**Public Profile (`PublicProfile.tsx`)**:
- Place the four cards in a grid immediately below the main profile info block (the card/section that shows avatar, name, address copy button, bio, rank, etc.).
- Use the same visual treatment as the Command Center cards for consistency.

## Key Technical Decisions (from deep research)
- **Improve, do not replace**: Extend `useProfileBalances.ts` (and the data exposed via `CommandCenterContext`) to also return derived portfolio metrics (`totalValueUsd`, `topHolding`, `coinsCount`). Extract pure calculation functions so the same logic can be reused on the backend.
- **Public profiles via cached backend**: Add a backend endpoint (or extend profile) that returns the four metrics for any address. Implement simple server-side caching (in-memory or DB-backed) with ~1 hour TTL + on-demand refresh. This keeps public RPC load reasonable while still allowing fresh data in Command Center.
- **Wallet Age**: Primary source = `user_profiles.created_at` (already exists in DB, just needs to be exposed in `api/profile.js` and `fetchUserProfile`).
- **No new top-level hook**: Do not create `usePortfolioMetrics`. Improve the existing balances system.
- **Public read provider**: Leverage existing `getReadProvider()` (already used in `launchpadClient`, `apiBase.ts` fallbacks, etc.) for the backend when refreshing cache.
- **USD calculation**: Reuse patterns already present in `warRoomMetrics.ts` and `FeaturedCampaigns` (balance × price derived from marketCapBnb + bnbUsd).

## Constraints (per AGENTS.md - Non-Negotiable)
- All API calls must go through `src/lib/apiBase.ts` (apiFetch / apiJson / apiUrl).
- Must work with `npm run dev` locally (Vite proxy).
- Must continue working after Netlify deploy (existing `/api/*` → Railway redirect must be sufficient).
- No new direct `fetch()` bypassing the central layer.
- No changes to `netlify.toml` unless explicitly required and documented.
- Prefer improving existing files over creating many new ones.

## Success Criteria
- Four metric cards render correctly in Command Center Overview (using improved `useProfileBalances` for freshest data).
- Same four cards render correctly on Public Profile (using the cached backend endpoint).
- Total Value, Top Holding (with %), Coins count, and Wallet Age are accurate and update reasonably.
- ~1h caching strategy for public holdings is implemented and documented.
- `created_at` is exposed and used for Wallet Age.
- No performance regression on profile loads.
- Full compliance with AGENTS.md (local + production verified).
- Cards match the pump.fun visual style from the reference image while fitting our HUD aesthetic.

---

**Idea Source**: Direct user request + reference image `pumpprofile.png` in `.grok/architect-feed/` + live pump.fun example.

**Priority**: Medium-High (strong user signal for profile signal density).

**Assumptions**:
- Most raw data exists; this is primarily a derivation + presentation task.
- We are comfortable de-emphasizing the current Ranking/Reputation cards in Command Center Overview for this iteration.