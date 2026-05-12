import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/apiBase";
import { getActiveChainId } from "@/lib/chainConfig";
import { fetchPrepareDraft, type PrepareDraftBundle } from "@/lib/draftApi";
import { useWallet } from "@/contexts/WalletContext";

type SocialLink = {
  label: string;
  short: string;
  url: string;
};

function normalizeExternalUrl(raw: string | null | undefined, kind: "x" | "telegram" | "discord" | "website" | "other") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const handle = value.replace(/^@+/, "").replace(/^\/+/, "");

  if (kind === "x") return `https://x.com/${handle}`;
  if (kind === "telegram") return `https://t.me/${handle}`;
  if (kind === "discord") return value.toLowerCase().includes("discord") ? `https://${handle}` : value;

  return `https://${handle}`;
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
  if (!bundle) return [];

  const draft = bundle.draft;
  const promo = bundle.promotion;

  return [
    { label: "Website", short: "WEB", url: normalizeExternalUrl(promo.websiteUrl || draft.websiteUrl, "website") },
    { label: "X (formally Twitter)", short: "X", url: normalizeExternalUrl(promo.xUrl || draft.xUrl, "x") },
    { label: "Telegram", short: "TG", url: normalizeExternalUrl(promo.telegramUrl, "telegram") },
    { label: "Discord", short: "DC", url: normalizeExternalUrl(promo.discordUrl, "discord") },
    { label: "Other", short: "OTHER", url: normalizeExternalUrl(draft.otherUrl, "other") },
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
    return [
      { label: "Website", short: "WEB", url: normalizeExternalUrl(props.website, "website") },
      { label: "X (formally Twitter)", short: "X", url: normalizeExternalUrl(props.x, "x") },
      { label: "Telegram", short: "TG", url: normalizeExternalUrl(props.telegram, "telegram") },
      { label: "Discord", short: "DC", url: normalizeExternalUrl(props.discord, "discord") },
      { label: "Other", short: "OTHER", url: normalizeExternalUrl(metadata?.external_url, "other") },
    ].filter((item) => Boolean(item.url));
  }, [metadata]);

  return <SocialLinksPanel links={links} />;
}
