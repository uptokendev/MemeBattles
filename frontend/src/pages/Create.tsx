import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ImageIcon, Info, BookOpen, FileText, Rocket, Network, Wallet } from "lucide-react";
import { z } from "zod";
import { useTokenForm } from "@/hooks/useTokenForm";
import { tokenSchema, TOKEN_VALIDATION_LIMITS } from "@/constants/validation";
import { useWallet } from "@/contexts/WalletContext";
import { checkTickerAvailability, createCampaignDraft, saveDraftPromotion, type TickerAvailability } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";
import { apiFetch } from "@/lib/apiBase";
import { getActiveChainId } from "@/lib/chainConfig";
import { DRAFT_CHAIN_OPTIONS, getDraftChainLabel, isSolanaDraftChainId } from "@/lib/draftChains";
import { connectSolanaWallet, disconnectSolanaWallet, getSolanaProvider, signSolanaDraftAction } from "@/lib/solanaWallet";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;
const JUST_CREATED_DRAFT_CACHE_PREFIX = "mwz:just-created-draft:";

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function normalizeTicker(value: string) {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH);
}

function cacheDraftLogo(draftId: string, logoUrl: string) {
  if (typeof window === "undefined" || !draftId || !logoUrl) return;
  try {
    window.sessionStorage.setItem(`mwz:draft-logo:${draftId}`, logoUrl);
  } catch {
    // Ignore storage failures.
  }
}

function clearJustCreatedDraftCache(draftId: string) {
  if (typeof window === "undefined" || !draftId) return;
  try {
    window.sessionStorage.removeItem(`${JUST_CREATED_DRAFT_CACHE_PREFIX}${draftId}`);
  } catch {
    // Ignore storage failures.
  }
}

const Create = () => {
  const {
    formData,
    setTokenName,
    setTicker,
    setDescription,
    setCategory,
    setWebsite,
    setTwitter,
    setTelegram,
    setDiscord,
    setOtherLink,
    setShowSocialLinks,
    handleImageChange,
    handleRemoveImage,
    handleReset,
    clearSocialLinks,
  } = useTokenForm();

  const wallet = useWallet();
  const navigate = useNavigate();
  const [isDrafting, setIsDrafting] = useState(false);
  const [checkingTicker, setCheckingTicker] = useState(false);
  const [tickerAvailability, setTickerAvailability] = useState<TickerAvailability | null>(null);
  const [tickerCheckError, setTickerCheckError] = useState<string | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<number>(() => getActiveChainId(wallet.chainId));
  const [solanaAccount, setSolanaAccount] = useState("");
  const [connectingSolana, setConnectingSolana] = useState(false);

  const normalizedTicker = useMemo(() => normalizeTicker(formData.ticker), [formData.ticker]);
  const chainId = selectedChainId;
  const selectedChainLabel = getDraftChainLabel(chainId);
  const isSolanaDraft = isSolanaDraftChainId(chainId);
  const activeCreatorWallet = isSolanaDraft ? solanaAccount : wallet.account;
  const tickerConfirmedAvailable = Boolean(normalizedTicker && tickerAvailability?.ticker === normalizedTicker && tickerAvailability.available);
  const tickerBlocked = Boolean(normalizedTicker && tickerAvailability?.ticker === normalizedTicker && !tickerAvailability.available);

  useEffect(() => {
    const provider = getSolanaProvider();
    const publicKey = provider?.publicKey?.toString?.() || "";
    if (publicKey) setSolanaAccount(publicKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ticker = normalizedTicker;

    setTickerAvailability(null);
    setTickerCheckError(null);

    if (!ticker) {
      setCheckingTicker(false);
      return;
    }

    setCheckingTicker(true);

    const timer = window.setTimeout(() => {
      checkTickerAvailability({ ticker, chainId })
        .then((result) => {
          if (cancelled) return;
          setTickerAvailability(result);
          setTickerCheckError(null);
        })
        .catch((err: any) => {
          if (cancelled) return;
          setTickerAvailability(null);
          setTickerCheckError(err?.message || "Could not verify ticker availability.");
        })
        .finally(() => {
          if (!cancelled) setCheckingTicker(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedTicker, chainId]);

  const connectSolanaForDraft = async () => {
    setConnectingSolana(true);
    try {
      const publicKey = await connectSolanaWallet();
      setSolanaAccount(publicKey);
      toast.success("Phantom connected for Solana draft mode.");
    } catch (err: any) {
      toast.error(err?.message || "Could not connect Phantom.");
    } finally {
      setConnectingSolana(false);
    }
  };

  const disconnectSolanaForDraft = async () => {
    try {
      await disconnectSolanaWallet();
      setSolanaAccount("");
      toast.success("Phantom disconnected from Solana draft mode.");
    } catch (err: any) {
      toast.error(err?.message || "Could not disconnect Phantom.");
    }
  };

  const ensureTickerAvailable = () => {
    if (!normalizedTicker) {
      toast.error("Ticker is required.");
      return false;
    }

    if (checkingTicker) {
      toast.error("Wait for ticker availability check to finish.");
      return false;
    }

    if (tickerCheckError) {
      toast.error("Ticker availability could not be verified. Try again before signing.");
      return false;
    }

    if (!tickerConfirmedAvailable) {
      toast.error(tickerAvailability?.reason || "Ticker is not available.");
      return false;
    }

    return true;
  };

  const validateCoreForm = () => {
    if (formData.category === "project") {
      toast.error("Project tokens coming soon!");
      return false;
    }

    try {
      tokenSchema.parse({
        name: formData.name,
        ticker: formData.ticker,
        description: formData.description || undefined,
        website: formData.website || undefined,
        twitter: formData.twitter || undefined,
        otherLink: formData.otherLink || undefined,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0]?.message ?? "Validation error");
        return false;
      }
      toast.error("Validation failed");
      return false;
    }

    if (!ensureTickerAvailable()) return false;

    if (!formData.imagePreview || !formData.image) {
      toast.error("Please upload a token image");
      return false;
    }

    if (formData.image.size > MAX_LOGO_UPLOAD_BYTES) {
      toast.error(`Token image is too large (${formatFileSize(formData.image.size)}). Please upload an image under 5 MB.`);
      return false;
    }

    if (isSolanaDraft) {
      if (!solanaAccount) {
        toast.error("Connect Phantom before saving a Solana draft.");
        return false;
      }
      return true;
    }

    if (!wallet.isConnected || !wallet.account) {
      toast.error("Please connect your wallet first");
      return false;
    }

    return true;
  };

  const uploadLogo = async () => {
    if (!formData.image || !activeCreatorWallet) throw new Error("Missing logo or wallet");
    const qs = new URLSearchParams({ kind: "logo", chainId: String(chainId), address: activeCreatorWallet }).toString();
    const fd = new FormData();
    fd.append("file", formData.image);

    const res = await apiFetch(`/api/upload?${qs}`, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Logo upload failed (${res.status})`);
    }

    const json = (await res.json()) as { url?: string };
    if (!json?.url) throw new Error("Logo upload failed (missing url)");
    return json.url;
  };

  const handleCreateDraft = async () => {
    if (!validateCoreForm()) return;
    setIsDrafting(true);

    try {
      const creatorWallet = activeCreatorWallet!;
      const auth = isSolanaDraft
        ? await signSolanaDraftAction({
            walletAddress: creatorWallet,
            chainId,
            action: "create_draft",
          })
        : await signDraftAction({
            signer: wallet.signer,
            walletAddress: creatorWallet,
            chainId,
            action: "create_draft",
          });

      const logoUrl = await uploadLogo();
      const draft = await createCampaignDraft({
        auth: auth as any,
        chainId,
        creatorWallet,
        name: formData.name,
        ticker: normalizedTicker,
        description: formData.description || null,
        category: formData.category || "meme",
        logoUrl,
        websiteUrl: formData.website || null,
        xUrl: formData.twitter || null,
        telegramUrl: formData.telegram || null,
        discordUrl: formData.discord || null,
        otherUrl: formData.otherLink || null,
        visibility: "private",
      } as any);

      try {
        const promotionAuth = isSolanaDraft
          ? await signSolanaDraftAction({
              walletAddress: creatorWallet,
              chainId,
              action: "save_promotion" as any,
              draftId: draft.id,
            })
          : await signDraftAction({
              signer: wallet.signer,
              walletAddress: creatorWallet,
              chainId,
              action: "save_promotion" as any,
              draftId: draft.id,
            } as any);

        await saveDraftPromotion(draft.id, {
          auth: promotionAuth as any,
          websiteUrl: formData.website || "",
          xUrl: formData.twitter || "",
          telegramUrl: formData.telegram || "",
          discordUrl: formData.discord || "",
          docs: formData.otherLink ? [formData.otherLink] : [],
          visibility: "private",
        });
      } catch (promotionError) {
        console.warn("[Create] Failed to seed promotion social links", promotionError);
      }

      clearJustCreatedDraftCache(draft.id);
      cacheDraftLogo(draft.id, logoUrl);
      toast.success(isSolanaDraft ? "Solana draft saved. Deploy stays locked for now." : "Draft saved. No gas spent.");
      navigate(`/drafts/${draft.id}/promotion`);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to create draft");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.error("Deploy Mode is locked during Prepare Mode. Save a draft instead.");
  };

  const isProjectDisabled = formData.category === "project";
  const tickerUnavailableOrUnknown = Boolean(normalizedTicker && !tickerConfirmedAvailable);
  const missingWallet = isSolanaDraft ? !solanaAccount : !wallet.account;
  const isDraftDisabled = isProjectDisabled || isDrafting || checkingTicker || tickerUnavailableOrUnknown || missingWallet;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-[96rem] flex-col px-2 py-3 md:h-[calc(100dvh-9rem)] md:min-h-0 md:overflow-hidden md:px-3 md:py-2 lg:px-4">
      <div className="mb-3 flex flex-col gap-3 md:mb-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-retro text-xs uppercase tracking-[0.22em] text-accent">Create Coin</p>
          <h1 className="font-retro text-3xl tracking-tight text-foreground md:text-4xl lg:text-5xl">Create a new coin</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-muted-foreground md:max-w-md">
            <span className="font-retro uppercase tracking-[0.14em] text-accent">Prepare Mode:</span>{" "}
            Drafts and promotion pages are open now. Solana is draft-only until launch tooling is ready.
          </div>
          <Button asChild size="sm" className="mwz-button mwz-button-orange shrink-0 font-retro">
            <Link to="/playbook">
              <BookOpen className="mr-2 h-4 w-4" />
              Playbook
            </Link>
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mwz-card grid flex-1 gap-3 overflow-visible p-3 md:min-h-0 md:grid-cols-[0.9fr_1.25fr_0.85fr] md:overflow-hidden md:p-4 lg:grid-cols-[0.86fr_1.28fr_0.86fr]">
        <section className="space-y-3 rounded-2xl border border-border/50 bg-background/20 p-3 md:min-h-0 md:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-retro text-xs uppercase tracking-[0.16em] text-muted-foreground">Logo</p>
              <h2 className="font-retro text-lg text-foreground">Token Image</h2>
            </div>
            <button type="button" onClick={handleReset} className="font-retro text-xs text-accent transition-colors hover:text-accent/80">
              Reset all
            </button>
          </div>

          <div className="flex items-center gap-4 md:flex-col md:items-stretch">
            {!formData.imagePreview ? (
              <label htmlFor="image-upload" className="flex h-28 w-28 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-border bg-background/50 transition-colors hover:border-accent md:h-48 md:w-full lg:h-56">
                <ImageIcon className="h-10 w-10 text-muted-foreground md:h-14 md:w-14" />
              </label>
            ) : (
              <div className="relative h-28 w-28 shrink-0 md:h-48 md:w-full lg:h-56">
                <img src={formData.imagePreview} alt="Token preview" className="h-full w-full rounded-2xl border-2 border-border object-cover" />
                <button type="button" onClick={handleRemoveImage} className="absolute -right-2 -top-2 rounded-full bg-accent p-1 transition-colors hover:bg-accent/90">
                  <X className="h-4 w-4 text-accent-foreground" />
                </button>
              </div>
            )}
            <div className="space-y-2 text-xs text-muted-foreground">
              <input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isProjectDisabled} />
              <p>Upload a compressed PNG, JPG, or WebP.</p>
              <p>Max upload size: 5 MB.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-retro text-foreground">Launch path</div>
            Draft Mode opens promotion setup first. Solana drafts can build pages now; deployment stays unavailable until Solana launch infrastructure is added.
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/50 bg-background/20 p-3 md:min-h-0 md:overflow-hidden">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Network className="h-4 w-4 text-accent" />
              <label className="font-retro text-sm text-foreground">Draft chain</label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {DRAFT_CHAIN_OPTIONS.map((chain) => {
                const selected = chain.id === selectedChainId;
                return (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => setSelectedChainId(chain.id)}
                    aria-pressed={selected}
                    className={`rounded-lg border px-3 py-2 text-left font-retro text-xs transition-all ${selected ? "border-accent bg-accent/20 text-accent" : "border-border bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    <span className="block text-sm text-foreground">{chain.shortLabel}</span>
                    <span className="mt-1 block uppercase tracking-[0.12em]">{chain.draftOnly ? "Draft only" : "Draft + deploy"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isSolanaDraft && (
            <div className="rounded-2xl border border-cyan-300/35 bg-cyan-300/10 p-3 text-xs text-cyan-100">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-retro uppercase tracking-[0.14em]">Solana Prepare Mode</div>
                  <p className="mt-1 text-cyan-100/75">Draft creation and promotion pages are enabled. Push Live remains blocked.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" onClick={connectSolanaForDraft} disabled={connectingSolana} variant="outline" className="mwz-button h-9 px-3 font-retro text-xs">
                    <Wallet className="mr-2 h-4 w-4" />
                    {solanaAccount ? "Reconnect" : connectingSolana ? "Connecting" : "Connect Phantom"}
                  </Button>
                  {solanaAccount && (
                    <Button type="button" onClick={disconnectSolanaForDraft} disabled={connectingSolana || isDrafting} variant="outline" className="h-9 px-3 font-retro text-xs">
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
              {solanaAccount && <div className="truncate font-mono text-[11px] text-cyan-100/80">{solanaAccount}</div>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block font-retro text-sm text-foreground">Token name</label>
              <Input value={formData.name} onChange={(e) => setTokenName(e.target.value)} placeholder="Token" className="h-11 rounded-lg border-border bg-background/50 font-retro text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} maxLength={TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH} />
            </div>

            <div>
              <label className="mb-2 block font-retro text-sm text-foreground">Token ticker</label>
              <Input value={formData.ticker} onChange={(e) => setTicker(normalizeTicker(e.target.value))} placeholder="TICKER" maxLength={TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH} className="h-11 rounded-lg border-border bg-background/50 font-retro text-base uppercase text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
              {normalizedTicker && (
                <div className={`mt-1 text-[0.68rem] font-retro uppercase tracking-[0.12em] ${tickerConfirmedAvailable ? "text-green-300" : tickerBlocked || tickerCheckError ? "text-red-300" : "text-orange-300"}`}>
                  {checkingTicker ? `Checking ${selectedChainLabel} ticker availability...` : tickerConfirmedAvailable ? `$${normalizedTicker} available on ${selectedChainLabel}` : tickerCheckError ? tickerCheckError : tickerAvailability?.reason || "Ticker availability pending"}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="font-retro text-sm text-foreground">Token Category</label>
              <Info className="h-4 w-4 text-accent" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCategory("meme")} className={`rounded-lg px-4 py-2.5 font-retro text-sm transition-all ${formData.category === "meme" ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" : "border border-border bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                Meme
              </button>
              <button type="button" onClick={() => setCategory("project")} className={`rounded-lg px-4 py-2.5 font-retro text-sm transition-all ${formData.category === "project" ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" : "border border-border bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                Project
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block font-retro text-sm text-foreground">
              Token description <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea value={formData.description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="min-h-20 resize-none rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[6.5rem] lg:min-h-[7rem]" maxLength={TOKEN_VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH} disabled={isProjectDisabled} />
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
            {!formData.showSocialLinks ? (
              <button type="button" onClick={() => setShowSocialLinks(true)} className="font-retro text-sm text-accent transition-colors hover:text-accent/80 disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled}>
                Add Social Links
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-retro text-sm text-foreground">Social Links</label>
                  <button type="button" onClick={clearSocialLinks} className="text-muted-foreground transition-colors hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <Input value={formData.website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" type="url" className="h-10 rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
                  <Input value={formData.twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="X (formally Twitter)" type="url" className="h-10 rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
                  <Input value={formData.telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram" type="url" className="h-10 rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
                  <Input value={formData.discord} onChange={(e) => setDiscord(e.target.value)} placeholder="Discord" type="url" className="h-10 rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
                  <Input value={formData.otherLink} onChange={(e) => setOtherLink(e.target.value)} placeholder="Other" type="url" className="h-10 rounded-lg border-border bg-background/50 font-retro text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isProjectDisabled} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/20 p-3 md:min-h-0 md:overflow-hidden">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-3">
            <div className="mb-3">
              <div className="font-retro text-sm text-foreground">Draft Mode</div>
              <p className="mt-1 text-xs text-muted-foreground">Save the coin as a {selectedChainLabel} draft, reserve the ticker on that chain, and open the promotion setup page.</p>
            </div>
            <Button type="button" onClick={handleCreateDraft} disabled={isDraftDisabled} className="mwz-button h-12 w-full font-retro text-base">
              <FileText className="mr-2 h-5 w-5" />
              {isDrafting ? "Saving Draft..." : isSolanaDraft ? "Save Solana Draft" : "Save Draft"}
            </Button>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/25 p-3 opacity-80">
            <div className="mb-3">
              <div className="font-retro text-sm text-foreground">Deploy Mode</div>
              <p className="mt-1 text-xs text-muted-foreground">{isSolanaDraft ? "Solana deployment is not available yet. Build the Prepare page now and launch later." : "Direct on-chain deployment is locked during Prepare Mode. When live launch opens, this button will deploy immediately without the promotion page."}</p>
            </div>
            <Button type="submit" disabled className="h-12 w-full cursor-not-allowed bg-muted font-retro text-base text-muted-foreground shadow-none">
              <Rocket className="mr-2 h-5 w-5" />
              {isSolanaDraft ? "Solana Launch Soon" : "Locked in Prepare Mode"}
            </Button>
          </div>

          <div className="mt-auto rounded-2xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-retro text-foreground">Official links</div>
            Website, X (formally Twitter), Telegram, Discord, and Other are captured before promotion setup.
          </div>
        </section>
      </form>
    </div>
  );
};

export default Create;
