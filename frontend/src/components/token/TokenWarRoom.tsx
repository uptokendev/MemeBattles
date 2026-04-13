import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWarRoom } from "@/hooks/useWarRoom";
import type { ChatMessage } from "@/lib/chatApi";

function initials(nameOrAddr?: string | null) {
  const s = String(nameOrAddr ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function shortAddress(addr?: string | null) {
  const value = String(addr ?? "").trim();
  if (!value) return "Unknown";
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roleBadge(role?: string) {
  switch (role) {
    case "creator":
      return <Badge className="ml-2 border-accent/30 bg-accent/10 text-accent hover:bg-accent/15">Creator</Badge>;
    case "recruiter":
      return <Badge variant="secondary" className="ml-2">Recruiter</Badge>;
    case "mod":
      return <Badge variant="outline" className="ml-2">Mod</Badge>;
    default:
      return null;
  }
}

function MessageRow({ item, selfAddress }: { item: ChatMessage; selfAddress?: string }) {
  const display = (item.displayName || "").trim() || shortAddress(item.walletAddress);
  const isSelf = selfAddress && item.walletAddress.toLowerCase() === selfAddress.toLowerCase();

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${isSelf ? "border-accent/30 bg-accent/5" : "border-border/35 bg-card/15"}`}>
      <Avatar className="h-8 w-8">
        {item.avatarUrl ? <AvatarImage src={item.avatarUrl} /> : null}
        <AvatarFallback className="text-[11px]">{initials(item.displayName || item.walletAddress)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{display}</span>
          {isSelf ? <Badge variant="outline">You</Badge> : null}
          {roleBadge(item.role)}
          <span className="text-[11px] text-muted-foreground">{timeLabel(item.createdAt)}</span>
          {item.pending ? <span className="text-[11px] text-muted-foreground">Sending…</span> : null}
          {item.failed ? <span className="text-[11px] text-destructive">Failed</span> : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-foreground/90">{item.message}</p>
      </div>
    </div>
  );
}

export function TokenWarRoom({ chainId, campaignAddress }: { chainId: number; campaignAddress: string }) {
  const {
    wallet,
    messages,
    loading,
    loadingOlder,
    sending,
    input,
    setInput,
    send,
    listRef,
    loadOlder,
    hasMore,
    onlineCount,
    typingNames,
    unreadCount,
    isNearBottom,
    jumpToBottom,
    ensureSession,
    session,
  } = useWarRoom({ chainId, campaignAddress });

  const typingLabel = useMemo(() => {
    if (!typingNames.length) return "";
    if (typingNames.length === 1) return `${typingNames[0]} typing…`;
    if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} typing…`;
    return `${typingNames[0]}, ${typingNames[1]} and others typing…`;
  }, [typingNames]);

  return (
    <div className="relative h-[520px] w-full min-h-0 overflow-hidden rounded-xl border border-border/35 bg-card/10">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border/35 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">War Room</h3>
            <p className="text-[11px] text-muted-foreground">Realtime campaign chat · {onlineCount} online</p>
          </div>
          {!wallet.account ? (
            <Button size="sm" variant="secondary" onClick={() => wallet.connect()}>
              Connect wallet
            </Button>
          ) : !session ? (
            <Button size="sm" variant="secondary" onClick={() => void ensureSession()}>
              Join chat
            </Button>
          ) : null}
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {hasMore ? (
            <div className="mb-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                {loadingOlder ? "Loading…" : "Load older messages"}
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading war room…</div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No war room messages yet. Be the first to break the silence.</div>
          ) : (
            <div className="space-y-2">
              {messages.map((item) => (
                <MessageRow key={`${item.id}:${item.clientNonce ?? ""}`} item={item} selfAddress={wallet.account} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/35 bg-card/20 px-3 py-3">
          <div className="mb-2 flex min-h-4 items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{typingLabel || " "}</span>
            <span className="text-[11px] text-muted-foreground">{input.trim().length}/500</span>
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={wallet.account ? "Jump into the war room…" : "Connect wallet to join chat…"}
              className="min-h-[72px] resize-none"
              disabled={sending}
              maxLength={500}
            />
            <Button className="h-[72px] px-5" onClick={() => void send()} disabled={sending || !input.trim()}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>

      {!isNearBottom && unreadCount > 0 ? (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-24 right-4 rounded-full border border-accent/30 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground shadow-lg"
        >
          {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
        </button>
      ) : null}
    </div>
  );
}
