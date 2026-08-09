import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ImageIcon, Info, BookOpen, FileText, Rocket, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { z } from "zod";
import { useTokenForm } from "@/hooks/useTokenForm";
import { tokenSchema, TOKEN_VALIDATION_LIMITS } from "@/constants/validation";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { LaunchpadSafetyStatus } from "@/components/launchpad/LaunchpadSafetyStatus";
import { emitCreatorArmBlocked, resolveCreatorArmBlock } from "@/components/prepare/CreatorArmEligibilityDialog";
import { getBnbContractAddresses, getBnbContractReadiness } from "@/lib/bnbContracts";
import { checkTickerAvailability, createCampaignDraft, type TickerAvailability } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";
import { signSolanaDraftAction } from "@/lib/solanaWallet";
import { apiFetch } from "@/lib/apiBase";
import { BNB_CHAIN_ID, getActiveChainId, getChainLabel, getDefaultChainId, isEvmChainId, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { getBnbLaunchpadSafetyStatus } from "@/lib/launchpad/adapters/bnbLaunchpadAdapter";
import { useLaunchpad } from "@/lib/launchpadClient";
import {
  readScheduledCreatorLaunchEligibility,
  type ScheduledCreatorLaunchEligibility,
} from "@/lib/scheduledLaunchClientV2";
import { getScheduledFactoryAddress } from "@/lib/scheduledFactoryConfig";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContentContainer } from "@/components/layout/ContentContainer";

const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;
const JUST_CREATED_DRAFT_CACHE_PREFIX = "mwz:just-created-draft:";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const WAD = 10n ** 18n;
const STANDARD_GRADUATION_OPTIONS = [
  {
    id: "fast",
    label: "$15K",
    title: "Fast grad",
    description: "Shortest bonding phase for quick graduation tests and high-velocity launches.",
    targetWei: 15_000n * WAD,
  },
  {
    id: "normal",
    label: "$30K",
    title: "Normal bond",
    description: "Default balanced curve with enough room for launch discovery.",
    targetWei: 30_000n * WAD,
  },
  {
    id: "deep",
    label: "$50K",
    title: "Deep liquidity",
    description: "Longer bonding phase designed to seed stronger DEX liquidity.",
    targetWei: 50_000n * WAD,
  },
] as const;
const TEST_GRADUATION_OPTION = {
  id: "test",
  label: "$6",
  title: "Test grad",
  description: "BNB testnet only. Use this to rehearse graduation, LP lock, DEX trading, and fees.",
  targetWei: 6n * WAD,
} as const;

function readFlag(value: unknown, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return TRUE_VALUES.has(raw);
}

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
  const solanaWallet = useSolanaWallet();
  const launchpad = useLaunchpad();
  const navigate = useNavigate();
  const [isDrafting, setIsDrafting] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [checkingTicker, setCheckingTicker] = useState(false);
  const [tickerAvailability, setTickerAvailability] = useState<TickerAvailability | null>(null);
  const [tickerCheckError, setTickerCheckError] = useState<string | null>(null);
  const [graduationTargetWei, setGraduationTargetWei] = useState<bigint>(30_000n * WAD);
  const [creatorEligibility, setCreatorEligibility] = useState<ScheduledCreatorLaunchEligibility | null>(null);
  const [creatorEligibilityError, setCreatorEligibilityError] = useState<string | null>(null);
  const armDialogShownForWallet = useRef<string | null>(null);

  const normalizedTicker = useMemo(() => normalizeTicker(formData.ticker), [formData.ticker]);
  const isSolanaCreator = Boolean(solanaWallet.isSolanaConnected && solanaWallet.solanaAccount && !wallet.isConnected);
  const creatorWallet = isSolanaCreator ? solanaWallet.solanaAccount : wallet.account || "";
  const chainId = isSolanaCreator ? SOLANA_CHAIN_ID : getActiveChainId(wallet.chainId);
  const testGraduationThresholdEnabled = readFlag(import.meta.env.VITE_ENABLE_TEST_GRADUATION_THRESHOLD, false);
  const graduationOptions = useMemo(
    () => (
      chainId === 97 && testGraduationThresholdEnabled
        ? [...STANDARD_GRADUATION_OPTIONS, TEST_GRADUATION_OPTION]
        : [...STANDARD_GRADUATION_OPTIONS]
    ),
    [chainId, testGraduationThresholdEnabled],
  );
  const configuredBnbChainId = useMemo(() => {
    const configured = getDefaultChainId();
    return isEvmChainId(configured) ? configured : BNB_CHAIN_ID;
  }, []);
  const creatorChainLabel = isSolanaCreator ? "Solana" : getChainLabel(chainId);
  const creatorWalletLabel = creatorWallet ? `${creatorWallet.slice(0, 4)}...${creatorWallet.slice(-4)}` : "No wallet";
  const launchpadSafetyStatus = useMemo(() => {
    if (isSolanaCreator) return launchpad.getSafetyStatus();
    const contractReadiness = getBnbContractReadiness(configuredBnbChainId);
    const addresses = getBnbContractAddresses(configuredBnbChainId);
    return getBnbLaunchpadSafetyStatus({
      chainId: configuredBnbChainId,
      factoryAddress: addresses.launchFactory,
      hasSigner: Boolean(wallet.signer),
      hasAccount: Boolean(wallet.account),
      walletChainId: wallet.chainId,
      contractReadiness,
    });
  }, [configuredBnbChainId, isSolanaCreator, launchpad, wallet.account, wallet.chainId, wallet.signer]);
  const isSolanaProtocolPending = launchpadSafetyStatus.protocolStatus === "protocol_pending";
  const bnbDirectDeployEnabled = !isSolanaCreator && readFlag(import.meta.env.VITE_ENABLE_DIRECT_BNB_DEPLOY, false);
  const directDeployRouteReady = bnbDirectDeployEnabled && launchpadSafetyStatus.protocolStatus === "ready";
  const tickerConfirmedAvailable = Boolean(normalizedTicker && tickerAvailability?.ticker === normalizedTicker && tickerAvailability.available);
  const tickerBlocked = Boolean(normalizedTicker && tickerAvailability?.ticker === normalizedTicker && !tickerAvailability.available);

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

  useEffect(() => {
    const selectedStillAvailable = graduationOptions.some((option) => option.targetWei === graduationTargetWei);
    if (!selectedStillAvailable) setGraduationTargetWei(30_000n * WAD);
  }, [graduationOptions, graduationTargetWei]);

  // Pre-check arm eligibility as soon as a BNB creator wallet is connected.
  useEffect(() => {
    if (isSolanaCreator || !wallet.account || !wallet.signer || !isEvmChainId(chainId)) {
      setCreatorEligibility(null);
      setCreatorEligibilityError(null);
      return;
    }

    const factoryAddress =
      getScheduledFactoryAddress(Number(chainId), launchpad.factoryAddress) || launchpad.factoryAddress || "";
    if (!factoryAddress) {
      setCreatorEligibility(null);
      setCreatorEligibilityError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      readScheduledCreatorLaunchEligibility({
        signer: wallet.signer!,
        chainId: Number(chainId),
        factoryAddress,
      })
        .then((result) => {
          if (cancelled) return;
          setCreatorEligibility(result);
          setCreatorEligibilityError(null);

          if (!result.allowed) {
            const walletKey = `${wallet.account}:${chainId}:${result.cooldownEndsAt}:${result.currentLiveCount}`;
            // Show the explain dialog once per blocked wallet session state.
            if (armDialogShownForWallet.current !== walletKey) {
              armDialogShownForWallet.current = walletKey;
              emitCreatorArmBlocked(
                resolveCreatorArmBlock({
                  mode: "now",
                  eligibility: result,
                  errorMessage: result.cooldownEndsAt > Math.floor(Date.now() / 1000)
                    ? `Creator arm cooldown active until ${new Date(result.cooldownEndsAt * 1000).toISOString()}. Immediate and timed arms both require 24h between on-chain deploys. A later trading-open time does not bypass this.`
                    : result.currentLiveCount >= result.maxLiveBonding
                      ? `Live campaign limit reached (${result.currentLiveCount}/${result.maxLiveBonding}).`
                      : "This creator wallet cannot deploy or arm another campaign right now.",
                }),
              );
            }
          } else {
            armDialogShownForWallet.current = null;
          }
        })
        .catch((error) => {
          if (cancelled) return;
          setCreatorEligibility(null);
          setCreatorEligibilityError(String(error?.message || error || "Could not check creator deployment eligibility."));
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSolanaCreator, wallet.account, wallet.signer, chainId, launchpad.factoryAddress]);

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

    if (!creatorWallet) {
      toast.error("Please connect your BNB or Solana wallet first");
      return false;
    }

    if (!isSolanaCreator && !wallet.signer) {
      toast.error("Wallet signer unavailable. Reconnect your BNB wallet and try again.");
      return false;
    }

    return true;
  };

  const uploadLogo = async () => {
    if (!formData.image || !creatorWallet) throw new Error("Missing logo or wallet");
    const chainIdForUpload = String(chainId);
    const address = isSolanaCreator ? creatorWallet : creatorWallet.toLowerCase();
    const qs = new URLSearchParams({ kind: "logo", chainId: chainIdForUpload, address });
    try {
      if (!isSolanaCreator && wallet.signer) {
        const { signWalletAction, appendAuthToSearchParams } = await import("@/lib/walletActionAuth");
        const auth = await signWalletAction({
          action: "upload_logo",
          walletAddress: address,
          chainId: Number(chainId),
          signer: wallet.signer,
        });
        appendAuthToSearchParams(qs, auth);
      } else if (isSolanaCreator) {
        const { signWalletAction, appendAuthToSearchParams } = await import("@/lib/walletActionAuth");
        const { signSolanaMessage } = await import("@/lib/solanaWallet");
        const auth = await signWalletAction({
          action: "upload_logo",
          walletAddress: address,
          chainId: Number(chainId),
          walletType: "solana",
          signMessage: async (message) => (await signSolanaMessage(message, address)).signature,
        });
        appendAuthToSearchParams(qs, auth);
      }
    } catch (signErr) {
      console.warn("[Create] upload auth sign skipped", signErr);
    }
    const fd = new FormData();
    fd.append("file", formData.image);

    const res = await apiFetch(`/api/upload?${qs.toString()}`, {
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

  const createDraftAuth = async (draftId?: string) => {
    if (isSolanaCreator) {
      return signSolanaDraftAction({
        walletAddress: creatorWallet,
        chainId,
        action: draftId ? "save_promotion" : "create_draft",
        draftId,
      });
    }

    return signDraftAction({
      signer: wallet.signer,
      walletAddress: creatorWallet,
      chainId,
      action: draftId ? "save_promotion" : "create_draft",
      draftId,
    });
  };

  const handleCreateDraft = async () => {
    if (!validateCoreForm()) return;
    setIsDrafting(true);

    try {
      const auth = await createDraftAuth();
      const logoUrl = await uploadLogo();
      const draft = await createCampaignDraft({
        auth,
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
        docs: formData.otherLink ? [formData.otherLink] : [],
        otherUrl: formData.otherLink || null,
        graduationTargetWei: graduationTargetWei.toString(),
        visibility: "private",
      });
      cacheDraftLogo(draft.id, logoUrl);
      toast.success(isSolanaCreator ? "Solana draft signed and saved. No gas spent." : "Draft saved. No gas spent.");
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

    if (isSolanaProtocolPending) {
      toast.error("Solana launch protocol is pending. Save a signed Solana draft for now.");
      return;
    }

    if (!bnbDirectDeployEnabled) {
      toast.error("Direct BNB deploy is disabled for this environment. Save a draft instead.");
      return;
    }

    if (!directDeployRouteReady) {
      toast.error("Direct BNB deploy needs the final launchpad and Topaz contract env values first.");
      return;
    }

    if (!wallet.account || !wallet.signer) {
      toast.error("Connect your BNB wallet first.");
      return;
    }

    if (!validateCoreForm()) return;
    setIsDeploying(true);

    let latestEligibility = creatorEligibility;
    try {
      const factoryAddress =
        getScheduledFactoryAddress(Number(chainId), launchpad.factoryAddress) || launchpad.factoryAddress || "";
      if (factoryAddress) {
        const eligibility = await readScheduledCreatorLaunchEligibility({
          signer: wallet.signer,
          chainId: Number(chainId),
          factoryAddress,
        });
        latestEligibility = eligibility;
        setCreatorEligibility(eligibility);

        if (!eligibility.allowed) {
          const now = Math.floor(Date.now() / 1000);
          const message =
            eligibility.currentLiveCount >= eligibility.maxLiveBonding
              ? `Live campaign limit reached (${eligibility.currentLiveCount}/${eligibility.maxLiveBonding}). Graduate an existing live campaign before another deploy.`
              : eligibility.cooldownEndsAt > now
                ? `Creator arm cooldown active until ${new Date(eligibility.cooldownEndsAt * 1000).toISOString()}. Immediate and timed arms both require 24h between on-chain deploys. A later trading-open time does not bypass this.`
                : "This creator wallet cannot deploy or arm another campaign right now.";
          emitCreatorArmBlocked(
            resolveCreatorArmBlock({
              mode: "now",
              eligibility,
              errorMessage: message,
            }),
          );
          return;
        }
      }

      const logoUrl = await uploadLogo();
      const receipt: any = await launchpad.createCampaign({
        name: formData.name,
        symbol: normalizedTicker,
        logoURI: logoUrl,
        xAccount: formData.twitter || "",
        website: formData.website || "",
        extraLink: formData.otherLink || "",
        graduationTargetWei,
      });

      const campaignAddress = String(receipt?.campaignAddress || "").trim();
      const tokenAddress = String(receipt?.tokenAddress || "").trim();
      toast.success("Campaign deployed on BNB.");
      if (tokenAddress || campaignAddress) navigate(`/token/${tokenAddress || campaignAddress}?chainId=${chainId}`);
    } catch (error: any) {
      console.error(error);
      const message = String(
        error?.shortMessage || error?.reason || error?.message || "Failed to deploy campaign",
      );
      const code = String(error?.code || error?.data?.code || "");
      const lower = message.toLowerCase();
      const looksLikeArmBlock =
        lower.includes("cooldown") ||
        lower.includes("not eligible") ||
        lower.includes("creatornoteligible") ||
        lower.includes("live campaign limit") ||
        lower.includes("cannot deploy or arm") ||
        lower.includes("cannot arm another") ||
        code.includes("ELIGIB") ||
        code.includes("COOLDOWN") ||
        code === "CALL_EXCEPTION" ||
        (latestEligibility != null && latestEligibility.allowed === false) ||
        (latestEligibility != null &&
          Number(latestEligibility.cooldownEndsAt) > Math.floor(Date.now() / 1000));

      if (looksLikeArmBlock) {
        emitCreatorArmBlocked(
          resolveCreatorArmBlock({
            mode: "now",
            eligibility: latestEligibility,
            errorMessage: message,
            errorCode: code,
          }),
        );
      } else {
        toast.error(message);
      }
    } finally {
      setIsDeploying(false);
    }
  };

  const isProjectDisabled = formData.category === "project";
  const tickerUnavailableOrUnknown = Boolean(normalizedTicker && !tickerConfirmedAvailable);
  const isDraftDisabled = isProjectDisabled || isDrafting || isDeploying || checkingTicker || tickerUnavailableOrUnknown;
  // Keep deploy clickable when arm-blocked so the explain dialog can open on click.
  const isDeployDisabled =
    isProjectDisabled ||
    isDrafting ||
    isDeploying ||
    checkingTicker ||
    tickerUnavailableOrUnknown ||
    !directDeployRouteReady ||
    !wallet.signer;
  const deployModeDescription = isSolanaProtocolPending
    ? "Solana drafts are signed and saved through your Solana wallet. After promotion, deploy via Push Live (V4 authorized create). Buy/sell land in a later parity phase."
    : bnbDirectDeployEnabled
      ? directDeployRouteReady
        ? "Deploy directly to the configured BNB launchpad. This will upload the logo, request server route authorization, and send the LaunchFactory transaction from your wallet."
        : "Direct deploy is enabled, but the final BNB launchpad and Topaz contract env values are not complete yet."
      : "Direct on-chain deployment is locked during Prepare Mode. When live launch opens, this button will deploy immediately without the promotion page.";
  const deployButtonLabel = isDeploying
    ? "Deploying..."
    : directDeployRouteReady
      ? "Deploy Coin"
      : isSolanaProtocolPending
        ? "Solana Protocol Pending"
        : bnbDirectDeployEnabled
          ? "Contracts Required"
          : "Locked in Prepare Mode";

  return (
    <ContentContainer className="flex min-h-[calc(100dvh-9rem)] flex-col px-2 pb-3 md:px-3 md:pb-2 lg:px-4">
      <div className="mb-3 flex flex-col gap-3 md:mb-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-retro text-xs uppercase tracking-[0.22em] text-accent">Create Coin</p>
          <h1 className="font-retro text-3xl tracking-tight text-foreground md:text-4xl lg:text-5xl">Create a new coin</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-muted-foreground md:max-w-md">
            <span className="font-retro uppercase tracking-[0.14em] text-accent">Prepare Mode:</span>{" "}
            {isSolanaCreator ? "Solana wallet drafts are open now. On-chain Solana launch follows the program deployment." : "Drafts and promotion pages are open now. BNB launch remains the live on-chain route."}
          </div>
          <Button asChild size="sm" className="mwz-button mwz-button-orange shrink-0 font-retro">
            <Link to="/playbook">
              <BookOpen className="mr-2 h-4 w-4" />
              Playbook
            </Link>
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mwz-card grid flex-1 items-start gap-3 overflow-visible p-3 md:grid-cols-[0.9fr_1.25fr_0.85fr] md:p-4 lg:grid-cols-[0.86fr_1.28fr_0.86fr]">
        <section className="space-y-3 rounded-xl border border-border/50 bg-background/20 p-3">
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
              <label htmlFor="image-upload" className="flex h-28 w-28 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/50 transition-colors hover:border-accent md:h-48 md:w-full lg:h-56">
                <ImageIcon className="h-10 w-10 text-muted-foreground md:h-14 md:w-14" />
              </label>
            ) : (
              <div className="relative h-28 w-28 shrink-0 md:h-48 md:w-full lg:h-56">
                <img src={formData.imagePreview} alt="Token preview" className="h-full w-full rounded-xl border-2 border-border object-cover" />
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

          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-retro text-foreground">Active wallet</div>
            <div className="flex items-center justify-between gap-3">
              <span>{creatorChainLabel}</span>
              <span className="font-retro text-accent">{creatorWalletLabel}</span>
            </div>
            <div className="mt-2 text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              {isSolanaCreator ? "Solana signed draft lane" : "BNB launch lane"}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/50 bg-background/20 p-3">
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
                  {checkingTicker ? "Checking ticker availability..." : tickerConfirmedAvailable ? `$${normalizedTicker} available` : tickerCheckError ? tickerCheckError : tickerAvailability?.reason || "Ticker availability pending"}
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

          <div className="rounded-xl border border-border/50 bg-background/25 p-3">
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

        <section className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/20 p-3">
          <Collapsible defaultOpen={false} className="rounded-xl border border-border/50 bg-background/25">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-2.5 text-left">
              <div className="min-w-0">
                <div className="font-retro text-sm text-foreground">Graduation threshold</div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {graduationOptions.find((o) => o.targetWei === graduationTargetWei)?.label || "$30K"}
                  {" · "}
                  {graduationOptions.find((o) => o.targetWei === graduationTargetWei)?.title || "Normal bond"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {chainId === 97 && testGraduationThresholdEnabled ? (
                  <span className="rounded-full border border-orange-400/40 bg-orange-400/10 px-2 py-1 font-retro text-[10px] uppercase tracking-[0.12em] text-orange-200">
                    Test
                  </span>
                ) : null}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 px-2.5 pb-2.5">
              <p className="text-xs text-muted-foreground">
                Bonding volume needed before graduation to DEX liquidity.
              </p>
              <div className="grid gap-2">
                {graduationOptions.map((option) => {
                  const selected = graduationTargetWei === option.targetWei;
                  const isTest = option.id === "test";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setGraduationTargetWei(option.targetWei)}
                      disabled={isProjectDisabled}
                      className={`rounded-lg border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        selected
                          ? isTest
                            ? "border-orange-300 bg-orange-400/15 text-orange-100 shadow-lg shadow-orange-400/15"
                            : "border-accent bg-accent/15 text-foreground shadow-lg shadow-accent/10"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-accent/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-retro text-sm">{option.label}</span>
                        <span className="font-retro text-[10px] uppercase tracking-[0.12em]">{option.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.68rem] leading-4">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible defaultOpen={false} className="rounded-xl border border-border/50 bg-background/25">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-2.5 text-left">
              <div className="min-w-0">
                <div className="font-retro text-sm text-foreground">Launch Safety</div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {launchpadSafetyStatus.protocolLabel
                    ?? (launchpadSafetyStatus.protocolStatus === "ready" ? "Live" : launchpadSafetyStatus.protocolStatus)}
                  {" · "}
                  {launchpadSafetyStatus.chainLabel}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2.5 pb-2.5">
              <LaunchpadSafetyStatus status={launchpadSafetyStatus} compact embedded />
            </CollapsibleContent>
          </Collapsible>

          <div className="rounded-xl border border-border/50 bg-background/25 p-2.5">
            <div className="mb-2">
              <div className="font-retro text-sm text-foreground">Draft Mode</div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{isSolanaCreator ? "Sign with your Solana wallet, reserve the ticker, and open the promotion setup page. No SOL is spent in Prepare Mode." : "Save the coin as a draft, reserve the ticker, and open the promotion setup page. No gas is spent until you deploy from Prepare."}</p>
            </div>
            <Button type="button" onClick={handleCreateDraft} disabled={isDraftDisabled} className="mwz-button h-10 w-full font-retro text-sm">
              <FileText className="mr-2 h-4 w-4" />
              {isDrafting ? "Saving Draft..." : isSolanaCreator ? "Sign Solana Draft" : "Save Draft"}
            </Button>
          </div>

          <div className="rounded-xl border border-border/50 bg-background/25 p-2.5">
            <div className="mb-2">
              <div className="font-retro text-sm text-foreground">Deploy Mode</div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{deployModeDescription}</p>
            </div>
            {!isSolanaCreator && wallet.account ? (
              <div className="rounded-xl border border-border/50 bg-background/30 p-3 text-xs">
                <div className="font-retro uppercase tracking-[0.14em] text-muted-foreground">Creator arm status</div>
                {creatorEligibility?.allowed ? (
                  <p className="mt-1 text-green-300">
                    Eligible to deploy now. Live campaigns: {creatorEligibility.currentLiveCount} / {creatorEligibility.maxLiveBonding}
                  </p>
                ) : creatorEligibility ? (
                  <div className="mt-1 space-y-2 text-orange-300">
                    <p>
                      {creatorEligibility.cooldownEndsAt > Math.floor(Date.now() / 1000)
                        ? `Arm cooldown active until ${new Date(creatorEligibility.cooldownEndsAt * 1000).toLocaleString()}.`
                        : creatorEligibility.currentLiveCount >= creatorEligibility.maxLiveBonding
                          ? `Live limit reached (${creatorEligibility.currentLiveCount}/${creatorEligibility.maxLiveBonding}).`
                          : "This wallet cannot deploy right now."}
                    </p>
                    <p className="text-muted-foreground">
                      Arming a timed draft already starts the 24h cooldown, even if trading is still locked.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 border-orange-400/40 bg-orange-500/10 px-3 text-xs text-orange-200"
                      onClick={() =>
                        emitCreatorArmBlocked(
                          resolveCreatorArmBlock({
                            mode: "now",
                            eligibility: creatorEligibility,
                            errorMessage: "Deployment not available for this wallet right now.",
                          }),
                        )
                      }
                    >
                      Why can&apos;t I deploy?
                    </Button>
                  </div>
                ) : creatorEligibilityError ? (
                  <p className="mt-1 text-orange-300">{creatorEligibilityError}</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Checking creator arm eligibility…</p>
                )}
              </div>
            ) : null}
            <Button type="submit" disabled={isDeployDisabled} className={directDeployRouteReady ? "mwz-button h-10 w-full font-retro text-sm" : "h-10 w-full cursor-not-allowed bg-muted font-retro text-sm text-muted-foreground shadow-none"}>
              <Rocket className="mr-2 h-4 w-4" />
              {deployButtonLabel}
            </Button>
          </div>
        </section>
      </form>
    </ContentContainer>
  );
};

export default Create;
