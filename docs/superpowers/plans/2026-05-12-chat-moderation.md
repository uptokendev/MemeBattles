# Chat Moderation Tool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-12-chat-moderation-design.md](../specs/2026-05-12-chat-moderation-design.md)

**Goal:** Build chat moderation (delete + temp/perma mute) across two repos so operators in `mw-dashboard` can act on bad behavior in the MemeBattles `/live` launch-party chat in real time.

**Architecture:** One shared Ably channel (`live:launch-party`) carries `LiveChatMessage`, `LiveChatDelete`, `LiveChatMute`, and `LiveChatUnmute` events. **Phase A** adds the consumer-side enforcement in MemeBattles (mute consumption, message filtering, self-mute UX, CORS allow-list on `/api/ably/token`). **Phase B** adds the producer-side UI in mw-dashboard (`/live` page with feed, kebab menu of delete + mute durations, currently-muted right rail, live status + viewer count). Mutes are channel-scoped, ephemeral, client-honest — no DB persistence in V1.

**Tech stack:**
- MemeBattles: React 18 + Vite + TS, existing `useLiveChannel` hook, Ably 2.x already wired
- mw-dashboard: React 19 + Vite + TS + Tailwind 4 + shadcn + Supabase auth, no Ably dep yet (Phase B adds it)
- Shared Ably channel + 4 small TypeScript types

**Test strategy (v1, pragmatic):** Neither frontend has Vitest infrastructure. Verification is via **manual launch-night smoke checklist** at the end of each phase. When `/live` becomes recurring product (Tue/Thu AMA cadence — see spec Section 11), Vitest is part of V2 scope.

---

## File map

### Phase A — MemeBattles (`/Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles`)

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/liveChat.ts` | Modify | Add `LiveChatMute` + `LiveChatUnmute` types |
| `frontend/src/hooks/useLiveChannel.ts` | Modify | Consume mute/unmute, maintain `mutedWallets` Map, expose helpers, 30s expiry tick |
| `frontend/src/components/live/LiveChat.tsx` | Modify | Filter rendered messages from muted wallets |
| `frontend/src/components/live/LiveChatInput.tsx` | Modify | New `mutedUntil` prop, disabled state, toasts (with mount guard) |
| `frontend/src/pages/Live.tsx` | Modify | Pass `mutedUntil` from hook to input |
| `frontend/api/ably/token.js` | Modify | CORS allow-list for mw-dashboard origin + OPTIONS preflight |

### Phase B — mw-dashboard (`/Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard`)

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `ably` |
| `.env.example` | Modify | Add 3 new env vars |
| `src/lib/liveChat.ts` | Create | Types + render helpers (mirror of MemeBattles, single source per spec Section 4) |
| `src/hooks/useLiveChannel.ts` | Create | Ably client + mute Map + publish helpers; **no presence enter** |
| `src/components/live/LiveStatusPill.tsx` | Create | LIVE / OFFLINE from Mux HEAD probe |
| `src/components/live/ViewerCountChip.tsx` | Create | Presence count chip |
| `src/components/live/MessageRow.tsx` | Create | Message + kebab menu (delete + 5 mute durations + unmute) |
| `src/components/live/MutedListPanel.tsx` | Create | Right-rail panel with 1-second countdown + unmute button |
| `src/components/live/DeleteConfirmPopover.tsx` | Create | shadcn popover-confirm wrapper for delete only |
| `src/pages/LivePage.tsx` | Create | Page shell with tactical theme scope |
| `src/App.tsx` | Modify | Add `<Route path="/live" element={<LivePage />} />` |
| `src/components/layout/Sidebar.tsx` | Modify | Add "Live Chat" nav entry |

---

# PHASE A — MemeBattles consumer-side enforcement

## Task A1: Add mute/unmute types to `lib/liveChat.ts`

**Files:**
- Modify: `frontend/src/lib/liveChat.ts`

- [ ] **Step A1.1** — Read the existing file to confirm current state:

```bash
sed -n '1,20p' /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend/src/lib/liveChat.ts
```

Expected: file starts with `// frontend/src/lib/liveChat.ts` and has `LiveChatMessage` + `LiveChatDelete` types already.

- [ ] **Step A1.2** — Insert these two new types right after the existing `LiveChatDelete` type definition (around line 16). Code to add **verbatim** (the `SYNC:` magic comment helps grep-confirm this file stays aligned with the mw-dashboard copy):

```ts
// SYNC: docs/superpowers/specs/2026-05-12-chat-moderation-design.md Section 4
// — keep LiveChatMute / LiveChatUnmute in sync with mw-dashboard/src/lib/liveChat.ts.
export type LiveChatMute = {
  type: "mute";
  wallet: string;             // lowercased convention
  until: number | null;       // null = perma; otherwise ms-epoch expiry
  ts: number;                 // when the mute was issued
};

export type LiveChatUnmute = {
  type: "unmute";
  wallet: string;             // lowercased
  ts: number;
};
```

- [ ] **Step A1.3** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && yarn build 2>&1 | tail -5
```

Expected: `✓ built in Xs` with no new TS errors mentioning `liveChat`.

- [ ] **Step A1.4** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/src/lib/liveChat.ts
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(live): add LiveChatMute and LiveChatUnmute event types"
```

---

## Task A2: Consume mute/unmute events in `useLiveChannel`

**Files:**
- Modify: `frontend/src/hooks/useLiveChannel.ts`

The hook currently subscribes to `delete` events and maintains a `deletedIds` Set. Extend the same pattern for `mute`/`unmute` with a `mutedWallets` Map and a 30s expiry tick.

- [ ] **Step A2.1** — Update the import line to include the new types:

Find: `import type { LiveChatDelete, LiveChatMessage } from "@/lib/liveChat";`

Replace with: `import type { LiveChatDelete, LiveChatMessage, LiveChatMute, LiveChatUnmute } from "@/lib/liveChat";`

- [ ] **Step A2.2** — Add a new state variable next to `deletedIds`:

Find the line: `const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());`

Add immediately after:

```ts
const [mutedWallets, setMutedWallets] = useState<Map<string, number | null>>(new Map());
```

- [ ] **Step A2.3** — Extend the `onMessage` handler to recognize mute/unmute events. Find the existing handler block (around line 65-80) that looks like:

```ts
const onMessage = (msg: Ably.Message) => {
  const data = msg.data;
  if (data?.type === "delete") {
    const d = data as LiveChatDelete;
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(d.msgId);
      return next;
    });
    return;
  }
  const m = data as LiveChatMessage;
  if (!m || !m.id) return;
  setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
};
```

Replace it with:

```ts
const onMessage = (msg: Ably.Message) => {
  const data = msg.data;
  if (data?.type === "delete") {
    const d = data as LiveChatDelete;
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(d.msgId);
      return next;
    });
    return;
  }
  if (data?.type === "mute") {
    const m = data as LiveChatMute;
    setMutedWallets((prev) => {
      const next = new Map(prev);
      next.set(m.wallet.toLowerCase(), m.until);
      return next;
    });
    return;
  }
  if (data?.type === "unmute") {
    const m = data as LiveChatUnmute;
    setMutedWallets((prev) => {
      const next = new Map(prev);
      next.delete(m.wallet.toLowerCase());
      return next;
    });
    return;
  }
  const m = data as LiveChatMessage;
  if (!m || !m.id) return;
  setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
};
```

- [ ] **Step A2.4** — Extend the history-seed block to also seed mute/unmute events. Find the existing history block (around line 95-110). **Important:** the actual file has a `// history returns newest-first; flip to chronological` comment between the for-loop and `seeded.reverse();` — include it in the Find string so the exact-match Edit succeeds:

```ts
channel
  .history({ limit: historyLimit })
  .then((page) => {
    const seeded: LiveChatMessage[] = [];
    for (const item of page.items) {
      const d = item.data;
      if (d?.type === "delete") {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.add((d as LiveChatDelete).msgId);
          return next;
        });
      } else if (d?.id) {
        seeded.push(d as LiveChatMessage);
      }
    }
    // history returns newest-first; flip to chronological
    seeded.reverse();
    setMessages((prev) => (prev.length === 0 ? seeded : prev));
  })
  .catch(() => { /* history is best-effort */ });
```

Replace with (note the **trailing `seeded.reverse()` is intentionally removed** — the new loop already iterates in chronological order via `[...page.items].reverse()` so the resulting `seeded` array is already chronological):

```ts
channel
  .history({ limit: historyLimit })
  .then((page) => {
    const seeded: LiveChatMessage[] = [];
    // Replay history in chronological order so later events override earlier
    // ones correctly (e.g. mute → unmute → re-mute lands in the right state).
    const items = [...page.items].reverse();
    for (const item of items) {
      const d = item.data;
      if (d?.type === "delete") {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.add((d as LiveChatDelete).msgId);
          return next;
        });
      } else if (d?.type === "mute") {
        const mm = d as LiveChatMute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.set(mm.wallet.toLowerCase(), mm.until);
          return next;
        });
      } else if (d?.type === "unmute") {
        const mm = d as LiveChatUnmute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.delete(mm.wallet.toLowerCase());
          return next;
        });
      } else if (d?.id) {
        seeded.push(d as LiveChatMessage);
      }
    }
    setMessages((prev) => (prev.length === 0 ? seeded : prev));
  })
  .catch(() => { /* history is best-effort */ });
```

Note the change: items are now consumed in chronological (forward) order, not reversed at the end. This keeps mute/unmute precedence correct.

- [ ] **Step A2.5** — Add a 30-second expiry tick inside the same `useEffect`, after the presence block. Find the existing presence block (around line 113-120):

```ts
channel.presence.enter({ at: Date.now() }).catch(() => { /* ignore */ });
```

Add immediately before it (so it lives inside the same effect and gets cleaned up properly):

```ts
// Expire temp mutes every 30s. Operator's right-rail in mw-dashboard ticks
// at 1s for precision; viewers tolerate ~30s lag.
const expiryInterval = window.setInterval(() => {
  setMutedWallets((prev) => {
    const now = Date.now();
    let mutated = false;
    const next = new Map(prev);
    for (const [w, until] of prev) {
      if (until !== null && until < now) {
        next.delete(w);
        mutated = true;
      }
    }
    return mutated ? next : prev;
  });
}, 30_000);
```

- [ ] **Step A2.6** — Add the interval to the cleanup return. Find the cleanup block at the end of the effect:

```ts
return () => {
  try { channel.presence.leave(); } catch {}
  channel.unsubscribe();
  client.connection.off();
  client.close();
  clientRef.current = null;
  setConnected(false);
  setPresenceCount(0);
};
```

Replace with:

```ts
return () => {
  window.clearInterval(expiryInterval);
  try { channel.presence.leave(); } catch {}
  channel.unsubscribe();
  client.connection.off();
  client.close();
  clientRef.current = null;
  setConnected(false);
  setPresenceCount(0);
};
```

- [ ] **Step A2.7** — Expose `mutedWallets` and helper functions in the hook's return value. Find the existing return block:

```ts
return { messages: visibleMessages, publish, presenceCount, connected };
```

Replace with:

```ts
const isWalletMuted = (wallet: string): boolean => {
  if (!wallet) return false;
  const until = mutedWallets.get(wallet.toLowerCase());
  if (until === undefined) return false; // not muted
  if (until === null) return true;        // perma
  return until > Date.now();              // temp, still active
};

const getMuteExpiry = (wallet: string): number | null | undefined => {
  if (!wallet) return undefined;
  return mutedWallets.get(wallet.toLowerCase());
};

return {
  messages: visibleMessages,
  publish,
  presenceCount,
  connected,
  mutedWallets,
  isWalletMuted,
  getMuteExpiry,
};
```

- [ ] **Step A2.8** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && yarn build 2>&1 | tail -10
```

Expected: no new TS errors. If TypeScript complains about `for (const [w, until] of prev)` — the Map type signature should be `Map<string, number | null>` so iteration is `[string, number | null]`. That's fine.

- [ ] **Step A2.9** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/src/hooks/useLiveChannel.ts
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(live): consume mute/unmute events in useLiveChannel with 30s expiry"
```

---

## Task A3: Filter muted-wallet messages in `LiveChat.tsx`

**Files:**
- Modify: `frontend/src/components/live/LiveChat.tsx`

- [ ] **Step A3.1** — Add a new `mutedWallets` prop. Update the props type. Find:

```tsx
type Props = {
  messages: LiveChatMessage[];
};
```

Replace with:

```tsx
type Props = {
  messages: LiveChatMessage[];
  mutedWallets: Map<string, number | null>;
};
```

- [ ] **Step A3.2** — Destructure the new prop in the component signature. Find:

```tsx
export const LiveChat = ({ messages }: Props) => {
```

Replace with:

```tsx
export const LiveChat = ({ messages, mutedWallets }: Props) => {
```

- [ ] **Step A3.3** — Add a derived filter at the top of the render (just before `messages.map`). Find:

```tsx
      {messages.map((m) => {
```

Replace with:

```tsx
      {messages
        .filter((m) => {
          const until = mutedWallets.get(m.wallet.toLowerCase());
          if (until === undefined) return true;
          if (until === null) return false;       // perma — hide
          return until <= Date.now();              // temp expired? show again
        })
        .map((m) => {
```

- [ ] **Step A3.4** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && yarn build 2>&1 | tail -5
```

Expected: no new errors. TypeScript may complain that `Live.tsx` is passing a `LiveChatMessage[]` but not the new `mutedWallets` prop — that's resolved in Task A5.

- [ ] **Step A3.5** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/src/components/live/LiveChat.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(live): filter muted-wallet messages from chat feed"
```

---

## Task A4: Self-mute UX in `LiveChatInput.tsx` (disabled state + toasts)

**Files:**
- Modify: `frontend/src/components/live/LiveChatInput.tsx`

- [ ] **Step A4.1** — Extend the props type. Find:

```tsx
type Props = {
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  disabled?: boolean;
  onSend: (msg: LiveChatMessage) => Promise<void> | void;
};
```

Replace with:

```tsx
type Props = {
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  disabled?: boolean;
  /** Mute expiry: undefined = not muted, null = perma, number = ms-epoch expiry */
  mutedUntil?: number | null;
  onSend: (msg: LiveChatMessage) => Promise<void> | void;
};
```

- [ ] **Step A4.2** — Update the component signature to accept the new prop. Find:

```tsx
export const LiveChatInput = ({ wallet, handle, squadCallsign, disabled, onSend }: Props) => {
```

Replace with:

```tsx
export const LiveChatInput = ({ wallet, handle, squadCallsign, disabled, mutedUntil, onSend }: Props) => {
```

- [ ] **Step A4.3** — Add `useEffect` and `useRef` to the React import. Find:

```tsx
import { useRef, useState } from "react";
```

Replace with:

```tsx
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step A4.4** — Add mute-derived state and the transition-watcher effect at the top of the component body (right after `const [value, setValue] = useState("");`). Code to insert:

```tsx
  // Derive whether the user is currently muted (perma OR temp not yet expired)
  const isMuted =
    mutedUntil !== undefined && (mutedUntil === null || mutedUntil > Date.now());

  // Initial-mount guard: don't fire a toast on first render if the user is
  // already muted (reload scenario — they already know). Only fire on actual
  // not-muted → muted and muted → not-muted transitions.
  const prevMutedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevMutedRef.current === null) {
      // First render — record state, no toast
      prevMutedRef.current = isMuted;
      return;
    }
    if (prevMutedRef.current === false && isMuted) {
      // not-muted → muted
      if (mutedUntil === null) {
        toast.error("You have been muted (perma).");
      } else if (mutedUntil !== undefined) {
        const remainingSec = Math.max(0, Math.round((mutedUntil - Date.now()) / 1000));
        toast.error(`You have been muted for ${formatRemaining(remainingSec)}.`);
      }
    } else if (prevMutedRef.current === true && !isMuted) {
      // muted → not muted
      toast("You can chat again.");
    }
    prevMutedRef.current = isMuted;
  }, [isMuted, mutedUntil]);
```

- [ ] **Step A4.5** — Add the `formatRemaining` helper above the component. Find the line:

```tsx
type Props = {
```

Insert immediately before it:

```tsx
function formatRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

```

- [ ] **Step A4.6** — Block submit when muted and update the form to reflect muted state. Find the submit function start:

```tsx
  const submit = async () => {
    if (pending) return;
    const text = sanitizeChatText(value);
    if (!text) return;
```

Replace with:

```tsx
  const submit = async () => {
    if (pending || isMuted) return;
    const text = sanitizeChatText(value);
    if (!text) return;
```

- [ ] **Step A4.7** — Update the `<Input>` AND `<Button>` together so the disabled-when-muted state covers both, in one clean find/replace. Find this exact block (Input + closing tag + Button opening):

```tsx
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHAT_LENGTH))}
        placeholder={disabled ? "Comms disabled" : "Send transmission…"}
        disabled={disabled || pending}
        maxLength={MAX_CHAT_LENGTH}
        className="font-mono"
      />
      <Button type="submit" size="icon" disabled={disabled || pending || !value.trim()}>
```

Replace with:

```tsx
      <Input
        value={isMuted ? "" : value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHAT_LENGTH))}
        placeholder={
          isMuted
            ? "You have been muted."
            : disabled
              ? "Comms disabled"
              : "Send transmission…"
        }
        disabled={disabled || pending || isMuted}
        maxLength={MAX_CHAT_LENGTH}
        className="font-mono"
      />
      <Button type="submit" size="icon" disabled={disabled || pending || isMuted || !value.trim()}>
```

Note: the perma vs temp wording is intentionally the same ("You have been muted.") for V1 — the duration detail is carried by the toast (Task A4.4). A live countdown in the placeholder is V2 polish.

- [ ] **Step A4.8** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && yarn build 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step A4.9** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/src/components/live/LiveChatInput.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(live): self-mute input UX with toasts and mount guard"
```

---

## Task A5: Wire mute state through `Live.tsx`

**Files:**
- Modify: `frontend/src/pages/Live.tsx`

- [ ] **Step A5.1** — Update the destructure from `useLiveChannel`. Find:

```tsx
  const { messages, publish, presenceCount, connected } = useLiveChannel({
```

Replace with:

```tsx
  const { messages, publish, presenceCount, connected, mutedWallets, getMuteExpiry } = useLiveChannel({
```

- [ ] **Step A5.2** — Compute the current user's mute state. Add after the existing `const handle = ...` line:

```tsx
  // undefined = not muted; null = perma; number = ms-epoch expiry
  const ownMutedUntil = getMuteExpiry(account);
```

- [ ] **Step A5.3** — Pass `mutedWallets` to `<LiveChat>` and `mutedUntil` to `<LiveChatInput>`. Find:

```tsx
          <div className="min-h-0 flex-1">
            <LiveChat messages={PREVIEW_MODE ? PREVIEW_MESSAGES : messages} />
          </div>
          <LiveChatInput
            wallet={account}
            handle={handle}
            squadCallsign={squadCallsign}
            disabled={!connected}
            onSend={publish}
          />
```

Replace with:

```tsx
          <div className="min-h-0 flex-1">
            <LiveChat
              messages={PREVIEW_MODE ? PREVIEW_MESSAGES : messages}
              mutedWallets={mutedWallets}
            />
          </div>
          <LiveChatInput
            wallet={account}
            handle={handle}
            squadCallsign={squadCallsign}
            disabled={!connected}
            mutedUntil={ownMutedUntil}
            onSend={publish}
          />
```

- [ ] **Step A5.4** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && yarn build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step A5.5** — Smoke-test locally (Vite dev server, real Ably):
  1. Set `VITE_LIVE_CHAT_PREVIEW=0` and `VITE_ENABLE_LOCAL_ABLY=1` in `frontend/.env.local`
  2. Run `yarn dev` (netlify dev) from `frontend/`
  3. Open `localhost:<port>/live`, connect wallet, post a message
  4. Open Ably dev console (https://ably.com/accounts/<acct>/apps/<app>/dev-console) → publish to channel `live:launch-party`:
     ```json
     { "type": "mute", "wallet": "<your-connected-wallet-lowercase>", "until": <Date.now() + 60000>, "ts": <Date.now()> }
     ```
  5. The page should: input goes disabled, sonner toast "You have been muted for 1m" fires, your own messages disappear from the feed
  6. Publish unmute event:
     ```json
     { "type": "unmute", "wallet": "<same wallet>", "ts": <Date.now()> }
     ```
  7. Input re-enables, "You can chat again." toast fires, messages reappear

If any of those don't work, debug before committing.

- [ ] **Step A5.6** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/src/pages/Live.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(live): wire mute state from useLiveChannel into chat + input"
```

---

## Task A6: CORS allow-list on `/api/ably/token`

**Files:**
- Modify: `frontend/api/ably/token.js`

mw-dashboard will hit this endpoint cross-origin. Add the allow-list + preflight OPTIONS support.

- [ ] **Step A6.1** — Read the current top of the handler so the patch goes in the right place:

```bash
sed -n '37,50p' /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend/api/ably/token.js
```

Expected: handler starts with `export default async function handler(req, res) {` followed by a method check.

- [ ] **Step A6.2** — Add an allow-list and CORS helper at the top of the file, after the existing imports. Find:

```js
import Ably from "ably";
import { badMethod, getQuery, isAddress, json } from "../../server/http.js";
```

Insert immediately after:

```js
// CORS allow-list for cross-origin access from mw-dashboard.
// Production origin is TBD by deploy config; set MW_DASHBOARD_ORIGIN env var.
// Vite default dev port for mw-dashboard is 5173 — confirm in mw-dashboard/vite.config.ts.
const MW_DASHBOARD_ALLOWED_ORIGINS = [
  String(process.env.MW_DASHBOARD_ORIGIN || "").trim(),
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (MW_DASHBOARD_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-max-age", "600");
  }
}
```

- [ ] **Step A6.3** — Wire CORS + OPTIONS preflight into the handler. Find:

```js
export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  res.setHeader("cache-control", "no-store");
```

Replace with:

```js
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") return badMethod(res);

  res.setHeader("cache-control", "no-store");
```

- [ ] **Step A6.4** — Build (the api/ files are CommonJS, so just a syntax sanity-check via node):

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend && node --check api/ably/token.js && echo "syntax ok"
```

Expected: `syntax ok`. If you get a parse error, re-read the inserted blocks.

- [ ] **Step A6.5 (optional but recommended)** — Smoke-test CORS preflight against a running netlify dev server. With `yarn dev` running in `frontend/`:

```bash
curl -is -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:8888/api/ably/token | head -20
```

(Replace `8888` with whichever port netlify dev binds to.)

Expected: `HTTP/1.1 204 No Content` with response headers including `access-control-allow-origin: http://localhost:5173`. If the header is missing, the allow-list isn't matching — check that `localhost:5173` is in `MW_DASHBOARD_ALLOWED_ORIGINS` and that `req.headers.origin` is being read correctly.

- [ ] **Step A6.6** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles add frontend/api/ably/token.js
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles commit -m "feat(api): CORS allow-list mw-dashboard on /api/ably/token"
```

---

## Phase A verification checkpoint

Before starting Phase B, confirm:

- [ ] Steps A1–A6 are all committed (6 commits, all `feat(live)` / `feat(api)` prefix)
- [ ] `yarn build` in `frontend/` is green
- [ ] The smoke test in A5.5 succeeded (mute event → input disables + toast; unmute → re-enable + toast)
- [ ] The `mutedWallets` Map populates correctly when you reload the page after a mute event has fired (history seeding works)

If all green, proceed to Phase B.

---

# PHASE B — mw-dashboard producer-side UI

**Working directory for Phase B:** `/Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard`

**Branch:** mw-dashboard is on `main` with a clean working tree. Recent commits use bare conventional-commits style (`fix(promotors): ...`). No Co-Authored-By trailer. Follow the same convention.

## Task B1: Install Ably + add env vars + register route

**Files:**
- Modify: `package.json`
- Modify: `.env.example` (create if missing)
- Modify: `src/App.tsx`

- [ ] **Step B1.1** — Install `ably`:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard
npm install ably
```

Expected: `ably@^2.x.x` added under dependencies.

- [ ] **Step B1.2** — Document new env vars in `.env.example`. If the file doesn't exist, create it. Read it first:

```bash
test -f /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard/.env.example && cat /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard/.env.example || echo "(file does not exist yet)"
```

Append (or create with) this block at the end, leaving one blank line before it if there's existing content:

```dotenv
# -----------------------------
# /live chat moderation (consumes & publishes to MemeBattles Ably channel)
# -----------------------------

# MemeBattles host that serves /api/ably/token. mw-dashboard browser hits this
# cross-origin; the MemeBattles side must have MW_DASHBOARD_ORIGIN env set to
# this dashboard's origin for CORS to succeed.
VITE_LIVE_ABLY_AUTH_URL=https://<memebattles-prod-host>/api/ably/token

# Live chat Ably channel name. Must match MemeBattles' VITE_LIVE_CHAT_CHANNEL.
# Channel slug regex on the token endpoint: ^live:[a-z0-9._-]+$
VITE_LIVE_CHAT_CHANNEL=live:launch-party

# Same Mux playback ID MemeBattles uses for the live stream — drives the
# LIVE/OFFLINE status pill in the moderation header.
VITE_MUX_PLAYBACK_ID=
```

- [ ] **Step B1.3** — Add the `/live` route to `src/App.tsx`. Find this import block (around line 4-12):

```tsx
import { DashboardPage } from '@/pages/DashboardPage'
import { SubmissionsPage } from '@/pages/SubmissionsPage'
import { TicketsPage } from '@/pages/TicketsPage'
import { StatsPage } from '@/pages/StatsPage'
import { DiagnosticsPage } from '@/pages/DiagnosticsPage'
import { PromotorsPage } from '@/pages/PromotorsPage'
import { PromotorDetailPage } from '@/pages/PromotorDetailPage'
```

Add immediately after:

```tsx
import { LivePage } from '@/pages/LivePage'
```

- [ ] **Step B1.4** — Add the route in the `<Routes>` block. Find:

```tsx
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/stats" element={<StatsPage />} />
```

Replace with:

```tsx
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/live" element={<LivePage />} />
                  <Route path="/stats" element={<StatsPage />} />
```

- [ ] **Step B1.5** — Commit JUST the dep install and env file now. Leave `src/App.tsx` modified but **unstaged** — the route registration will land in Task B9 after `LivePage.tsx` exists. (If we committed the `App.tsx` change now, the build would fail because `LivePage` doesn't exist yet.)

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add package.json package-lock.json .env.example
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): install ably and document /live env vars"
```

After this step, `git status` should show `src/App.tsx` still in "Changes not staged for commit" — that's expected and intentional.

---

## Task B2: `lib/liveChat.ts` types + helpers

**Files:**
- Create: `src/lib/liveChat.ts`

- [ ] **Step B2.1** — Create the file with verbatim contents:

```ts
// src/lib/liveChat.ts
// Mirror of MemeBattles' live-chat type contract.
// SYNC: docs/superpowers/specs/2026-05-12-chat-moderation-design.md Section 4
// — keep this file aligned with MemeBattles/frontend/src/lib/liveChat.ts.
// Grep for `SYNC:` across both repos to confirm alignment.

export type LiveChatMessage = {
  id: string;
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  text: string;
  ts: number;
};

export type LiveChatDelete = {
  type: "delete";
  msgId: string;
  ts: number;
};

export type LiveChatMute = {
  type: "mute";
  wallet: string;             // lowercased convention
  until: number | null;       // null = perma; otherwise ms-epoch expiry
  ts: number;
};

export type LiveChatUnmute = {
  type: "unmute";
  wallet: string;             // lowercased
  ts: number;
};

export function shortWallet(wallet: string): string {
  if (!wallet || wallet.length < 11) return wallet || "0x?";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** Mute durations exposed in the operator kebab menu, in milliseconds. */
export const MUTE_DURATIONS = [
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 5 * 60_000 },
  { label: "10m", ms: 10 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
] as const;

/** Returns true if the given mute-expiry value indicates the wallet is currently muted. */
export function isMuteActive(until: number | null | undefined): boolean {
  if (until === undefined) return false;
  if (until === null) return true;          // perma
  return until > Date.now();
}

/** Format a temp-mute expiry as "Xm Ys" countdown. Returns "perma" when until === null. */
export function formatMuteRemaining(until: number | null | undefined, nowMs: number = Date.now()): string {
  if (until === null) return "perma";
  if (until === undefined) return "";
  const remaining = Math.max(0, until - nowMs);
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
```

- [ ] **Step B2.2** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step B2.3** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/lib/liveChat.ts
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add liveChat lib (types, helpers, mute durations)"
```

---

## Task B3: `useLiveChannel` hook

**Files:**
- Create: `src/hooks/useLiveChannel.ts`

This hook differs from MemeBattles' version: **no presence enter**, **exposes publish helpers** (`publishDelete`, `publishMute`, `publishUnmute`), **maintains the mute Map** like MemeBattles does.

- [ ] **Step B3.1** — Create directory if needed:

```bash
mkdir -p /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard/src/hooks
```

- [ ] **Step B3.2** — Create the file with verbatim contents:

```ts
// src/hooks/useLiveChannel.ts
import { useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import type {
  LiveChatDelete,
  LiveChatMessage,
  LiveChatMute,
  LiveChatUnmute,
} from "@/lib/liveChat";

const ABLY_AUTH_URL = String(import.meta.env.VITE_LIVE_ABLY_AUTH_URL || "").trim();

type Options = {
  channelName: string;
  clientId: string;      // any stable identifier — Supabase user email or "operator-<uuid>"
  enabled: boolean;
  historyLimit?: number;
};

export function useLiveChannel({ channelName, clientId, enabled, historyLimit = 100 }: Options) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [mutedWallets, setMutedWallets] = useState<Map<string, number | null>>(new Map());
  const [presenceCount, setPresenceCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!ABLY_AUTH_URL) return; // env not configured

    const authUrl = `${ABLY_AUTH_URL}?scope=live&channel=${encodeURIComponent(channelName)}`;
    const client = new Ably.Realtime({
      authUrl,
      authMethod: "GET",
      clientId,
    });
    clientRef.current = client;

    const channel = client.channels.get(channelName);

    const handleConnected = () => setConnected(true);
    const handleClosed = () => setConnected(false);
    client.connection.on("connected", handleConnected);
    client.connection.on("disconnected", handleClosed);
    client.connection.on("closed", handleClosed);

    const onMessage = (msg: Ably.Message) => {
      const data = msg.data;
      if (data?.type === "delete") {
        const d = data as LiveChatDelete;
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.add(d.msgId);
          return next;
        });
        return;
      }
      if (data?.type === "mute") {
        const m = data as LiveChatMute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.set(m.wallet.toLowerCase(), m.until);
          return next;
        });
        return;
      }
      if (data?.type === "unmute") {
        const m = data as LiveChatUnmute;
        setMutedWallets((prev) => {
          const next = new Map(prev);
          next.delete(m.wallet.toLowerCase());
          return next;
        });
        return;
      }
      const m = data as LiveChatMessage;
      if (!m || !m.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    channel.subscribe(onMessage);

    // history seed in chronological order so mute → unmute → re-mute lands right
    channel
      .history({ limit: historyLimit })
      .then((page) => {
        const seeded: LiveChatMessage[] = [];
        const items = [...page.items].reverse();
        for (const item of items) {
          const d = item.data;
          if (d?.type === "delete") {
            setDeletedIds((prev) => {
              const next = new Set(prev);
              next.add((d as LiveChatDelete).msgId);
              return next;
            });
          } else if (d?.type === "mute") {
            const mm = d as LiveChatMute;
            setMutedWallets((prev) => {
              const next = new Map(prev);
              next.set(mm.wallet.toLowerCase(), mm.until);
              return next;
            });
          } else if (d?.type === "unmute") {
            const mm = d as LiveChatUnmute;
            setMutedWallets((prev) => {
              const next = new Map(prev);
              next.delete(mm.wallet.toLowerCase());
              return next;
            });
          } else if (d?.id) {
            seeded.push(d as LiveChatMessage);
          }
        }
        setMessages((prev) => (prev.length === 0 ? seeded : prev));
      })
      .catch(() => { /* history is best-effort */ });

    // Operator-side tick: 1-second cadence for the muted-list panel countdown.
    // Viewer side ticks at 30s. The asymmetry is intentional per spec.
    const expiryInterval = window.setInterval(() => {
      setMutedWallets((prev) => {
        const now = Date.now();
        let mutated = false;
        const next = new Map(prev);
        for (const [w, until] of prev) {
          if (until !== null && until < now) {
            next.delete(w);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    }, 1000);

    // No presence enter — operators don't count themselves as viewers.
    const refreshPresence = async () => {
      try {
        const members = await channel.presence.get();
        setPresenceCount(members.length);
      } catch { /* ignore */ }
    };
    channel.presence.subscribe(["enter", "leave", "update"], refreshPresence);
    refreshPresence();

    return () => {
      window.clearInterval(expiryInterval);
      channel.presence.unsubscribe();
      channel.unsubscribe();
      client.connection.off();
      client.close();
      clientRef.current = null;
      setConnected(false);
      setPresenceCount(0);
    };
  }, [channelName, clientId, enabled, historyLimit]);

  const publishDelete = useMemo(
    () => async (msgId: string) => {
      const client = clientRef.current;
      if (!client) return;
      const channel = client.channels.get(channelName);
      await channel.publish("msg", { type: "delete", msgId, ts: Date.now() } as LiveChatDelete);
    },
    [channelName],
  );

  const publishMute = useMemo(
    () => async (wallet: string, until: number | null) => {
      const client = clientRef.current;
      if (!client) return;
      const channel = client.channels.get(channelName);
      await channel.publish("msg", {
        type: "mute",
        wallet: wallet.toLowerCase(),
        until,
        ts: Date.now(),
      } as LiveChatMute);
    },
    [channelName],
  );

  const publishUnmute = useMemo(
    () => async (wallet: string) => {
      const client = clientRef.current;
      if (!client) return;
      const channel = client.channels.get(channelName);
      await channel.publish("msg", {
        type: "unmute",
        wallet: wallet.toLowerCase(),
        ts: Date.now(),
      } as LiveChatUnmute);
    },
    [channelName],
  );

  const visibleMessages = useMemo(
    () => messages.filter((m) => !deletedIds.has(m.id)),
    [messages, deletedIds],
  );

  return {
    messages: visibleMessages,
    mutedWallets,
    presenceCount,
    connected,
    publishDelete,
    publishMute,
    publishUnmute,
  };
}
```

Note for the engineer: **operator feed deliberately does NOT filter out muted-wallet messages**. The operator needs to see what the muted user is still typing (in case they want to escalate to perma-mute or delete specific messages). Only the VIEWER side filters.

- [ ] **Step B3.3** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -10
```

Expected: no errors. If TypeScript complains about Ably types, check that `ably` was installed correctly in B1.1.

- [ ] **Step B3.4** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/hooks/useLiveChannel.ts
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add useLiveChannel hook with publish helpers and mute map"
```

---

## Task B4: `LiveStatusPill.tsx`

**Files:**
- Create: `src/components/live/LiveStatusPill.tsx`

- [ ] **Step B4.1** — Create directory:

```bash
mkdir -p /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard/src/components/live
```

- [ ] **Step B4.2** — Create the file:

```tsx
// src/components/live/LiveStatusPill.tsx
import { useEffect, useRef, useState } from "react";

async function checkLive(playbackId: string): Promise<boolean> {
  if (!playbackId) return false;
  try {
    const res = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export function LiveStatusPill({ playbackId }: { playbackId: string }) {
  const [isLive, setIsLive] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const tick = async () => {
      const live = await checkLive(playbackId);
      if (!cancelledRef.current) setIsLive(live);
    };
    tick();
    const interval = window.setInterval(tick, 10_000);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
    };
  }, [playbackId]);

  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700/60 bg-zinc-900/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
      OFFLINE
    </span>
  );
}
```

- [ ] **Step B4.3** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/components/live/LiveStatusPill.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add LiveStatusPill component (Mux HEAD probe)"
```

---

## Task B5: `ViewerCountChip.tsx`

**Files:**
- Create: `src/components/live/ViewerCountChip.tsx`

- [ ] **Step B5.1** — Create the file:

```tsx
// src/components/live/ViewerCountChip.tsx
import { Users } from "lucide-react";

export function ViewerCountChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-700/60 bg-zinc-900/50 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
      <Users className="h-3 w-3" aria-hidden />
      {count} watching
    </span>
  );
}
```

- [ ] **Step B5.2** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/components/live/ViewerCountChip.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add ViewerCountChip"
```

---

## Task B6: `MessageRow.tsx` + `DeleteConfirmPopover.tsx`

**Files:**
- Create: `src/components/live/DeleteConfirmPopover.tsx`
- Create: `src/components/live/MessageRow.tsx`

- [ ] **Step B6.0** — Pre-check which shadcn primitives already exist so the install step is deterministic:

```bash
ls /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard/src/components/ui/ | grep -E "^(popover|dropdown-menu)\.tsx$"
```

If both `popover.tsx` and `dropdown-menu.tsx` are listed, skip the install fallback further down. If either is missing, run this BEFORE creating the files in B6.1/B6.2:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npx shadcn@latest add popover dropdown-menu
```

- [ ] **Step B6.1** — First the popover wrapper. Create `DeleteConfirmPopover.tsx`:

```tsx
// src/components/live/DeleteConfirmPopover.tsx
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Props = {
  onConfirm: () => void;
  children: React.ReactNode;
};

export function DeleteConfirmPopover({ onConfirm, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 bg-zinc-900 border-zinc-800 text-zinc-100" align="end">
        <div className="text-sm">Delete this message? It will disappear for all viewers.</div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Note:** mw-dashboard uses `@base-ui/react` primitives, not full shadcn. If `@/components/ui/popover` doesn't exist, install the shadcn popover component first:

```bash
npx shadcn@latest add popover
```

If `npx shadcn` flags missing `components.json`, the project may use a different primitive convention; check `src/components/ui/` for existing popover-like component (e.g. `dropdown-menu` could substitute). Adjust this file's imports accordingly.

- [ ] **Step B6.2** — Now `MessageRow.tsx`:

```tsx
// src/components/live/MessageRow.tsx
import { MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmPopover } from "./DeleteConfirmPopover";
import {
  MUTE_DURATIONS,
  isMuteActive,
  shortWallet,
  type LiveChatMessage,
} from "@/lib/liveChat";

type Props = {
  message: LiveChatMessage;
  muteUntil: number | null | undefined;
  onDelete: (msgId: string) => void;
  onMute: (wallet: string, until: number | null) => void;
  onUnmute: (wallet: string) => void;
};

export function MessageRow({ message: m, muteUntil, onDelete, onMute, onUnmute }: Props) {
  const name = m.handle ?? shortWallet(m.wallet);
  const currentlyMuted = isMuteActive(muteUntil);
  return (
    <div className="group flex items-start gap-2 px-2 py-1 hover:bg-zinc-900/60 rounded-sm">
      <div className="flex-1 min-w-0 font-mono text-sm leading-snug">
        {m.squadCallsign && (
          <span className="mr-1 font-semibold uppercase tracking-wider text-cyan-400">
            [{m.squadCallsign}]
          </span>
        )}
        <span className="font-semibold text-zinc-100">{name}</span>
        <span className="text-zinc-500">: </span>
        <span className="text-zinc-200 break-words">{m.text}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 h-7 w-7"
            aria-label="Moderation actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DeleteConfirmPopover onConfirm={() => onDelete(m.id)}>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-red-400 focus:bg-red-500/10 focus:text-red-300"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DeleteConfirmPopover>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {MUTE_DURATIONS.map((d) => (
            <DropdownMenuItem
              key={d.label}
              onSelect={() => onMute(m.wallet, Date.now() + d.ms)}
              className="text-orange-400 focus:bg-orange-500/10 focus:text-orange-300"
            >
              Mute {d.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => onMute(m.wallet, null)}
            className="text-amber-400 focus:bg-amber-500/10 focus:text-amber-300"
          >
            Perma-mute
          </DropdownMenuItem>
          {currentlyMuted && (
            <>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onSelect={() => onUnmute(m.wallet)}
                className="text-emerald-400 focus:bg-emerald-500/10 focus:text-emerald-300"
              >
                Unmute
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

If `@/components/ui/dropdown-menu` doesn't exist, install with `npx shadcn@latest add dropdown-menu`.

- [ ] **Step B6.3** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -10
```

If build fails on missing `popover` or `dropdown-menu` modules, run `npx shadcn@latest add popover dropdown-menu` (one command, both at once). Then build again.

- [ ] **Step B6.4** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/components/live/MessageRow.tsx src/components/live/DeleteConfirmPopover.tsx src/components/ui/
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add MessageRow with kebab menu (delete + 5 mute durations + unmute)"
```

(The `src/components/ui/` add covers any shadcn primitives that were installed during this task.)

---

## Task B7: `MutedListPanel.tsx`

**Files:**
- Create: `src/components/live/MutedListPanel.tsx`

- [ ] **Step B7.1** — Create the file:

```tsx
// src/components/live/MutedListPanel.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMuteRemaining, shortWallet } from "@/lib/liveChat";

type Props = {
  mutedWallets: Map<string, number | null>;
  onUnmute: (wallet: string) => void;
};

export function MutedListPanel({ mutedWallets, onUnmute }: Props) {
  // 1-second tick to keep countdowns precise on the operator surface.
  const [, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const entries = Array.from(mutedWallets.entries());

  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Currently muted
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No active mutes.</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map(([wallet, until]) => {
            const remaining = formatMuteRemaining(until);
            const isPerma = until === null;
            return (
              <li
                key={wallet}
                className="flex items-center justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-900/40 px-2 py-1"
              >
                <div className="font-mono text-xs text-zinc-100">{shortWallet(wallet)}</div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isPerma
                        ? "font-mono text-[10px] uppercase tracking-widest text-amber-400"
                        : "font-mono text-[10px] uppercase tracking-widest text-orange-400"
                    }
                  >
                    {remaining}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] uppercase tracking-widest text-emerald-400 hover:text-emerald-300"
                    onClick={() => onUnmute(wallet)}
                  >
                    Unmute
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step B7.2** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -5
```

- [ ] **Step B7.3** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/components/live/MutedListPanel.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add MutedListPanel with 1s countdown and unmute"
```

---

## Task B8: `LivePage.tsx`

**Files:**
- Create: `src/pages/LivePage.tsx`

- [ ] **Step B8.1** — Create the file:

```tsx
// src/pages/LivePage.tsx
import { useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import { LiveStatusPill } from "@/components/live/LiveStatusPill";
import { ViewerCountChip } from "@/components/live/ViewerCountChip";
import { MessageRow } from "@/components/live/MessageRow";
import { MutedListPanel } from "@/components/live/MutedListPanel";

const CHAT_CHANNEL = String(import.meta.env.VITE_LIVE_CHAT_CHANNEL || "live:launch-party").trim();
const PLAYBACK_ID = String(import.meta.env.VITE_MUX_PLAYBACK_ID || "").trim();

export function LivePage() {
  const { user } = useAuth();
  const clientId = useMemo(
    () => (user?.email ? `operator-${user.email}` : `operator-${crypto.randomUUID()}`),
    [user?.email],
  );

  const {
    messages,
    mutedWallets,
    presenceCount,
    publishDelete,
    publishMute,
    publishUnmute,
  } = useLiveChannel({
    channelName: CHAT_CHANNEL,
    clientId,
    enabled: true,
  });

  const handleDelete = (msgId: string) => {
    publishDelete(msgId).catch(() => toast.error("Failed to delete"));
  };
  const handleMute = (wallet: string, until: number | null) => {
    publishMute(wallet, until).catch(() => toast.error("Failed to mute"));
  };
  const handleUnmute = (wallet: string) => {
    publishUnmute(wallet).catch(() => toast.error("Failed to unmute"));
  };

  return (
    // Scope the tactical theme to this page only — wrapper sets dark bg so
    // /tickets, /submissions, etc. stay unaffected.
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <LiveStatusPill playbackId={PLAYBACK_ID} />
          <ViewerCountChip count={presenceCount} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            channel · {CHAT_CHANNEL}
          </span>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-sm border border-zinc-800/60 bg-zinc-900/40 p-2 h-[70vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-500 p-4">
                Comms channel quiet.
              </div>
            ) : (
              <div className="flex flex-col">
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    muteUntil={mutedWallets.get(m.wallet.toLowerCase())}
                    onDelete={handleDelete}
                    onMute={handleMute}
                    onUnmute={handleUnmute}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-sm border border-zinc-800/60 bg-zinc-900/40 p-3">
            <MutedListPanel mutedWallets={mutedWallets} onUnmute={handleUnmute} />
          </aside>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step B8.2** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -10
```

If `useAuth` is not at `@/hooks/useAuth`, run `grep -rn "export.*useAuth" src/` to find the correct path and adjust the import.

- [ ] **Step B8.3** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/pages/LivePage.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): add /live page (feed + delete + mute UI + muted-list panel)"
```

---

## Task B9: Register route + sidebar nav

**Files:**
- Modify: `src/App.tsx` (already modified in B1.3-B1.4 — just commit now)
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step B9.1** — Add the sidebar nav entry. Open `src/components/layout/Sidebar.tsx` and find the `navItems` array (around lines 10-14). Find:

```tsx
  { to: '/submissions', label: 'Submissions', icon: FileText },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
```

Replace with:

```tsx
  { to: '/submissions', label: 'Submissions', icon: FileText },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/live', label: 'Live Chat', icon: Radio },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
```

- [ ] **Step B9.2** — Add `Radio` to the lucide-react imports. Find the existing `import { ... } from 'lucide-react'` line near the top of the file and add `Radio` to the destructure (alphabetical placement is fine).

- [ ] **Step B9.3** — Build:

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step B9.4** — Smoke-test locally:

```bash
npm run dev
```

In the browser:
1. Log in via the Supabase login page
2. Click "Live Chat" in the sidebar — should land on `/live` with tactical dark theme
3. LIVE/OFFLINE pill, viewer count, channel name in the header
4. If a MemeBattles client is connected to the same channel and posting messages, they should appear here in real time
5. Click ⋮ on a message → menu shows Delete + Mute 1m/5m/10m/1h + Perma-mute
6. Click Mute 1m → message author's wallet appears in the right rail with a countdown
7. From a separate MemeBattles browser as the muted wallet: input goes disabled, sonner toast fires
8. Wait 1 minute → muted entry disappears from rail; muted user's input re-enables

If anything fails, debug before committing.

- [ ] **Step B9.5** — Commit:

```bash
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard add src/App.tsx src/components/layout/Sidebar.tsx
git -C /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/mw-dashboard commit -m "feat(live): register /live route and sidebar nav entry"
```

---

## Phase B verification checkpoint

Before declaring done:

- [ ] All Phase B tasks committed (8 commits on `mw-dashboard` `main` branch)
- [ ] mw-dashboard `npm run build` is green
- [ ] The integration smoke test in B9.4 succeeded
- [ ] Production env vars set: `VITE_LIVE_ABLY_AUTH_URL` (mw-dashboard side) + `MW_DASHBOARD_ORIGIN` (MemeBattles side, for CORS)

---

## Launch-night checklist (full system — spec Section 10)

End-to-end test in production-like environment.

- [ ] T-30: mw-dashboard `/live` shows no active mutes, OFFLINE pill, presence 0
- [ ] Connect a test wallet on MemeBattles `/live` → presence 1, post a message
- [ ] In dashboard: ⋮ → Delete → confirm → message vanishes on MemeBattles within ~1s
- [ ] In dashboard: ⋮ → Mute 1m → muted wallet's input disables + "You have been muted for 1m" toast; right rail shows the wallet with `0m 59s` ticking down
- [ ] Wait 1 minute → input re-enables, panel empties, muted user sees "You can chat again." toast
- [ ] Mute then immediately Unmute → confirms immediate restoration
- [ ] Perma-mute → reload mw-dashboard tab → confirm the mute persists in the right rail (history seed works)
- [ ] Restart the stream on a fresh channel name → confirm all mutes are gone (channel-scoped state)
- [ ] CORS check: open the mw-dashboard Network tab, find the `/api/ably/token` request — should be 200 with `access-control-allow-origin` set to the dashboard origin

---

## Out of scope (do NOT do)

- Adding Vitest infrastructure (deferred per Test strategy at the top)
- Persistent mute storage in Supabase (V2 — spec Section 11)
- Audit log with `actor` field (V2)
- Bulk select-and-mute
- Server-side Ably token rejection for muted wallets (V2)
- Theming any other mw-dashboard page (only `/live` is tactical-themed)
- Operator-side message posting (operators are read+moderate only)
- Per-operator role/permission system

---

## Cross-repo coordination

When this is merged in both repos, ensure the two `liveChat.ts` files have **identical** type declarations. The spec doc is canonical when they drift. If V2 introduces a shared package, the source-of-truth migrates from "spec" to "package."
