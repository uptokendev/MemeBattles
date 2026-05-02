import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy, Eye, Flame, GripVertical, Rocket, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchCampaignDraft,
  saveDraftPromotion,
  type DraftVisibility,
  type PrepareDraftBundle,
} from "@/lib/draftApi";

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function joinLines(items?: string[]) {
  return (items || []).join("\n");
}

function shortDraftId(value: string) {
  return value ? `#${value.slice(0, 8)}` : "#DRAFT";
}

function EditableFrame(props: { id: string; title: string; template: string; children: React.ReactNode }) {
  return (
    <section className="mwz-card mb-4 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 bg-black/25 px-4 py-3">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-[0.22em] text-orange-300">SEC {props.id}</span>
        <span className="font-retro text-sm uppercase tracking-[0.12em] text-foreground">{props.title}</span>
        <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:inline">/ {props.template}</span>
      </div>
      <div className="p-4 md:p-5">{props.children}</div>
    </section>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-retro text-3xl leading-none text-foreground">{value}</div>
      <div className="mt-1 font-mono text-[10px] text-green-300">{delta}</div>
    </div>
  );
}

function TokenImage({ src, ticker }: { src?: string | null; ticker: string }) {
  return (
    <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-orange-400/50 bg-[radial-gradient(circle,rgba(255,153,0,0.22),rgba(0,0,0,0.78))] font-retro text-2xl text-orange-200 shadow-[0_0_28px_rgba(255,153,0,0.16)]">
      {src ? <img src={src} alt={`${ticker} logo`} className="h-full w-full object-cover" /> : `$${ticker}`}
    </div>
  );
}

export default function DraftPromotionSetup() {
  const { draftId = "" } = useParams();
  const navigate = useNavigate();
  const wallet = useWallet();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [missionStatement, setMissionStatement] = useState("");
  const [launchStrategy, setLaunchStrategy] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [docsText, setDocsText] = useState("");
  const [creatorNote, setCreatorNote] = useState("");
  const [visibility, setVisibility] = useState<DraftVisibility>("private");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCampaignDraft(draftId, wallet.account)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setMissionStatement(data.promotion.missionStatement || "");
        setLaunchStrategy(data.promotion.launchStrategy || "");
        setTelegramUrl(data.promotion.telegramUrl || "");
        setDiscordUrl(data.promotion.discordUrl || "");
        setXUrl(data.promotion.xUrl || data.draft.xUrl || "");
        setWebsiteUrl(data.promotion.websiteUrl || data.draft.websiteUrl || "");
        setDocsText(joinLines(data.promotion.docs));
        setCreatorNote(data.promotion.creatorNote || "");
        setVisibility(data.draft.visibility || "private");
      })
      .catch((err) => toast.error(err?.message || "Draft not found"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, wallet.account]);

  const draft = bundle?.draft;
  const pop = bundle?.popularity;

  const readiness = useMemo(() => {
    const checks = [
      Boolean(draft?.logoUrl),
      Boolean(missionStatement.trim()),
      Boolean(launchStrategy.trim()),
      Boolean(xUrl.trim() || telegramUrl.trim() || discordUrl.trim() || websiteUrl.trim()),
      visibility !== "private",
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft?.logoUrl, missionStatement, launchStrategy, xUrl, telegramUrl, discordUrl, websiteUrl, visibility]);

  const save = async (publish = false, preview = false) => {
    setSaving(true);
    try {
      const updated = await saveDraftPromotion(draftId, {
        missionStatement,
        roadmap: [],
        launchStrategy,
        telegramUrl,
        discordUrl,
        xUrl,
        websiteUrl,
        docs: splitLines(docsText),
        creatorNote,
        bannerUrl: "",
        shareMessage: `Incoming transmission: ${draft?.name || "this draft"} is preparing for war on MemeWarzone.`,
        visibility,
        publish,
      });
      setBundle(updated);
      toast.success(publish ? "Promotion page published." : "Draft page saved.");
      if (publish || preview) navigate(`/prepare/${updated.draft.slug}`);
      return updated;
    } catch (err: any) {
      toast.error(err?.message || "Failed to save promotion page");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!draft) return;
    const url = `${window.location.origin}/prepare/${draft.slug}`;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("Prepare page link copied.");
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl py-20 text-center font-retro text-muted-foreground">Loading draft command center...</div>;
  }

  if (!draft || !bundle) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-retro text-4xl text-foreground">Draft not found</h1>
        <Button asChild className="mwz-button mt-6 font-retro"><Link to="/create">Create Draft</Link></Button>
      </div>
    );
  }

  return (
    <div className="relative -mx-2 -mt-1 min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(255,153,0,0.16),transparent_42%),linear-gradient(180deg,rgba(1,6,0,0.98),rgba(0,0,0,0.96))] md:-mx-3 lg:-mx-4">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(57,255,79,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,153,0,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_380px]">
        <div className="border-r border-border/60">
          <div className="sticky top-0 z-30 flex min-h-14 flex-col gap-3 border-b border-border/70 bg-black/70 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" className="mwz-button h-8 px-3 text-xs">
                <Link to="/create">← Back to create</Link>
              </Button>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Edit mode</div>
                <div className="font-retro text-sm uppercase tracking-[0.12em] text-muted-foreground">${draft.ticker} · Draft {shortDraftId(draft.id)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Status: {draft.status.replace(/_/g, " ")}</span>
              <Button onClick={() => save(false)} disabled={saving} variant="outline" className="mwz-button h-8 px-3 text-xs">
                <Save className="mr-1 h-3 w-3" /> Save draft
              </Button>
              <Button onClick={() => save(false, true)} disabled={saving} variant="outline" className="mwz-button h-8 px-3 text-xs">
                <Eye className="mr-1 h-3 w-3" /> Save + preview
              </Button>
            </div>
          </div>

          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
            <EditableFrame id="01" title="Identity" template="locked from Create form">
              <div className="grid gap-5 md:grid-cols-[128px_1fr] md:items-center">
                <TokenImage src={draft.logoUrl} ticker={draft.ticker} />
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Name</label>
                    <Input value={draft.name} readOnly className="h-14 border-dashed border-border/80 bg-background/30 font-retro text-3xl uppercase tracking-[0.08em]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ticker</label>
                    <Input value={`$${draft.ticker}`} readOnly className="h-10 border-dashed border-border/80 bg-background/30 font-mono text-sm uppercase tracking-[0.18em] text-orange-300" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Short description</label>
                    <Input value={draft.description || ""} readOnly className="h-11 border-dashed border-border/80 bg-background/30 font-retro text-base text-muted-foreground" />
                  </div>
                </div>
              </div>
            </EditableFrame>

            <EditableFrame id="02" title="Mission Statement" template="creator text">
              <Textarea value={missionStatement} onChange={(e) => setMissionStatement(e.target.value)} className="min-h-40 border-border/70 bg-background/50 font-retro text-base leading-7" placeholder="Explain the brief. What is this draft? Why should soldiers lock in before launch?" />
            </EditableFrame>

            <EditableFrame id="03" title="Launch Strategy" template="battle plan">
              <Textarea value={launchStrategy} onChange={(e) => setLaunchStrategy(e.target.value)} className="min-h-36 border-border/70 bg-background/50 font-retro text-base leading-7" placeholder="How will the creator build hype, activate the squad, and push into launch day?" />
            </EditableFrame>

            <EditableFrame id="04" title="Comms Channels" template="public links">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={xUrl} onChange={(e) => setXUrl(e.target.value)} className="border-border/70 bg-background/50 font-retro" placeholder="X / Twitter URL" />
                <Input value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} className="border-border/70 bg-background/50 font-retro" placeholder="Telegram URL" />
                <Input value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} className="border-border/70 bg-background/50 font-retro" placeholder="Discord URL" />
                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="border-border/70 bg-background/50 font-retro" placeholder="Website URL" />
              </div>
            </EditableFrame>

            <EditableFrame id="05" title="Docs + Creator Note" template="optional support">
              <div className="grid gap-4 md:grid-cols-2">
                <Textarea value={docsText} onChange={(e) => setDocsText(e.target.value)} className="min-h-32 border-border/70 bg-background/50 font-retro" placeholder={"https://docs.example.com\nhttps://whitepaper.example.com"} />
                <Textarea value={creatorNote} onChange={(e) => setCreatorNote(e.target.value)} className="min-h-32 border-border/70 bg-background/50 font-retro" placeholder="Creator note shown in the dossier." />
              </div>
            </EditableFrame>
          </div>
        </div>

        <aside className="sticky top-0 h-screen overflow-auto bg-black/45 p-5 backdrop-blur">
          <div className="mb-5">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300">// Command center</div>
            <h2 className="mt-1 font-retro text-3xl uppercase tracking-[0.08em] text-foreground">Draft control</h2>
          </div>

          <div className="mwz-card mb-4 border-orange-400/50 bg-[radial-gradient(circle_at_30%_0%,rgba(255,153,0,0.18),rgba(2,17,4,0.92))] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Readiness</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-retro text-5xl leading-none text-orange-300">{readiness}</span>
              <span className="font-mono text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-4 h-2 border border-border/60 bg-black/45">
              <div className="h-full bg-gradient-to-r from-orange-500 to-green-400" style={{ width: `${readiness}%` }} />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Readiness now checks only the real setup fields: logo, mission, launch strategy, at least one comms channel, and public/unlisted visibility.
            </p>
            <Button onClick={() => save(true)} disabled={saving} className="mwz-button mwz-button-orange mt-4 h-11 w-full justify-center font-retro">
              <Rocket className="mr-2 h-4 w-4" /> Publish promotion
            </Button>
            <Button onClick={() => save(false)} disabled={saving} variant="outline" className="mwz-button mt-2 h-10 w-full justify-center font-retro text-xs">
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            <Button onClick={() => save(false, true)} disabled={saving} variant="outline" className="mwz-button mt-2 h-10 w-full justify-center font-retro text-xs">
              <Eye className="mr-2 h-4 w-4" /> Save + preview
            </Button>
          </div>

          <div className="mwz-card mb-4 p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">// Draft traffic · 7D</div>
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Views" value={String(pop?.views || 0)} delta="+182%" />
              <Metric label="Notify-armed" value={String(pop?.signedActions || 0)} delta="+91%" />
              <Metric label="Watchlists" value={String(pop?.follows || 0)} delta="+44%" />
              <Metric label="Shares" value={String(pop?.shares || 0)} delta="+12%" />
            </div>
          </div>

          <div className="mwz-card mb-4 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-orange-300" /> Locked sections
            </div>
            {["Identity", "Mission Statement", "Launch Strategy", "Comms Channels", "Docs + Creator Note"].map((name, index) => (
              <div key={name} className="flex items-center gap-3 border-b border-border/40 py-2 last:border-b-0">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-retro text-sm text-foreground">{name}</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">SEC 0{index + 1}</div>
                </div>
                <span className="h-4 w-8 border border-orange-400/60 bg-orange-400/70" />
              </div>
            ))}
          </div>

          <div className="mwz-card p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">// Visibility + share link</div>
            <div className="flex items-center gap-2 border border-border/70 bg-black/45 px-3 py-2 font-mono text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">/prepare/{draft.slug}</span>
              <button type="button" onClick={copyLink} className="text-orange-300"><Copy className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["public", "unlisted", "private"] as DraftVisibility[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setVisibility(item)}
                  className={`mwz-button h-9 text-[10px] uppercase tracking-[0.14em] ${visibility === item ? "mwz-button-orange" : ""}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => save(false, true)} disabled={saving} variant="outline" className="mwz-button h-10 flex-1 font-retro text-xs">
              <Eye className="mr-2 h-4 w-4" /> Preview
            </Button>
            <Button onClick={copyLink} variant="outline" className="mwz-button h-10 flex-1 font-retro text-xs">
              <Flame className="mr-2 h-4 w-4" /> Copy link
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
