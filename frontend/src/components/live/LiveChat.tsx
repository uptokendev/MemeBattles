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
                <span className="text-[10px] uppercase tracking-widest text-cyan-400">
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
