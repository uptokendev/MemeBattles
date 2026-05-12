import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bell,
  Edit3,
  ExternalLink,
  Flame,
  MessageSquareReply,
  Rocket,
  Send,
  Share2,
  Shield,
  Star,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import {
  addDraftComment,
  armDraftNotifications,
  fetchDraftComments,
  fetchPrepareDraft,
  followDraft,
  type DraftComment,
  type PrepareDraftBundle,
} from "@/lib/draftApi";
import { normalizeSocialUrl } from "@/lib/socialLinks";

const DEMO_SLUG = "memewarzone-mwz-demo";

function shortWallet(value: string) {
  if (!value) return "Unknown";
  if (value.startsWith("@")) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toUpperCase();
}

function buildPreparePageUrl(slug: string) {
  if (typeof window === "undefined") return `https://memewar.zone/prepare/${slug}`;
  return `${window.location.origin}/prepare/${slug}`;
}

function fixedMissionPhases() {
  return [
    ["Recon", "Prepare the page, arm notifications, and recruit the first watchlist soldiers."],
    ["Deploy", "Push the draft live and open the bonding curve when launch is confirmed."],
    ["Graduate", "Reach target, finalize liquidity, and unlock creator payout logic."],
    ["Conquest", "Enter weekly battles, visibility loops, UpVotes, and community competition."],
  ];
}

function TokenLogo({ src, ticker }: { src?: string | null; ticker: string }) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-orange-400/60 bg-[radial-gradient(circle_at_30%_25%,rgba(57,255,122,0.95),rgba(0,65,28,0.95)_52%,rgba(0,0,0,0.78))] font-retro text-xl text-white shadow-[0_0_28px_rgba(57,255,122,0.22)] md:h-24 md:w-24">
      {src ? <img src={src} alt={`${ticker} logo`} className="h-full w-full object-cover" /> : `$${ticker}`}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-black/35 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-orange-300" />
        {label}
      </div>
      <div className="mt-1 font-retro text-2xl leading-none text-foreground">{value}</div>
    </div>
  );
}

function CommsCard({ links }: { links: Array<[string, string, string]> }) {
  return (
    <div className="mwz-card h-full p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-300">// Comms channels</div>
      <div className="grid gap-2">
        {links.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-black/30 p-3 text-sm text-muted-foreground">
            No public channels published yet.
          </div>
        ) : (
          links.map(([label, url, note]) => (
            <a
              key={`${label}-${url}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-black/35 px-3 py-2 transition-colors hover:border-orange-400/60"
            >
              <div>
                <div className="font-retro text-sm uppercase tracking-[0.12em] text-foreground group-hover:text-orange-300">{label}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{note}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-orange-300" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function Transmissions({ draftId, isCreator }: { draftId: string; isCreator: boolean }) {
  const wallet = useWallet();
  const [items, setItems] = useState<DraftComment[]>([]);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<DraftComment | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchDraftComments(draftId)
      .then((comments) => {
        if (!cancelled) setItems(comments);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const send = async (reply = false) => {
    const text = reply ? replyBody.trim() : body.trim();
    if (!wallet.account) {
      toast.error("Connect wallet to send a transmission.");
      return;
    }
    if (reply && !isCreator) {
      toast.error("Only the creator can reply to transmissions.");
      return;
    }
    if (!text) return;

    setLoading(true);
    try {
      const prefix = reply && replyingTo ? `↳ Creator reply to ${shortWallet(replyingTo.walletAddress)}: ` : "";
      const comment = await addDraftComment(draftId, wallet.account, `${prefix}${text}`);
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

  return (
    <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 md:px-6 lg:grid-cols-[1fr_360px]">
      {replyingTo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="mwz-card w-full max-w-lg border-orange-400/50 bg-black/95 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Creator reply</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Replying to {shortWallet(replyingTo.walletAddress)}: “{replyingTo.body}”
                </p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="mwz-button h-8 w-8">×</button>
            </div>
            <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} className="min-h-28 border-border/70 bg-background/50 font-retro" placeholder="Send official creator reply..." />
            <Button onClick={() => send(true)} disabled={loading || !replyBody.trim()} className="mwz-button mwz-button-orange mt-3 w-full font-retro">
              Send creator reply
            </Button>
          </div>
        </div>
      )}

      <div className="mwz-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-retro text-2xl uppercase tracking-[0.12em] text-foreground">Transmissions</h2>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">// Bunker comms feed</p>
          </div>
          <span className="rounded-full border border-orange-400/40 px-3 py-1 font-mono text-xs text-orange-300">{items.length} intercepted</span>
        </div>

        <div className="grid max-h-[260px] gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-black/30 p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No transmissions intercepted yet. Be the first soldier in the bunker.
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/50 bg-black/35 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-retro text-sm text-foreground">{shortWallet(item.walletAddress)}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                <div className="mt-2 flex gap-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <span>🔥 {item.reactionCount}</span>
                  <button type="button" onClick={() => (isCreator ? setReplyingTo(item) : toast.error("Only the creator can reply."))} className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200">
                    <MessageSquareReply className="h-3 w-3" /> Reply
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mwz-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-orange-300">
          <Send className="h-4 w-4" /> Send transmission
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Drop your call sign, alpha, or war cry..." className="min-h-28 border-border/70 bg-background/50 font-retro text-base" />
        <Button onClick={() => send(false)} disabled={loading || !body.trim()} className="mwz-button mwz-button-orange mt-3 w-full font-retro">
          <Send className="mr-2 h-4 w-4" /> Send transmission
        </Button>
        {!wallet.account && <p className="mt-3 text-xs text-muted-foreground">Wallet connection required for bunker actions.</p>}
      </div>
    </section>
  );
}

export default function PrepareCompact() {
  const { slug = DEMO_SLUG } = useParams();
  const wallet = useWallet();

  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [followCount, setFollowCount] = useState<number | null>(null);
  const [armingNotification, setArmingNotification] = useState(false);
  const [followingDraft, setFollowingDraft] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchPrepareDraft(slug, wallet.account)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setFollowCount(data.popularity.follows);
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
  }, [slug, wallet.account]);

  const draft = bundle?.draft;
  const promo = bundle?.promotion;
  const pop = bundle?.popularity;

  const refreshPrepareBundle = async () => {
    const data = await fetchPrepareDraft(slug, wallet.account);
    setBundle(data);
    setFollowCount(data.popularity.follows);
    return data;
  };

  const handleArmNotification = async () => {
    if (!draft) return;
    if (!wallet.account) {
      toast.error("Connect wallet to arm notifications.");
      return;
    }
    setArmingNotification(true);
    try {
      await armDraftNotifications(draft.id, wallet.account);
      await refreshPrepareBundle().catch(() => null);
      window.dispatchEvent(new CustomEvent("mwz:notifications-changed"));
      toast.success("Notifications armed for this draft.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to arm notifications.");
    } finally {
      setArmingNotification(false);
    }
  };

  const handleFollow = async () => {
    if (!draft) return;
    if (!wallet.account) {
      toast.error("Connect wallet to follow this draft.");
      return;
    }
    setFollowingDraft(true);
    try {
      const result = await followDraft(draft.id, wallet.account);
      setFollowCount(result.followCount);
      await refreshPrepareBundle().catch(() => null);
      window.dispatchEvent(new CustomEvent("mwz:draft-follows-changed"));
      toast.success("Draft followed.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to follow draft.");
    } finally {
      setFollowingDraft(false);
    }
  };

  const copyPage = async () => {
    if (!draft) return;
    await navigator.clipboard?.writeText(buildPreparePageUrl(draft.slug)).catch(() => undefined);
    toast.success("Prepare page link copied.");
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl py-20 text-center font-retro text-muted-foreground">Loading war room dossier...</div>;
  }

  if (!bundle || !draft || !promo || !pop) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-retro text-4xl text-foreground">Prepare page not found</h1>
        <Button asChild className="mwz-button mt-6 font-retro"><Link to="/create">Create Draft</Link></Button>
      </div>
    );
  }

  const isCreator = Boolean(wallet.account && draft.creatorWallet && wallet.account.toLowerCase() === draft.creatorWallet.toLowerCase());
  const heroTagline = draft.description || "The launchpad that turns every drop into a war.";
  const mission = promo.missionStatement || draft.description || "Creator has not published a mission statement yet.";
  const strategy = promo.launchStrategy || "Launch strategy is being prepared.";
  const phases = fixedMissionPhases();
  const links: Array<[string, string, string]> = [
    ["Website", normalizeSocialUrl(promo.websiteUrl || draft.websiteUrl, "website"), "Lore + official site"],
    ["X", normalizeSocialUrl(promo.xUrl || draft.xUrl, "x"), "Frontline updates"],
    ["Telegram", normalizeSocialUrl(promo.telegramUrl, "telegram"), "Squad comms"],
    ["Discord", normalizeSocialUrl(promo.discordUrl, "discord"), "Bunker voice"],
  ].filter(([, url]) => Boolean(url));

  return (
    <div className="relative -mx-2 -mt-1 min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.18),transparent_46%),radial-gradient(ellipse_at_bottom,rgba(57,255,79,0.08),transparent_54%),linear-gradient(180deg,rgba(26,8,2,0.96),rgba(1,6,0,0.98))] md:-mx-3 lg:-mx-4">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,153,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,79,0.05)_1px,transparent_1px)] [background-size:52px_52px]" />
      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 md:px-6 lg:min-h-[calc(100dvh-7.5rem)] lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="mwz-card flex min-h-[30rem] flex-col justify-between overflow-hidden border-orange-400/35 bg-black/45 p-5 md:p-6">
            <div>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-3 py-1 font-retro text-xs uppercase tracking-[0.16em] text-orange-200">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" /> Prepare Mode
                </div>
                <div className="hidden text-right text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:block">
                  Status<br /><span className="text-orange-300">{statusLabel(draft.status)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <TokenLogo src={draft.logoUrl} ticker={draft.ticker} />
                <div className="min-w-0">
                  <div className="font-mono text-lg uppercase tracking-[0.38em] text-orange-300">${draft.ticker}</div>
                  <h1 className="mt-2 bg-gradient-to-b from-white via-orange-200 to-orange-600 bg-clip-text font-retro text-5xl uppercase leading-[0.82] tracking-[0.03em] text-transparent drop-shadow-[0_0_32px_rgba(255,153,0,0.32)] md:text-6xl xl:text-7xl">
                    {draft.name}
                  </h1>
                </div>
              </div>

              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {heroTagline} <span className="text-muted-foreground/70">Trading is locked until deployment.</span>
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <StatCard label="Armed" value={String(pop.signedActions || 0)} icon={Users} />
              <StatCard label="Watchlists" value={String(followCount ?? pop.follows)} icon={Star} />
              <StatCard label="Heat" value={`${pop.popularityPercentage}%`} icon={Flame} />
              <StatCard label="Status" value={statusLabel(draft.status).slice(0, 10)} icon={Shield} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={handleArmNotification} disabled={armingNotification} className="mwz-button mwz-button-orange h-11 px-5 font-retro text-sm">
                <Bell className="mr-2 h-4 w-4" /> {armingNotification ? "Arming..." : "Arm notification"}
              </Button>
              <Button onClick={handleFollow} disabled={followingDraft} className="mwz-button h-11 px-5 font-retro text-sm">
                <Star className="mr-2 h-4 w-4" /> {followingDraft ? "Following..." : "Follow"}
              </Button>
              <Button onClick={copyPage} variant="outline" className="mwz-button h-11 px-5 font-retro text-sm">
                <Share2 className="mr-2 h-4 w-4" /> Copy page
              </Button>
              {isCreator && (
                <Button asChild variant="outline" className="mwz-button h-11 px-5 font-retro text-sm">
                  <Link to={`/drafts/${draft.id}/promotion`}><Edit3 className="mr-2 h-4 w-4" /> Edit</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-rows-[auto_1fr]">
            <CommsCard links={links} />
            <div className="mwz-card p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-300">// Launch path</div>
              <div className="grid gap-2">
                {phases.map(([title, text], index) => (
                  <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-xl border border-border/50 bg-black/30 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-400/40 font-retro text-sm text-orange-300">0{index + 1}</div>
                    <div>
                      <div className="font-retro text-sm uppercase tracking-[0.12em] text-foreground">{title}</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-5 md:px-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="mwz-card p-4 md:p-5">
            <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-300">// The dossier</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="font-retro text-2xl uppercase tracking-[0.1em] text-foreground">Mission brief</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{mission}</p>
                {promo.creatorNote && <p className="mt-3 border-l border-orange-400/50 pl-3 text-sm leading-6 text-orange-100/80">{promo.creatorNote}</p>}
              </div>
              <div>
                <h2 className="font-retro text-2xl uppercase tracking-[0.1em] text-foreground">Launch strategy</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{strategy}</p>
                {Array.isArray(promo.docs) && promo.docs.length > 0 && (
                  <div className="mt-4 grid gap-2">
                    {promo.docs.map((doc) => (
                      <a key={doc} href={normalizeSocialUrl(doc, "other")} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between rounded-xl border border-border/50 bg-black/30 px-3 py-2 font-retro text-xs uppercase tracking-[0.12em] text-orange-300">
                        Docs / other <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mwz-card p-4 md:p-5">
            <div className="mb-3 text-xs uppercase tracking-[0.22em] text-orange-300">// Recon heat</div>
            <div className="flex items-center gap-5">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border border-orange-400/50 bg-[radial-gradient(circle,rgba(255,153,0,0.18),transparent_64%)]">
                <div className="font-retro text-3xl text-orange-300">{pop.popularityPercentage}%</div>
                <span className="absolute inset-4 animate-ping rounded-full border border-orange-400/30" />
              </div>
              <div>
                <div className="font-retro text-xl uppercase tracking-[0.12em] text-foreground">Signal strength</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Heat combines armed notifications, follows, shares, and prepare-page activity before deployment.
                </p>
                <Button onClick={copyPage} variant="outline" className="mwz-button mt-3 h-9 font-retro text-xs">
                  <Rocket className="mr-2 h-4 w-4" /> Share recon page
                </Button>
              </div>
            </div>
          </div>
        </section>

        <Transmissions draftId={draft.id} isCreator={isCreator} />
      </main>
    </div>
  );
}
