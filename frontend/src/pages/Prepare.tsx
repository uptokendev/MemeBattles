import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bell, ExternalLink, Flame, Globe, MessageSquare, Rocket, Send, Share2, Shield, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import {
  addDraftComment,
  fetchDraftComments,
  fetchPrepareDraft,
  followDraft,
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

function getLaunchCountdown() {
  return [
    ["11", "D"],
    ["08", "H"],
    ["42", "M"],
    ["17", "S"],
  ];
}

function RadarCard({ percentage, heatLabel }: { percentage: number; heatLabel: string }) {
  return (
    <div className="mwz-card p-5 md:p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// RECON HEAT</div>
      <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-full border border-orange-400/50 bg-[radial-gradient(circle,rgba(255,153,0,0.20),transparent_58%)] shadow-[0_0_40px_rgba(255,153,0,0.13)]">
        <div className="mwz-radar h-40 w-40">
          <span className="mwz-radar-sweep" />
          <span className="absolute left-[28%] top-[36%] h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_18px_rgba(255,153,0,0.9)]" />
          <span className="absolute right-[30%] top-[55%] h-1.5 w-1.5 rounded-full bg-orange-200 shadow-[0_0_14px_rgba(255,153,0,0.8)]" />
          <span className="absolute bottom-[27%] left-[42%] h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_14px_rgba(255,153,0,0.8)]" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.18em]">
        <span className="mwz-muted">Signal</span>
        <span className="text-orange-300">{percentage}% · {heatLabel}</span>
      </div>
    </div>
  );
}

function TransmissionList({ draftId }: { draftId: string }) {
  const wallet = useWallet();
  const [items, setItems] = useState<DraftComment[]>([]);
  const [body, setBody] = useState("");
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

  const send = async () => {
    if (!wallet.account) {
      toast.error("Connect wallet to send a transmission.");
      return;
    }
    if (!body.trim()) return;
    setLoading(true);
    try {
      const comment = await addDraftComment(draftId, wallet.account, body.trim());
      setItems((prev) => [comment, ...prev]);
      setBody("");
      toast.success("Transmission sent.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send transmission");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-px w-16 bg-orange-400/70" />
          <div>
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">Transmissions</h2>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">// Bunker comms feed</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="grid gap-4 md:grid-cols-2">
          {items.length === 0 ? (
            <div className="mwz-card p-5 text-sm text-muted-foreground md:col-span-2">No transmissions intercepted yet. Be the first soldier in the bunker.</div>
          ) : (
            items.slice(0, 8).map((item) => (
              <div key={item.id} className="mwz-card flex gap-3 p-4">
                <div className="h-10 w-10 shrink-0 rounded-full border border-orange-400/40 bg-[radial-gradient(circle_at_30%_20%,rgba(255,153,0,0.55),rgba(25,8,2,0.9))]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-retro text-sm text-foreground">{shortWallet(item.walletAddress)}</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  <div className="mt-3 flex gap-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <span>🔥 {item.reactionCount}</span>
                    <span>↑ 12</span>
                    <span>Reply</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mwz-card p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-orange-300">
            <Send className="h-4 w-4" /> Send transmission
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Drop your call sign, alpha, or war cry..."
            className="min-h-32 border-border/70 bg-background/50 font-retro text-base"
          />
          <Button onClick={send} disabled={loading || !body.trim()} className="mwz-button mwz-button-orange mt-3 w-full font-retro">
            <Send className="mr-2 h-4 w-4" />
            Send transmission
          </Button>
          {!wallet.account && <p className="mt-3 text-xs text-muted-foreground">Wallet connection required for bunker actions.</p>}
        </div>
      </div>
    </section>
  );
}

export default function Prepare() {
  const { slug = DEMO_SLUG } = useParams();
  const wallet = useWallet();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [followCount, setFollowCount] = useState<number | null>(null);

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

  const countdown = useMemo(() => getLaunchCountdown(), []);

  const handleFollow = async () => {
    if (!draft) return;
    if (!wallet.account) {
      toast.error("Connect wallet to watchlist this draft.");
      return;
    }
    try {
      const result = await followDraft(draft.id, wallet.account);
      setFollowCount(result.followCount);
      toast.success("Draft added to your watchlist.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to watchlist draft");
    }
  };

  const share = async () => {
    const url = window.location.href;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("Dossier link copied.");
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

  const ticker = `$${draft.ticker}`;
  const heroTagline = draft.description || "The launchpad that turns every drop into a war.";
  const links = [
    ["X / Twitter", promo.xUrl || draft.xUrl, "Frontline updates", "X"],
    ["Telegram", promo.telegramUrl, "Squad comms", "TG"],
    ["Discord", promo.discordUrl, "Bunker voice", "DC"],
    ["Website", promo.websiteUrl || draft.websiteUrl, "Lore + docs", "WEB"],
  ].filter(([, url]) => Boolean(url));

  return (
    <div className="relative -mx-2 -mt-1 min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.20),transparent_48%),radial-gradient(ellipse_at_bottom,rgba(57,255,79,0.09),transparent_52%),linear-gradient(180deg,rgba(26,8,2,0.96),rgba(1,6,0,0.98))] md:-mx-3 lg:-mx-4">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,153,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,79,0.05)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,153,0,0.22),transparent_34%)]" />

      <main className="relative z-10">
        <section className="relative flex min-h-[680px] flex-col items-center px-4 py-16 text-center md:px-8 md:py-20">
          <div className="absolute left-4 top-6 hidden gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground md:flex">
            <span className="text-orange-300">// COORD: 47.6° N · 11.2° E</span>
            <span>SECTOR: 04-RECON</span>
          </div>
          <div className="absolute right-4 top-6 hidden items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-200 md:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            UNARMED · DRAFT MODE
          </div>

          <div className="mwz-chip mwz-chip-active mt-8 inline-flex items-center gap-2 px-4 py-2 text-xs md:mt-14">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" />
            Incoming transmission · BNB Chain
          </div>

          <div className="mt-8 font-mono text-xl uppercase tracking-[0.5em] text-orange-300">{ticker}</div>
          <h1 className="mt-3 max-w-5xl bg-gradient-to-b from-white via-orange-200 to-orange-600 bg-clip-text font-retro text-6xl uppercase leading-[0.82] tracking-[0.03em] text-transparent drop-shadow-[0_0_40px_rgba(255,153,0,0.38)] md:text-8xl lg:text-[9rem]">
            {draft.name}
          </h1>

          <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-3 border border-orange-400/50 bg-black/45 px-4 py-3 shadow-[0_0_40px_rgba(255,153,0,0.18)] md:px-6">
            <span className="text-[10px] uppercase tracking-[0.22em] text-orange-300">// Deploy in</span>
            {countdown.map(([n, l], index) => (
              <div key={l} className="flex items-baseline gap-1">
                <span className="font-retro text-4xl leading-none text-white tabular-nums drop-shadow-[0_0_18px_rgba(255,153,0,0.65)]">{n}</span>
                <span className="font-mono text-xs text-orange-200">{l}</span>
                {index < countdown.length - 1 && <span className="ml-2 text-2xl text-muted-foreground">:</span>}
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
            {heroTagline} <span className="text-muted-foreground/70">Prepare Mode is live, but trading is locked until deployment.</span>
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={handleFollow} className="mwz-button mwz-button-orange h-13 px-6 font-retro text-base">
              <Bell className="mr-2 h-4 w-4" /> Arm notification
            </Button>
            <Button onClick={handleFollow} className="mwz-button h-13 px-6 font-retro text-base">
              <Star className="mr-2 h-4 w-4" /> Watchlist
            </Button>
            <Button onClick={share} variant="outline" className="mwz-button h-13 px-6 font-retro text-base">
              <Share2 className="mr-2 h-4 w-4" /> Share dossier
            </Button>
          </div>

          <div className="mwz-card mt-12 grid overflow-hidden border-orange-400/35 bg-black/45 md:grid-cols-4">
            {[
              ["Armed recruits", String(pop.signedActions || 0), Users],
              ["Watchlists", String(followCount ?? pop.follows), Star],
              ["Heat", `${pop.popularityPercentage}%`, Flame],
              ["Status", statusLabel(draft.status), Shield],
            ].map(([label, value, Icon], index) => (
              <div key={String(label)} className={`flex items-center gap-3 px-5 py-4 text-left ${index > 0 ? "border-t border-border/50 md:border-l md:border-t-0" : ""}`}>
                <Icon className="h-5 w-5 text-orange-300" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label as string}</div>
                  <div className="mt-1 font-retro text-2xl leading-none text-foreground">{value as string}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-4">
            <div className="h-px w-16 bg-orange-400/70" />
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">The Dossier</h2>
            <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground md:inline">// Creator-curated sections</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div className="mwz-card p-6 md:p-8">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-orange-400/50 bg-[radial-gradient(circle,rgba(255,153,0,0.28),rgba(0,0,0,0.75))] font-retro text-2xl text-orange-200">
                {ticker}
              </div>
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Lore</div>
              <h3 className="mt-2 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">The brief</h3>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground md:text-base">
                {promo.missionStatement || draft.description || "Creator has not published a mission statement yet."}
              </p>
              {promo.creatorNote && <p className="mt-5 border-l border-orange-400/40 pl-4 text-sm leading-6 text-orange-100/85">{promo.creatorNote}</p>}
            </div>

            <div className="mwz-card p-5 md:p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Comms channels</div>
              <h3 className="mt-2 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">Tune in</h3>
              <div className="mt-5 flex flex-col gap-2">
                {links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No public comms channels published yet.</p>
                ) : links.map(([label, url, meta, code]) => (
                  <a key={String(label)} href={String(url)} target="_blank" rel="noreferrer" className="mwz-button flex items-center justify-between gap-3 px-3 py-3 text-left text-xs">
                    <span className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-orange-300" />
                      <span>
                        <span className="block text-sm text-foreground">{label as string}</span>
                        <span className="block text-[10px] text-muted-foreground">{meta as string} · {code as string}</span>
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            <RadarCard percentage={pop.popularityPercentage} heatLabel={pop.heatLabel} />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-4">
            <div className="h-px w-16 bg-orange-400/70" />
            <h2 className="font-retro text-3xl uppercase tracking-[0.12em] text-foreground md:text-4xl">Mission Phases</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {(promo.roadmap?.length ? promo.roadmap : ["Recon: recruits, hype, visuals.", "Deploy: bonding curve goes live.", "Graduate: DEX migration and LP lock.", "Conquest: weekly league war."]).slice(0, 4).map((phase, index) => {
              const [title, ...rest] = phase.split(":");
              return (
                <div key={`${phase}-${index}`} className={`mwz-card p-5 ${index === 0 ? "border-orange-400/70 bg-orange-500/5" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Phase 0{index + 1}</span>
                    {index === 0 ? <Flame className="h-4 w-4 text-orange-300" /> : <Rocket className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="mt-4 font-retro text-3xl uppercase text-foreground">{title.trim()}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{rest.join(":").trim() || phase}</p>
                  {index === 0 && <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-orange-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" /> Active</div>}
                </div>
              );
            })}
          </div>
        </section>

        <TransmissionList draftId={draft.id} />

        <section className="mx-auto max-w-7xl px-4 py-10 pb-20 md:px-8 md:py-14 md:pb-24">
          <div className="mwz-card border-orange-400/50 bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.18),rgba(2,17,4,0.92)_70%)] p-8 text-center md:p-12">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Prepare Mode active</div>
            <h3 className="mt-3 bg-gradient-to-b from-white to-orange-400 bg-clip-text font-retro text-5xl uppercase tracking-[0.08em] text-transparent md:text-7xl">Be first in.</h3>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {(followCount ?? pop.follows).toLocaleString()} soldiers already watching. The moment {ticker} moves from draft to live campaign, the alert fires.
            </p>
            <div className="mx-auto mt-7 flex max-w-xl gap-2">
              <Input className="h-12 border-border/70 bg-background/50 font-retro" placeholder="wallet or call sign" />
              <Button onClick={handleFollow} className="mwz-button mwz-button-orange h-12 px-6 font-retro">Arm me</Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
