import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiBase";
import { getActiveChainId } from "@/lib/chainConfig";
import { fetchCampaignDraft, fetchPrepareDraft, saveDraftPromotion, type PrepareDraftBundle } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";
import { useWallet } from "@/contexts/WalletContext";

type SocialLink = {
  label: string;
  short: string;
  url: string;
};

type SocialLinkForm = {
  website: string;
  x: string;
  telegram: string;
  discord: string;
  other: string;
};

const emptySocialForm: SocialLinkForm = {
  website: "",
  x: "",
  telegram: "",
  discord: "",
  other: "",
};

function cleanHandle(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/^@+/, "")
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

function normalizeExternalUrl(raw: string | null | undefined, kind: "x" | "telegram" | "discord" | "website" | "other") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  if (kind === "x") {
    const handle = cleanHandle(value).replace(/^(twitter\.com|x\.com)\//i, "").split("/")[0];
    return handle ? `https://x.com/${handle}` : "";
  }

  if (kind === "telegram") {
    const handle = cleanHandle(value).replace(/^(t\.me|telegram\.me|telegram\.dog)\//i, "").split("/")[0];
    return handle ? `https://t.me/${handle}` : "";
  }

  if (kind === "discord") {
    const handle = value.replace(/^@+/, "").replace(/^\/+/, "");
    return value.toLowerCase().includes("discord") ? `https://${handle}` : value;
  }

  return `https://${value.replace(/^\/+/, "")}`;
}

function isTokenSelfUrl(raw: string | null | undefined, campaignAddress: string) {
  const value = String(raw || "").trim().toLowerCase();
  const address = String(campaignAddress || "").trim().toLowerCase();
  if (!value || !address) return false;
  return value.includes(`/token/${address}`);
}

function formFromBundle(bundle: PrepareDraftBundle | null): SocialLinkForm {
  if (!bundle) return emptySocialForm;

  const draft = bundle.draft;
  const promo = bundle.promotion;
  const otherFromPromotionDocs = Array.isArray(promo.docs) ? promo.docs.find(Boolean) : "";

  return {
    website: promo.websiteUrl || draft.websiteUrl || "",
    x: promo.xUrl || draft.xUrl || "",
    telegram: promo.telegramUrl || "",
    discord: promo.discordUrl || "",
    other: draft.otherUrl || otherFromPromotionDocs || "",
  };
}

function SocialLinksPanel({ links }: { links: SocialLink[] }) {
  if (!links.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-4 z-40 md:bottom-auto md:top-[6.1rem]">
      <div className="pointer-events-auto rounded-2xl border border-border/60 bg-black/75 p-2 shadow-xl backdrop-blur-md">
        <div className="mb-1 px-2 font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Official Links
        </div>
        <div className="flex flex-wrap gap-1.5 md:flex-col">
          {links.map((link) => (
            <a
              key={`${link.label}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/60 px-2.5 py-2 font-retro text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-accent/60 hover:text-accent md:min-w-36"
              title={link.label}
            >
              <span>{link.short}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function prepareLinks(bundle: PrepareDraftBundle | null): SocialLink[] {
  const form = formFromBundle(bundle);

  return [
    { label: "Website", short: "WEB", url: normalizeExternalUrl(form.website, "website") },
    { label: "X (formally Twitter)", short: "X", url: normalizeExternalUrl(form.x, "x") },
    { label: "Telegram", short: "TG", url: normalizeExternalUrl(form.telegram, "telegram") },
    { label: "Discord", short: "DC", url: normalizeExternalUrl(form.discord, "discord") },
    { label: "Other", short: "OTHER", url: normalizeExternalUrl(form.other, "other") },
  ].filter((item) => Boolean(item.url));
}

export function PrepareSocialLinksOverlay() {
  const { slug = "" } = useParams();
  const wallet = useWallet();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    void fetchPrepareDraft(slug, wallet.account)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch(() => {
        if (!cancelled) setBundle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, wallet.account]);

  const links = useMemo(() => prepareLinks(bundle), [bundle]);
  return <SocialLinksPanel links={links} />;
}

export function PromotionEditSocialLinksPanel() {
  const { draftId = "" } = useParams();
  const wallet = useWallet();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [form, setForm] = useState<SocialLinkForm>(emptySocialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    void fetchCampaignDraft(draftId, wallet.account)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setForm(formFromBundle(data));
      })
      .catch(() => {
        if (cancelled) return;
        setBundle(null);
        setForm(emptySocialForm);
      });

    return () => {
      cancelled = true;
    };
  }, [draftId, wallet.account]);

  const setField = (key: keyof SocialLinkForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!bundle || !draftId) return;
    if (!wallet.account) {
      toast.error("Connect the creator wallet to save social links.");
      return;
    }

    setSaving(true);
    try {
      const auth = await signDraftAction({
        signer: wallet.signer,
        walletAddress: wallet.account,
        chainId: Number(bundle.draft.chainId),
        action: "save_promotion",
        draftId,
      } as any);

      const normalizedWebsite = normalizeExternalUrl(form.website, "website");
      const normalizedX = normalizeExternalUrl(form.x, "x");
      const normalizedTelegram = normalizeExternalUrl(form.telegram, "telegram");
      const normalizedDiscord = normalizeExternalUrl(form.discord, "discord");
      const normalizedOther = normalizeExternalUrl(form.other, "other");

      const updated = await saveDraftPromotion(draftId, {
        auth,
        missionStatement: bundle.promotion.missionStatement,
        roadmap: bundle.promotion.roadmap,
        launchStrategy: bundle.promotion.launchStrategy,
        websiteUrl: normalizedWebsite,
        xUrl: normalizedX,
        telegramUrl: normalizedTelegram,
        discordUrl: normalizedDiscord,
        docs: normalizedOther ? [normalizedOther] : [],
        creatorNote: bundle.promotion.creatorNote,
        bannerUrl: bundle.promotion.bannerUrl,
        shareMessage: bundle.promotion.shareMessage,
        visibility: bundle.draft.visibility,
      });

      setBundle(updated);
      setForm(formFromBundle(updated));
      toast.success("Social links saved.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save social links.");
    } finally {
      setSaving(false);
    }
  };

  if (!bundle) return null;

  return (
    <div className="fixed bottom-5 right-4 z-40 w-[min(92vw,26rem)] rounded-2xl border border-border/60 bg-black/80 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Official links</div>
          <div className="font-retro text-sm text-foreground">Promotion social links</div>
        </div>
        <Button type="button" onClick={handleSave} disabled={saving} size="sm" className="mwz-button h-8 px-3 font-retro text-xs">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving" : "Save"}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="Website" className="h-9 bg-background/60 font-retro text-xs" />
        <Input value={form.x} onChange={(e) => setField("x", e.target.value)} placeholder="X handle or URL" className="h-9 bg-background/60 font-retro text-xs" />
        <Input value={form.telegram} onChange={(e) => setField("telegram", e.target.value)} placeholder="Telegram handle or URL" className="h-9 bg-background/60 font-retro text-xs" />
        <Input value={form.discord} onChange={(e) => setField("discord", e.target.value)} placeholder="Discord" className="h-9 bg-background/60 font-retro text-xs" />
        <Input value={form.other} onChange={(e) => setField("other", e.target.value)} placeholder="Other" className="h-9 bg-background/60 font-retro text-xs sm:col-span-2" />
      </div>
    </div>
  );
}

export function TokenSocialLinksOverlay() {
  const { campaignAddress = "" } = useParams();
  const wallet = useWallet();
  const [metadata, setMetadata] = useState<any | null>(null);

  useEffect(() => {
    const address = String(campaignAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return;

    let cancelled = false;
    const chainId = getActiveChainId(wallet.chainId);

    void apiFetch(`/api/token-metadata/${chainId}/${address}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setMetadata(json || null);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignAddress, wallet.chainId]);

  const links = useMemo(() => {
    const props = metadata?.properties || {};
    const externalUrl = isTokenSelfUrl(metadata?.external_url, campaignAddress) ? "" : metadata?.external_url;

    return [
      { label: "Website", short: "WEB", url: normalizeExternalUrl(props.website, "website") },
      { label: "X (formally Twitter)", short: "X", url: normalizeExternalUrl(props.x, "x") },
      { label: "Telegram", short: "TG", url: normalizeExternalUrl(props.telegram, "telegram") },
      { label: "Discord", short: "DC", url: normalizeExternalUrl(props.discord, "discord") },
      { label: "Other", short: "OTHER", url: normalizeExternalUrl(externalUrl, "other") },
    ].filter((item) => Boolean(item.url));
  }, [metadata, campaignAddress]);

  return <SocialLinksPanel links={links} />;
}
