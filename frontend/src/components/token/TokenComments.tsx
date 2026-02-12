import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import { toast } from "sonner";

type TokenCommentsProps = {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string;
};

type CommentRow = {
  id: number;
  body: string;
  createdAt: string; // ISO
  authorAddress: string;
  parentId?: number | null;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
};

const isAddress = (v?: string | null) => /^0x[a-fA-F0-9]{40}$/.test(String(v ?? ""));

const shorten = (addr: string) =>
  addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

const initials = (nameOrAddr: string) => {
  const s = (nameOrAddr ?? "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
};

const timeAgo = (iso: string) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
};

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getNonce(chainId: number, address: string): Promise<string> {
  const url = `/api/auth/nonce?chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(address)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const j = await readJson(res);
    throw new Error(j?.error || `Nonce request failed (${res.status})`);
  }
  const j = await res.json();
  if (!j?.nonce) throw new Error("Nonce missing");
  return String(j.nonce);
}

function buildCommentMessage(args: {
  chainId: number;
  address: string;
  campaignAddress: string;
  nonce: string;
  body: string;
}) {
  // Keep this stable; the server verifies the exact string.
  const bodyPreview = args.body.replace(/\s+/g, " ").trim().slice(0, 180);
  return [
    "UPMEME Comment",
    `Action: COMMENT_CREATE`,
    `ChainId: ${args.chainId}`,
    `Address: ${args.address.toLowerCase()}`,
    `Campaign: ${args.campaignAddress.toLowerCase()}`,
    `Nonce: ${args.nonce}`,
    "",
    bodyPreview,
  ].join("\n");
}

export function TokenComments({ chainId, campaignAddress, tokenAddress }: TokenCommentsProps) {
  const wallet = useWallet();
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalizedCampaign = useMemo(() => (campaignAddress ?? "").toLowerCase(), [campaignAddress]);
  const normalizedToken = useMemo(() => {
    const t = (tokenAddress ?? "").toLowerCase();
    return isAddress(t) ? t : undefined;
  }, [tokenAddress]);

  const load = useCallback(async () => {
    if (!isAddress(normalizedCampaign)) return;
    try {
      setLoading(true);
      setError(null);
      const url = `/api/comments?chainId=${encodeURIComponent(String(chainId))}&campaignAddress=${encodeURIComponent(normalizedCampaign)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await readJson(res);
        throw new Error(j?.error || `Failed to load comments (${res.status})`);
      }
      const j = await res.json();
      const rows = Array.isArray(j?.items) ? (j.items as CommentRow[]) : [];
      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [chainId, normalizedCampaign]);

  useEffect(() => {
    void load();
  }, [load]);

  const canPost = useMemo(() => body.trim().length > 0 && body.trim().length <= 500, [body]);

  const handlePost = useCallback(async () => {
    try {
      if (!isAddress(normalizedCampaign)) return;
      if (!canPost) return;

      if (!wallet.account) {
        await wallet.connect();
      }
      if (!wallet.signer || !wallet.account) {
        toast("Connect your wallet to comment.");
        return;
      }

      const author = wallet.account.toLowerCase();
      const nonce = await getNonce(chainId, author);
      const msg = buildCommentMessage({
        chainId,
        address: author,
        campaignAddress: normalizedCampaign,
        nonce,
        body,
      });
      const signature = await wallet.signer.signMessage(msg);

      setPosting(true);

      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId,
          campaignAddress: normalizedCampaign,
          tokenAddress: normalizedToken,
          address: author,
          body: body.trim(),
          nonce,
          signature,
        }),
      });

      if (!res.ok) {
        const j = await readJson(res);
        throw new Error(j?.error || `Failed to post comment (${res.status})`);
      }

      setBody("");
      await load();
      toast("Comment posted.");
    } catch (e: any) {
      toast(e?.message || "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }, [body, canPost, chainId, load, normalizedCampaign, normalizedToken, wallet]);

  return (
    <div className="h-full w-full flex flex-col min-h-0 gap-3">
      <Card className="bg-card/20 border border-border/40 rounded-xl p-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={undefined} />
            <AvatarFallback className="text-xs">
              {wallet.account ? initials(wallet.account) : "?"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={wallet.account ? "Write a comment…" : "Connect wallet to comment…"}
              className="min-h-[15px] resize-none"
              maxLength={500}
              disabled={posting}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {body.trim().length}/500
              </span>
              <div className="flex items-center gap-2">
                {!wallet.account ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => wallet.connect()}
                    disabled={posting}
                  >
                    Connect wallet
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={handlePost}
                  disabled={posting || !wallet.account || !canPost}
                >
                  {posting ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
            {error ? (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="flex-1 min-h-0 overflow-auto pr-1">
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading comments…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No comments yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((c) => {
              const label = (c.authorDisplayName ?? "").trim();
              const display = label.length ? label : shorten(c.authorAddress);
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/20 p-3"
                >
                  <Avatar className="h-9 w-9">
                    {c.authorAvatarUrl ? <AvatarImage src={c.authorAvatarUrl} /> : null}
                    <AvatarFallback className="text-xs">
                      {initials(label.length ? label : c.authorAddress)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {display}
                        </span>
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {timeAgo(c.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">
                      {c.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
