import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bell,
  Download,
  Edit3,
  ExternalLink,
  Flame,
  Globe,
  ImageDown,
  MessageSquareReply,
  Rocket,
  Send,
  Share2,
  Shield,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveImageUri } from "@/lib/media";
import { addressesMatch } from "@/lib/address";
import warzoneHud from "@/assets/promotion/warzonehud.png";
import { buildPrepareTweetText } from "@/lib/prepareShareText";
import {
  downloadPrepareShareCard,
  openPrepareXComposer,
  sharePrepareToX,
  sharePrepareToXToastMessage,
} from "@/lib/sharePrepareToX";
import {
  addDraftComment,
  armDraftNotifications,
  fetchDraftComments,
  fetchPrepareDraft,
  followDraft,
  toggleDraftCommentReaction,
  type DraftComment,
  type PrepareDraftBundle,
} from "@/lib/draftApi";


const DEMO_SLUG = "memewarzone-mwz-demo";

function shortWallet(value: string) {
  if (!value) return "Unknown";
  if (value.startsWith("@")) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toUpperCase();
}

function fixedMissionPhases() {
  return [
    [
      "Recon",
      "Creator prepares the promotion page, arms comms, recruits the first watchlist soldiers, and builds the launch signal.",
    ],
    [
      "Deploy",
      "Creator pushes the draft live into the bonding curve. Trading opens only after deployment is confirmed.",
    ],
    [
      "Graduate",
      "The campaign reaches the graduation threshold, finalize logic runs, LP is created, and the creator payout unlocks.",
    ],
    [
      "Conquest",
      "The campaign enters weekly battles, visibility loops, UpVotes, and community competition.",
    ],
  ];
}

function normalizeExternalUrl(
  raw: string | null | undefined,
  kind: "x" | "telegram" | "discord" | "website",
) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const handle = value.replace(/^@+/, "").replace(/^\/+/, "");

  if (kind === "x") return `https://x.com/${handle}`;
  if (kind === "telegram") return `https://t.me/${handle}`;
  if (kind === "discord") return value.includes("discord") ? `https://${handle}` : value;

  return `https://${handle}`;
}

function readableHandleFromUrl(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (value.startsWith("@")) return value.toUpperCase();

  try {
    const url = new URL(normalizeExternalUrl(value, "x"));
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    if (firstPath) return `@${firstPath}`.toUpperCase();
  } catch {
    // Fall through to plain handle cleanup.
  }

  const cleaned = value.replace(/^https?:\/\//i, "").replace(/^x\.com\//i, "").replace(/^@+/, "");
  return cleaned ? `@${cleaned}`.toUpperCase() : "";
}

function creatorLabel(bundle: PrepareDraftBundle) {
  const xHandle = readableHandleFromUrl(bundle.promotion?.xUrl || bundle.draft?.xUrl || "");
  return xHandle || shortWallet(bundle.draft.creatorWallet);
}

function absoluteUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:image\//i.test(raw)) return raw;

  if (typeof window !== "undefined" && raw.startsWith("/")) {
    return `${window.location.origin}${raw}`;
  }

  return "";
}

/** Production app host for share/OG links (never localhost or preview hosts). */
const PUBLIC_APP_ORIGIN = "https://app.memewar.zone";

function publicAppOrigin() {
  if (typeof window === "undefined") return PUBLIC_APP_ORIGIN;
  const host = window.location.hostname.toLowerCase();
  // Always share the live host so X crawls production OG edge tags + share-card PNG.
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".netlify.app")) {
    return PUBLIC_APP_ORIGIN;
  }
  return window.location.origin;
}

function buildPreparePageUrl(slug: string) {
  // utm helps X re-scrape after OG fixes (fresh URL, not a cached SPA unfurl).
  return `${publicAppOrigin()}/prepare/${slug}?utm_source=x&utm_medium=share`;
}

function buildShareCardUrl(bundle: PrepareDraftBundle, download = false, version?: string) {
  const { draft } = bundle;
  // Short slug URL: server loads draft + metrics and renders the PNG.
  // Avoids long query strings that break X/Twitter image crawlers.
  const params = new URLSearchParams({
    slug: String(draft.slug || "").trim(),
  });
  if (download) params.set("download", "1");
  if (version) params.set("_v", version);

  return `${publicAppOrigin()}/api/prepare-share-card?${params.toString()}`;
}

function RadarCard({ percentage, heatLabel }: { percentage: number; heatLabel: string }) {
  const [pulse, setPulse] = useState(0);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPulse((prev) => (prev + 1) % 3);
      setDrift((prev) => (prev >= 2 ? -2 : prev + 1));
    }, 900);

    return () => window.clearInterval(timer);
  }, []);

  const livePercentage = Math.max(0, Math.min(100, percentage + drift));
  const dots = [
    "left-[28%] top-[36%] h-2 w-2",
    "right-[30%] top-[55%] h-1.5 w-1.5",
    "bottom-[27%] left-[42%] h-1.5 w-1.5",
  ];

  return (
    <div className="mwz-card p-5 md:p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
        // RECON HEAT
      </div>

      <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(255,153,0,0.20),transparent_58%)] shadow-[0_0_40px_rgba(255,153,0,0.13)]">
        <div className="mwz-radar h-40 w-40">
          <span className="mwz-radar-sweep" />

          {dots.map((classes, index) => (
            <span
              key={classes}
              className={`absolute ${classes} rounded-full bg-orange-300 transition-all duration-300 ${
                pulse === index
                  ? "scale-150 opacity-100 shadow-[0_0_24px_rgba(255,185,71,1)]"
                  : "opacity-55 shadow-[0_0_10px_rgba(255,153,0,0.45)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.18em]">
        <span className="mwz-muted">Signal</span>
        <span className="text-orange-300 transition-all duration-300">
          {livePercentage}% · {heatLabel}
        </span>
      </div>
    </div>
  );
}

function TokenLogo({ src, ticker }: { src?: string | null; ticker: string }) { 
  return (
    <div className="mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(57,255,122,0.95),rgba(0,65,28,0.95)_52%,rgba(0,0,0,0.78))] font-retro text-2xl text-white">
      {src ? (
        <img src={src} alt={`${ticker} logo`} className="h-full w-full object-cover" />
      ) : (
        `$${ticker}`
      )}
    </div>
  );
}
function WarzoneHudPreview({
  imageUrl,
  ticker,
  name,
}: {
  imageUrl: string;
  ticker: string;
  name: string;
}) {
  return (
    <div className="relative mx-auto w-[min(500px,92vw)] drop-shadow-[0_0_45px_rgba(255,122,26,0.28)] md:w-[min(540px,86vw)]">
      <div className="relative aspect-[1080/1024]">
        {/* Screen content behind the transparent HUD PNG */}
        <div className="absolute left-[20.4%] right-[19.4%] top-[12.1%] bottom-[12.2%] z-0 flex translate-x-[-2px] translate-y-[1px] flex-col overflow-hidden bg-black">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <img
  src={imageUrl}
  alt={`${ticker} campaign image`}
  className="h-full w-full object-contain p-1 md:p-1.5"
  draggable={false}
/>

            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_0%,rgba(0,0,0,0.12)_45%,rgba(0,0,0,0.70)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,122,26,0.08),transparent_45%,rgba(0,0,0,0.60))]" />
          </div>

          <div className="border-y border-orange-400/40 bg-black/95 px-3 py-2 text-center">
            <div className="truncate font-mono text-[11px] uppercase tracking-[0.28em] text-orange-300 md:text-xs">
              {ticker}
            </div>
          </div>

          <div className="flex min-h-[4.8rem] items-center justify-center border-t border-orange-400/30 bg-black/95 px-4 py-3 text-center md:min-h-[5.6rem]">
            <div className="line-clamp-2 font-retro text-2xl uppercase leading-[0.9] tracking-[0.06em] text-orange-100 drop-shadow-[0_0_14px_rgba(255,122,26,0.35)] md:text-3xl">
              {name}
            </div>
          </div>
        </div>

        {/* HUD frame above the dynamic content */}
        <img
          src={warzoneHud}
          alt=""
          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
function ShareModal({
  bundle,
  onClose,
}: {
  bundle: PrepareDraftBundle;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"download" | "open-x" | "guided" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [openedX, setOpenedX] = useState(false);
  const pngUrl = buildShareCardUrl(bundle, false, "4");
  const pageUrl = buildPreparePageUrl(bundle.draft.slug);
  const fileName = `memewarzone-${bundle.draft.slug || "prepare"}-share-card.png`;

  const tweetText = buildPrepareTweetText({
    name: bundle.draft.name,
    shareMessage: bundle.promotion.shareMessage,
  });

  const copyPage = async () => {
    await navigator.clipboard?.writeText(pageUrl).catch(() => undefined);
    toast.success("Promotion page link copied.");
  };

  const downloadCard = async () => {
    if (busy) return;
    setBusy("download");
    try {
      await downloadPrepareShareCard({ imageUrl: pngUrl, fileName });
      setDownloaded(true);
      toast.success("Share card saved. Next: open X and attach that PNG to your post.", {
        duration: 7_000,
      });
    } catch (err) {
      console.error("[Prepare] download share card failed", err);
      toast.error("Download failed. Try again or right-click the preview → Save image.");
    } finally {
      setBusy(null);
    }
  };

  const openXOnly = () => {
    if (busy) return;
    setBusy("open-x");
    try {
      const opened = openPrepareXComposer({ tweetText, pageUrl });
      setOpenedX(true);
      if (!downloaded) {
        toast.message("X opened with your text. Attach the share card PNG before posting.", {
          duration: 8_000,
        });
      } else {
        toast.success("In X: image button → pick the downloaded share card → Post.", {
          duration: 9_000,
        });
      }
      if (!opened) {
        toast.error("Pop-up blocked. Allow pop-ups for this site, then try again.");
      }
    } finally {
      setBusy(null);
    }
  };

  const guidedShare = async () => {
    if (busy) return;
    setBusy("guided");
    try {
      const result = await sharePrepareToX({
        imageUrl: pngUrl,
        pageUrl,
        tweetText,
        fileName,
        mode: "guided",
      });
      if (result.method === "download-and-compose" || result.method === "web-share") {
        setDownloaded(true);
      }
      if (result.method !== "web-share") {
        setOpenedX(true);
      }
      toast.success(sharePrepareToXToastMessage(result), { duration: 10_000 });
    } catch (err) {
      console.error("[Prepare] share to X failed", err);
      toast.error("Could not start X share. Use Step 1 + Step 2 below.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="mwz-card max-h-[92vh] w-full max-w-5xl overflow-auto border-orange-400/50 bg-black/95 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
              // Dynamic share card
            </div>
            <h3 className="mt-1 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">
              Share on X
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              X cannot auto-attach images from a website button. Save the share card, open
              your post, then attach the PNG — same pattern as trade P&amp;L cards.
            </p>
          </div>

          <button onClick={onClose} className="mwz-button h-9 w-9">
            <X className="mx-auto h-4 w-4" />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/70 bg-black/50">
          <img src={pngUrl} alt="Generated Prepare Mode share card" className="w-full" />
        </div>

        <div className="mt-4 rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-orange-300">
            Fast path (recommended)
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Downloads your share card, then opens X with the Warzone message and promotion
            page link. You only attach the image in X and hit Post.
          </p>
          <Button
            type="button"
            onClick={() => void guidedShare()}
            disabled={Boolean(busy)}
            className="mwz-button mwz-button-orange mt-3 w-full font-retro sm:w-auto"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {busy === "guided" ? "Preparing…" : "1 · Download card & open X"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div
            className={`rounded-lg border p-4 ${
              downloaded ? "border-emerald-400/50 bg-emerald-500/10" : "border-border/70 bg-black/40"
            }`}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-orange-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 font-retro text-[10px] text-orange-200">
                1
              </span>
              Save the card
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Downloads a PNG of this preview to your device (usually Downloads folder).
            </p>
            <Button
              type="button"
              onClick={() => void downloadCard()}
              disabled={Boolean(busy)}
              className="mwz-button mt-3 w-full font-retro text-xs"
            >
              <Download className="mr-2 h-4 w-4" />
              {busy === "download" ? "Saving…" : downloaded ? "Download again" : "Download share card"}
            </Button>
            {downloaded ? (
              <p className="mt-2 text-[11px] text-emerald-300">Saved ✓ — continue to step 2</p>
            ) : null}
          </div>

          <div
            className={`rounded-lg border p-4 ${
              openedX ? "border-emerald-400/50 bg-emerald-500/10" : "border-border/70 bg-black/40"
            }`}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-orange-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 font-retro text-[10px] text-orange-200">
                2
              </span>
              Open X
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Opens compose with your message + promotion page link (not the raw image URL).
            </p>
            <Button
              type="button"
              onClick={openXOnly}
              disabled={Boolean(busy)}
              className="mwz-button mt-3 w-full font-retro text-xs"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {busy === "open-x" ? "Opening…" : "Open X compose"}
            </Button>
            {openedX ? (
              <p className="mt-2 text-[11px] text-emerald-300">Compose opened ✓ — finish step 3 in X</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border/70 bg-black/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-orange-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 font-retro text-[10px] text-orange-200">
                3
              </span>
              Attach in X
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>In the X post, click the <strong className="text-foreground">image / media</strong> button</li>
              <li>Choose the share card you just downloaded</li>
              <li>Check the text, then <strong className="text-foreground">Post</strong></li>
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-orange-200/90">
              Phone tip: the fast path may open a share sheet — pick <strong>X</strong> so the
              image is attached automatically.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
          <Button type="button" onClick={() => void copyPage()} className="mwz-button font-retro text-xs">
            <Share2 className="mr-2 h-4 w-4" />
            Copy page link
          </Button>
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(pngUrl).catch(() => undefined);
              toast.message("PNG link copied — for Discord/Telegram previews only, not for X media.", {
                duration: 6_000,
              });
            }}
            className="mwz-button font-retro text-xs"
          >
            <ImageDown className="mr-2 h-4 w-4" />
            Copy PNG link
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransmissionList({
  draftId,
  isCreator,
  chainMismatchForInteraction,
  draftIsSolana,
  openCrossChainPrompt,
}: {
  draftId: string;
  isCreator: boolean;
  chainMismatchForInteraction: boolean;
  draftIsSolana: boolean;
  openCrossChainPrompt: (isSolanaDraft: boolean) => void;
}) {
  const wallet = useWallet();
  const { solanaAccount, isSolanaConnected } = useSolanaWallet();
  const activeWalletAddress = isSolanaConnected ? solanaAccount : wallet.account;
  const [items, setItems] = useState<DraftComment[]>([]);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<DraftComment | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [reactingIds, setReactingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    void fetchDraftComments(draftId, activeWalletAddress)
      .then((comments) => {
        if (!cancelled) setItems(comments);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [draftId, activeWalletAddress]);

  const send = async (reply = false) => {
    const text = reply ? replyBody.trim() : body.trim();

    if (!activeWalletAddress) {
      toast.error("Connect wallet to send a transmission.");
      return;
    }

    if (chainMismatchForInteraction) {
      openCrossChainPrompt(draftIsSolana);
      return;
    }

    if (reply && !isCreator) {
      toast.error("Only the creator can reply to transmissions.");
      return;
    }

    if (!text) return;

    setLoading(true);

    try {
      const prefix =
        reply && replyingTo
          ? `↳ Creator reply to ${replyingTo.displayName || shortWallet(replyingTo.walletAddress)}: `
          : "";

      const comment = await addDraftComment(draftId, activeWalletAddress, `${prefix}${text}`);

      setItems((prev) => [comment, ...prev]);
      setBody("");
      setReplyBody("");
      setReplyingTo(null);

      toast.success(reply ? "Creator reply sent." : "Transmission sent.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send transmission");
    } finally {
      setLoading(false);
    }
  };

  const react = async (comment: DraftComment) => {
    if (!activeWalletAddress) {
      toast.error("Connect wallet to fire this transmission.");
      return;
    }
    if (chainMismatchForInteraction) {
      openCrossChainPrompt(draftIsSolana);
      return;
    }
    if (reactingIds[comment.id]) return;

    const previousCount = Number(comment.reactionCount || 0);
    const previousReacted = Boolean(comment.viewerReacted);
    const optimisticReacted = !previousReacted;
    const optimisticCount = Math.max(0, previousCount + (optimisticReacted ? 1 : -1));

    setReactingIds((prev) => ({ ...prev, [comment.id]: true }));
    setItems((prev) =>
      prev.map((item) =>
        item.id === comment.id
          ? { ...item, reactionCount: optimisticCount, viewerReacted: optimisticReacted }
          : item
      )
    );

    try {
      const result = await toggleDraftCommentReaction(draftId, comment.id, activeWalletAddress);
      setItems((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                reactionCount: result.reactionCount,
                viewerReacted: result.reacted,
              }
            : item
        )
      );
    } catch (err: any) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                reactionCount: previousCount,
                viewerReacted: previousReacted,
              }
            : item
        )
      );
      toast.error(err?.message || "Failed to fire transmission");
    } finally {
      setReactingIds((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
      {replyingTo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="mwz-card w-full max-w-lg border-orange-400/50 bg-black/95 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
                  // Creator reply
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Replying to {replyingTo.displayName || shortWallet(replyingTo.walletAddress)}: “{replyingTo.body}”
                </p>
              </div>

              <button onClick={() => setReplyingTo(null)} className="mwz-button h-8 w-8">
                <X className="mx-auto h-4 w-4" />
              </button>
            </div>

            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              className="min-h-32 border-border/70 bg-background/50 font-retro"
              placeholder="Send official creator reply..."
            />

            <Button
              onClick={() => send(true)}
              disabled={loading || !replyBody.trim()}
              className="mwz-button mwz-button-orange mt-3 w-full font-retro"
            >
              Send creator reply
            </Button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-px w-16 bg-orange-400/70" />
          <div>
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">
              Transmissions
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              // Bunker comms feed
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="max-h-[720px] overflow-y-auto pr-1">
          <div className="grid gap-4 md:grid-cols-2">
            {items.length === 0 ? (
              <div className="mwz-card p-5 text-sm text-muted-foreground md:col-span-2">
                No transmissions intercepted yet. Be the first soldier in the bunker.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="mwz-card flex gap-3 p-4">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,153,0,0.55),rgba(25,8,2,0.9))]" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-retro text-sm text-foreground" title={item.walletAddress}>
                        {item.displayName || shortWallet(item.walletAddress)}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>

                    <div className="mt-3 flex gap-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => void react(item)}
                        disabled={Boolean(reactingIds[item.id])}
                        aria-pressed={Boolean(item.viewerReacted)}
                        aria-label={item.viewerReacted ? "Remove fire" : "Fire this transmission"}
                        className={`inline-flex items-center gap-1 transition-colors disabled:opacity-60 ${
                          item.viewerReacted
                            ? "text-orange-300 hover:text-orange-200"
                            : "text-muted-foreground hover:text-orange-200"
                        }`}
                      >
                        <span aria-hidden="true">🔥</span>
                        <span>{item.reactionCount || 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          isCreator
                            ? setReplyingTo(item)
                            : toast.error("Only the creator can reply.")
                        }
                        className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200"
                      >
                        <MessageSquareReply className="h-3 w-3" />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mwz-card p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-orange-300">
            <Send className="h-4 w-4" />
            Send transmission
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Drop your call sign, alpha, or war cry..."
            className="min-h-32 border-border/70 bg-background/50 font-retro text-base"
          />

          <Button
            onClick={() => send(false)}
            disabled={loading || !body.trim()}
            className="mwz-button mwz-button-orange mt-3 w-full font-retro"
          >
            <Send className="mr-2 h-4 w-4" />
            Send transmission
          </Button>

          {!activeWalletAddress && (
            <p className="mt-3 text-xs text-muted-foreground">
              Wallet connection required for bunker actions.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Prepare() {
  const { slug = DEMO_SLUG } = useParams();
  const wallet = useWallet();
  const { connect: connectEvm, detectedWallets } = wallet;
  const { solanaAccount, isSolanaConnected, connectSolana, availableSolanaWallets } = useSolanaWallet();
  const activeWalletAddress = isSolanaConnected ? solanaAccount : wallet.account;

  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [followCount, setFollowCount] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [armingNotification, setArmingNotification] = useState(false);
  const [followingDraft, setFollowingDraft] = useState(false);
  const [hasArmed, setHasArmed] = useState(false);
  const [hasFollowed, setHasFollowed] = useState(false);
  const [showCrossChainDialog, setShowCrossChainDialog] = useState(false);
  const [requiredChainForDialog, setRequiredChainForDialog] = useState<'solana' | 'evm' | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    void fetchPrepareDraft(slug, activeWalletAddress)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setFollowCount(data.popularity.follows);
        // Hydrate post-click visual from server-side per-viewer state so a
        // refresh doesn't reset Armed/Following back to the orange CTA.
        setHasArmed(Boolean(data.viewer?.isArmed));
        setHasFollowed(Boolean(data.viewer?.isFollowing));
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || "Prepare page not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, activeWalletAddress]);

  const draft = bundle?.draft;
  const promo = bundle?.promotion;
  const pop = bundle?.popularity;

  const refreshPrepareBundle = async () => {
    const data = await fetchPrepareDraft(slug, activeWalletAddress);
    setBundle(data);
    setFollowCount(data.popularity.follows);
    return data;
  };

  const handleArmNotification = async () => {
    if (!draft) return;

    if (!activeWalletAddress) {
      toast.error("Connect wallet to arm notifications.");
      return;
    }

    if (chainMismatchForInteraction) {
      openCrossChainPrompt(draftIsSolana);
      return;
    }

    setArmingNotification(true);

    try {
      await armDraftNotifications(draft.id, activeWalletAddress);
      await refreshPrepareBundle().catch(() => null);
      window.dispatchEvent(new CustomEvent("mwz:notifications-changed"));
      setHasArmed(true);
      toast.success("Notifications armed for this draft.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to arm notifications.");
    } finally {
      setArmingNotification(false);
    }
  };

  const handleFollow = async () => {
    if (!draft) return;

    if (!activeWalletAddress) {
      toast.error("Connect wallet to follow this draft.");
      return;
    }

    if (chainMismatchForInteraction) {
      openCrossChainPrompt(draftIsSolana);
      return;
    }

    setFollowingDraft(true);

    try {
      const result = await followDraft(draft.id, activeWalletAddress, draft.chainId);
      setFollowCount(result.followCount);
      await refreshPrepareBundle().catch(() => null);
      window.dispatchEvent(new CustomEvent("mwz:draft-follows-changed"));
      setHasFollowed(true);
      toast.success("Draft followed.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to follow draft.");
    } finally {
      setFollowingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl py-20 text-center font-retro text-muted-foreground">
        Loading war room dossier...
      </div>
    );
  }

  if (!bundle || !draft || !promo || !pop) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-retro text-4xl text-foreground">Prepare page not found</h1>
        <Button asChild className="mwz-button mt-6 font-retro">
          <Link to="/create">Create Draft</Link>
        </Button>
      </div>
    );
  }

const ticker = `$${draft.ticker}`;
const heroImageUrl = resolveImageUri(draft.logoUrl) || "/placeholder.svg";
const heroTagline = draft.description || "The launchpad that turns every drop into a war.";
  const isCreator = Boolean(
    activeWalletAddress &&
      draft.creatorWallet &&
      addressesMatch(activeWalletAddress, draft.creatorWallet, draft.chainId),
  );

  const draftIsSolana = draft.chainId === 101;
  const currentIsSolana = !!isSolanaConnected;
  const chainMismatchForInteraction = draftIsSolana !== currentIsSolana;

  const openCrossChainPrompt = (isSolanaDraft: boolean) => {
    setRequiredChainForDialog(isSolanaDraft ? 'solana' : 'evm');
    setShowCrossChainDialog(true);
  };

  const links = [
    ["X / Twitter", normalizeExternalUrl(promo.xUrl || draft.xUrl, "x"), "Frontline updates", "X"],
    ["Telegram", normalizeExternalUrl(promo.telegramUrl, "telegram"), "Squad comms", "TG"],
    ["Discord", normalizeExternalUrl(promo.discordUrl, "discord"), "Bunker voice", "DC"],
    ["Website", normalizeExternalUrl(promo.websiteUrl || draft.websiteUrl, "website"), "Lore + docs", "WEB"],
  ].filter(([, url]) => Boolean(url));

  let armLabel = "Arm notification";
  if (armingNotification) armLabel = "Arming...";
  else if (hasArmed) armLabel = "Armed";

  let followLabel = "Follow";
  if (followingDraft) followLabel = "Following...";
  else if (hasFollowed) followLabel = "Following";

  return (
    <div className="relative -mx-2 -mt-1 min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.20),transparent_48%),radial-gradient(ellipse_at_bottom,rgba(57,255,79,0.09),transparent_52%),linear-gradient(180deg,rgba(26,8,2,0.96),rgba(1,6,0,0.98))] md:-mx-3 lg:-mx-4">
      {shareOpen && <ShareModal bundle={bundle} onClose={() => setShareOpen(false)} />}

      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,153,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,79,0.05)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,153,0,0.22),transparent_34%)]" />

      <main className="relative z-10">
        <section className="relative isolate flex min-h-[680px] flex-col items-center px-2 py-4 text-center md:px-4 md:py-6">
          <div className="absolute left-4 top-6 hidden gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:flex">
            <span className="text-orange-300">// COORD: 47.6° N · 11.2° E</span>
            <span>SECTOR: 04-RECON</span>
          </div>

          <div className="absolute right-4 top-6 hidden items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-200 md:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            UNARMED · DRAFT MODE
          </div>

          {isCreator && (
            <div className="absolute left-4 top-16 z-20 md:left-auto md:right-4">
              <Button asChild variant="outline" className="mwz-button h-9 px-3 font-retro text-xs">
                <Link to={`/drafts/${draft.id}/promotion`}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Back to edit
                </Link>
              </Button>
            </div>
          )}

<div className="mwz-chip mwz-chip-active relative z-20 mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs md:mt-4">
  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" />
  Incoming transmission · Prepare Mode
</div>

<div className="relative z-10 mt-4">
  <WarzoneHudPreview imageUrl={heroImageUrl} ticker={ticker} name={draft.name} />
</div>

          <p className="relative z-20 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
            {heroTagline}{" "}

          </p>

          <div className="relative z-20 mt-6 flex flex-wrap justify-center gap-3">
            <Button
              onClick={handleArmNotification}
              disabled={armingNotification}
              className={`mwz-button h-13 px-6 font-retro text-base active:!translate-y-px ${
                hasArmed
                  ? "!border-green-400 !bg-green-500/25 !text-green-100"
                  : "mwz-button-orange"
              }`}
            >
              <Bell className="mr-2 h-4 w-4" fill={hasArmed ? "currentColor" : "none"} />
              {armLabel}
            </Button>

            <Button
              onClick={handleFollow}
              disabled={followingDraft}
              className={`mwz-button h-13 px-6 font-retro text-base active:!translate-y-px ${
                hasFollowed ? "mwz-button-orange !bg-orange-500/25 !text-orange-100" : ""
              }`}
            >
              <Star className="mr-2 h-4 w-4" fill={hasFollowed ? "currentColor" : "none"} />
              {followLabel}
            </Button>

            <Button
              onClick={() => setShareOpen(true)}
              variant="outline"
              className="mwz-button h-13 px-6 font-retro text-base active:!translate-y-px active:!bg-orange-500/15"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Generate share card
            </Button>
          </div>

          <div className="mwz-card relative z-20 mt-10 grid w-full max-w-6xl overflow-hidden border-orange-400/35 bg-black/45 md:grid-cols-4">
            {[
              ["Armed recruits", String(pop.armedCount ?? 0), Users],
              ["Watchlists", String(followCount ?? pop.follows), Star],
              ["Heat", `${pop.popularityPercentage}%`, Flame],
              ["Status", statusLabel(draft.status), Shield],
            ].map(([label, value, Icon], index) => (
              <div
                key={String(label)}
                className={`flex items-center gap-3 px-5 py-4 text-left ${
                  index > 0 ? "border-t border-border/50 md:border-l md:border-t-0" : ""
                }`}
              >
                <Icon className="h-5 w-5 text-orange-300" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {label as string}
                  </div>
                  <div className="mt-1 font-retro text-2xl leading-none text-foreground">
                    {value as string}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-4">
            <div className="h-px w-16 bg-orange-400/70" />
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">
              The Dossier
            </h2>
            <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground md:inline">
              // Creator-curated sections
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div className="mwz-card p-6 md:p-8">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
                // Lore
              </div>

              <h3 className="mt-2 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">
                The brief
              </h3>

              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground md:text-base">
                {promo.missionStatement ||
                  draft.description ||
                  "Creator has not published a mission statement yet."}
              </p>

              {promo.creatorNote && (
                <p className="mt-5 border-l border-orange-400/40 pl-4 text-sm leading-6 text-orange-100/85">
                  {promo.creatorNote}
                </p>
              )}
            </div>

            <div className="mwz-card p-5 md:p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
                // Comms channels
              </div>

              <h3 className="mt-2 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">
                Tune in
              </h3>

              <div className="mt-5 flex flex-col gap-2">
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No public comms channels published yet.
                  </p>
                ) : (
                  links.map(([label, url, meta, code]) => (
                    <a
                      key={String(label)}
                      href={String(url)}
                      target="_blank"
                      rel="noreferrer"
                      className="mwz-button flex items-center justify-between gap-3 px-3 py-3 text-left text-xs"
                    >
                      <span className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-orange-300" />
                        <span>
                          <span className="block text-sm text-foreground">
                            {label as string}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {meta as string} · {code as string}
                          </span>
                        </span>
                      </span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ))
                )}
              </div>
            </div>

            <RadarCard percentage={pop.popularityPercentage} heatLabel={pop.heatLabel} />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-4">
            <div className="h-px w-16 bg-orange-400/70" />
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">
              Mission Phases
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {fixedMissionPhases().map(([title, body], index) => (
              <div
                key={title}
                className={`mwz-card p-5 ${
                  index === 0 ? "border-orange-400/70 bg-orange-500/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Phase 0{index + 1}
                  </span>
                  {index === 0 ? (
                    <Flame className="h-4 w-4 text-orange-300" />
                  ) : (
                    <Rocket className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="mt-4 font-retro text-3xl uppercase text-foreground">
                  {title}
                </div>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>

                {index === 0 && (
                  <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-orange-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" />
                    Active
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <TransmissionList
          draftId={draft.id}
          isCreator={isCreator}
          chainMismatchForInteraction={chainMismatchForInteraction}
          draftIsSolana={draftIsSolana}
          openCrossChainPrompt={openCrossChainPrompt}
        />

        <section className="mx-auto max-w-7xl px-4 py-10 pb-20 md:px-8 md:py-14 md:pb-24">
          <div className="mwz-card border-orange-400/50 bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.18),rgba(2,17,4,0.92)_70%)] p-8 text-center md:p-12">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
              // Prepare Mode active
            </div>

            <h3 className="mt-3 bg-gradient-to-b from-white to-orange-400 bg-clip-text font-retro text-5xl uppercase tracking-[0.08em] text-transparent md:text-7xl">
              Be first in.
            </h3>

            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {(followCount ?? pop.follows).toLocaleString()} soldiers already watching.
              The moment {ticker} moves from draft to live campaign, the alert fires.
            </p>

            <div className="mt-7 flex justify-center">
              <Button
                onClick={handleArmNotification}
                disabled={armingNotification}
                className={`mwz-button h-13 px-6 font-retro text-base active:!translate-y-px ${
                  hasArmed
                    ? "!border-green-400 !bg-green-500/25 !text-green-100"
                    : "mwz-button-orange"
                }`}
              >
                <Bell className="mr-2 h-4 w-4" fill={hasArmed ? "currentColor" : "none"} />
                {armLabel}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={showCrossChainDialog} onOpenChange={setShowCrossChainDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Wallet required to interact</DialogTitle>
            <DialogDescription>
              When interacting with this draft, you need to connect with a {requiredChainForDialog === 'solana' ? 'Solana (Phantom)' : 'BNB Chain (EVM)'} wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            {requiredChainForDialog === 'solana' && (
              <div className="mt-1 space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Detected Solana wallets
                </p>

                {availableSolanaWallets.length > 0 ? (
                  availableSolanaWallets.map((solanaWallet) => (
                    <button
                      type="button"
                      key={solanaWallet.id}
                      onClick={async () => {
                        try {
                          await connectSolana(solanaWallet.id);
                          setShowCrossChainDialog(false);
                          toast.success(`Connected ${solanaWallet.name}. You can now interact with the draft.`);
                        } catch (error: any) {
                          toast.error(error?.message || "Failed to connect Solana wallet");
                        }
                      }}
                      className="group relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="relative flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-400">
                          {solanaWallet.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-retro text-sm text-foreground">{solanaWallet.name}</p>
                            <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-purple-400">
                              detected
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Solana mainnet (101) - required for this draft.
                          </p>
                        </div>
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-muted-foreground transition-colors group-hover:border-accent/40 group-hover:text-accent">
                          <Wallet className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-background/35 p-5 text-center text-sm text-muted-foreground">
                    No Solana wallets detected. Install Phantom, Solflare, Backpack, or Glow.
                  </div>
                )}
              </div>
            )}

            {requiredChainForDialog === 'evm' && (
              <div className="mt-1 space-y-3">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Detected BNB/EVM wallets</p>
                {detectedWallets.length > 0 ? (
                  detectedWallets.map((detectedWallet) => (
                    <button
                      type="button"
                      key={detectedWallet.id}
                      onClick={async () => {
                        try {
                          await connectEvm(detectedWallet.id);
                          setShowCrossChainDialog(false);
                          toast.success(`Connected ${detectedWallet.name}`);
                        } catch (error) {
                          toast.error("Failed to connect wallet. Please try again.");
                        }
                      }}
                      className="group relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-card"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="relative flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent text-sm font-bold">
                          {detectedWallet.name?.[0]?.toUpperCase() || 'W'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-retro text-sm text-foreground">{detectedWallet.name}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-1">{detectedWallet.description}</p>
                        </div>
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-muted-foreground transition-colors group-hover:border-accent/40 group-hover:text-accent">
                          <Wallet className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-background/35 p-5 text-center text-sm text-muted-foreground">
                    No EVM/BNB wallets detected. Install MetaMask or another compatible wallet.
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            After connecting the correct wallet, click the action button again.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
