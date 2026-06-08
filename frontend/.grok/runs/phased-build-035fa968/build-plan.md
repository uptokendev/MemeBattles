# Build Plan: User-Facing Copy Improvements (MemeWarzone Postgrad UI)

**Idea Source**: `.grok/runs/phased-build-035fa968/idea.md`
**Date**: 2026-05-27
**Created By**: Architect Agent (phased-build skill)
**Status**: Draft

## Overview

This plan implements a comprehensive set of user-facing copy and terminology improvements across the primary public surfaces of the MemeWarzone frontend (the "postgrad" experience). The source idea document provides a detailed replacement table targeting internal-sounding language in Arena, Battles, Battle Details, War Room, Events, League, Tournament, War Pool, Command Center (creator surfaces), navigation, and generic phrases.

The work is **purely presentational text changes** in React/TSX components and label maps. No new features, no behavior changes, no API modifications, and no backend work are required or in scope. All changes are static strings or simple label objects rendered in the UI.

Primary files affected (identified via exhaustive grep + file reads):
- `src/pages/Arena.tsx`, `src/pages/ArenaBattles.tsx`, `src/pages/BattleDetails.tsx`, `src/pages/WarRoom.tsx`, `src/pages/PostGradEvents.tsx`, `src/pages/PostGradLeague.tsx`, `src/pages/TournamentDetails.tsx`
- `src/components/postgrad/` (ArenaCampaignRailCard.tsx, PostGradPrimitives.tsx, RichBattleCard.tsx, RichBattleCardOrange.tsx, WarPoolPanel.tsx, WarRoomCampaignRow.tsx, WarRoomBattleIntel.tsx, WarRoomTokenIntelRow.tsx and related)
- `src/constants/navigation.ts`, `src/components/TopBar.tsx`
- `src/components/command-center/` (primarily CommandCenterShell.tsx, CommandCenterCoins.tsx for creator-facing labels)
- Supporting label maps and dynamic formatting inside the above files (e.g., `bracketLabels`, `eventTypeLabels`, status resolution functions)

The effort is broken into four sequential, verifiable phases grouped by user surface. Each phase is independently testable by visiting the relevant routes in `npm run dev` (and after build).

## Out of Scope (Entire Effort)

- Any backend, API routes, database, Supabase, or Railway changes.
- Any smart contract or on-chain work.
- Logic, state, hooks, data fetching, or component behavior modifications (only string values and a few label map keys/values).
- Introduction of i18n, string resources, or central copy system.
- Updates to comments, log messages, mock data internals (unless the string is directly rendered in user-visible UI in the affected pages), error codes, or variable names.
- Route path changes, new pages, or navigation structure changes (labels only).
- Styling, Tailwind classes, layout, or visual design.
- Legacy non-postgrad pages/components unless they are actively rendered under current feature flags in `App.tsx`.
- Full string audit beyond the exact replacements listed in the idea document.
- Documentation updates outside of inline code comments where helpful for future maintainers.
- Changes to `netlify.toml`, `vite.config.ts`, environment variables, or `src/lib/apiBase.ts`.

## Phases

### Phase 1: Arena Overview and Arena Battles Public Board

**Goal**: Update all primary copy on the Arena landing (`/arena`) and the public Battles board (`/arena/battles`) plus the shared `ArenaCampaignRailCard` sponsor/featured rail components according to the replacement table.

**Frontend Work**:
- Edit `src/pages/Arena.tsx`: Replace section headers and labels including "Featured memecoins by UpVotes", "UpVote feed", "Trending feed", "No featured tokens", "Lane 1"/"Lane 2"/"Lane 3" (per guidance: prefer Live Battles / Open Challenges / Events & Leagues or remove), "Open for battle", "Open queue", "Waiting for an opponent", "View queue", "Events and leagues", "Active event", raw `season.state`, "Reward pool", various "on this branch yet" / "not available on this branch yet" messages, sponsored rail empty states, and related teaser copy.
- Edit `src/pages/ArenaBattles.tsx`: Update "Arena battles", "Market candidates", "Battle-ready memecoins", "Public feed", "Live board" intent, "Open queue", "Open for battle", "Recent settled", "Battle recaps", "Recent battle results", "archived" / "completed", all "on this branch yet" variants, "Campaign feed" → "Live market data" where appropriate, "Feed unavailable", and empty state messages.
- Edit `src/components/postgrad/ArenaCampaignRailCard.tsx`: Update sponsor spot language ("Want this sponsor spot? Click here." / "Want this sponsor spot?"), "Apply here", and any related fallback rail text.
- Minor supporting updates in any directly imported label computation used by these two pages.

**Backend/Contract Work**: None.

**Deliverables**:
- All strings listed for "Arena overview" and "Arena Battles" sections of the idea table replaced in the rendered UI on `/arena` and `/arena/battles`.
- Clean TypeScript, no new errors.
- Manual verification: happy-path rendering + empty states on both routes.

**Dependencies**: None (foundational public surface).

**Integration Points with Other Phases**: Shared rail component also used by Events/League pages (Phase 4). "War Room" links inside actions remain until Phase 3/4.

**Estimated Complexity**: Low (text replacements only; ~4 files).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes — pure static JSX/TS text.
- Will this work after a Netlify deploy (calls going through the Railway redirect)? Yes — identical static output.
- Are we introducing any direct `fetch()` calls that bypass `src/lib/apiBase.ts`? No.
- Do we need to touch `netlify.toml` or environment variable handling? No.
- API impact: None. All existing hooks/feeds continue to supply the same data; only display labels change.

### Phase 2: Battle Details and War Pool Surfaces

**Goal**: Apply all Battle Details and War Pool terminology replacements so that battle-focused pages and the support/payout UI use user-friendly language.

**Frontend Work**:
- Edit `src/pages/BattleDetails.tsx`: Replace "Battle arena", "Battle details unavailable.", "This battle could not be resolved from the current Arena feed.", "Battle lifecycle and settlement.", "Track challenge state...", "Arena battle", "Featured battle", "Battle details", "Memecoin matchup", "Leading", score formatting ("12.3 pts"), "Lifecycle states" + the raw state string, "Settlement guard" + its description, "Event bridge" + promotion text, and all "on this branch yet" / "current Arena feed" / "Fallback feed" variants.
- Edit `src/components/postgrad/WarPoolPanel.tsx`: Full replacement of "War Pool", "Spectator support and settlement routing", support descriptions, raw state labels (map to "Open / Closed / Paying out / Paid out"), "entries" → "supporters", "Cutoff", "Winner route", "Fees", support button text, "Settlement preview", all "Projected..." / "Current projected winner", "Winner side", "Other side", "Projected multiple", "Eligible winning entries", "Routing breakdown", "Winners / Protocol / Featured", action buttons ("Lock cutoff" etc.), and payout-related copy.
- Edit `src/components/postgrad/PostGradPrimitives.tsx`: Update "War Pool" titles/eyebrows, "Routing" section, "preview data", and any shared War Pool or generic phrasing rendered via `BattleCard`, `WarPoolModule`, etc.
- Edit `src/components/postgrad/RichBattleCard.tsx` and `src/components/postgrad/RichBattleCardOrange.tsx`: Update all inline "War Pool" tags, percentages, "War Pool data will appear..." messages, and related battle card labels.

**Backend/Contract Work**: None.

**Deliverables**:
- Complete application of Battle Details and War Pool sections from the replacement table across `/battle/:id` and embedded War Pool panels.
- All state-driven labels (pool.state, battle states) use the friendly versions from the table.

**Dependencies**: Phase 1 (some shared primitives and cards).

**Integration Points with Other Phases**: Battle cards and primitives are used in Arena pages (Phase 1) and War Room (Phase 3).

**Estimated Complexity**: Medium (higher number of dynamic + state-mapped strings; WarPoolPanel is dense).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes.
- Will this work after a Netlify deploy? Yes.
- Any direct fetch bypassing apiBase? No (War Pool data still comes through existing `useArenaWarPoolFeed` etc.).
- netlify.toml / env changes? No.
- API impact: None.

### Phase 3: War Room → Market Surface

**Goal**: Rename and rephrase the entire War Room experience to "Market" terminology and apply all listed replacements for market data, statuses, and empty states.

**Frontend Work**:
- Edit `src/pages/WarRoom.tsx`: Update page header "War Room", subtitle ("terminal-style surface"), "Campaign feed", error/empty messages ("War Room feed is unavailable...", "War Room campaign data...", "Loading War Room coins…", "No War Room campaigns...", filter messages), "Memecoin info", mode labels ("Graduated" → "Post-launch", "Draft" → "Not live yet"), sort labels including "ATH" context, and source labels.
- Edit `src/components/postgrad/WarRoomCampaignRow.tsx`: Update `statusLabel` mapping for "Graduated" / "Draft", "ATH" display, and any row-level descriptive text.
- Edit `src/components/postgrad/WarRoomBattleIntel.tsx`: Update "Draft", `resolveBattleStateLabel` ("Open for battle"), "Feed unavailable", "on this branch yet" messages, "Current matchup" / "Battle lane", and related intel copy.
- Edit `src/components/postgrad/WarRoomTokenIntelRow.tsx`: Any "War Pool", "Memecoin", or generic labels rendered in rows.
- Supporting: `src/features/postgrad/warRoomMetrics.ts` (status type + any exported label helpers if they produce user text; primarily leave implementation but update comments if they quote UI strings).

**Backend/Contract Work**: None.

**Deliverables**:
- `/war-room` (and linked usage from other pages) fully uses "Market" + table replacements.
- Status pills and filters reflect "Post-launch" / "Not live yet".

**Dependencies**: None direct, but shares cards with Phase 1/2.

**Integration Points with Other Phases**: "War Room" links from ArenaBattles, Events, League will be updated in Phase 4 for consistency. Nav change in Phase 4.

**Estimated Complexity**: Medium (core rename has high visibility; many filter/empty state variants).

**Local vs Production Impact**:
- Local dev: Yes.
- Netlify deploy: Yes.
- No new fetches or apiBase bypasses.
- No netlify / vite / env changes.
- API impact: None (War Room feed hooks unchanged).

### Phase 4: Events, League, Tournaments, Navigation, Creator Dashboard, and Global Generics

**Goal**: Complete remaining public surfaces (Events, League, Tournament), update persistent navigation and Command Center creator-facing labels, and perform a final sweep of all generic phrase replacements listed in the idea document.

**Frontend Work**:
- Edit `src/pages/PostGradEvents.tsx`: All "Arena events", "Scheduled competition, tournament watch...", "tournament watch" → "tournament tracker", "Event entrants", "Memecoins in the event picture", "Event entrant campaign data...", "Scheduled and deploying" → "Coming up", "queued", "Bracket-linked events" → "Tournaments", "tracked", "Archive" → "Past events", "Completed event history", "stored", "Open bracket", plus all event-specific "on this branch yet" messages and `bracketLabels` / `eventTypeLabels` maps.
- Edit `src/pages/PostGradLeague.tsx`: "Arena leagues", "Season standings...", "Track the current table", "Season leader", "Awaiting standings", "Promotion zone" / "Relegation zone", "Tokens currently marked...", "League entrants", "Memecoins in contention", "League table", "Current season standings", movement labels ("promoted" etc. and the example streak formatting), "Open in War Room" → "View in Market", "Season archive", "Archived ...", "Top finisher", all league "on this branch yet" messages, and `movementTone` / `stateTone` where they affect labels.
- Edit `src/pages/TournamentDetails.tsx`: "Tournament scaffold", "Bracket route, matchups...", "archive-readiness", "Bracket state", "Use this page to read tournament progress...", "Current", "Cleared", "Registration", "Completed", and related stage descriptions / source labels.
- Edit `src/constants/navigation.ts`: "War Room" → "Market", "Command Center" → "Creator tools" (or "Creator dashboard" per context in table).
- Edit `src/components/TopBar.tsx`: Any "War Room" labels in nav links.
- Edit creator-facing Command Center files: `src/components/command-center/CommandCenterShell.tsx` (shell copy about Command Center being private), `src/pages/command-center/CommandCenterCoins.tsx` ("Command Center", battle opt-in language, "Open for battle" / "View queue" in context, descriptions) and related cards/headers. Apply "creator dashboard" phrasing where table indicates.
- Global generics sweep across all previously edited files + any remaining occurrences: "on this branch yet" → "right now", "current Arena feed" → "live data", "fallback feed" → "backup data", "preview data" → "demo data", "current event feed", "tracked" → "shown", "stored" → "saved", "resolved", "routing" (in user strings) → "payout handling / flow", "lifecycle" → "progress", "adapter" → "system / service", and context-appropriate "campaign" → "coin" / "project".
- Final verification pass over all routes and shared components.

**Backend/Contract Work**: None.

**Deliverables**:
- Full coverage of Events, League, Tournament, Navigation, and creator dashboard sections of the table.
- 100% of generic phrases from the idea document replaced in user-visible strings.
- All navigation and cross-links updated consistently.
- `npm run build` succeeds with zero new errors.

**Dependencies**: Phases 1–3 (shared components and prior renames reduce duplication).

**Integration Points with Other Phases**: Final consolidation phase; touches nav used by everything.

**Estimated Complexity**: Medium-High (highest file count + final sweep to prevent drift).

**Local vs Production Impact**:
- Will this work with `npm run dev` locally? Yes.
- Will this work after a Netlify deploy? Yes.
- Any direct fetch bypassing `apiBase.ts`? No.
- netlify.toml / env / vite changes? No.
- API impact: None whatsoever.

## Cross-Cutting Concerns

- **No API or contract impact** in any phase (per AGENTS.md questions).
- All changes respect the central API layer (no fetches are added or modified).
- **Verification strategy**: Manual route-by-route inspection in dev server + production build. Use browser devtools to confirm exact strings from the table. Run `npm run build` after every phase.
- **Risk mitigation**: Perform replacements with unique multi-line or high-context `old_string` values (never blind global replace on short phrases like "War Pool"). Update label maps and dynamic resolvers in the same change as static strings.
- **Rollback**: Trivial — revert the specific string edits (git).
- Testing: No new unit tests required (copy-only). Existing build + typecheck is the gate.

## Future Phases / Follow-ups (not in this effort)

- Centralized string / copy management or light i18n if copy churn increases.
- User research validation of the new phrasing.
- Any additional surfaces discovered later (e.g., Profile, TokenDetails war room embeds) that quote the same internal terms.
- Potential follow-up to make "creator dashboard" vs "Command Center" naming fully consistent across all internal tools pages.

---

**Plan Sign-off Ready**: This plan provides a junior-to-mid engineer with exact files, concrete string targets from the source table, and clear verification steps for each phase while strictly obeying every rule in `AGENTS.md`.
