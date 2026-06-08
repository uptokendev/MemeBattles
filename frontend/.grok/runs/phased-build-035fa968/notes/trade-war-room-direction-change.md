# Direction Change: Trade Surface Naming (2026-05-27)

**Context**: During Phase 4 implementation of the copy improvements run, user feedback on the resumed session:

> "Calling it war-room doesnt instantly give users the idea its our trade room. So we need to rename it to the trade warroom"

**Previous state in this run**:
- Original source idea had "War Room" → "Market" (and we executed that in Phase 3).
- Nav + page labels were updated to "Market" + "market view" etc.

**New requirement**:
- The **trade / memecoin market surface** (the `/war-room` page showing trending coins, post-launch, bonding curves, support pools, etc.) must be called **"Trade War Room"** (or "Trade Warroom") so users immediately understand it is the place for trading / market activity on memecoins.

**Decision**:
- Display name: **"Trade War Room"** (title case with space for scannability and consistency with other nav items like "Battle Leagues" and "Creator tools").
- Route remains `/war-room` (and all related function names, feature flags `warRoom`, API paths `/api/war-room`, component names `WarRoom*`, hook names `useWarRoom*`, `getPostGradWarRoomSearchRoute`, etc. are left completely untouched — this is a pure presentation / label change only).
- The separate per-token **social/chat "War Room"** feature (TokenWarRoom.tsx + useWarRoom.ts + Ably channel + chat UI) is **explicitly left alone** and keeps its existing "War Room" naming (it is a distinct live chat/social surface).

**Files that will receive label updates** (trade surface only):
- Navigation (already partially done as "Market" → now "Trade War Room")
- TopBar
- WarRoom.tsx (page header, subtitle, source labels if they reference it)
- All cross links that currently say "War Room" or "Open in War Room" when pointing to the trade surface:
  - ArenaBattles.tsx
  - PostGradEvents.tsx
  - PostGradLeague.tsx
  - PostGradStatusStrip.tsx
- Any other visible references that clearly belong to the coin feed / market surface (not the chat).

**Out of scope for this change**:
- Any code identifiers
- Route paths or feature flag keys
- The social/chat War Room implementation and its strings
- Mock data comments that are not rendered to users
- Backend contracts

This supersedes the "Market" naming for the trade surface in the current phased-build effort.

Next: Implement the label changes safely, then re-verify build + manual surface check.
