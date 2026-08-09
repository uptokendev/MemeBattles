/**
 * CrypticPump partner listing:
 * - Creator: "List on CrypticPump.com" opens iframe modal
 * - Everyone: badge with link once listing_url is stored
 *
 * Cross-origin success needs CrypticPump to postMessage listing URL, or creator
 * pastes the listing URL after submitting (fallback).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiBase";
import { cn } from "@/lib/utils";

const PARTNER_ORIGIN = "https://crypticpump.com";
const PARTNER_SUBMIT = `${PARTNER_ORIGIN}/partner_submit.php`;

/** CrypticPump purple CTA (list button only) */
const CP_BTN =
  "h-8 border border-violet-400/80 bg-gradient-to-b from-violet-500/90 to-purple-800/95 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-50 shadow-[0_0_18px_rgba(139,92,246,0.35)] hover:from-violet-400 hover:to-purple-700 hover:border-violet-300 hover:text-white";

/** Official partner badge art (public for everyone once listing URL is saved). */
const CP_BADGE_SRC = "/assets/partners/crypticpump-listed-badge.jpg";

/** Map MWZ chainId → CrypticPump form "chain" select values (BNB | Solana). */
function crypticPumpChainLabel(chainId?: number | null): "BNB" | "Solana" | null {
  if (!chainId || !Number.isFinite(chainId)) return null;
  // Solana mainnet/devnet (MWZ uses 101 in places); everything else BNB family (56/97).
  if (chainId === 101 || chainId === 102 || chainId === 103) return "Solana";
  if (chainId === 56 || chainId === 97) return "BNB";
  // Default EVM → BNB option on their form
  return "BNB";
}

export type CrypticPumpListingData = {
  listingUrl: string;
  campaignAddress?: string;
  tokenAddress?: string | null;
};

/** Absolute public MWZ token details URL (Trading / Launch Link for CrypticPump). */
export function buildPublicTokenPageUrl(
  campaignAddress?: string | null,
  chainId?: number | null,
  originOverride?: string | null,
): string | null {
  const campaign = String(campaignAddress || "").trim();
  if (!campaign) return null;
  const origin = String(
    originOverride ||
      (typeof window !== "undefined" ? window.location?.origin : "") ||
      "",
  ).replace(/\/$/, "");
  if (!origin) return null;
  try {
    const u = new URL(`/token/${encodeURIComponent(campaign)}`, `${origin}/`);
    if (chainId && Number.isFinite(Number(chainId))) {
      u.searchParams.set("chainId", String(chainId));
    }
    return u.toString();
  } catch {
    return `${origin}/token/${encodeURIComponent(campaign)}${
      chainId ? `?chainId=${encodeURIComponent(String(chainId))}` : ""
    }`;
  }
}

/**
 * Partner prefill handshake.
 * Canonical params CrypticPump maps (agreed):
 *   partner, campaign, token, chainId, name, ticker, website,
 *   launchUrl  → Trading / Launch Link (public MWZ token page)
 * Alias: launchLink (same value). chain = BNB | Solana.
 * chainId 56 + 97 both map to BNB on their side.
 */
function buildIframeSrc(args: {
  campaignAddress?: string | null;
  tokenAddress?: string | null;
  chainId?: number | null;
  name?: string | null;
  ticker?: string | null;
  website?: string | null;
  /** Absolute public MWZ token page → launchUrl / Trading field. */
  tokenPageUrl?: string | null;
}) {
  const qs = new URLSearchParams();
  qs.set("partner", "memewarzone");

  if (args.campaignAddress) qs.set("campaign", String(args.campaignAddress).trim());

  // Trading / Launch Link — set early so server logs always show it.
  // Canonical: launchUrl (primary). Alias: launchLink.
  const launchUrl = String(
    args.tokenPageUrl || buildPublicTokenPageUrl(args.campaignAddress, args.chainId) || "",
  ).trim();
  if (launchUrl) {
    qs.set("launchUrl", launchUrl);
    qs.set("launchLink", launchUrl);
  }

  const token = String(args.tokenAddress || "").trim();
  if (token) {
    qs.set("token", token);
    qs.set("contract_address", token);
  }

  if (args.chainId) {
    qs.set("chainId", String(args.chainId));
  }
  const chainLabel = crypticPumpChainLabel(args.chainId);
  if (chainLabel) qs.set("chain", chainLabel);

  if (args.name) qs.set("name", String(args.name).trim());
  if (args.ticker) qs.set("ticker", String(args.ticker).replace(/^\$/, "").trim());

  // Project website only (separate from launchUrl).
  const website = String(args.website || "").trim();
  if (website) qs.set("website", website);

  return `${PARTNER_SUBMIT}?${qs.toString()}`;
}

export async function fetchCrypticPumpListing(
  chainId: number,
  campaignAddress: string,
): Promise<CrypticPumpListingData | null> {
  if (!chainId || !campaignAddress) return null;
  try {
    const qs = new URLSearchParams({
      chainId: String(chainId),
      campaign: campaignAddress,
    });
    const res = await apiFetch(`/api/crypticpump-listings?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const url = String(json?.listing?.listingUrl || "").trim();
    if (!url) return null;
    return {
      listingUrl: url,
      campaignAddress: json?.listing?.campaignAddress,
      tokenAddress: json?.listing?.tokenAddress,
    };
  } catch {
    return null;
  }
}

async function saveCrypticPumpListing(input: {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  listingUrl: string;
  creatorWallet: string;
}): Promise<CrypticPumpListingData> {
  const res = await apiFetch("/api/crypticpump-listings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));
  const url = String(json?.listing?.listingUrl || input.listingUrl).trim();
  if (!url) throw new Error("Listing saved without URL");
  return { listingUrl: url, campaignAddress: input.campaignAddress, tokenAddress: input.tokenAddress };
}

/** Normalize any CrypticPump listing link (absolute, relative, coin.php?id=…). */
function normalizePartnerListingUrl(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  if (s.startsWith("/")) s = `${PARTNER_ORIGIN}${s}`;
  if (/^coin\.php\?/i.test(s) || /^coin\.php\//i.test(s)) s = `${PARTNER_ORIGIN}/${s.replace(/^\//, "")}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Flexible partner postMessage parser (part 2 handshake).
 * Agreed shape: { source: 'crypticpump', type: 'listing_submitted', listingUrl }
 * Also accepts common aliases until their payload is finalized.
 */
function extractListingUrlFromPartnerMessage(data: unknown): string | null {
  let payload: any = data;
  if (typeof payload === "string") {
    const asUrl = normalizePartnerListingUrl(payload);
    if (asUrl && /crypticpump\.com/i.test(asUrl)) return asUrl;
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;

  const direct = [
    payload.listingUrl,
    payload.listing_url,
    payload.canonicalUrl,
    payload.canonical_url,
    payload.coinUrl,
    payload.coin_url,
    payload.url,
    payload.link,
    payload.href,
    payload.listing?.listingUrl,
    payload.listing?.url,
    payload.data?.listingUrl,
    payload.data?.url,
    payload.payload?.listingUrl,
    payload.payload?.url,
  ];
  for (const c of direct) {
    const n = normalizePartnerListingUrl(c);
    if (n) return n;
  }

  // Last resort: any string field that looks like a CrypticPump listing page.
  for (const v of Object.values(payload)) {
    if (typeof v !== "string") continue;
    if (!/crypticpump\.com|coin\.php\?/i.test(v)) continue;
    const n = normalizePartnerListingUrl(v);
    if (n) return n;
  }
  return null;
}

function isCrypticPumpPartnerOrigin(origin: string): boolean {
  const o = String(origin || "").toLowerCase();
  return o.includes("crypticpump.com");
}

export function CrypticPumpBadge({
  listingUrl,
  className,
}: {
  listingUrl: string;
  className?: string;
}) {
  if (!listingUrl) return null;
  return (
    <a
      href={listingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center transition opacity-95 hover:opacity-100",
        className,
      )}
      title="Listed on crypticpump.com"
      aria-label="Listed on crypticpump.com — open listing"
    >
      <img
        src={CP_BADGE_SRC}
        alt="Listed on crypticpump.com"
        className="h-8 w-auto max-w-[min(220px,46vw)] object-contain object-left sm:h-9"
        draggable={false}
      />
    </a>
  );
}

export function CrypticPumpListButton({
  chainId,
  campaignAddress,
  tokenAddress,
  name,
  ticker,
  website,
  creatorWallet,
  listing,
  onListed,
  className,
}: {
  chainId: number;
  campaignAddress: string;
  tokenAddress?: string | null;
  name?: string | null;
  ticker?: string | null;
  website?: string | null;
  creatorWallet: string;
  listing: CrypticPumpListingData | null;
  onListed: (listing: CrypticPumpListingData) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeStatus, setIframeStatus] = useState<"loading" | "loaded" | "timeout">("loading");
  const [copiedTokenLink, setCopiedTokenLink] = useState(false);
  /** Second iframe load usually means form POST finished (success/error page) — promote paste UI. */
  const [awaitingListingUrl, setAwaitingListingUrl] = useState(false);
  const [handshakeHint, setHandshakeHint] = useState<string | null>(null);
  const iframeLoadCountRef = useRef(0);

  // Absolute public token page → launchUrl in iframe + copy strip in modal.
  const tokenPageUrl = useMemo(
    () => buildPublicTokenPageUrl(campaignAddress, chainId),
    [campaignAddress, chainId],
  );

  const copyTokenPageUrl = useCallback(async () => {
    if (!tokenPageUrl) return;
    try {
      await navigator.clipboard.writeText(tokenPageUrl);
      setCopiedTokenLink(true);
      window.setTimeout(() => setCopiedTokenLink(false), 2000);
    } catch {
      // Fallback for older browsers / denied clipboard
      try {
        const ta = document.createElement("textarea");
        ta.value = tokenPageUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopiedTokenLink(true);
        window.setTimeout(() => setCopiedTokenLink(false), 2000);
      } catch {
        setError("Could not copy link — select it manually");
      }
    }
  }, [tokenPageUrl]);

  const iframeSrc = useMemo(
    () =>
      buildIframeSrc({
        campaignAddress,
        tokenAddress,
        chainId,
        name,
        ticker,
        website,
        tokenPageUrl,
      }),
    [campaignAddress, tokenAddress, chainId, name, ticker, website, tokenPageUrl],
  );

  useEffect(() => {
    if (!open) {
      setIframeStatus("loading");
      setAwaitingListingUrl(false);
      setHandshakeHint(null);
      iframeLoadCountRef.current = 0;
      return;
    }
    setIframeStatus("loading");
    setAwaitingListingUrl(false);
    setHandshakeHint(null);
    iframeLoadCountRef.current = 0;
    // Cross-origin iframes don't fire a reliable error if X-Frame blocks them;
    // if we never get onLoad, surface a fallback after a short wait.
    const t = window.setTimeout(() => {
      setIframeStatus((s) => (s === "loading" ? "timeout" : s));
    }, 8000);
    return () => window.clearTimeout(t);
  }, [open, iframeSrc]);

  const persist = useCallback(
    async (listingUrl: string) => {
      const normalized = normalizePartnerListingUrl(listingUrl);
      if (!normalized) {
        setError("Paste a full CrypticPump listing URL (e.g. https://crypticpump.com/coin.php?id=…)");
        return false;
      }
      setSaving(true);
      setError(null);
      setHandshakeHint(null);
      try {
        const saved = await saveCrypticPumpListing({
          chainId,
          campaignAddress,
          tokenAddress,
          listingUrl: normalized,
          creatorWallet,
        });
        onListed(saved);
        setOpen(false);
        setManualUrl("");
        setAwaitingListingUrl(false);
        return true;
      } catch (e: any) {
        setError(e?.message || "Could not save listing");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [chainId, campaignAddress, tokenAddress, creatorWallet, onListed],
  );

  /**
   * Close path: if a listing URL was pasted, save it; otherwise re-fetch API
   * (postMessage may have saved while the modal was open) and show the badge.
   */
  const handleClose = useCallback(async () => {
    if (saving || closing) return;
    setClosing(true);
    setError(null);
    try {
      const pasted = manualUrl.trim();
      if (pasted) {
        const ok = await persist(pasted);
        if (!ok) return; // keep modal open so user can fix the URL / error
        return;
      }
      const existing = await fetchCrypticPumpListing(chainId, campaignAddress);
      if (existing?.listingUrl) {
        onListed(existing);
      }
      setOpen(false);
      setManualUrl("");
      setAwaitingListingUrl(false);
      setHandshakeHint(null);
    } catch {
      setOpen(false);
    } finally {
      setClosing(false);
    }
  }, [saving, closing, manualUrl, persist, chainId, campaignAddress, onListed]);

  // Partner success handshake (part 2). Modal must stay open; form POST reloads iframe.
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (!isCrypticPumpPartnerOrigin(String(event.origin || ""))) return;
      const listingUrl = extractListingUrlFromPartnerMessage(event.data);
      if (listingUrl) {
        void persist(listingUrl);
        return;
      }
      // Partner ping without URL — still surface paste path.
      if (event.data && typeof event.data === "object") {
        setAwaitingListingUrl(true);
        setHandshakeHint(
          "CrypticPump messaged us but without a listing URL yet. Paste the coin page URL below to attach the badge.",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, persist]);

  if (listing?.listingUrl) {
    return <CrypticPumpBadge listingUrl={listing.listingUrl} className={className} />;
  }

  const busy = saving || closing;

  const modal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-3 sm:p-4"
            style={{ zIndex: 9999 }}
            role="dialog"
            aria-modal="true"
            aria-label="List on CrypticPump"
          >
            {/* Flat panel — no mwz-card (that class still draws the PNG border-image frame). */}
            <div
              className="flex max-h-[min(94vh,920px)] w-full max-w-3xl flex-col overflow-hidden border border-orange-400/45 bg-black"
              style={{ borderImage: "none", boxShadow: "none", clipPath: "none", borderRadius: 0 }}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 bg-black p-3 sm:p-4">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-orange-300">// Partner</div>
                  <h3 className="font-retro text-lg text-foreground sm:text-xl">List on CrypticPump</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Free basic listing via the form. When it lands (or you paste the listing URL), a public badge appears
                    on this token for everyone.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mwz-button mwz-button-orange shrink-0 font-retro text-xs px-3"
                  disabled={busy}
                  onClick={() => void handleClose()}
                >
                  {closing ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Close
                    </>
                  )}
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black p-3 sm:p-4">
                {tokenPageUrl ? (
                  <div className="mb-3 space-y-1.5 border border-orange-400/30 bg-muted/10 p-2.5 sm:p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-orange-300/90">
                      Trading / Launch link
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Sent to CrypticPump as <span className="font-mono text-foreground/80">launchUrl</span> so
                      Trading / Launch Link can auto-fill. If it&apos;s empty, copy and paste below.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        readOnly
                        value={tokenPageUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="font-mono text-[11px] sm:text-xs"
                        aria-label="Meme Warzone token page URL"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="mwz-button mwz-button-orange shrink-0 font-retro text-xs"
                        onClick={() => void copyTokenPageUrl()}
                      >
                        {copiedTokenLink ? (
                          <>
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy link
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="relative min-h-[min(70vh,720px)] w-full border border-orange-400/40 bg-black">
                  {iframeStatus === "loading" ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black text-xs text-muted-foreground">
                      Loading CrypticPump form…
                    </div>
                  ) : null}
                  {iframeStatus === "timeout" ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black px-4 text-center">
                      <p className="text-sm text-orange-200">
                        The form didn&apos;t load in this window (common if production framing is blocked).
                      </p>
                      <a
                        href={iframeSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mwz-button mwz-button-orange px-4 py-2 font-retro text-xs"
                      >
                        Open CrypticPump form in a new tab
                      </a>
                      <p className="max-w-md text-xs text-muted-foreground">
                        After free listing, paste the public listing URL below to attach the badge.
                      </p>
                    </div>
                  ) : null}
                  <iframe
                    key={iframeSrc}
                    src={iframeSrc}
                    title="Submit your project to CrypticPump"
                    className="min-h-[min(70vh,720px)] w-full border-0 bg-black"
                    style={{ borderImage: "none", borderRadius: 0, boxShadow: "none" }}
                    // Avoid lazy-load inside a portal modal (can stay blank on some browsers).
                    loading="eager"
                    // Let CrypticPump see our origin as partner referrer if they gate by site.
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => {
                      setIframeStatus("loaded");
                      iframeLoadCountRef.current += 1;
                      // Form submit navigates the iframe → 2nd load ≈ success/result page.
                      if (iframeLoadCountRef.current >= 2) {
                        setAwaitingListingUrl(true);
                      }
                    }}
                  />
                </div>

                <div
                  className={cn(
                    "mt-4 space-y-2 border-t pt-4",
                    awaitingListingUrl
                      ? "border-orange-400/50 bg-orange-500/10 p-3 -mx-0"
                      : "border-border/50",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-orange-300">
                    {awaitingListingUrl
                      ? "Attach badge — paste your CrypticPump listing URL"
                      : "After submit — paste listing URL to show badge"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submitting on CrypticPump does not change the button by itself until we receive the public listing
                    link. Open your coin on CrypticPump (e.g.{" "}
                    <span className="font-mono text-foreground/80">crypticpump.com/coin.php?id=…</span>), copy that
                    URL, paste it here, and hit Save badge.
                  </p>
                  {handshakeHint ? <p className="text-xs text-orange-200">{handshakeHint}</p> : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://crypticpump.com/coin.php?id=…"
                      className="font-sans text-sm"
                      autoFocus={awaitingListingUrl}
                    />
                    <Button
                      type="button"
                      className="mwz-button mwz-button-orange shrink-0 font-retro"
                      disabled={busy || !manualUrl.trim()}
                      onClick={() => void persist(manualUrl.trim())}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save badge"
                      )}
                    </Button>
                  </div>
                  {error ? <p className="text-xs text-orange-300">{error}</p> : null}
                </div>
              </div>

              {/* Footer: explicit Close re-checks listing so badge can flip after partner handshake */}
              <div className="flex shrink-0 flex-col gap-2 border-t border-orange-400/30 bg-black p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <p className="text-[11px] text-muted-foreground leading-snug sm:max-w-[65%]">
                  After you submit on CrypticPump, press <span className="text-orange-200">Close</span>. We re-check
                  whether the listing was saved and show the badge if it was.
                </p>
                <Button
                  type="button"
                  className="mwz-button mwz-button-orange shrink-0 font-retro"
                  disabled={busy}
                  onClick={() => void handleClose()}
                >
                  {closing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking listing…
                    </>
                  ) : manualUrl.trim() ? (
                    "Save & close"
                  ) : (
                    "Close"
                  )}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className={cn(CP_BTN, className)}
        onClick={() => {
          setError(null);
          setHandshakeHint(null);
          setCopiedTokenLink(false);
          setAwaitingListingUrl(false);
          setOpen(true);
        }}
      >
        List on CrypticPump.com
      </Button>
      {modal}
    </>
  );
}
