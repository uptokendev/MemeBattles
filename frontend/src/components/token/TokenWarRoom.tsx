import { ArrowDown, Loader2, Send, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWallet } from "@/contexts/WalletContext";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { useWarRoom } from "@/hooks/useWarRoom";
import type { WarRoomMessage } from "@/lib/chatApi";

type TokenWarRoomProps = {
  chainId: number;
  campaignAddress: string;
  className?: string;
};

function shortAddress(addr?: string | null) {
  const a = String(addr ?? "").trim();
  if (!a) return "anon";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function RoleBadge({ role }: { role?: string | null }) {
  const r = String(role || "trader").toLowerCase();
  const label = r === "creator" ? "Creator" : r === "recruiter" ? "Recruiter" : r === "mod" ? "Mod" : "Trader";
  return (
    <span className="rounded-full border border-border/70 bg-background/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </span>
  );
}

function MessageRow({ message, self }: { message: WarRoomMessage; self: boolean }) {
  const display = message.displayName || shortAddress(message.walletAddress);
  const initial = display.slice(0, 1).toUpperCase();

  return (
    <div className={`flex gap-2 ${self ? "justify-end" : "justify-start"}`}>
      {!self ? (
        <Avatar className="mt-1 h-7 w-7 border border-border/70">
          <AvatarImage src={message.avatarUrl || undefined} />
          <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
        </Avatar>
      ) : null}

      <div className={`max-w-[82%] ${self ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${self ? "justify-end" : "justify-start"}`}>
          <span className="font-mono text-muted-foreground">{display}</span>
          <RoleBadge role={message.role} />
          <span className="text-muted-foreground/70">{formatTime(message.createdAt)}</span>
          {message.pending ? <span className="text-muted-foreground/70">sending…</span> : null}
          {message.failed ? <span className="text-red-400">failed</span> : null}
        </div>

        <div
          className={`whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-sm leading-relaxed shadow-sm ${
            self
              ? "border-emerald-400/30 bg-emerald-500/10 text-foreground"
              : "border-border/70 bg-background/60 text-foreground"
          } ${message.failed ? "border-red-400/50 bg-red-500/10" : ""}`}
        >
          {message.message}
        </div>
      </div>
    </div>
  );
}

export function TokenWarRoom({ chainId, campaignAddress, className = "" }: TokenWarRoomProps) {
  const wallet = useWallet();
  const room = useWarRoom({
    chainId,
    campaignAddress,
    walletAddress: wallet.account,
    signer: wallet.signer,
  });

  const connected = Boolean(wallet.account);

  return (
    <Card className={`relative flex h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card/30 p-0 backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">War Room</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">Live campaign chat</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{room.onlineCount || 0} online</span>
        </div>
      </div>

      <div ref={room.listRef} onScroll={room.onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {room.hasMore ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={room.loadOlder} className="h-8 rounded-full text-xs">
              Load older messages
            </Button>
          </div>
        ) : null}

        {room.loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading War Room…
          </div>
        ) : room.messages.length ? (
          room.messages.map((message) => (
            <MessageRow
              key={message.id || message.clientNonce}
              message={message}
              self={String(message.walletAddress || "").toLowerCase() === String(wallet.account || "").toLowerCase()}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            <div>
              <div className="mb-1 font-semibold text-foreground">No war room messages yet.</div>
              <div>Be the first soldier to break the silence.</div>
            </div>
          </div>
        )}
      </div>

      {!room.isNearBottom && room.unreadCount > 0 ? (
        <Button
          size="sm"
          onClick={room.jumpToBottom}
          className="absolute bottom-24 left-1/2 h-8 -translate-x-1/2 rounded-full px-3 text-xs shadow-lg"
        >
          <ArrowDown className="mr-1 h-3.5 w-3.5" /> {room.unreadCount} new
        </Button>
      ) : null}

      <div className="border-t border-border/70 bg-background/30 px-4 py-3">
        {room.typingLabel ? <div className="mb-2 text-[11px] text-muted-foreground">{room.typingLabel}…</div> : null}
        {room.error ? <div className="mb-2 text-[11px] text-red-400">{room.error}</div> : null}

        {!connected ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">Connect with the wallet selector before entering the War Room.</div>
            <ConnectWalletButton />
          </div>
        ) : null}

        <div className="flex gap-2">
          <Textarea
            value={room.input}
            onChange={(e) => room.setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                room.sendMessage();
              }
            }}
            disabled={room.sending || !connected}
            placeholder={connected ? "Send a message to the War Room…" : "Connect wallet to enter the War Room…"}
            maxLength={500}
            className="min-h-[42px] max-h-28 resize-none rounded-2xl bg-background/60 text-sm"
          />
          <Button onClick={room.sendMessage} disabled={room.sending || !connected || !room.input.trim()} className="h-[42px] rounded-2xl px-3">
            {room.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Sign once per session. Messages send normally after that.</span>
          <span>{room.input.length}/500</span>
        </div>
      </div>
    </Card>
  );
}
