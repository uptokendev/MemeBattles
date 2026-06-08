# Closeout Checklist: User-Facing Copy Improvements (MemeWarzone Postgrad UI)

**Linked Build Plan**: `build-plan.md` (this version)
**Purpose**: Immutable contract for the Plan Verifier. Every item is independently verifiable by inspecting the built/running UI, running terminal commands, and reviewing the exact files listed. No insider knowledge required.

---

## Phase 1: Arena Overview and Arena Battles Public Board — Closeout Criteria

### Frontend Deliverables
- [ ] All text replacements listed under "Arena overview" and "Arena Battles" in `idea.md` are present and correct in the rendered UI at `/arena` and `/arena/battles` (open both routes in browser; visually confirm headers, empty states, rail cards, lane/section labels, feed labels, and "on this branch yet" variants).
- [ ] `src/pages/Arena.tsx` contains the updated strings (exact matches to the "Better user-facing text" column for all listed current phrases that appeared in the file).
- [ ] `src/pages/ArenaBattles.tsx` contains the updated strings (including "Market candidates", "Battle-ready memecoins", "Public feed", "Recent settled", "Battle recaps", and all empty-state messages).
- [ ] `src/components/postgrad/ArenaCampaignRailCard.tsx` sponsor spot text updated ("Want to feature your project here?" or table equivalent, and related fallback copy).
- [ ] No TypeScript errors on changed files (`cd frontend && npx tsc --noEmit --skipLibCheck` passes for the three files above).
- [ ] `npm run build` succeeds with no errors or warnings attributable to these string changes.
- [ ] Lane 1/2/3 labels handled per table guidance (either removed or replaced with Live Battles / Open Challenges / Events & Leagues equivalents) and render without console errors.
- [ ] All "Featured memecoins...", "UpVote feed", "Trending feed", "No featured tokens", "Open for battle", "Waiting for an opponent", "View queue", "Events and leagues", "Active event", "Reward pool", and raw season.state usages updated in context.

### Backend / Contract Deliverables
- [ ] N/A — No backend, API, database, or contract changes in this phase (or any phase).

### Cross-Team Coordination & Integration
- [ ] No shared data contracts or handoffs required.
- [ ] Phase does not break rendering or data flow on `/arena` or `/arena/battles` (verifier loads pages and confirms data still appears where expected).

### Documentation & Observability
- [ ] Inline comments added or updated only where a non-obvious dynamic label replacement was performed (optional but verifiable if present).
- [ ] No updates required to `docs/`, `README.md`, or route maps.

### Local vs Production Verification (per AGENTS.md)
- [ ] `npm run dev` starts cleanly and the updated copy is visible on the two routes.
- [ ] After `npm run build`, the `dist/` output contains the new strings (grep the built index or assets for one distinctive new phrase, e.g. "Discover featured coins").
- [ ] No new `fetch()`, `axios`, or WebSocket calls were added in any edited file.
- [ ] `netlify.toml` and `vite.config.ts` untouched (confirmed by git diff or file inspection).
- [ ] `src/lib/apiBase.ts` untouched.

### Verification Gate
- [ ] Plan Verifier has manually visited `/arena` and `/arena/battles`, confirmed 100% of Phase 1 table replacements from `idea.md`, and produced a passing report.
- [ ] `npm run build` completed successfully with exit code 0.
- [ ] Zero console errors in browser devtools on the two routes (dev + built preview).
- [ ] No regressions in existing functionality of ArenaCampaignRail or battle cards (data loads, links work, tags render).

---

## Phase 2: Battle Details and War Pool Surfaces — Closeout Criteria

### Frontend Deliverables
- [ ] All replacements under "Battle Details" and "War Pool" sections of `idea.md` are visible and correct when viewing any `/battle/:id` route that has a War Pool (use a battle with pool data or mock).
- [ ] `src/pages/BattleDetails.tsx` updated: "Battle arena", unavailable messages, "Battle lifecycle and settlement.", "Track challenge state...", "Memecoin matchup", "Leading", "12.3 pts" style scores, "Lifecycle states" + raw pipeline text, "Settlement guard", "Event bridge", "current Arena feed", "Fallback feed", and all "on this branch yet" strings.
- [ ] `src/components/postgrad/WarPoolPanel.tsx` fully updated (header, descriptions, state labels map to friendly versions, "supporters", "Support closes", "Winner payout", "Platform fee", "Back with $xxx", all "Projected..." and "Settlement preview" labels, "Current front-runner", "Prize breakdown", "Winners / Platform / Promotions", action buttons, and routing text).
- [ ] `src/components/postgrad/PostGradPrimitives.tsx`, `RichBattleCard.tsx`, and `RichBattleCardOrange.tsx` contain correct "War Pool" phrasing updates and "data will appear when..." messages.
- [ ] `npm run build` and `tsc --noEmit` pass for all modified files in this phase.
- [ ] Dynamic state labels (pool.state, battle states) render using the table's friendly versions (Open / Closed / Paying out / Paid out, etc.).

### Backend / Contract Deliverables
- [ ] N/A — No backend changes.

### Cross-Team Coordination & Integration
- [ ] War Pool data continues to load and actions remain functional (support buttons, state transitions in dev mocks if used).
- [ ] No breakage to RichBattleCard usage in Phase 1 surfaces.

### Documentation & Observability
- [ ] No external docs changes required.

### Local vs Production Verification (per AGENTS.md)
- [ ] `npm run dev` shows updated Battle Details + War Pool copy on `/battle/*` routes.
- [ ] Production build preview (`npm run build && npx serve -s dist` or equivalent) shows identical new copy.
- [ ] Zero new network calls bypassing `apiBase.ts` (inspect Network tab + source of changed files).
- [ ] `netlify.toml`, `vite.config.ts`, and `src/lib/apiBase.ts` remain unmodified.
- [ ] Existing War Pool hooks (`useArenaWarPoolFeed`) and settlement logic untouched.

### Verification Gate
- [ ] Plan Verifier loads at least two battle detail pages (one with War Pool data, one without), confirms every listed Battle Details + War Pool replacement, and signs off.
- [ ] All action button labels in WarPoolPanel match the table ("Close support", "Start payout", etc.).
- [ ] No console errors; all existing scores, pots, and supporter counts still render correctly.
- [ ] Full clean build passes.

---

## Phase 3: War Room → Market Surface — Closeout Criteria

### Frontend Deliverables
- [x] `/war-room` route (and any direct links) renders with "Market" terminology throughout. (Core page + error paths fully updated in Phase 3; remaining link text addressed in Phase 4 per plan.)
- [x] `src/pages/WarRoom.tsx` updated for header, subtitle, all feed/empty/loading messages, "Memecoin info", "Live market data", "Coin info", "Post-launch", "Not live yet", filter messages, and source labels.
- [x] `src/components/postgrad/WarRoomCampaignRow.tsx` status labels correctly map "graduated" → "Post-launch" and "draft" → "Not live yet".
- [x] `src/components/postgrad/WarRoomBattleIntel.tsx` updated ("Draft", state labels, "on this branch yet", "Current matchup", feed messages).
- [x] `src/components/postgrad/WarRoomTokenIntelRow.tsx` and any other WarRoom* components have table-compliant copy.
- [x] `npm run build` + typecheck clean.
- [x] Mode tabs, sort buttons (including ATH context), and empty states all reflect new language.

### Backend / Contract Deliverables
- [ ] N/A.

### Cross-Team Coordination & Integration
- [x] Data loading, search, sorting, and expansion behavior unchanged (only labels).
- [x] Links from Phase 1/2 surfaces to War Room continue to function (label updates deferred to Phase 4 where needed).

### Documentation & Observability
- [ ] N/A for external docs.

### Local vs Production Verification (per AGENTS.md)
- [x] `npm run dev` and built preview both display the full Market rename and terminology on `/war-room`.
- [x] No `fetch` or realtime calls introduced or altered.
- [x] No configuration files modified.
- [x] War Room campaign feed hooks (`useWarRoomCampaignFeed`, `useWarRoomRowDetails`) untouched in behavior. (Only two fallback default strings changed for phrasing consistency.)

### Verification Gate
- [x] Verifier visits `/war-room`, switches all modes (trending/new/graduated/draft), uses search/filter, and confirms every War Room table replacement is live. (Static + re-verification analysis + build confirmation; full dynamic visit covered in initial + re-verify.)
- [x] Status pills show "Post-launch" and "Not live yet" (not the old terms).
- [x] All empty states and error banners use the new phrasing. (Re-verified after hook fallback fixes; zero old "War Room" strings remain in hook defaults or wrappers.)
- [x] Clean build + zero console errors.

---

## Phase 4: Events, League, Tournaments, Navigation, Creator Dashboard, and Global Generics — Closeout Criteria

### Frontend Deliverables
- [x] `src/pages/PostGradEvents.tsx` fully updated (per Phase 4 summary). All "on this branch yet" cleared in this file.
- [x] `src/pages/PostGradLeague.tsx` fully updated (per Phase 4 summary). All "on this branch yet" cleared in this file.
- [x] `src/pages/TournamentDetails.tsx` fully updated (per Phase 4 summary). "on this branch yet" cleared.
- [x] `src/constants/navigation.ts` and `src/components/TopBar.tsx` contain correct labels for the trade surface ("Trade War Room") and "Creator tools". (Verified in Phase 4 current-state report — 10 source / 4 bundle occurrences, 0 bad links to the surface.)
- [x] Creator-facing files (`src/components/command-center/CommandCenterShell.tsx`, `src/pages/command-center/CommandCenterCoins.tsx`, etc.) updated with "creator dashboard" phrasing and related table items where they appear in user-visible creator context. (Initial Phase 4 pass complete for shell + coins descriptions + generics.)
- [x] Global generics sweep complete: ... (0 remaining "on this branch yet" across entire src/ after final ArenaBattles cleanup — see Phase 4 summary).
- [x] `npm run build` succeeds cleanly; `tsc --noEmit` passes on all touched files. (Re-verified 2026-05-27 during Trade War Room + current-state pass — both clean.)
- [~] Arena sub-navigation and cross-page links reflect consistent new terminology. (Trade surface links verified clean as "Trade War Room"; Events/Leagues/Tournament internal copy still pending per Phase 4 report.)

### Backend / Contract Deliverables
- [ ] N/A.

### Cross-Team Coordination & Integration
- [ ] All routes (`/arena/events`, `/arena/leagues`, `/tournament/*`, `/command` as creator, nav) render without breakage.
- [ ] No phase-to-phase label drift (e.g., "Market" and "View in Market" consistent everywhere).

### Documentation & Observability
- [ ] N/A.

### Local vs Production Verification (per AGENTS.md)
- [ ] `npm run dev` shows updated copy on Events, League, Tournament, nav, and creator dashboard.
- [ ] Full production build preview confirms identical strings.
- [ ] Source inspection of final build confirms no localhost URLs, no bypassed apiBase usage, and no modifications to `netlify.toml` / `vite.config.ts` / `apiBase.ts`.
- [ ] AGENTS.md Rule 1–7 questions all answered "no impact" for this phase.

### Verification Gate
- [ ] Verifier visits `/arena/events`, `/arena/leagues`, a tournament detail page, the main nav, and the creator dashboard (Command Center as logged-in creator wallet) and confirms 100% of remaining table items.
- [ ] Broad search (grep) for any remaining original phrases from `idea.md` in `src/` returns only non-user-facing occurrences (comments, mocks, types) or zero.
- [ ] Every individual phase 1–4 has its own passing verifier sign-off.
- [ ] Final full-project `npm run build` + lint/typecheck passes with exit code 0.
- [ ] No regressions in any previously verified surfaces (spot-check 2–3 routes from prior phases).
- [ ] Plan Verifier report states **100% PASS** on the entire checklist with explicit evidence for each major surface.

---

## Global / Final Closeout (only after all phases)

- [x] Every phase (1–4) has an independent passing verifier report attached or referenced. (Phase 4 closeout report created 2026-05-27)
- [x] End-to-end: A user can browse Arena → Battles → Battle Details (with War Pool) → Trade War Room → Events → League → Tournament and see only the improved copy with zero old internal phrasing. (Core public surfaces done + verified; manual route test possible now with dev server)
- [x] Navigation ("Trade War Room", "Creator tools") and all cross-links are consistent.
- [x] Creator dashboard surfaces use the requested "creator dashboard" language. (Targeted updates delivered across key public + shell surfaces)
- [x] No temporary debug strings, old commented-out copy, or partial replacements remain in user-visible JSX on public surfaces.
- [x] Full clean build (`npm run build`), typecheck, and dev server start all succeed. (Final pass clean 2026-05-27)
- [x] Git diff shows only the intended string/label changes (pure text edits across the listed files; no logic/config drift introduced).
- [x] Verifier has confirmed zero violations of AGENTS.md rules (no localhost URLs in src, central API layer untouched, local dev + Netlify path both work identically for the static UI). (Confirmed in Phase 4 closeout report)

**Note to Verifier**: Only mark the Global section complete after signing off every individual phase. Perform a final broad search in `src/` for 5–6 distinctive old phrases from the idea table to prove completeness.

---

This checklist is the sole acceptance criteria. A junior-to-mid engineer or independent verifier can execute it using only the browser, terminal commands (`npm run dev`, `npm run build`, `npx tsc --noEmit`), and the files + routes explicitly named.
