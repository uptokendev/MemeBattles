// frontend/src/components/live/LiveChatInput.tsx
import { useEffect, useRef, useState } from "react";
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

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

type Props = {
  wallet: string;
  handle: string | null;
  squadCallsign: string | null;
  disabled?: boolean;
  /** Mute expiry: undefined = not muted, null = perma, number = ms-epoch expiry */
  mutedUntil?: number | null;
  onSend: (msg: LiveChatMessage) => Promise<void> | void;
};

export const LiveChatInput = ({ wallet, handle, squadCallsign, disabled, mutedUntil, onSend }: Props) => {
  const [value, setValue] = useState("");
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
  const [pending, setPending] = useState(false);
  const lastSentRef = useRef<number>(0);

  const submit = async () => {
    if (pending || isMuted) return;
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
    } catch {
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
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
};
