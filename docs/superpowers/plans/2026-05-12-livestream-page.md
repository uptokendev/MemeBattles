# Livestream Page (`/live`) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-12-livestream-page-design.md](../specs/2026-05-12-livestream-page-design.md)

**Goal:** Ship a wallet-gated `/live` page in the MemeWarzone frontend that plays a Mux-hosted livestream and renders an Ably-powered chat with squad callsigns and a moderator shield, for a one-off launch-party event.

**Architecture:** New React route in the existing SPA. Mux Player (`@mux/mux-player-react`) for live video; existing Ably token-auth pattern (mirrored from `useAblyTokenChannel.ts`) for chat + presence; existing `WalletProvider` for access gating; existing `fetchWalletAttributionState` for squad callsign lookup. No backend changes; feature-flagged at the route level for clean retirement.

**Tech Stack:** React 18, React Router v6, TypeScript, TailwindCSS, shadcn/ui, TanStack Query, Ably (`ably@2`), `@mux/mux-player-react` (new), `lucide-react`, `sonner`.

**Test strategy (v1, pragmatic):** No Vitest infrastructure exists in the frontend today. For a one-off launch-event page, the verification gate is the **manual launch-night checklist** (Task 11) rather than introducing a test framework. If `/live` becomes a recurring feature, add Vitest + unit tests as a follow-up — that's the right time to invest in the test harness.

**Pre-flight (do these in your browser/OBS before any code):**

- [ ] Sign up at https://mux.com and create a new Live Stream in the dashboard
- [ ] Copy the **Stream Key** and the RTMPS URL (`rtmps://global-live.mux.com:443/app`)
- [ ] Copy the **Playback ID** (different from the stream key — public, embedded in the player)
- [ ] In OBS: Settings → Stream → Service: Custom; Server: `rtmps://global-live.mux.com:443/app`; Stream Key: `<paste>`. Test for ~10 seconds; verify the Mux dashboard flips the stream to "Active"; stop the stream

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| `frontend/package.json` | Modify | Add `@mux/mux-player-react` |
| `frontend/.env.example` (or wherever env-vars are documented) | Modify | Document new VITE_* vars |
| `frontend/src/lib/liveChat.ts` | Create | `LiveChatMessage` / `LiveChatDelete` types, ULID helper, URL-strip, moderator check (case-insensitive), display-prefix builder |
| `frontend/src/hooks/useLiveChannel.ts` | Create | Ably channel hook for `/live` — mirrors `useAblyTokenChannel.ts` pattern; exposes `publish`, `messages`, `presenceCount`, `connected`, `deleteIds` |
| `frontend/src/components/live/LiveBadge.tsx` | Create | `LIVE` / `OFFLINE` pill |
| `frontend/src/components/live/PlayerOffline.tsx` | Create | Themed offline placeholder card |
| `frontend/src/components/live/LivestreamPlayer.tsx` | Create | Mux Player + status polling + offline fallback |
| `frontend/src/components/live/ViewerCount.tsx` | Create | Tiny presence-count chip |
| `frontend/src/components/live/LiveChat.tsx` | Create | Chat list renderer (shield/callsign rules) |
| `frontend/src/components/live/LiveChatInput.tsx` | Create | Throttled, sanitized, 200-char-capped input |
| `frontend/src/pages/Live.tsx` | Create | Page shell, wallet gate, responsive layout, glues all the above |
| `frontend/src/App.tsx` | Modify | Add `<Route path="/live" element={<Live />} />` |

---

## Task 1: Install Mux Player + document env vars

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.env.example` (or create one if missing)

- [ ] **Step 1.1** — Add the dep

```bash
cd /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend
yarn add @mux/mux-player-react
```

- [ ] **Step 1.2** — Confirm install worked

```bash
yarn list --pattern @mux/mux-player-react
```

Expected: a single resolved version like `@mux/mux-player-react@^3.x.x`.

- [ ] **Step 1.3** — Document new env vars

Append to `frontend/.env.example`, matching the existing convention (section header + `# VAR=value` commented examples for optionals; uncommented `KEY=` for required-but-blank-in-example):

```dotenv

# -----------------------------
# /live livestream page (Mux + Ably-backed launch event)
# -----------------------------

# Public Mux Playback ID (from Mux dashboard → Video → Live Streams → your stream)
VITE_MUX_PLAYBACK_ID=

# Optional chat channel override; defaults to "live:launch-party" in code.
# VITE_LIVE_CHAT_CHANNEL=live:launch-party

# Feature flag; set to "false" to retire the /live route post-launch without removing code.
# VITE_LIVE_PAGE_ENABLED=true

# Comma-separated wallet addresses that render with a moderator shield in chat.
# Case-insensitive match. Same list maintained in mw-dashboard.
# VITE_LIVE_CHAT_MODERATORS=0xabc...,0xdef...
```

- [ ] **Step 1.4** — Commit

```bash
git add frontend/package.json frontend/yarn.lock frontend/.env.example
git commit -m "feat(live): add @mux/mux-player-react and document /live env vars"
```

---

## Task 2: `lib/liveChat.ts` — types and pure helpers

**File:** Create `frontend/src/lib/liveChat.ts`.

This file is pure functions and types — no React, no Ably. Everything else imports from here.

- [ ] **Step 2.1** — Create the file with the exact contents below

```ts
// frontend/src/lib/liveChat.ts

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

const URL_REGEX = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
// ASCII C0 controls (\x00 through \x1F) plus DEL (\x7F). Use explicit hex to avoid
// the range silently being interpreted as printable space-to-hyphen if the source
// is reflowed or copy-pasted through tools that strip control characters.
const CONTROL_REGEX = /[\x00-\x1F\x7F]/g;

export const MAX_CHAT_LENGTH = 200;
export const MIN_CHAT_INTERVAL_MS = 2000;

export function sanitizeChatText(input: string): string {
  // strip control chars + null, collapse whitespace, strip URLs, hard cap
  const noControl = input.replace(CONTROL_REGEX, " ");
  const noUrl = noControl.replace(URL_REGEX, "");
  const collapsed = noUrl.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_CHAT_LENGTH);
}

export function isModerator(wallet: string, moderatorList: string[]): boolean {
  if (!wallet) return false;
  const target = wallet.toLowerCase();
  return moderatorList.some((m) => m.trim().toLowerCase() === target);
}

export function parseModeratorEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function shortWallet(wallet: string): string {
  if (!wallet || wallet.length < 11) return wallet || "0x?";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function newMessageId(): string {
  // ULID-ish: timestamp + 8 random hex chars — sortable, collision-resistant enough
  // for a single launch event without pulling in a dep.
  const ts = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${ts}-${rand}`;
}
```

- [ ] **Step 2.2** — Smoke-check it compiles

```bash
cd frontend
yarn build 2>&1 | tail -30
```

Expected: build succeeds (no TS errors in `liveChat.ts`). Existing build may have unrelated warnings; only check for new errors mentioning `liveChat`.

- [ ] **Step 2.3** — Commit

```bash
git add frontend/src/lib/liveChat.ts
git commit -m "feat(live): add liveChat lib (types, sanitizer, moderator check, id helper)"
```

---

## Task 3: `useLiveChannel` hook — Ably wiring (mirrors token-channel pattern)

**File:** Create `frontend/src/hooks/useLiveChannel.ts`.

Mirror the auth/connection pattern from [`frontend/src/hooks/useAblyTokenChannel.ts`](../../frontend/src/hooks/useAblyTokenChannel.ts) — `authUrl` token auth, local-dev disable guard, ref-counted client cache. Read that file first; reuse the same env vars (`VITE_REALTIME_API_BASE`, `VITE_ABLY_AUTH_BASE`, `VITE_ENABLE_LOCAL_ABLY`).

- [ ] **Step 3.1** — Read the reference hook so the patterns match

```bash
sed -n '1,140p' /Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/frontend/src/hooks/useAblyTokenChannel.ts
```

- [ ] **Step 3.2** — Create the new hook

```ts
// frontend/src/hooks/useLiveChannel.ts
import { useEffect, useMemo, useRef, useState } from "react";
import Ably from "ably";
import type { LiveChatDelete, LiveChatMessage } from "@/lib/liveChat";

const REALTIME_API_BASE = String(import.meta.env.VITE_REALTIME_API_BASE || "").trim();
const ABLY_AUTH_BASE = String(import.meta.env.VITE_ABLY_AUTH_BASE || "").trim();
const ENABLE_LOCAL_ABLY = String(import.meta.env.VITE_ENABLE_LOCAL_ABLY || "").trim() === "1";

function isLoopbackHost(h: string) {
  const n = h.trim().toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]";
}
function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  return isLoopbackHost(window.location.hostname);
}
function shouldDisableLocalAbly() {
  return isLocalBrowser() && !ABLY_AUTH_BASE && !ENABLE_LOCAL_ABLY;
}
function getAuthBase() {
  if (shouldDisableLocalAbly()) return "";
  if (ABLY_AUTH_BASE && /^https?:\/\//i.test(ABLY_AUTH_BASE)) return ABLY_AUTH_BASE.replace(/\/$/, "");
  if (REALTIME_API_BASE && /^https?:\/\//i.test(REALTIME_API_BASE)) return REALTIME_API_BASE.replace(/\/$/, "");
  // Same-origin fallback so production (where /api/ably/token is co-hosted) works
  // without requiring VITE_ABLY_AUTH_BASE to be set — matches the existing
  // useAblyTokenChannel pattern for token-comment realtime.
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin.replace(/\/$/, "");
  return "";
}

type Options = {
  channelName: string;
  clientId: string;          // wallet address — used for presence identity
  enabled: boolean;          // false → don't connect (e.g. wallet not connected, feature flag off)
  historyLimit?: number;
};

export function useLiveChannel({ channelName, clientId, enabled, historyLimit = 50 }: Options) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [presenceCount, setPresenceCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const authBase = getAuthBase();
    if (!authBase) return; // local-dev with Ably disabled — no-op

    const client = new Ably.Realtime({
      authUrl: `${authBase}/api/ably/token`,
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
      const m = data as LiveChatMessage;
      if (!m || !m.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };

    channel.subscribe(onMessage);

    // history seed
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

    // presence
    channel.presence.enter({ at: Date.now() }).catch(() => { /* ignore */ });
    const refreshPresence = async () => {
      try {
        const members = await channel.presence.get();
        setPresenceCount(members.length);
      } catch { /* ignore */ }
    };
    channel.presence.subscribe(["enter", "leave", "update"], refreshPresence);
    refreshPresence();

    return () => {
      try { channel.presence.leave(); } catch {}
      channel.unsubscribe();
      client.connection.off();
      client.close();
      clientRef.current = null;
      setConnected(false);
      setPresenceCount(0);
    };
  }, [channelName, clientId, enabled, historyLimit]);

  const publish = useMemo(() => {
    return async (data: LiveChatMessage) => {
      const client = clientRef.current;
      if (!client) return;
      const channel = client.channels.get(channelName);
      await channel.publish("msg", data);
    };
  }, [channelName]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !deletedIds.has(m.id)),
    [messages, deletedIds],
  );

  return { messages: visibleMessages, publish, presenceCount, connected };
}
```

- [ ] **Step 3.3** — Verify build

```bash
cd frontend && yarn build 2>&1 | tail -10
```

Expected: no new TS errors from `useLiveChannel.ts`. If build fails on Ably types, check `import Ably from "ably"` matches the existing token hook's style.

- [ ] **Step 3.4** — Commit

```bash
git add frontend/src/hooks/useLiveChannel.ts
git commit -m "feat(live): add useLiveChannel hook for ably chat + presence"
```

---

## Task 4: `LiveBadge.tsx` — small status pill

**File:** Create `frontend/src/components/live/LiveBadge.tsx`.

- [ ] **Step 4.1** — Create the directory and file

```tsx
// frontend/src/components/live/LiveBadge.tsx
import { cn } from "@/lib/utils";

export const LiveBadge = ({ isLive }: { isLive: boolean }) => {
  if (isLive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border border-red-500/60",
          "bg-red-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-red-400"
        )}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      OFFLINE
    </span>
  );
};
```

- [ ] **Step 4.2** — Commit

```bash
git add frontend/src/components/live/LiveBadge.tsx
git commit -m "feat(live): add LiveBadge status pill"
```

---

## Task 5: `PlayerOffline.tsx` — themed placeholder

**File:** Create `frontend/src/components/live/PlayerOffline.tsx`.

- [ ] **Step 5.1** — Create the file

```tsx
// frontend/src/components/live/PlayerOffline.tsx
import { Radio } from "lucide-react";

export const PlayerOffline = () => {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 bg-card/65">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.04),transparent_60%)]" aria-hidden />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <Radio className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Standby
        </div>
        <div className="max-w-sm font-retro text-2xl md:text-3xl">
          Stream starting soon
        </div>
        <div className="max-w-sm text-sm text-muted-foreground">
          Hold the line, soldier. Comms will be live shortly.
        </div>
      </div>
    </div>
  );
};
```

Note: `font-retro` and `bg-card`, `border-border`, `text-muted-foreground` are existing Tailwind tokens used elsewhere in the codebase. If `font-retro` resolves to nothing in your setup, fall back to the default body font — it's only styling.

- [ ] **Step 5.2** — Commit

```bash
git add frontend/src/components/live/PlayerOffline.tsx
git commit -m "feat(live): add PlayerOffline themed placeholder"
```

---

## Task 6: `LivestreamPlayer.tsx` — Mux Player + live-status polling

**File:** Create `frontend/src/components/live/LivestreamPlayer.tsx`.

- [ ] **Step 6.1** — Create the file

```tsx
// frontend/src/components/live/LivestreamPlayer.tsx
import MuxPlayer from "@mux/mux-player-react";
import { useQuery } from "@tanstack/react-query";
import { LiveBadge } from "./LiveBadge";
import { PlayerOffline } from "./PlayerOffline";

type Props = {
  playbackId: string;
};

async function checkLive(playbackId: string): Promise<boolean> {
  // HEAD on the HLS manifest is the lightest "is the stream live now" probe.
  // If Mux's CDN ever blocks CORS on HEAD, the fetch throws and we return false (offline).
  // That's a safe default — we'll spot a stuck-offline state in the launch-night
  // smoke test (Task 12) and can swap this for Mux Player's own `loaderror`/`playing`
  // state events if needed.
  try {
    const res = await fetch(`https://stream.mux.com/${playbackId}.m3u8`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export const LivestreamPlayer = ({ playbackId }: Props) => {
  const { data: isLive = false } = useQuery({
    queryKey: ["mux-live-status", playbackId],
    queryFn: () => checkLive(playbackId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled: Boolean(playbackId),
  });

  return (
    <div className="relative w-full">
      <div className="absolute right-3 top-3 z-10">
        <LiveBadge isLive={isLive} />
      </div>
      {isLive ? (
        <MuxPlayer
          streamType="live"
          playbackId={playbackId}
          metadata={{ video_title: "MemeWarzone Launch Party" }}
          autoPlay
          accentColor="#ef4444"
          className="aspect-video w-full overflow-hidden rounded-md bg-black"
        />
      ) : (
        <PlayerOffline />
      )}
    </div>
  );
};
```

- [ ] **Step 6.2** — Build check

```bash
cd frontend && yarn build 2>&1 | tail -10
```

Expected: no errors. If TypeScript complains about `MuxPlayer` props, check the installed version's exports — recent versions expose `MuxPlayer` as the default export from `@mux/mux-player-react`.

- [ ] **Step 6.3** — Commit

```bash
git add frontend/src/components/live/LivestreamPlayer.tsx
git commit -m "feat(live): add LivestreamPlayer with live-status polling"
```

---

## Task 7: `ViewerCount.tsx` — presence chip

**File:** Create `frontend/src/components/live/ViewerCount.tsx`.

- [ ] **Step 7.1** — Create the file

```tsx
// frontend/src/components/live/ViewerCount.tsx
import { Users } from "lucide-react";

export const ViewerCount = ({ count }: { count: number }) => {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card/50 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
      <Users className="h-3 w-3" aria-hidden />
      {count} watching
    </span>
  );
};
```

- [ ] **Step 7.2** — Commit

```bash
git add frontend/src/components/live/ViewerCount.tsx
git commit -m "feat(live): add ViewerCount presence chip"
```

---

## Task 8: `LiveChat.tsx` — chat list with shield/callsign rendering

**File:** Create `frontend/src/components/live/LiveChat.tsx`.

- [ ] **Step 8.1** — Create the file

```tsx
// frontend/src/components/live/LiveChat.tsx
import { useEffect, useRef } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isModerator,
  parseModeratorEnv,
  shortWallet,
  type LiveChatMessage,
} from "@/lib/liveChat";

const MODERATORS = parseModeratorEnv(import.meta.env.VITE_LIVE_CHAT_MODERATORS as string | undefined);

type Props = {
  messages: LiveChatMessage[];
};

export const LiveChat = ({ messages }: Props) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // autoscroll to bottom on new message, unless user has scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1 font-mono text-sm"
    >
      {messages.length === 0 && (
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Comms channel open. Be the first to transmit.
        </div>
      )}
      {messages.map((m) => {
        const isMod = isModerator(m.wallet, MODERATORS);
        const name = m.handle ?? shortWallet(m.wallet);
        return (
          <div key={m.id} className="leading-snug">
            <span
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                isMod ? "text-amber-400" : "text-foreground/90",
              )}
            >
              {isMod && (
                <>
                  <Shield className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Moderator. </span>
                  <span className="text-[10px] uppercase tracking-widest">[MOD]</span>
                </>
              )}
              {!isMod && m.squadCallsign && (
                <span className="text-[10px] uppercase tracking-widest text-primary">
                  [{m.squadCallsign}]
                </span>
              )}
              <span>{name}</span>
            </span>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground/95">{m.text}</span>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 8.2** — Commit

```bash
git add frontend/src/components/live/LiveChat.tsx
git commit -m "feat(live): add LiveChat renderer with shield + callsign rules"
```

---

## Task 9: `LiveChatInput.tsx` — throttled, sanitized input

**File:** Create `frontend/src/components/live/LiveChatInput.tsx`.

- [ ] **Step 9.1** — Create the file

```tsx
// frontend/src/components/live/LiveChatInput.tsx
import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MAX_CHAT_LENGTH,
  MIN_CHAT_INTERVAL_MS,
  newMessageId,
  sanitizeChatText,
  type LiveChatMessage,
} from "@/lib/liveChat";

type Props = {
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  disabled?: boolean;
  onSend: (msg: LiveChatMessage) => Promise<void> | void;
};

export const LiveChatInput = ({ wallet, handle, squadCallsign, disabled, onSend }: Props) => {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const lastSentRef = useRef<number>(0);

  const submit = async () => {
    if (pending) return;
    const text = sanitizeChatText(value);
    if (!text) return;
    const now = Date.now();
    if (now - lastSentRef.current < MIN_CHAT_INTERVAL_MS) {
      toast.error("Slow down, soldier — one message every 2 seconds.");
      return;
    }
    setPending(true);
    try {
      const msg: LiveChatMessage = {
        id: newMessageId(),
        wallet,
        handle,
        squadCallsign,
        text,
        ts: now,
      };
      await onSend(msg);
      lastSentRef.current = now;
      setValue("");
    } catch (err) {
      toast.error("Couldn't send message. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-center gap-2"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_CHAT_LENGTH))}
        placeholder={disabled ? "Comms disabled" : "Send transmission…"}
        disabled={disabled || pending}
        maxLength={MAX_CHAT_LENGTH}
        className="font-mono"
      />
      <Button type="submit" size="icon" disabled={disabled || pending || !value.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
};
```

- [ ] **Step 9.2** — Commit

```bash
git add frontend/src/components/live/LiveChatInput.tsx
git commit -m "feat(live): add throttled LiveChatInput"
```

---

## Task 10: `Live.tsx` — page shell, wallet gate, layout

**File:** Create `frontend/src/pages/Live.tsx`.

- [ ] **Step 10.1** — Create the file

```tsx
// frontend/src/pages/Live.tsx
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWallet } from "@/contexts/WalletContext";
import { fetchWalletAttributionState } from "@/lib/recruiterApi";
import { LivestreamPlayer } from "@/components/live/LivestreamPlayer";
import { LiveChat } from "@/components/live/LiveChat";
import { LiveChatInput } from "@/components/live/LiveChatInput";
import { ViewerCount } from "@/components/live/ViewerCount";
import { useLiveChannel } from "@/hooks/useLiveChannel";
import NotFound from "./NotFound";

const PLAYBACK_ID = String(import.meta.env.VITE_MUX_PLAYBACK_ID || "").trim();
const CHAT_CHANNEL = String(import.meta.env.VITE_LIVE_CHAT_CHANNEL || "live:launch-party").trim();
const PAGE_ENABLED = String(import.meta.env.VITE_LIVE_PAGE_ENABLED || "true").trim() === "true";

const Live = () => {
  // Hooks must be called unconditionally on every render (Rules of Hooks).
  // Side-effects are gated via `enabled` so they no-op until the wallet is connected.
  const wallet = useWallet();
  const account = wallet.account || "";
  const ready = PAGE_ENABLED && wallet.isConnected && account.length > 0;

  const { data: attribution } = useQuery({
    queryKey: ["wallet-attribution", account.toLowerCase()],
    queryFn: () => fetchWalletAttributionState(account),
    staleTime: Infinity,
    enabled: ready,
  });
  // recruiterDisplayName is part of WalletAttributionPublicState (recruiterApi.ts:146-155).
  const squadCallsign = attribution?.recruiterCode ?? null;
  const handle = attribution?.recruiterDisplayName ?? null;

  const { messages, publish, presenceCount } = useLiveChannel({
    channelName: CHAT_CHANNEL,
    clientId: account,
    enabled: ready,
  });

  // Render branches AFTER all hooks have been called.
  if (!PAGE_ENABLED) return <NotFound />;

  if (!wallet.isConnected || !account) {
    return (
      <div className="mx-auto w-full max-w-3xl py-10">
        <Card className="flex flex-col items-center gap-4 border-border/60 bg-card/65 p-6 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Restricted Channel
            </div>
            <div className="mt-1 font-retro text-2xl md:text-4xl">
              Connect to watch the launch party
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              The stream is gated to wallet-connected soldiers.
            </div>
          </div>
          <ConnectWalletButton />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl py-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <LivestreamPlayer playbackId={PLAYBACK_ID} />
          <div className="flex items-center justify-between">
            <ViewerCount count={presenceCount} />
          </div>
        </div>
        <Card className="flex h-[480px] flex-col gap-3 border-border/60 bg-card/65 p-3 md:h-[640px]">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Comms Channel
          </div>
          <div className="min-h-0 flex-1">
            <LiveChat messages={messages} />
          </div>
          <LiveChatInput
            wallet={account}
            handle={handle}
            squadCallsign={squadCallsign}
            onSend={publish}
          />
        </Card>
      </div>
    </div>
  );
};

export default Live;
```

**Notes for the engineer:**
- `useWallet()` returns `{ isConnected, account, signer }` per `WalletContext` (`account` is a `string`, initialized to `""`)
- `fetchWalletAttributionState` is at `frontend/src/lib/recruiterApi.ts:249`; returns `WalletAttributionPublicState` with `recruiterCode`, `recruiterDisplayName`, `recruiterIsOg`, `squadState` — schema is verified
- `ConnectWalletButton` import path mirrors `Recruiter.tsx:81`. If your build errors on it, check whether it's a named vs default export in `frontend/src/components/ConnectWalletButton.tsx` and adjust the import accordingly

- [ ] **Step 10.2** — Build

```bash
cd frontend && yarn build 2>&1 | tail -20
```

Fix any import-path issues that surface. Common gotchas: `ConnectWalletButton` may be a named vs default export — check `src/components/ConnectWalletButton.tsx` and adjust the import.

- [ ] **Step 10.3** — Commit

```bash
git add frontend/src/pages/Live.tsx
git commit -m "feat(live): add /live page with wallet gate, player, chat layout"
```

---

## Task 11: Wire the route in `App.tsx`

**File:** Modify `frontend/src/App.tsx`.

- [ ] **Step 11.1** — Add the import next to the other page imports (alphabetical-ish placement; existing file imports `Prepare`, `RecruiterDashboard` etc.):

```tsx
import Live from "./pages/Live";
```

- [ ] **Step 11.2** — Add the route inside `<Routes>` (place it near `/prepare/:slug` for thematic grouping):

```tsx
<Route path="/live" element={<Live />} />
```

- [ ] **Step 11.3** — Build + visit

```bash
cd frontend && yarn build 2>&1 | tail -10
yarn dev
```

**Important — local-dev Ably:** the existing `useAblyTokenChannel` pattern disables Ably on localhost unless `VITE_ENABLE_LOCAL_ABLY=1` is set (so missing `ABLY_API_KEY` doesn't flood console with 500s from `/api/ably/token`). Our `useLiveChannel` mirrors this. For a meaningful local chat test, set `VITE_ENABLE_LOCAL_ABLY=1` in `frontend/.env.local`, or accept that chat will be a no-op on localhost.

Then in a browser:
1. Hit `http://localhost:<port>/live`
2. Disconnected wallet → should show "Connect to watch the launch party" card
3. Connect wallet → should show offline placeholder + viewer count (chat panel appears empty if local Ably is disabled; that's expected)
4. With `VITE_ENABLE_LOCAL_ABLY=1` and a backend serving `/api/ably/token`: open a second browser/incognito with a different wallet — both should appear in presence and chat messages should round-trip

- [ ] **Step 11.4** — Commit

```bash
git add frontend/src/App.tsx
git commit -m "feat(live): register /live route"
```

---

## Task 12: Set production env vars + smoke test against real Mux stream

This task is operational, not code — but it's a required step before launch night.

- [ ] **Step 12.1** — Set env vars in your deploy target (Netlify per `netlify.toml`):

```
VITE_MUX_PLAYBACK_ID=<from Mux dashboard>
VITE_LIVE_CHAT_CHANNEL=live:launch-party
VITE_LIVE_PAGE_ENABLED=true
VITE_LIVE_CHAT_MODERATORS=<founder wallet 1>,<founder wallet 2>
```

- [ ] **Step 12.2** — Deploy (push to whatever branch triggers your Netlify build) and verify the live URL shows the offline placeholder

- [ ] **Step 12.3** — In OBS, start streaming to Mux (settings from the pre-flight section). Within ~10s the production `/live` page should:
  - Show LIVE badge
  - Play the video
  - Latency feels ~3s glass-to-glass

- [ ] **Step 12.4** — Stop OBS. Within ~15s `/live` should flip back to offline.

- [ ] **Step 12.5** — Verify mod-shield: visit `/live` from one of the wallets in `VITE_LIVE_CHAT_MODERATORS`. Post a message. Check from a second non-mod browser that the shield appears on that wallet's message.

- [ ] **Step 12.6** — Verify case-insensitive mod match: temporarily change one entry in `VITE_LIVE_CHAT_MODERATORS` to all-lowercase and confirm the shield still appears. Then revert to checksum casing.

---

## Launch-night manual checklist (from spec Section 14)

Run all of these end-to-end before going live.

- [ ] T-30 min: Mux stream key validated in OBS; `/live` shows offline state on production; env vars confirmed deployed; Mux dashboard "Live Streams" page shows the stream idle
- [ ] T-5 min: OBS Start Streaming → Mux dashboard flips to Active within ~5s → `/live` flips to live within ~10s; latency feels ~3s
- [ ] Phone on cellular: confirms CDN delivery from a non-office network
- [ ] Incognito with no wallet: gate works
- [ ] Two wallets in different browsers: chat round-trips
- [ ] Stop OBS: `/live` flips to offline within ~15s, no console errors
- [ ] mw-dashboard publishes a `delete:{msgId}` event on the same channel — message disappears from MemeWarzone within ~1s (coordinate with the dashboard repo; can be smoke-tested by manually publishing a delete event via Ably dev tools if dashboard isn't ready)

---

## Out of scope (do NOT do)

- Adding Vitest infrastructure (deferred — see "Test strategy" at the top)
- Recording / VOD playback on `/live` (handled later by manually uploading edited recording to a Mux Asset and swapping `playbackId` post-event, per spec Section 2)
- Moderator UI inside MemeWarzone (lives in `mw-dashboard` repo per spec Section 12)
- Persistent chat history in Supabase (Ably history is enough)
- Countdown timer (spec Section 7 chose generic placeholder)
