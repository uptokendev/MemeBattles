# Livestream Page (`/live`) — Design

**Date:** 2026-05-12
**Status:** Approved (pending spec review)
**Author:** Sven (with Claude)
**Target event:** Launch party livestream for "Prepare mode"

## 1. Goal

Ship a `/live` page in the MemeBattles frontend so connected wallet users can watch a single launch-party livestream produced from OBS, with real-time chat alongside the video. Page is gated to wallet-connected users; chat surfaces squad affiliation and a moderator shield. Designed for a one-off event with a small audience (≤200 concurrent), but cheap to leave deployed and easy to retire post-event via a feature flag.

## 2. Non-goals

- Recurring creator-streaming product feature (this is a launch-event page, not a streaming platform)
- Multi-stream / multi-creator routing
- Provider-managed recording / VOD playback on the same page (recording is captured by Livepeer but we manually publish an edited VOD separately later)
- Sub-second WebRTC interactivity (no guest call-ins; OBS is the only ingest)
- Persistent chat history in Supabase / a database (Ably history is enough)
- Moderator UI inside the MemeBattles repo (lives in `mw-dashboard`)

## 3. Provider & infrastructure

**Live provider:** Livepeer Studio
- RTMP ingest from OBS: `rtmp://rtmp.livepeer.com/live` + stream key
- Playback via `@livepeer/react` SDK — defaults to WebRTC (sub-second), transparently falls back to LL-HLS (~3–5s)
- No API key needed client-side for public playback info

**Cost estimate (200 viewers × 2hr launch):** ~$5–10. Livepeer transcoding ~$0.005/min; egress included.

**Why Livepeer (vs alternatives considered):**
- Bunny.net: officially does not support RTMP ingest as of 2026-05-12 ("we are exploring what we can offer in the future")
- Cloudflare Stream: managed, $24 for the event, lowest risk — runner-up
- Mux: best React DX, ~$17–25, runner-up for polish
- Livepeer: thematically on-brand (crypto-native, fits MemeBattles aesthetic), cheapest managed option, sub-3s latency. Stream provisioning verified working on 2026-05-12.

## 4. Architecture

```
OBS (one machine)
   │  RTMP push
   ▼
rtmp://rtmp.livepeer.com/live  (Livepeer Studio: transcode + global edge)
   │
   │  HLS / WebRTC playback
   ▼
<LivestreamPlayer /> inside /live page in MemeBattles frontend
   │
   └─ Ably channel "live:launch-party"  ──► chat messages + presence (viewer count)
                                        ──► delete events from mw-dashboard moderators
```

- **No backend changes** in the MemeBattles repo: no new API routes, no DB migrations.
- Single env-var controlled stream — flip the playback ID + redeploy to ship a new event in the future.
- Feature-flagged at the route level: `VITE_LIVE_PAGE_ENABLED=false` causes `/live` to render `<NotFound />`, retiring the page without removing code.

## 5. Routing & access

**Route:** `<Route path="/live" element={<Live />} />` added to `frontend/src/App.tsx`, inside the existing `<BrowserRouter>` and persistent shell (Sidebar / TopBar / Footer / ScreenFrame).

**Access control:** wallet-connected users only. Uses existing `WalletProvider` / `useWallet()`. Unauthenticated viewers see a themed "Connect wallet to watch the launch party" CTA (reuse existing wallet-gate pattern in the codebase). Wallet disconnect during a session tears down the player and presence entry, returns the user to the gate.

## 6. Component layout

```
frontend/src/
├── pages/
│   └── Live.tsx                    [new] page shell, wallet gate, responsive layout
├── components/live/                [new directory]
│   ├── LivestreamPlayer.tsx        @livepeer/react Player primitives + offline fallback
│   ├── PlayerOffline.tsx           themed placeholder card (generic "stream starting soon")
│   ├── LiveChat.tsx                Ably channel UI (history seed + subscribe + render)
│   ├── LiveChatInput.tsx           throttled input (1 msg / 2s, 200 char cap, strip URLs)
│   ├── LiveBadge.tsx               LIVE / OFFLINE pill driven by playback status
│   └── ViewerCount.tsx             Ably presence count
└── lib/
    └── liveChat.ts                 message schema + Ably helpers (shared shape w/ mw-dashboard)
```

**Layout:**
- Desktop (`md:` and up): 70/30 split — player on left, chat rail on right
- Mobile: stacked — player on top, chat panel below

## 7. Player

Uses `@livepeer/react/player` composable primitives (`Player.Root`, `Player.Container`, `Player.Video`, `Player.Controls`).

```ts
// LivestreamPlayer.tsx (sketch)
const { data: src } = useQuery({
  queryKey: ["livepeer-playback", playbackId],
  queryFn: async () => {
    const res = await fetch(`https://livepeer.studio/api/playback/${playbackId}`);
    return getSrc(await res.json());
  },
  refetchInterval: 15_000, // detect offline→live transition without page refresh
});
```

- `src` is `null` while the stream is offline → render `<PlayerOffline />`
- WebRTC negotiation is automatic, LL-HLS fallback is automatic
- Controls themed via Tailwind classes to match the tactical-command-ui aesthetic
- Aspect ratio fixed 16:9; black background prevents player flicker on mode swap

## 8. Chat

**Channel:** `live:launch-party` (configurable via `VITE_LIVE_CHAT_CHANNEL`).

**Message schema** (shared contract with `mw-dashboard`):

```ts
type LiveChatMessage = {
  id: string;              // ULID, client-generated
  wallet: string;          // 0x...
  handle: string | null;   // display name from profile, if any
  squadCallsign: string | null; // null if unaffiliated
  text: string;
  ts: number;              // ms epoch
};
```

**Delete event** (published by mw-dashboard moderators on the same channel):

```ts
type LiveChatDelete = {
  type: "delete";
  msgId: string;
  ts: number;
};
```

Receiving clients filter out any message id present in the local "deleted" set.

**History seeding:** on mount, `channel.history({ limit: 50 })` populates the panel so late joiners see recent context.

**Identity & rendering:**

On page mount, fetch the connected wallet's squad membership once (cached for session via TanStack Query). The exact lookup endpoint (`/api/squads/{recruiterCode}/summary` or similar) is to be confirmed during implementation — if no public per-wallet squad lookup exists, add a small read-only `GET /api/wallets/:address/squad` route.

Render rules (priority order):

| Wallet matches mod list? | Squad callsign present? | Prefix in chat |
|---|---|---|
| yes | — | `🛡 [MOD] @handle` (shield always wins) |
| no | yes | `[CALLSIGN] @handle` |
| no | no | `@handle` (or short wallet if no handle) |

- Shield = `<Shield />` from `lucide-react` (already in deps), color from tactical command CSS variables
- `[MOD]` text tag accompanies the icon for screen-reader accessibility
- Handle falls back to `wallet.slice(0, 6) + "…" + wallet.slice(-4)` if profile handle is null

**Trust model — callsign:** clients embed their own callsign in the published message. Spoofing risk is accepted for V1 (one-event blast radius, mw-dashboard delete recourse). Tightening to a server-verified callsign claim is a post-launch evolution.

**Trust model — moderator status:** moderator status is **not** embedded in the message. It is computed client-side from `VITE_LIVE_CHAT_MODERATORS` (comma-separated wallet list at build time). Cannot be spoofed because the truth lives in the build, not in the payload. mw-dashboard maintains its own copy of the same list.

**Moderator match is case-insensitive.** Wallet addresses from `useWallet()` (via ethers) are typically EIP-55 checksummed mixed-case; env-var entries are often lowercased. Compare with `.toLowerCase()` on both sides before matching to avoid a silent miss on launch night.

**Rotating moderators requires a redeploy.** Acceptable for a one-off launch event; if `/live` becomes recurring, promote the list to runtime config (Supabase row, fetched at page load) so mods can be added/removed without rebuilding.

**Env-var exposure note.** `VITE_LIVE_CHAT_MODERATORS` ships in the client bundle (all `VITE_*` vars do). Wallet addresses are already public on-chain, so this is intentional and safe — but worth knowing it isn't a secret.

**Client-side safety on publish:**
- Trim whitespace, strip null/control characters
- Hard cap 200 characters
- Strip URLs (regex `https?://\S+` and `www\.\S+`) — keeps spam/scam links out for a wallet-gated audience without needing real moderation
- Throttle 1 message per 2 seconds per wallet (in-memory, not enforced server-side)

**Viewer count:** Ably channel presence. Every connected client enters presence; the page shows `channel.presence.get().length`. Each tab counts as one — documented limitation, not solved for V1.

## 9. Live indicator

Small pill in the top-right corner of the player container:

- `LIVE` with a red pulsing dot when the playback `src` is non-null and `Player.Root` reports playing
- `OFFLINE` (muted color) otherwise

Source of truth is the same TanStack Query poll that drives the player.

## 10. Error handling & edge cases

| Scenario | Behavior |
|---|---|
| Stream goes offline mid-event | Player swaps to `<PlayerOffline />`; chat keeps working; sonner toast: "Stream interrupted — back in a moment" |
| WebRTC negotiation fails | SDK auto-falls-back to LL-HLS — no UI change needed |
| Playback-info fetch fails (network / 5xx) | Render offline placeholder; TanStack Query retries every 15s |
| Ably connection fails | Chat panel shows "Chat unavailable — refresh to retry"; video keeps playing independently |
| User disconnects wallet mid-event | Redirect to wallet-gate CTA; player teardown; presence entry drops |
| Multiple tabs open by same wallet | Each tab = one presence entry; each tab = independent throttle bucket |
| Feature flag disabled (`VITE_LIVE_PAGE_ENABLED=false`) | Route renders `<NotFound />` |

## 11. Env vars (new)

Add to `.env.example` and document in the repo's existing env-var docs:

```
VITE_LIVEPEER_PLAYBACK_ID=<playback ID from Livepeer Studio dashboard>
VITE_LIVE_CHAT_CHANNEL=live:launch-party
VITE_LIVE_PAGE_ENABLED=true
VITE_LIVE_CHAT_MODERATORS=0x...,0x...     # comma-separated wallet addresses
```

The Ably API/auth wiring uses whatever pattern is already in place for token-comment realtime — no new key needed.

## 12. Cross-repo coordination with `mw-dashboard`

**Shared contract:**
- Ably channel name: `live:launch-party` (or whatever `VITE_LIVE_CHAT_CHANNEL` resolves to in this repo)
- `LiveChatMessage` schema (Section 8) — identical shape on both sides
- `LiveChatDelete` event — published by dashboard moderators, consumed by MemeBattles
- Moderator wallet list — maintained in both repos' env vars; same source-of-truth list

**What mw-dashboard owns:**
- Moderator-facing chat reader UI
- Publishing delete events
- Authenticating moderator wallets
- (Optionally, post-launch) ban/kick semantics

**What MemeBattles owns:**
- Watching and posting chat
- Consuming delete events (drop msgs from local state)
- Rendering the moderator shield based on its env-var moderator list

## 13. Dependencies

Add to `frontend/package.json`:

- `@livepeer/react` — current SDK with composable Player primitives

Already present (no install needed):

- `ably` — chat + presence
- `@tanstack/react-query` — playback-info polling + squad lookup caching
- `lucide-react` — Shield icon
- `sonner` — toasts for stream interruption
- `react-router-dom` — `/live` route

## 14. Testing

**Unit (Vitest):**
- `LivestreamPlayer`: renders `<PlayerOffline />` when src is null; renders `Player.Root` when src present
- `LiveChatInput`: throttles publishes; strips URLs; truncates >200 chars; trims whitespace
- `LiveChat`: applies moderator shield rule (including case-insensitive wallet match); applies callsign bracket rule; drops messages on delete events; seeds from history on mount
- `Live` page: renders wallet-gate CTA when disconnected; renders player + chat when connected; renders `<NotFound />` when feature flag off

**Manual launch-night checklist (more valuable than e2e for a one-off):**

- T-30 min: stream key validated in OBS; `/live` shows offline state on production; env vars confirmed deployed
- T-5 min: OBS Start Streaming → `/live` flips to live state within ~15s; latency feels <5s
- Phone on cellular: confirms CDN delivery from a non-office network
- Incognito with no wallet: confirms gate works
- Two wallets in different browsers: chat round-trips in real time
- Stop OBS: `/live` flips to offline within ~15s, no console errors
- mw-dashboard delete event: dispatch from dashboard, message disappears from MemeBattles within ~1s

**Not in scope:** Cypress e2e tests against Livepeer mocks — not worth wiring up for a one-off page.

## 15. Open implementation details (to confirm during planning)

- **Squad-lookup endpoint.** Must be resolved before planning starts because the answer affects Section 4's "no backend changes" claim:
  - **Path A (preferred):** an existing endpoint (e.g. `/api/wallets/:address` or similar) already returns squad affiliation. Plan stays purely frontend.
  - **Path B:** no such endpoint exists. Then either (i) add a small read-only `GET /api/wallets/:address/squad` route — explicitly amending Section 4 to allow this one backend addition, or (ii) call the existing `/api/squads/{recruiterCode}/summary` from the dashboard side and embed the callsign at message-publish time (but the publishing client doesn't know its own callsign without a lookup, so this loops back to needing an endpoint).
  - The implementation plan must pick A or B-i explicitly in its first step.
- Whether the existing wallet-gate CTA can be reused as-is or needs a thin wrapper for the `/live` context
- Tailwind theming of `@livepeer/react` Player.Controls to match tactical-command-ui CSS — small spike during implementation
- Ably client init: reuse the existing client/auth used by token comments, or instantiate a separate client for the live channel

## 16. Decisions & rationale (provenance)

| Decision | Why |
|---|---|
| Livepeer over Bunny.net | Bunny does not support RTMP live ingest as of today |
| Livepeer over Cloudflare/Mux | On-brand for crypto-native audience; cheaper at low scale; user already provisioned stream successfully |
| Native player vs YouTube/Twitch embed | User asked for native MemeBattles experience |
| Wallet-gated vs fully public | User answered: wallet-connected only |
| Generic offline placeholder vs countdown | User answered: generic — start time is flexible |
| Ably chat over skipping chat | User answered: keep chat; Ably already in stack |
| Moderation lives in mw-dashboard, not MemeBattles | User-directed separation of concerns |
| Shield always overrides squad callsign in chat prefix | Mod status is operationally important during a live event; squad affiliation is flavor — showing both is noisy |
| Moderator status computed client-side from env list | Cannot be spoofed; no message-payload trust required |
| No backend / DB changes | YAGNI for a one-off launch page |
| Feature flag at route level | Clean retirement without code removal |
