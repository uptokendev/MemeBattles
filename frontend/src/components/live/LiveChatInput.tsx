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
