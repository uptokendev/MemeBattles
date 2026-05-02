import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bell,
  Copy,
  Eye,
  FileText,
  Flame,
  Globe,
  Link2,
  Lock,
  MessageSquare,
  Radio,
  Rocket,
  Send,
  Share2,
  ShieldCheck,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import { cn } from "@/lib/utils";
import {
  addDraftComment,
  calculateDraftPopularity,
  demoDraft,
  formatDraftDate,
  formatDraftDateTime,
  getDraftBySlug,
  isDraftFollowed,
  recordDraftShare,
  recordDraftView,
  shortAddress,
  toggleDraftCommentReaction,
  toggleDraftFollow,
  type CampaignDraft,
} from "@/lib/draftPromotion";

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function timeUntil(value: string) {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return { days: "--", hours: "--", minutes: "--" };
  const diff = Math.max(0, target - Date.now());
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
}

function metricCard(label: string, value: string, icon: ReactNode) {
  return (
    <div className="mwz-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="truncate font-retro text-xl text-foreground">{value}</p>
    </div>
  );
}

function externalLinkLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url || "Not set";
  }
}

const PublicPromotion = () => {
  const params = useParams();
  const wallet = useWallet();
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [commentBody, setCommentBody] = useState("");

  useEffect(() => {
    const next = getDraftBySlug(params.slug) || demoDraft;
    const viewKey = `mwz_prepare_viewed_${next.id}`;
    let viewed = false;
    try {
      viewed = window.sessionStorage.getItem(viewKey) === "1";
      if (!viewed) window.sessionStorage.setItem(viewKey, "1");
    } catch {
      viewed = false;
    }
    setDraft(viewed ? next : recordDraftView(next.id) || next);
  }, [params.slug]);

  useEffect(() => {
    const onDraftsChanged = () => setDraft((current) => (current ? getDraftBySlug(current.slug) || current : current));
    window.addEventListener("mwz:drafts-changed", onDraftsChanged as EventListener);
    return () => window.removeEventListener("mwz:drafts-changed", onDraftsChanged as EventListener);
  }, []);

  const popularity = useMemo(() => (draft ? calculateDraftPopularity(draft) : null), [draft]);
  const countdown = useMemo(() => (draft ? timeUntil(draft.deployTarget) : timeUntil("")), [draft]);

  if (!draft || !popularity) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mwz-panel p-6 font-retro text-muted-foreground">Loading Prepare Mode page...</div>
      </div>
    );
  }

  const account = wallet.account || "";
  const followed = isDraftFollowed(draft.id, account);
  const isOwner = draft.creatorAddress === "local-creator" || account.toLowerCase() === draft.creatorAddress.toLowerCase();
  const privateBlocked = draft.visibility === "private" && !isOwner;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/prepare/${draft.slug}` : `/prepare/${draft.slug}`;

  const requireWallet = () => {
    if (wallet.isConnected && wallet.account) return wallet.account;
    window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
    toast.message("Connect your wallet to join this draft.");
    return "";
  };

  const refreshDraft = () => {
    setDraft(getDraftBySlug(draft.slug) || draft);
  };

  const handleFollow = () => {
    const address = requireWallet();
    if (!address) return;
    const next = toggleDraftFollow(draft.id, address);
    if (next) {
      setDraft(next);
      toast.success(followed ? "Removed from watchlist." : "Draft added to watchlist.");
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${draft.shareMessage}\n${publicUrl}`);
      toast.success("Prepare page link copied.");
    } catch {
      toast.message(publicUrl);
    }
    const next = recordDraftShare(draft.id, account || null);
    if (next) setDraft(next);
  };

  const handleComment = () => {
    const address = requireWallet();
    if (!address) return;
    const next = addDraftComment(draft.id, address, commentBody);
    if (next) {
      setDraft(next);
      setCommentBody("");
      toast.success("Transmission posted.");
    }
  };

  const handleReaction = (commentId: string) => {
    const address = requireWallet();
    if (!address) return;
    const next = toggleDraftCommentReaction(draft.id, commentId, address);
    if (next) setDraft(next);
  };

  if (privateBlocked) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mwz-panel p-8 text-center">
          <Lock className="mx-auto mb-4 h-10 w-10 text-accent" />
          <h1 className="mwz-section-title text-3xl">Private Draft</h1>
          <p className="mt-3 text-sm text-muted-foreground">This Prepare Mode page is only visible to the creator.</p>
          <Button type="button" onClick={requireWallet} className="mwz-button mt-5 font-retro">
            Connect wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-2 py-4 md:px-4 md:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-background/70 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="mwz-chip mwz-chip-active px-2 py-1 text-[10px]">
            <Radio className="mr-1 inline h-3 w-3" />
            Prepare Mode
          </span>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Draft page. No trading UI. Launch target: {formatDraftDateTime(draft.deployTarget)}
          </span>
        </div>
        {isOwner && (
          <Button asChild className="mwz-button h-9 px-3 text-xs font-retro">
            <Link to={`/drafts/${draft.id}/promotion`}>Edit setup</Link>
          </Button>
        )}
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="mwz-panel overflow-hidden">
          <div className="relative min-h-[220px] border-b border-border/70 bg-background">
            <img src={draft.bannerUrl || "/assets/ui/menuandhero.png"} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.86),rgba(0,0,0,0.42),rgba(0,0,0,0.86))]" />
            <div className="relative z-10 flex min-h-[220px] flex-col justify-end p-4 md:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="mwz-chip px-2 py-1 text-[10px]">Draft #{draft.id.slice(-6).toUpperCase()}</span>
                <span className="mwz-chip px-2 py-1 text-[10px]">{draft.visibility}</span>
                <span className="mwz-chip px-2 py-1 text-[10px]">{popularity.label}</span>
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <img src={draft.logoUrl || "/assets/ticker.png"} alt={draft.name} className="h-24 w-24 border border-border/70 object-cover md:h-32 md:w-32" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm uppercase tracking-[0.18em] text-accent">${draft.ticker}</p>
                  <h1 className="mwz-section-title mt-1 text-4xl md:text-6xl">{draft.name}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{draft.tagline}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleFollow} className={cn("mwz-button h-11 px-4 font-retro", followed && "mwz-button-orange")}>
                <Star className="h-4 w-4" />
                {followed ? "Watching" : "Watch draft"}
              </Button>
              <Button type="button" onClick={handleFollow} className="mwz-button h-11 px-4 font-retro">
                <Bell className="h-4 w-4" />
                Arm launch alert
              </Button>
              <Button type="button" onClick={handleShare} className="mwz-button h-11 px-4 font-retro">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
            {!wallet.isConnected && (
              <Button type="button" onClick={requireWallet} className="mwz-button mwz-button-orange h-11 px-4 font-retro">
                Connect to engage
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="mwz-panel p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Recon Signal</p>
                <h2 className="font-retro text-xl text-foreground">Popularity</h2>
              </div>
              <div className="mwz-radar grid place-items-center">
                <div className="mwz-radar-sweep" />
                <span className="relative z-10 font-retro text-3xl text-accent">{popularity.percentage}</span>
              </div>
            </div>
            <div className="h-2 border border-border/70 bg-background">
              <div className="h-full bg-[linear-gradient(90deg,var(--mwz-orange),var(--mwz-green))]" style={{ width: `${popularity.percentage}%` }} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Weighted by follows, unique commenters, comments, reactions, shares, signed-in actions, and views.
            </p>
          </div>

          <div className="mwz-panel p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-accent">Deploy Window</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["D", countdown.days],
                ["H", countdown.hours],
                ["M", countdown.minutes],
              ].map(([label, value]) => (
                <div key={label} className="mwz-card p-3">
                  <p className="font-retro text-3xl text-foreground">{value}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Target: {formatDraftDate(draft.deployTarget)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {metricCard("Watchlists", formatNumber(popularity.totals.follows), <Star className="h-4 w-4" />)}
            {metricCard("Comments", formatNumber(popularity.totals.comments), <MessageSquare className="h-4 w-4" />)}
            {metricCard("Reactions", formatNumber(popularity.totals.reactions), <ThumbsUp className="h-4 w-4" />)}
            {metricCard("Shares", formatNumber(popularity.totals.shares), <Share2 className="h-4 w-4" />)}
          </div>
        </aside>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="mwz-panel p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2 text-accent">
              <FileText className="h-4 w-4" />
              <h2 className="font-retro text-xl uppercase tracking-[0.14em] text-foreground">Mission</h2>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-base">{draft.mission || draft.description}</p>
          </div>

          <div className="mwz-panel p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-accent">
              <Rocket className="h-4 w-4" />
              <h2 className="font-retro text-xl uppercase tracking-[0.14em] text-foreground">Battle Plan</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {draft.roadmap.map((item, index) => (
                <div key={item.id} className="mwz-card p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Phase {index + 1}</p>
                  <h3 className="mt-2 font-retro text-xl text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mwz-panel p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2 text-accent">
              <Radio className="h-4 w-4" />
              <h2 className="font-retro text-xl uppercase tracking-[0.14em] text-foreground">Launch Strategy</h2>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-base">{draft.launchStrategy}</p>
          </div>

          <div className="mwz-panel p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2 text-accent">
              <ShieldCheck className="h-4 w-4" />
              <h2 className="font-retro text-xl uppercase tracking-[0.14em] text-foreground">Creator Note</h2>
            </div>
            <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-base">{draft.creatorNote}</p>
          </div>

          <div className="mwz-panel p-5 md:p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-accent">
                <MessageSquare className="h-4 w-4" />
                <h2 className="font-retro text-xl uppercase tracking-[0.14em] text-foreground">The Bunker</h2>
              </div>
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{formatNumber(popularity.totals.comments)} transmissions</span>
            </div>

            <div className="mb-4 flex flex-col gap-3 border border-border/70 bg-background/60 p-3">
              <Textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                className="min-h-20 resize-none border-border bg-background/70 font-retro text-foreground placeholder:text-muted-foreground"
                placeholder={wallet.isConnected ? "Drop a transmission..." : "Connect wallet to post a transmission..."}
                maxLength={500}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{commentBody.length}/500</span>
                <Button type="button" onClick={handleComment} className="mwz-button h-10 px-4 font-retro">
                  <Send className="h-4 w-4" />
                  Post
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {draft.comments.map((comment) => {
                const reacted = account ? comment.reactions.some((item) => item.toLowerCase() === account.toLowerCase()) : false;
                return (
                  <div key={comment.id} className="mwz-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center border border-border/70 bg-background/70 font-retro text-xs text-accent">
                        {comment.authorLabel.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-retro text-sm text-foreground">{comment.authorLabel}</span>
                          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            {shortAddress(comment.authorAddress)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{formatDraftDateTime(comment.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{comment.body}</p>
                        <button
                          type="button"
                          onClick={() => handleReaction(comment.id)}
                          className={cn("mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground", reacted && "text-accent")}
                        >
                          <ThumbsUp className="h-4 w-4" />
                          {comment.reactions.length}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <div className="mwz-panel p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-accent">Creator</p>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center border border-border/70 bg-background/70 font-retro text-accent">
                {draft.creatorHandle.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-retro text-foreground">{draft.creatorHandle}</p>
                <p className="truncate text-xs text-muted-foreground">{shortAddress(draft.creatorAddress)}</p>
              </div>
            </div>
            <Button asChild className="mwz-button mt-3 h-10 w-full text-xs font-retro">
              <Link to={`/profile?address=${encodeURIComponent(draft.creatorAddress)}`}>
                <Eye className="h-4 w-4" />
                View profile
              </Link>
            </Button>
          </div>

          <div className="mwz-panel p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-accent">Comms</p>
            <div className="grid gap-2">
              {[
                ["Website", draft.communityLinks.website, <Globe className="h-4 w-4" />],
                ["X", draft.communityLinks.x, <Flame className="h-4 w-4" />],
                ["Telegram", draft.communityLinks.telegram, <Users className="h-4 w-4" />],
                ["Discord", draft.communityLinks.discord, <MessageSquare className="h-4 w-4" />],
              ].map(([label, url, icon]) => (
                <a
                  key={String(label)}
                  href={String(url || "#")}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("mwz-button flex h-10 items-center justify-start gap-2 px-3 text-xs font-retro", !url && "pointer-events-none opacity-50")}
                >
                  {icon}
                  <span className="min-w-0 truncate">{String(label)}: {externalLinkLabel(String(url || ""))}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="mwz-panel p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-accent">Docs</p>
            <div className="grid gap-2">
              {[
                ["Litepaper", draft.docsLinks.litepaper],
                ["Audit", draft.docsLinks.audit],
                ["Deck", draft.docsLinks.deck],
              ].map(([label, url]) => (
                <a
                  key={label}
                  href={url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("mwz-button flex h-10 items-center justify-start gap-2 px-3 text-xs font-retro", !url && "pointer-events-none opacity-50")}
                >
                  <Link2 className="h-4 w-4" />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="mwz-panel p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-accent">Share Intel</p>
            <p className="text-sm leading-6 text-muted-foreground">{draft.shareMessage}</p>
            <Button type="button" onClick={handleShare} className="mwz-button mt-3 h-10 w-full text-xs font-retro">
              <Copy className="h-4 w-4" />
              Copy rally link
            </Button>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default PublicPromotion;
