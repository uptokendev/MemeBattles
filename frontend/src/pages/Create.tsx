import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ImageIcon, Info, BookOpen } from "lucide-react";
import { z } from "zod";
import ProcessingCard from "@/components/ui/processing-card";
import { useTokenForm } from "@/hooks/useTokenForm";
import { useTokenProcessing } from "@/hooks/useTokenProcessing";
import { tokenSchema, TOKEN_VALIDATION_LIMITS } from "@/constants/validation";

// NEW: import wallet + launchpad client
import { useWallet } from "@/hooks/useWallet";
import { useLaunchpad } from "@/lib/launchpadClient";
import type React from "react";
import { useState } from "react";

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function uploadTokenLogo(file: File, chainId: number, address: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(
    `/api/upload?kind=logo&chainId=${encodeURIComponent(String(chainId))}&address=${encodeURIComponent(
      address.toLowerCase()
    )}`,
    { method: "POST", body: fd }
  );

  const j = await safeReadJson(res);
  if (!res.ok) throw new Error(j?.error || `Logo upload failed (${res.status})`);
  if (!j?.url) throw new Error("Logo upload did not return url");
  return String(j.url);
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

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0] ?? null;
  setLogoFile(file);
  handleImageChange(e); // keep your existing preview behavior
};

  const {
    isProcessing,
    processingStatus,
    processingProgress,
    startProcessing,
    setProcessingRedirectTo,
  } = useTokenProcessing();

  // NEW: hooks for wallet + contracts
  const wallet = useWallet();
const anyWallet: any = wallet as any;
const chainId: number = Number(anyWallet?.chainId ?? anyWallet?.network?.chainId ?? 97);



const { createCampaign, fetchCampaigns } = useLaunchpad();
const [logoFile, setLogoFile] = useState<File | null>(null);
  // UPDATED: async and actually calls the contract
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (formData.category === "project") {
      toast.error("Project tokens coming soon!");
      return;
    }

    // Validate inputs
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
        return;
      }
      toast.error("Validation failed");
      return;
    }

    // Require image
    if (!formData.imagePreview) {
      toast.error("Please upload a token image");
      return;
    }

    // Require wallet connection
    if (!wallet.isConnected) {
      toast.error("Please connect your wallet first");
      return;
    }

    try {
      // Show nice processing overlay
      startProcessing();

      // Must have a real File (imagePreview is just a data URL)
if (!logoFile) {
  toast.error("Please upload a token image file");
  return;
}

const address = String(wallet.account ?? "").toLowerCase();
if (!address) {
  toast.error("Wallet address missing");
  return;
}

// 1) Upload logo -> get public URL
const uploadedLogoUrl = await uploadTokenLogo(logoFile, chainId, address);

// 2) Send URL on-chain
const result = await createCampaign({
  name: formData.name,
  symbol: formData.ticker.toUpperCase(),
  logoURI: uploadedLogoUrl,
  xAccount: formData.twitter || "",
  website: formData.website || "",
  extraLink: formData.otherLink || "",
  basePriceWei: 0n,
  priceSlopeWei: 0n,
  graduationTargetWei: 0n,
  lpReceiver: "",
});

      toast.success("Campaign created on-chain!");

      // Prefer deterministic campaign address from receipt logs
      const campaignAddress = (result as any)?.campaignAddress;

      if (campaignAddress) {
        const nextUrl = `/token/${campaignAddress}`;

        // Tell your processing overlay where to go (if you use it)
        setProcessingRedirectTo(nextUrl);

        // Optional: small buffer for subgraph/indexer/UI cache convergence
        await new Promise((r) => setTimeout(r, 1500));

        // HARD reload navigation (guarantees a fresh TokenDetails load)
        window.location.assign(nextUrl);
        return; // prevent any fallback redirect logic below
      }

      // Fallback: your existing best-effort poll (kept as backup)
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
              const nextUrl = `/token/${newest.campaign}`;
              setProcessingRedirectTo(nextUrl);

              await new Promise((r) => setTimeout(r, 1500));
              window.location.assign(nextUrl);
              return;
            }
          }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (e) {
        console.warn("[Create] Failed to resolve created campaign address", e);
      }

      // After this, useTokenProcessing will handle the rest of the UX
    } catch (error: any) {
      console.error(error);
      const message =
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        "Failed to create campaign";
      toast.error(message);
    }
  };

  const isProjectDisabled = formData.category === "project";

  return (
    <>
      {/* Processing Overlay */}
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

          {/* Playbook Banner */}
          <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-2xl p-4 md:p-6 mb-4 md:mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl border border-accent/30 backdrop-blur-sm">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="bg-accent/20 p-3 md:p-4 rounded-xl">
                <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-accent" />
              </div>
              <div>
                <h2 className="text-lg md:2xl font-retro text-foreground mb-1">
                  First time launching?
                </h2>
                <p className="text-sm md:text-base text-muted-foreground font-retro">
                  We recommend reading our creator playbook first.
                </p>
              </div>
            </div>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-retro text-base md:text-lg px-6 md:px-8 py-4 md:py-6 rounded-xl shadow-lg w-full md:w-auto">
              Read Playbook
            </Button>
          </div>

          {/* Main Form Card */}
          <div className="bg-card/50 backdrop-blur-md rounded-2xl p-4 md:p-8 shadow-2xl border border-border relative">
            <button
              onClick={() => {
  setLogoFile(null);
  handleReset();
}}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-accent hover:text-accent/80 font-retro text-xs md:text-sm transition-colors"
            >
              Reset all
            </button>

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6 mt-4">
              {/* Token Image */}
              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">
                  Token Image
                </label>
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
                      <img
                        src={formData.imagePreview}
                        alt="Token preview"
                        className="w-full h-full object-cover rounded-xl border-2 border-border"
                      />
                      <button
                        type="button"
                        onClick={() => {
  setLogoFile(null);
  handleRemoveImage();
}}
                        className="absolute -top-2 -right-2 bg-accent hover:bg-accent/90 rounded-full p-1 transition-colors"
                      >
                        <X className="h-4 w-4 text-accent-foreground" />
                      </button>
                    </div>
                  )}
                  <input
  id="image-upload"
  type="file"
  accept="image/*"
  onChange={onLogoChange}
  className="hidden"
  disabled={isProjectDisabled}
/>
                </div>
              </div>

              {/* Token Name */}
              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">
                  Token name
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Token"
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro text-lg md:text-xl h-12 md:h-14 rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProjectDisabled}
                  maxLength={TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH}
                />
              </div>

              {/* Token Ticker */}
              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">
                  Token ticker
                </label>
                <Input
                  value={formData.ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="TICKER"
                  maxLength={TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH}
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro text-lg md:text-xl h-12 md:h-14 rounded-lg uppercase focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isProjectDisabled}
                />
              </div>

              {/* Token Category */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-foreground font-retro text-base md:text-lg">
                    Token Category
                  </label>
                  <Info className="h-4 w-4 text-accent" />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCategory("meme")}
                    className={`flex-1 py-3 md:py-4 px-4 md:px-6 rounded-lg font-retro text-base md:text-lg transition-all ${
                      formData.category === "meme"
                        ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                        : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                    }`}
                  >
                    Meme
                  </button>
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setCategory("project")}
                      className={`w-full py-3 md:py-4 px-4 md:px-6 rounded-lg font-retro text-base md:text-lg transition-all ${
                        formData.category === "project"
                          ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                          : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                      }`}
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

              {/* Token Description */}
              <div>
                <label className="block text-foreground font-retro mb-3 text-base md:text-lg">
                  Token description{" "}
                  <span className="text-muted-foreground">(optional)</span>
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

              {/* Social Links */}
              <div>
                {!formData.showSocialLinks ? (
                  <button
                    type="button"
                    onClick={() => setShowSocialLinks(true)}
                    className="text-accent hover:text-accent/80 font-retro text-base md:text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isProjectDisabled}
                  >
                    Add Social Links
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-foreground font-retro text-base md:text-lg">
                        Social Links
                      </label>
                      <button
                        type="button"
                        onClick={clearSocialLinks}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">
                        Website
                      </label>
                      <Input
                        value={formData.website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12"
                        disabled={isProjectDisabled}
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">
                        X (Twitter)
                      </label>
                      <Input
                        value={formData.twitter}
                        onChange={(e) => setTwitter(e.target.value)}
                        placeholder="https://x.com/username"
                        type="url"
                        className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12"
                        disabled={isProjectDisabled}
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground font-retro mb-2 text-xs md:text-sm">
                        Other Link
                      </label>
                      <Input
                        value={formData.otherLink}
                        onChange={(e) => setOtherLink(e.target.value)}
                        placeholder="https://..."
                        type="url"
                        className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground font-retro rounded-lg focus:border-accent focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed h-12"
                        disabled={isProjectDisabled}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Create Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isProjectDisabled}
                  className={`w-full font-retro text-xl md:text-2xl py-6 md:py-8 rounded-2xl shadow-lg transition-all ${
                    isProjectDisabled
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-accent hover:bg-accent/90 text-accent-foreground shadow-accent/20"
                  }`}
                >
                  Create Coin
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Create;
