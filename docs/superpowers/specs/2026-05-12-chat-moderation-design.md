# Live Chat Moderation — Design

**Date:** 2026-05-12
**Status:** Approved (pending spec review)
**Author:** Sven (with Claude)
**Related spec:** [Livestream Page (`/live`) — Design](./2026-05-12-livestream-page-design.md)
**Target event:** Launch party for "Prepare mode" — same launch as `/live`

## 1. Goal

Build a chat moderation surface on `mw-dashboard` so operators can monitor the live launch-party chat in real time and act on bad behavior. Two operator actions:

1. **Delete a message** (already partially in scope per the `/live` spec; this design makes it concrete and wires the producer side).
2. **Temp- or perma-mute a wallet** (new). Mute applies to the live chat only.

Also add the corresponding **consumer-side enforcement** in MemeBattles so mute events actually take effect.

## 2. Non-goals

- **Platform-wide bans.** Mute affects the live chat only. Muted wallets keep watching the stream, can still trade, view profiles, participate in squads, etc.
- **Persistent mute records.** Mutes live in the Ably channel's history alone. No Supabase row, no smart-contract state, no server-side mute table. A new stream on a fresh channel name starts clean.
- **Audit trail.** No `actor: <operator>` field on mute/delete events for V1. Anyone with mw-dashboard Supabase access is implicitly trusted.
- **Bulk operations.** No "select multiple and mute" / "select multiple and delete".
- **Server-side enforcement.** Mute is client-honest — clients voluntarily cooperate. A patched client can bypass mute on its own machine; other clients still drop the muted wallet's messages. Acceptable for a wallet-gated launch event.
- **Real-time mute-undo / soft-unmute.** Unmute is its own explicit event.
- **System announcements / pinning / kick / warn.** Out of scope.

## 3. Architecture

```
            Ably channel "live:launch-party"
                       ▲     ▲
                       │     │
      publish msg ─────┘     └──── publish msg, publish delete, publish mute, publish unmute
                       │                              │
   ┌───────────────────┴──┐              ┌────────────┴───────────────┐
   │  MemeBattles /live   │              │    mw-dashboard /live      │
   │  - viewers + chat    │              │  - operator-only           │
   │  - consume delete    │              │  - shows full feed         │
   │  - consume mute      │              │  - delete + mute UI        │
   │  - filter / disable  │              │  - currently-muted panel   │
   └──────────────────────┘              └────────────────────────────┘
```

**One Ably channel, two surfaces.** Both repos consume the same channel name (`live:launch-party`, configurable). mw-dashboard subscribes for the operator view AND publishes moderation events. MemeBattles continues to be the audience surface and now also enforces mute on its own clients.

**Auth model:**
- **mw-dashboard** is gated by Supabase email/password via existing `ProtectedRoute`. Anyone reaching `/live` on the dashboard is implicitly an operator.
- **Ably tokens for mw-dashboard** come from MemeBattles' existing `/api/ably/token` endpoint, via CORS. One source of truth for Ably auth; no key duplication.

## 4. Shared event contract

```ts
type LiveChatMessage = {
  id: string;
  wallet: string;            // lowercased convention recommended
  handle: string | null;
  squadCallsign: string | null;
  text: string;
  ts: number;
};

type LiveChatDelete = {
  type: "delete";
  msgId: string;
  ts: number;
};

type LiveChatMute = {
  type: "mute";
  wallet: string;            // lowercased
  until: number | null;      // null = perma; otherwise ms-epoch expiry
  ts: number;                // when the mute was issued
};

type LiveChatUnmute = {
  type: "unmute";
  wallet: string;            // lowercased
  ts: number;
};
```

These types live in **both** repos. Source of truth = this spec. They are tiny enough that manual sync between repos is acceptable; no shared package needed for V1.

Convention: all `wallet` values in mute/unmute events are **lowercased** by the publisher to keep comparison simple. Receivers also lowercase before comparing, defensively.

## 5. mw-dashboard side — what to build

### 5.1 New route

`/live` — new top-level route, behind existing `ProtectedRoute`. Sidebar entry labelled "Live Chat", placed between `/tickets` and `/stats`.

### 5.2 Page layout

```
┌─────────────────────────────────────────────────────────┐
│ LIVE / OFFLINE pill    •    12 watching    •  channel   │
├─────────────────────────────────────────────────────────┤
│  Message feed                          │  Currently muted │
│  (scrollable, newest at bottom)        │  ────────────── │
│                                        │  0xa…7c    1m   │
│  [MOD] @sven: keep it civil   ⋮ (kebab)│  0x4…1f   perma │
│  [BASED-007] @degen: lfg!     ⋮        │  (unmute btn)   │
│  0x12…cdef: gm                ⋮        │                 │
│                                        │                 │
└─────────────────────────────────────────────────────────┘
```

**Top bar:**
- `<LiveStatusPill />` — LIVE (red pulsing dot) or OFFLINE, driven by Mux HEAD probe against the same `VITE_LIVE_MUX_PLAYBACK_ID` MemeBattles uses
- `<ViewerCountChip />` — Ably presence count
- Channel name shown small, monospaced (operational reassurance: "you're looking at the right channel")

**Feed:** scrollable card. Each row is a `<MessageRow />` showing the same shield/callsign rendering rules as MemeBattles' chat (shared logic), plus a kebab `⋮` button revealing:
- Delete (shadcn popover confirm)
- Mute 1m
- Mute 5m
- Mute 10m
- Mute 1h
- Perma-mute
- Unmute (only shown when wallet is currently muted)

Five temp durations + perma + unmute = 6 actions per message (5 if not currently muted). Kebab menu, not inline buttons, to keep rows tight.

**Currently-muted panel:** right rail, shows active mutes with:
- Truncated wallet (`0xa…7c`)
- Remaining time (`4m 32s`) or `perma`, live-counting via a 1-second interval
- One-click "Unmute" affordance

When all mutes are inactive, panel shows "No active mutes."

### 5.3 Theming

Tactical/command-center aesthetic, scoped to the `/live` page only — does NOT bleed into `/tickets`, `/submissions`, etc. Achieved purely through Tailwind utilities (no CSS imports from MemeBattles, no global theme changes):

- Backgrounds: `bg-zinc-950`, `bg-zinc-900/60` cards, `border-zinc-800/60`
- Text: `text-zinc-100` body, `text-zinc-400` muted
- Accents: `text-red-400` LIVE/delete; `text-amber-400` MOD/perma-mute; `text-cyan-400` CALLSIGN; `text-orange-400` temp-mute
- Typography: `font-mono` for IDs/wallets/timestamps; `uppercase tracking-widest` for labels and section headers
- Cards: small radii (`rounded-sm`), subtle borders

### 5.4 Files

```
mw-dashboard/src/
├── pages/LivePage.tsx                       [new]
├── components/live/
│   ├── MessageRow.tsx                       row + kebab menu
│   ├── MutedListPanel.tsx                   active mutes + live countdown + unmute
│   ├── LiveStatusPill.tsx                   LIVE / OFFLINE from Mux HEAD probe
│   ├── ViewerCountChip.tsx                  Ably presence
│   └── DeleteConfirmPopover.tsx             shadcn popover for delete confirm (mute is one-click, no confirm)
├── hooks/useLiveChannel.ts                  Ably client + mute-map maintenance + publish helpers
└── lib/liveChat.ts                          shared types + render-rule helpers (shield/callsign)

mw-dashboard/.env.example                    new env vars (see 5.6)
mw-dashboard/package.json                    add `ably`
mw-dashboard/src/App.tsx (or routes file)    add <Route path="/live" /> + sidebar entry
```

### 5.5 `useLiveChannel` (mw-dashboard variant)

Differs from MemeBattles' equivalent:
- **No presence enter** (operators don't count themselves as viewers — keeps the count accurate)
- **No URL-strip / length-cap** (operators don't publish chat messages — only mute/delete events)
- **Exposes `publish` helpers**: `publishDelete(msgId)`, `publishMute(wallet, untilMs)`, `publishUnmute(wallet)`
- **Maintains an internal `Map<wallet, expiresAt | null>`** of currently-active mutes, exposed as `mutedWallets` for the right-rail panel

### 5.6 Env vars

```
# Shared with MemeBattles /live
VITE_LIVE_ABLY_AUTH_URL=https://memebattles.xyz/api/ably/token
VITE_LIVE_CHAT_CHANNEL=live:launch-party
VITE_LIVE_MUX_PLAYBACK_ID=
```

## 6. MemeBattles side — what changes

### 6.1 CORS allow-list on `/api/ably/token`

[`MemeBattles/frontend/api/ably/token.js`](../../frontend/api/ably/token.js) currently issues Ably tokens. Add an `Access-Control-Allow-Origin` response header allow-listing:
- `https://<mw-dashboard production origin>`
- `http://localhost:<mw-dashboard dev port>` (Vite default — confirm exact port)

Also support preflight `OPTIONS` if it isn't already.

~5 lines of change.

### 6.2 Mute consumption in `useLiveChannel`

Extend `MemeBattles/frontend/src/hooks/useLiveChannel.ts`:

- Subscribe to `mute` and `unmute` events alongside the existing `delete` handler
- Maintain a new `mutedWallets: Map<string, number | null>` (wallet lowercase → expiresAt or null for perma)
- Seed from `channel.history({ limit: 50 })` like delete events
- Auto-expire temp mutes via a 30-second `setInterval` tick that re-renders (drops entries with `expiresAt !== null && expiresAt < Date.now()`)
- Expose `mutedWallets`, plus a derived `isWalletMuted(wallet: string): boolean` helper
- On `unmute` event: drop matching entry from the map immediately

### 6.3 Message filtering in `LiveChat.tsx`

Skip rendering messages whose `wallet.toLowerCase()` is currently muted. One-line filter at the top of the `.map()`.

### 6.4 Self-mute UX in `LiveChatInput.tsx`

Add a `mutedUntil` prop:
- If `mutedUntil !== undefined && (mutedUntil === null || mutedUntil > Date.now())`, disable the input
- Placeholder text:
  - `null` (perma): `"You have been muted."`
  - temp: `"Muted — wait X more"` with countdown (live-updating)
- On the moment of transition from "not muted" → "muted", fire a sonner toast: `"You have been muted for X"` or `"You have been muted (perma)"`. Use a small `useEffect` watching for the transition (similar to the stream-interruption toast already in `LivestreamPlayer.tsx`).

### 6.5 Type updates

Extend `MemeBattles/frontend/src/lib/liveChat.ts` to export the new `LiveChatMute` / `LiveChatUnmute` types, matching the shared contract in Section 4.

## 7. Data flow — mute lifecycle

```
1. Operator opens mw-dashboard /live  →  Ably token  →  subscribe channel
2. Bad actor 0xABC posts spam  →  message appears in both surfaces' feed
3. Operator clicks ⋮ → Mute 5m on the offending row
4. mw-dashboard publishes { type: "mute", wallet: "0xabc", until: now+5min, ts: now }
5. All MemeBattles clients receive the mute event
   - Insert into mutedWallets map
   - LiveChat re-renders, dropping 0xabc's messages
   - If a client's own wallet === 0xabc → input disables + toast fires
6. 5 minutes later, the setInterval tick notices until < now, evicts the entry
   - LiveChat re-renders (0xabc's new messages appear again if they kept posting)
   - Self-muted client's input re-enables
7. Operator hits "Unmute" in the dashboard right-rail BEFORE 5min:
   - Publishes { type: "unmute", wallet: "0xabc", ts: now }
   - All clients drop the entry immediately
```

## 8. Error handling

| Scenario | Behavior |
|---|---|
| Ably auth fails (CORS misconfigured, MemeBattles down) | mw-dashboard `/live` shows a centered card: "Cannot connect to live channel — check `VITE_LIVE_ABLY_AUTH_URL`". A retry button re-attempts. |
| Operator clicks Delete twice rapidly | First publish wins; second is a duplicate delete event; receiver Set dedup makes it idempotent. |
| Operator double-clicks Mute | Same — duplicate mute events are idempotent (Map overwrites with same value). |
| Mute event arrives for a wallet not present in the feed | Still recorded in `mutedWallets` so when they DO post, their message is filtered. |
| Stream offline | `/live` dashboard page still works — feed visible, just no LIVE pill. Operators can pre-stage moderation, see lingering messages from a paused stream. |
| Supabase session expires mid-event | `ProtectedRoute` redirects to login. Ably client tears down cleanly on unmount. |
| Mute issued, then operator's dashboard reloads | Mute is in Ably history — re-fetched on mount, `mutedWallets` repopulated. No state lost. |
| Stream restarts on a NEW channel (different `VITE_LIVE_CHAT_CHANNEL`) | All mutes reset — by design. Mutes are channel-scoped, not platform-scoped. |

## 9. Trust model summary

**Operator authority:**
- Gated by Supabase email/password to mw-dashboard
- No per-message author signature; trust the Supabase login

**Client-honest enforcement for viewers:**
- MemeBattles clients voluntarily hide muted-wallet messages and disable input when self-muted
- A patched client can bypass mute on its own machine; **other clients still drop the muted wallet's messages**, so the disruption is contained
- Delete is the harder backstop — a deleted message is removed for everyone simultaneously (the message id is dropped, no patching can resurrect it on others' machines)
- Wallet rotation is the real escape hatch — a determined attacker connects a new wallet. Backstop: keep deleting + perma-mute the new one. Out of scope to solve permanently.

## 10. Testing

**Manual launch-night smoke checklist:**

- T-30: open mw-dashboard `/live`, see "No active mutes", `OFFLINE` pill, presence count `0` (you don't enter presence as operator)
- Connect a test wallet on MemeBattles `/live` from another browser → presence `1`, message appears when you type
- From mw-dashboard, click ⋮ → Delete → confirm → message vanishes on the MemeBattles side within ~1s
- From mw-dashboard, click ⋮ → Mute 1m → the test wallet's input disables + sees a toast; right-rail panel shows the wallet with `0m 59s` counting down
- Wait 1 minute → input re-enables, panel empties
- Mute → Unmute mid-mute → confirm immediate restore
- Perma-mute → reload the mw-dashboard page → confirm the mute persists in the right-rail panel (history seed works)
- New stream on a fresh channel name → confirm all mutes are gone

**No unit tests for V1** (consistent with the `/live` plan — manual checklist is the gate for a one-off launch event). If chat moderation becomes recurring, add Vitest in both repos.

## 11. Future work / V2 trigger (recurring cadence)

The team will run `/live` **every Tuesday and Thursday** for recurring AMA / shill-&-chill sessions. The V1 scope below is sized for the launch event only — when recurring usage starts, the following V1 simplifications will become real friction and need a V2 spec:

| V1 simplification | Why it becomes painful at recurrence |
|---|---|
| Client-honest mute enforcement | A determined troll who learned the pattern in one session will return and bypass. Move to server-side Ably token gating against a mute table. |
| No persistent mute storage | Operators re-mute the same offenders every session. Add a Supabase `live_chat_mutes` table that survives channel-name rotation. |
| Channel name `live:launch-party` | Doesn't fit recurring AMAs. Pick one of: persistent channel (`live:weekly`) for continuity, OR per-event channels (`live:ama-2026-05-21`) with mutes promoted from Supabase at channel-creation time. |
| Mutes reset on channel-name change | Becomes a foot-gun ("operators forget who they banned"). Solved by the Supabase persistence above. |
| No tests | 100+ stream events/year — the manual checklist becomes expensive. Add Vitest in both repos. |
| No audit log of who muted/deleted what | "Who silenced X?" will come up by session 5. Add an `actor: <supabase_user_email>` field to mute/delete events + a Supabase mod-actions log table. |
| No recording UX in mw-dashboard | Recurring shows usually have replay value. Surface Mux Asset IDs in the dashboard for post-session VOD publishing. |
| Stream key management | Mux's reusable Live Stream supports persistent stream keys — good for recurring. Already aligns. |

V2 should be drafted as a separate spec when V1 is in production and we have a session or two of real signal. Don't pre-design — wait for which V1 friction actually bites.

## 12. Out of scope (V1, explicit)

- Mute affecting any MemeBattles surface other than `/live` chat
- Persistent mute records in Supabase / on-chain / anywhere
- Bulk select-and-act
- Audit log / who-did-what tracking
- Server-side mute enforcement (Ably token rejection for muted wallets)
- "Tag" / pin / promote message
- System announcements published from dashboard
- Kick (force-disconnect)
- Per-operator role/permission system in dashboard
- Theming any other mw-dashboard page

## 13. Decisions & rationale (provenance)

| Decision | Why |
|---|---|
| Mute scoped to live chat only | User-directed — mute is for the launch event surface, not platform-wide |
| Client-honest enforcement | Wallet-gated audience makes the realistic attack surface small; server-enforced mute adds ~1 day of work; delete is the backstop |
| Implicit auth via Supabase login | User-directed — mirrors how `/tickets` and `/submissions` operate; no role table needed |
| Reuse MemeBattles `/api/ably/token` via CORS | User-directed — single source of truth for Ably auth, no key duplication |
| Five temp durations (1m / 5m / 10m / 1h / perma) | User-directed — allows escalation paths during a live event |
| Tactical theme scoped to `/live` page only | User wants tactical look; achieved via Tailwind utilities without CSS imports, so `/tickets` and others stay clean |
| Operators don't enter Ably presence | Keeps viewer count accurate to actual viewers |
| Operators don't publish chat messages | Out of scope; the dashboard is read+moderate, not a "system announcement" channel |
| No `actor` field on mute/delete events | YAGNI for V1; auth is implicit; can add later for audit |
| Mutes don't persist across channel-name changes | Channel-scoped state is a feature — fresh stream = fresh slate, by design |
