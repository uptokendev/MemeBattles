import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ImageIcon, Info, BookOpen, FileText, Rocket } from "lucide-react";
import { z } from "zod";
import { ethers } from "ethers";
import ProcessingCard from "@/components/ui/processing-card";
import { useTokenForm } from "@/hooks/useTokenForm";
import { useTokenProcessing } from "@/hooks/useTokenProcessing";
import { tokenSchema, TOKEN_VALIDATION_LIMITS } from "@/constants/validation";
import { LaunchpadReadinessNotice } from "@/components/launchpad/LaunchpadReadinessNotice";
import { useLaunchpadWriteReadiness } from "@/hooks/useLaunchpadWriteReadiness";
import { useWallet } from "@/contexts/WalletContext";
import { createCampaignDraft } from "@/lib/draftApi";
import { useLaunchpad } from "@/lib/launchpadClient";
import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function cacheDraftLogo(draftId: string, logoUrl: string) {
  if (typeof window === "undefined" || !draftId || !logoUrl) return;
  try {
    window.sessionStorage.setItem(`mwz:draft-logo:${draftId}`, logoUrl);
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
    setOtherLink,
    setShowSocialLinks,
    handleImageChange,
    handleRemoveImage,
    handleReset,
    clearSocialLinks,
  } = useTokenForm();

  const {
    isProcessing,
    processingStatus,
    processingProgress,
    startProcessing,
    setProcessingRedirectTo,
  } = useTokenProcessing();

  const wallet = useWallet();
  const navigate = useNavigate();
  const { createCampaign, fetchCampaigns } = useLaunchpad();
  const launchpadReadiness = useLaunchpadWriteReadiness();
  const [initialBuyBnb, setInitialBuyBnb] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);

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

    if (!formData.imagePreview || !formData.image) {
      toast.error("Please upload a token image");
      return false;
    }

    if (formData.image.size > MAX_LOGO_UPLOAD_BYTES) {
      toast.error(
        `Token image is too large (${formatFileSize(formData.image.size)}). Please upload an image under 2 MB.`,
      );
      return false;
    }

    if (!wallet.isConnected || !wallet.account) {
      toast.error("Please connect your wallet first");
      return false;
    }

    return true;
  };

  const uploadLogo = async () => {
    if (!formData.image || !wallet.account) throw new Error("Missing logo or wallet");
    const chainId = String(wallet.chainId ?? import.meta.env.VITE_TARGET_CHAIN_ID ?? "97");
    const address = wallet.account.toLowerCase();
    const qs = new URLSearchParams({ kind: "logo", chainId, address }).toString();
    const fd = new FormData();
    fd.append("file", formData.image);

    const res = await fetch(`/api/upload?${qs}`, {
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
      const logoUrl = await uploadLogo();
      const draft = await createCampaignDraft({
        chainId: Number(wallet.chainId ?? import.meta.env.VITE_TARGET_CHAIN_ID ?? 97),
        creatorWallet: wallet.account!,
        name: formData.name,
        ticker: formData.ticker.toUpperCase(),
        description: formData.description || null,
        category: formData.category || "meme",
        logoUrl,
        websiteUrl: formData.website || null,
        xUrl: formData.twitter || null,
        otherUrl: formData.otherLink || null,
        visibility: "private",
      });

      cacheDraftLogo(draft.id, logoUrl);
      toast.success("Prepare Mode draft created. No gas spent.");
      navigate(`/drafts/${draft.id}/promotion`);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to create draft");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateCoreForm()) return;

    if (!launchpadReadiness.ready) {
      toast.error(launchpadReadiness.message || launchpadReadiness.title);
      return;
    }

    const initialBuyBnbTrim = (initialBuyBnb ?? "").trim();
    if (initialBuyBnbTrim) {
      let wei: bigint;
      try {
        wei = ethers.parseEther(initialBuyBnbTrim);
      } catch {
        toast.error("Initial buy must be a valid BNB amount (e.g. 0.1)");
        return;
      }
      if (wei > ethers.parseEther("1")) {
        toast.error("Initial buy max is 1 BNB");
        return;
      }
    }

    try {
      startProcessing();
      const logoURI = await uploadLogo();

      await createCampaign({
        name: formData.name,
        symbol: formData.ticker.toUpperCase(),
        logoURI,
        xAccount: formData.twitter || "",
        website: formData.website || "",
        extraLink: formData.otherLink || "",
        initialBuyBnb,
        basePriceWei: 0n,
        priceSlopeWei: 0n,
        graduationTargetWei: 0n,
        lpReceiver: "",
      });

      toast.success("Campaign created on-chain!");

      try {
        const symbol = formData.ticker.toUpperCase();
        const creator = (wallet.account ?? "").toLowerCase();
        const maxAttempts = 10;
        const delayMs = 800;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const campaigns = (await fetchCampaigns()) ?? [];
          const matches = campaigns.filter((c) =>
            (c.creator ?? "").toLowerCase() === creator &&
            (c.symbol ?? "").toUpperCase() === symbol
          );

          if (matches.length > 0) {
            matches.sort((a, b) => {
              const at = (a.createdAt ?? 0);
              const bt = (b.createdAt ?? 0);
              if (bt !== at) return bt - at;
              return (b.id ?? 0) - (a.id ?? 0);
            });
            const newest = matches[0];
            if (newest?.campaign) {
              setProcessingRedirectTo(`/token/${newest.campaign}`);
              break;
            }
          }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (e) {
        console.warn("[Create] Failed to resolve created campaign address", e);
      }
    } catch (error: any) {
      console.error(error);
      const message = error?.shortMessage || error?.reason || error?.message || "Failed to create campaign";
      toast.error(message);
    }
  };

  const isProjectDisabled = formData.category === "project";
  const isCreateDisabled = isProjectDisabled || !launchpadReadiness.ready;
  const isDraftDisabled = isProjectDisabled || isDrafting;

  return (
    <>
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl px-4">
            <ProcessingCard
              name={formData.name || "Token"}
              status={processingStatus}
              progress={processingProgress}
              className="rounded-2xl border border-white/20 shadow-lg bg-white/[0.03]"
            />
          </div>
        </div>
      )}

      <div className="h-full overflow-y-auto pb-6 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-12">
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-retro tracking-tight text-foreground mb-6 md:mb-8">
            Create a new coin
          </h1>

          <div className="mwz-card mb-4 md:mb-6 p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="bg-accent/20 p-3 md:p-4 rounded-xl">
                <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-accent" />
              </div>
              <div>
                <h2 className="text-lg md:2xl font-retro text-foreground mb-1">First time launching?</h2>
                <p className="text-sm md:text-base text-muted-foreground font-retro">
                  Prepare Mode lets you build the promotion page first, with no gas and no trading UI.
                </p>
              </div>
            </div>
            <Button asChild className="mwz-button mwz-button-orange font-retro text-base md:text-lg px-6 md:px-8 py-4 md:py-6 w-full md:w-auto">
              <Link to="/playbook">Read Playbook</Link>
            </Button>
          </div>

          <div className="mb-4 md:mb-6">
            <LaunchpadReadinessNotice readiness={launchpadReadiness} compact={launchpadReadiness.ready} />
          </div>

          <div className="mwz-card p-4 md:p-8 relative">
            <button
              onClick={handleReset}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-accent hover:text-accent/80 font-retro text-xs md:text-sm transition-colors"
            >
              Reset all
            </button>

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6 mt-4">
              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">Token Image</label>
                <div className="flex items-center gap-4">
                  {!formData.imagePreview ? (
                    <label
                      htmlFor="image-upload"
                      className="w-24 h-24 md:w-32 md:h-32 border-2 border-dashed border-border rounded-xl flex items-center justify-center cursor-pointer hover:border-accent transition-colors bg-background/50"
                    >
                      <ImageIcon className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground" />
                    </label>
                  ) : (
                    <div className="relative w-24 h-24 md:w-32 md:h-32">
                      <img src={formData.imagePreview} alt="Token preview" className="w-full h-full object-cover rounded-xl border-2 border-border" />
                      <button type="button" onClick={handleRemoveImage} className="absolute -top-2 -right-2 bg-accent hover:bg-accent/90 rounded-full p-1 transition-colors">
                        <X className="h-4 w-4 text-accent-foreground" />
                      </button>
                    </div>
                  )}
                  <input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isProjectDisabled} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Max upload size: 2 MB. Use a compressed PNG, JPG, or WebP for best results.</p>
              </div>

              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">Token name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Token"
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro text-lg md:text-xl h-12 md:h-14 rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProjectDisabled}
                  maxLength={TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH}
                />
              </div>

              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">Token ticker</label>
                <Input
                  value={formData.ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="TICKER"
                  maxLength={TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH}
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro text-lg md:text-xl h-12 md:h-14 rounded-lg uppercase focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProjectDisabled}
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-foreground font-retro text-base md:text-lg">Token Category</label>
                  <Info className="h-4 w-4 text-accent" />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCategory("meme")}
                    className={`flex-1 py-3 md:py-4 px-4 md:px-6 rounded-lg font-retro text-base md:text-lg transition-all ${formData.category === "meme" ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"}`}
                  >
                    Meme
                  </button>
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setCategory("project")}
                      className={`w-full py-3 md:py-4 px-4 md:px-6 rounded-lg font-retro text-base md:text-lg transition-all ${formData.category === "project" ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"}`}
                    >
                      Project
                    </button>
                    {formData.category === "project" && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full bg-background/90 backdrop-blur-sm text-accent text-xs font-retro px-3 py-1 rounded border border-accent/30 whitespace-nowrap z-10">
                        UP meme projects coming soon
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">
                  Token description <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro text-base md:text-lg min-h-24 rounded-lg resize-none focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  maxLength={TOKEN_VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH}
                  disabled={isProjectDisabled}
                />
              </div>

              <div>
                {!formData.showSocialLinks ? (
                  <button type="button" onClick={() => setShowSocialLinks(true)} className="text-accent hover:text-accent/80 font-retro text-base md:text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isProjectDisabled}>
                    Add Social Links
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-foreground font-retro text-base md:text-lg">Social Links</label>
                      <button type="button" onClick={clearSocialLinks} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">Website</label>
                      <Input value={formData.website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" type="url" className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12" disabled={isProjectDisabled} />
                    </div>
                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">X (Twitter)</label>
                      <Input value={formData.twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="https://x.com/username" type="url" className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12" disabled={isProjectDisabled} />
                    </div>
                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">Other Link</label>
                      <Input value={formData.otherLink} onChange={(e) => setOtherLink(e.target.value)} placeholder="https://..." type="url" className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12" disabled={isProjectDisabled} />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">Initial buy (BNB, optional)</label>
                <Input
                  value={initialBuyBnb}
                  onChange={(e) => setInitialBuyBnb(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12"
                  disabled={isProjectDisabled}
                />
                <p className="mt-2 text-xs text-muted-foreground">Only used for live on-chain creation. Prepare Mode drafts never trigger a wallet transaction.</p>
              </div>

              <div className="grid gap-3 pt-4 md:grid-cols-2">
                <Button type="button" onClick={handleCreateDraft} disabled={isDraftDisabled} className="mwz-button h-16 font-retro text-lg md:text-xl">
                  <FileText className="mr-2 h-5 w-5" />
                  {isDrafting ? "Creating Draft..." : "Create Draft"}
                </Button>
                <Button
                  type="submit"
                  disabled={isCreateDisabled}
                  className={`font-retro text-lg md:text-xl h-16 shadow-lg transition-all ${isCreateDisabled ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-accent hover:bg-accent/90 text-accent-foreground shadow-accent/20"}`}
                >
                  <Rocket className="mr-2 h-5 w-5" />
                  {launchpadReadiness.ready ? "Create Live Campaign" : launchpadReadiness.title}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="mwz-card p-4 text-sm text-muted-foreground">
                  <span className="font-retro text-orange-300">Prepare Mode:</span> saves the draft, reserves the ticker, opens the War Room promotion setup page, and costs no gas.
                </div>
                <div className="mwz-card p-4 text-sm text-muted-foreground">
                  <span className="font-retro text-orange-300">Live Campaign:</span> keeps the current on-chain creation flow and requires wallet confirmation.
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Create;
