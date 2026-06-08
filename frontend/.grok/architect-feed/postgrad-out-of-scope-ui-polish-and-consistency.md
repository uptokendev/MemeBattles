# Post-Grad UI Polish & Consistency Changes (Outside Original Build Scope)

**Purpose of this document**
The original `buildplanclosoutpostgrad.md` defined the core PostGrad feature set (Arena lanes, battles, War Room compressed + expandable rows, War Pools, events, leagues, etc.). 

During implementation the user iteratively requested significant visual, structural, and usability refinements that go beyond the original plan. These changes deliver a much more cohesive experience across Command Center, War Room, Arena-related surfaces, and image handling.

**This document exists so these improvements are never accidentally reverted** during closeout, "cleanup", refactoring, or future feature work.

---

## 1. War Room (Trade War Room) — Layout & Scrolling

**Original plan intent** (Phase 7): Compressed token rows + expandable rows containing mini chart / trade panel / battle intel.

**Actual delivered (user-directed):**
- Constrained the entire War Room to the same `max-w-7xl mx-auto` width used by the Command Center (instead of full screen-wide). This creates a cleaner, more consistent reading width across creator tools and the trade surface.
- Removed the internal `max-h-[calc(100vh-220px)] overflow-y-auto` scroll container + the `overflow-hidden` on the main section.
- Result: The whole page now scrolls naturally (matching how Command Center pages behave). Tall expansions (charts + trade panels + battle intel) no longer fight an inner scrollbar.

**Files:**
- `frontend/src/pages/WarRoom.tsx` (root container class + list wrapper + section overflow)

**Why it must be preserved:** User explicitly stated the constrained width "just looks cleaner" and "whole page scroll works better".

---

## 2. Command Center Coins — Major Unification & "Launched Coins & Drafts"

This was one of the largest user-driven refactors.

**User request summary:**
- The original "battle controls + separate coins you hold + separate drafts" was "a complete mess".
- Combine everything into one filterable list using the **same expandable row pattern as the War Room**.
- Add a clean metric header row exactly like War Room: "Coin info | Market Cap | Liquidity | Volume | Holders | All-time high".
- Filters: All / Drafts / Launched / Open for Battle / In Battles (or similar).
- In the row expansion: show coin info + appropriate action buttons (Open for Battle, View Battle, Token Details) for coins and draft-specific fields for drafts.
- No buy/sell modals in the rows (info + navigation only).
- Preserve the "Find a Rival" matrix scanner below the list.

**Result:**
- New component: `CommandCenterCoinRow.tsx` (modeled directly on `WarRoomCampaignRow.tsx`).
- `CommandCenterCoins.tsx` was heavily refactored from separate PostGradCoinCard grids + draft cards into a single unified filterable row list.
- The metric header row was added for parity with War Room.

**Files:**
- `frontend/src/pages/command-center/CommandCenterCoins.tsx`
- `frontend/src/components/postgrad/CommandCenterCoinRow.tsx` (new)
- (Temporarily created but later de-emphasized: `PostGradCoinCard.tsx` for other surfaces)

**Why it must be preserved:** User said "we need to combine the 2" and "we also need just like the warroom to have a row of what the metrics mean".

---

## 3. Visual Coin/Card Consistency (Featured → All Surfaces)

Multiple rounds driven by user-provided screenshots (`featuredcards.png`, `battlecards.png`, `removediv.png`, `amess.png`).

**Key delivered rules (user-enforced):**
- All coin representations (except the exempted Prepare/Drafts grids) should feel like the FeaturedCampaigns cards.
- Square image column, 1:1 width split in some contexts, flush absolute inset-0 image positioning, gradient overlay, specific padding, font-retro titles, etc.
- Later pivot (per user): Use War Room-style rows for density in Command Center instead of tall cards.
- Specific technical fixes: removal of extra wrapper divs (red arrow in `removediv.png`), adjustment of widths, height reduction via rows.

**Files touched (some changes were partial/reverted per direction):**
- `frontend/src/components/postgrad/PostGradCoinCard.tsx` (created as the "canonical" 1:1 copy of Featured CSS)
- `frontend/src/components/postgrad/ArenaCampaignRailCard.tsx` (RailFrame wrapper removal)
- `frontend/src/components/postgrad/RichBattleCard.tsx` + `RichBattleCardOrange.tsx`
- Various battle/Arena surfaces briefly

**Important note:** The Prepare/Drafts grids were explicitly exempted ("the only exception is the campaign grid for campaigns and drafts").

---

## 4. Image Loading Reliability (IPFS + Hydration)

**Problem discovered:** Campaigns and War Room rows frequently showed only placeholders locally (and sometimes in prod), while drafts (which use direct HTTPS `logoUrl`) worked fine.

**Root cause:** `resolveImageUri` gateway ordering + lack of on-chain logoURI hydration for owner-created coins and War Room feed items.

**Fixes applied:**
- Switched primary gateway in `src/lib/media.ts` to `ipfs.io` with fallbacks (ipfs.io → Cloudflare → Pinata).
- Added `logoCache` + `useEffect` hydration using `fetchCampaignLogoURI` (from `useLaunchpad`) in:
  - `CommandCenterCoins.tsx` (for `createdCoins`)
  - `WarRoom.tsx` (for `rawCampaigns` from `useWarRoomCampaignFeed`)
- Declaration ordering discipline (see section 7) was critical to avoid TDZ crashes while adding these effects.

**Why it must be preserved:** User explicitly said "the featured cards also loads the placeholder image instead of the real image" and later confirmed "Alright that worked" after the combined TDZ + hydration fixes.

---

## 5. Command Center Discovery Features (Beyond Core Plan)

These were added on top of the basic "Command Center as home for challenger discovery" idea:

- **Battlefield Matrix Scanner** (`BattlefieldMatrixScanner.tsx`): Full "Autoselect for me" experience with matrix rain animation (~2.85s), live converging similarity %, real metrics (MC/holders/volume via `battleSimilarity.ts` pure functions) + flashy derived ones, reference coin selector, locked "RIVAL ACQUIRED" state, direct link to `/battle/:id`.
- **Incoming Challenges Banner** in `CommandCenterOverview.tsx`: Uses `useArenaBattleFeed` to surface active rival requests for the owner's coins with a prominent "RESPOND NOW IN COINS" CTA.

**Related pure logic:**
- `src/lib/battle/battleSimilarity.ts`

**Why preserved:** User reviewed the scanner direction ("Thus direction is perfect, go ahead") and later asked for richer list + stronger banner polish.

---

## 6. Portfolio Metrics (4-Card Grid)

Early in the arc: Added TOTAL VALUE / TOP HOLDING / COINS / WALLET AGE (with on-chain first activity binary search via `getFirstOnChainActivityTimestamp`) to both the private Command Center and public profiles.

- Rich client-side path for owner view (bypassing weak backend for self).
- 1h cache on backend for public views.
- Extracted `portfolioCalculations.ts`.

This was largely complete before the heavy PostGrad UI phase but is part of the "extra polish" surface.

---

## 7. Critical Technical Guardrail Learned (TDZ / Declaration Ordering)

Multiple black-screen crashes ("Cannot access 'xxx' before initialization") occurred when inserting new state/effects (logoCache hydration, unifiedItems memos, etc.) that referenced derived values declared later in the component body.

**Hard rule established:**
- Source hook results / memos (`createdCoins`, `rawCampaigns`, etc.) **must** be declared early.
- All dependent effects, memos, and derived state that close over them must come **after**.

This lesson was reinforced by the user: "For the warroom same errors we had before, you are AI so you need to learn from your mistakes."

Any future work that adds hooks/effects near the top of `CommandCenterCoins.tsx`, `WarRoom.tsx`, `PublicProfile.tsx`, etc. must respect this ordering.

---

## 8. Terminology & Minor UX Cleanups

- "War Room" → "Trade War Room" (and "WarRoom" route kept for compatibility).
- "Command Center" surfaces often referred to internally as "Creator tools".
- Removal of internal phrases ("on this branch yet", "Campaign feed") from user-facing text.
- Recruiter promo card exact visual alignment on homepage per reference image (soldier positioning, sizes, navigation to `/profile/{address}/command/recruiter`).

---

## 9. Files That Are Now "High Value / High Risk"

These files contain a lot of the user-directed consistency work and should be touched with extra care:

- `frontend/src/pages/WarRoom.tsx`
- `frontend/src/pages/command-center/CommandCenterCoins.tsx`
- `frontend/src/components/postgrad/CommandCenterCoinRow.tsx`
- `frontend/src/components/postgrad/WarRoomCampaignRow.tsx`
- `frontend/src/lib/media.ts` (resolveImageUri)
- `frontend/src/components/command-center/BattlefieldMatrixScanner.tsx`
- `frontend/src/lib/battle/battleSimilarity.ts`
- `frontend/src/pages/command-center/CommandCenterOverview.tsx` (banner)
- `frontend/AGENTS.md` (especially Rule 7)

---

## 10. How to Use This Document

- When doing any "cleanup", "refactor", "make it simpler", or closeout pass → cross-check this list first.
- If a proposed change would revert constrained width, whole-page scrolling, the unified Command Center row list + metric header, the matrix scanner, image hydration logic, or the declaration ordering discipline → flag it and get explicit user confirmation.
- New work should aim for **visual and interaction parity** with the patterns established here (War Room rows as the density pattern for owner coin lists, max-w-7xl for these surfaces, etc.).

---

## 11. Site-Wide Content Width Consistency (ContentContainer)

**Added later in the same arc** (user request: "for the launchpad page we need to do the same width as the warroom and the command center, in fact we need to do it for all pages").

**Delivered:**
- Created `ContentContainer` (single source of truth for the `mx-auto w-full max-w-7xl` pattern).
- Updated Command Center Layout, War Room, and the launchpad Create page (`/create`) to use it.
- Clear separation documented: content/tool pages (Command Center, War Room, Create, PublicProfile, Playbook, Status, Live, promotion flows, etc.) get the consistent comfortable width. Experiential pages (homepage/Showcase, Arena family + battles, TokenDetails, Prepare hero, Leagues, own Profile, Up* dashboards) intentionally stay wider or full-bleed.

**Files:**
- `frontend/src/components/layout/ContentContainer.tsx` (new)
- `frontend/src/components/command-center/CommandCenterLayout.tsx`
- `frontend/src/pages/WarRoom.tsx`
- `frontend/src/pages/Create.tsx` (launchpad root changed from the previous wide `max-w-[96rem]` outlier)
- Supporting updates in `AGENTS.md` (new "Layout & Width Consistency" pattern section)

**Protected principle:** Never force the 7xl constraint onto Category B experiential pages without explicit user approval. The component makes the correct usage obvious and auditable.

---

**Last updated:** Width consistency pass (launchpad + shared ContentContainer foundation).

**Maintained by:** Future agents must keep this document current when additional out-of-scope polish is accepted by the user.
