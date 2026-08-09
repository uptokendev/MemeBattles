/**
 * Create coin — 5-step card slide wizard.
 * Draft / deploy handlers preserve existing API + navigation contracts.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ImageIcon, FileText, Rocket, BookOpen } from "lucide-react";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { CreateDraftCardPreview, CreateLiveCardPreview } from "@/components/create/CreateCardPreviews";
import { CreateSplitPane, CreateWizardShell } from "@/components/create/CreateWizardShell";
import { cn } from "@/lib/utils";

const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const WAD = 10n ** 18n;
const TOTAL_STEPS = 5;

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

type CreateMode = "draft" | "deploy" | null;

function readFlag(value: unknown, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return TRUE_VALUES.has(raw);
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
    // ignore
  }
}

const Create = () => {
  const {
    formData,
    setTokenName,
    setTicker,
    setDescription,
    setWebsite,
    setTwitter,
    setTelegram,
    setDiscord,
    setOtherLink,
    handleImageChange,
    handleRemoveImage,
  } = useTokenForm();

  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const launchpad = useLaunchpad();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<CreateMode>(null);
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
    () =>
      chainId === 97 && testGraduationThresholdEnabled
        ? [...STANDARD_GRADUATION_OPTIONS, TEST_GRADUATION_OPTION]
        : [...STANDARD_GRADUATION_OPTIONS],
    [chainId, testGraduationThresholdEnabled],
  );
  const configuredBnbChainId = useMemo(() => {
    const configured = getDefaultChainId();
    return isEvmChainId(configured) ? configured : BNB_CHAIN_ID;
  }, []);
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
  const tickerConfirmedAvailable = Boolean(
    normalizedTicker && tickerAvailability?.ticker === normalizedTicker && tickerAvailability.available,
  );

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
            if (armDialogShownForWallet.current !== walletKey) {
              armDialogShownForWallet.current = walletKey;
              emitCreatorArmBlocked(
                resolveCreatorArmBlock({
                  mode: "now",
                  eligibility: result,
                  errorMessage:
                    result.cooldownEndsAt > Math.floor(Date.now() / 1000)
                      ? `Creator arm cooldown active until ${new Date(result.cooldownEndsAt * 1000).toISOString()}. Immediate and timed arms both require 24h between on-chain deploys.`
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
    const res = await apiFetch(`/api/upload?${qs.toString()}`, { method: "POST", body: fd });
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

  const handleDeployNow = async () => {
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
                ? `Creator arm cooldown active until ${new Date(eligibility.cooldownEndsAt * 1000).toISOString()}. Immediate and timed arms both require 24h between on-chain deploys.`
                : "This creator wallet cannot deploy or arm another campaign right now.";
          emitCreatorArmBlocked(resolveCreatorArmBlock({ mode: "now", eligibility, errorMessage: message }));
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
      if (tokenAddress || campaignAddress) {
        navigate(`/token/${tokenAddress || campaignAddress}?chainId=${chainId}`);
      }
    } catch (error: any) {
      console.error(error);
      const message = String(error?.shortMessage || error?.reason || error?.message || "Failed to deploy campaign");
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
        (latestEligibility != null && Number(latestEligibility.cooldownEndsAt) > Math.floor(Date.now() / 1000));

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

  // --- Step gates ---
  const identityReady = Boolean(
    formData.name.trim() &&
      normalizedTicker &&
      formData.image &&
      formData.imagePreview &&
      tickerConfirmedAvailable &&
      !checkingTicker &&
      !tickerCheckError,
  );
  const storyReady = Boolean(formData.description.trim());
  const canGoNext = (fromStep: number) => {
    if (fromStep === 1) return mode != null;
    if (fromStep === 2) return identityReady;
    if (fromStep === 3) return storyReady;
    if (fromStep === 4) return true;
    return false;
  };

  const goNext = () => {
    if (!canGoNext(step)) {
      if (step === 1) toast.error("Choose Draft mode or Direct deploy first.");
      else if (step === 2) toast.error("Add image, name, and an available ticker before continuing.");
      else if (step === 3) toast.error("Add a short description before continuing.");
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const selectedGraduation = graduationOptions.find((o) => o.targetWei === graduationTargetWei);
  const preview =
    mode === "deploy" ? (
      <CreateLiveCardPreview
        name={formData.name}
        symbol={normalizedTicker || formData.ticker}
        logoUrl={formData.imagePreview}
        creator={creatorWallet}
      />
    ) : (
      <CreateDraftCardPreview
        name={formData.name}
        ticker={normalizedTicker || formData.ticker}
        logoUrl={formData.imagePreview}
        mission={formData.description}
        creatorWallet={creatorWallet}
      />
    );

  const tickerStatusLine = !normalizedTicker
    ? "Enter a ticker to check availability."
    : checkingTicker
      ? "Checking ticker…"
      : tickerCheckError
        ? tickerCheckError
        : tickerConfirmedAvailable
          ? "Ticker is available."
          : tickerAvailability?.reason || "Ticker is not available.";

  return (
    <ContentContainer className="flex min-h-[calc(100dvh-9rem)] flex-col px-1 pb-4 pt-2 sm:px-2 md:px-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="text-xs text-muted-foreground">
          Wallet{" "}
          <span className="text-foreground">
            {creatorWallet ? `${creatorWallet.slice(0, 4)}…${creatorWallet.slice(-4)}` : "not connected"}
          </span>
          {" · "}
          {isSolanaCreator ? "Solana" : getChainLabel(chainId)}
        </div>
        <Button asChild size="sm" variant="outline" className="font-retro text-xs">
          <Link to="https://docs.memewar.zone" target="_blank" rel="noreferrer">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Docs
          </Link>
        </Button>
      </div>

      <CreateWizardShell
        step={step}
        totalSteps={TOTAL_STEPS}
        canBack={step > 1 && !isDrafting && !isDeploying}
        canNext={step < TOTAL_STEPS && canGoNext(step) && !isDrafting && !isDeploying}
        onBack={goBack}
        onNext={goNext}
        fullWidth={step === 5}
      >
        {/* STEP 1 — mode */}
        {step === 1 ? (
          <CreateSplitPane
            left={
              <div className="max-w-md space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p className="font-retro text-xs uppercase tracking-[0.2em] text-orange-300">// Choose your path</p>
                <h2 className="font-retro text-2xl text-foreground">Draft first — or go live now</h2>
                <p>
                  <span className="font-semibold text-accent">Draft mode</span> saves your coin with a wallet signature only
                  (no gas). You get a promotion page, can build heat, then push live when ready.
                </p>
                <p>
                  <span className="font-semibold text-accent">Direct deploy</span> uploads the creative, asks your BNB wallet
                  to sign the LaunchFactory transaction, pays gas, and lands you on Token Details when the contract is live.
                </p>
                <p className="text-xs text-muted-foreground/80">
                  You can still step back with the arrows if you change your mind.
                </p>
              </div>
            }
            right={
              <div className="flex h-full flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setMode("draft")}
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    mode === "draft"
                      ? "border-accent bg-accent/15 shadow-lg shadow-accent/10"
                      : "border-border bg-background/40 hover:border-accent/50",
                  )}
                >
                  <div className="flex items-center gap-2 font-retro text-lg text-foreground">
                    <FileText className="h-5 w-5 text-accent" />
                    Draft mode
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Free to save. Sign once, open the promotion setup page, launch later.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("deploy")}
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    mode === "deploy"
                      ? "border-orange-400/70 bg-orange-500/10 shadow-lg shadow-orange-500/10"
                      : "border-border bg-background/40 hover:border-orange-400/40",
                  )}
                >
                  <div className="flex items-center gap-2 font-retro text-lg text-foreground">
                    <Rocket className="h-5 w-5 text-orange-300" />
                    Direct deploy
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {directDeployRouteReady
                      ? "Wallet + gas. Live bonding campaign as soon as the tx confirms."
                      : isSolanaCreator || isSolanaProtocolPending
                        ? "Solana on-chain deploy is not open here yet — use Draft mode."
                        : bnbDirectDeployEnabled
                          ? "Contracts still wiring up — you can pick this, but deploy may be locked on the last step."
                          : "Locked in Prepare Mode for this environment — pick Draft for now."}
                  </p>
                </button>

                <Button
                  type="button"
                  className="mwz-button mwz-button-orange mt-auto h-11 font-retro"
                  disabled={!mode}
                  onClick={goNext}
                >
                  Next
                </Button>
              </div>
            }
          />
        ) : null}

        {/* STEP 2 — identity */}
        {step === 2 ? (
          <CreateSplitPane
            left={
              <div className="flex w-full flex-col items-center gap-3">
                <p className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {mode === "deploy" ? "Live card preview" : "Draft card preview"}
                </p>
                {preview}
              </div>
            }
            right={
              <div className="flex h-full flex-col gap-3">
                <div>
                  <label className="font-retro text-sm text-foreground">Token image</label>
                  <p className="mt-0.5 text-xs text-muted-foreground">PNG / JPG / WebP · max 5 MB</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={handleImageChange}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="font-retro" onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {formData.imagePreview ? "Replace image" : "Upload image"}
                  </Button>
                  {formData.imagePreview ? (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block font-retro text-sm">Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="Coin name"
                    maxLength={TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH}
                    className="font-retro"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-retro text-sm">Ticker</label>
                  <Input
                    value={formData.ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="TICKER"
                    maxLength={TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH}
                    className="font-retro uppercase"
                  />
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      tickerConfirmedAvailable ? "text-green-300" : tickerCheckError || tickerAvailability ? "text-orange-300" : "text-muted-foreground",
                    )}
                  >
                    {tickerStatusLine}
                  </p>
                </div>
                <Button type="button" className="mwz-button mwz-button-orange mt-auto h-11 font-retro" disabled={!canGoNext(2)} onClick={goNext}>
                  Next
                </Button>
              </div>
            }
          />
        ) : null}

        {/* STEP 3 — story + socials */}
        {step === 3 ? (
          <CreateSplitPane
            left={
              <div className="flex w-full flex-col items-center gap-3">
                <p className="font-retro text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Preview updates live</p>
                {preview}
              </div>
            }
            right={
              <div className="flex h-full flex-col gap-3">
                <div>
                  <label className="mb-1 block font-retro text-sm">
                    Short description <span className="text-orange-300">*</span>
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What should visitors know?"
                    className="min-h-24 font-retro text-sm"
                    maxLength={TOKEN_VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={formData.website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className="font-retro text-sm" />
                  <Input value={formData.twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="X / @handle / url" className="font-retro text-sm" />
                  <Input value={formData.telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Telegram" className="font-retro text-sm" />
                  <Input value={formData.discord} onChange={(e) => setDiscord(e.target.value)} placeholder="Discord" className="font-retro text-sm" />
                  <Input value={formData.otherLink} onChange={(e) => setOtherLink(e.target.value)} placeholder="Other link" className="font-retro text-sm sm:col-span-2" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Socials optional. Use @memewarzone, https://x.com/memewarzone, or bare memewarzone — same as before.
                </p>
                <Button type="button" className="mwz-button mwz-button-orange mt-auto h-11 font-retro" disabled={!canGoNext(3)} onClick={goNext}>
                  Next
                </Button>
              </div>
            }
          />
        ) : null}

        {/* STEP 4 — graduation + safety */}
        {step === 4 ? (
          <CreateSplitPane
            left={
              <div className="flex w-full flex-col items-center gap-3">
                {preview}
                {selectedGraduation ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Graduation: <span className="text-accent">{selectedGraduation.label}</span> · {selectedGraduation.title}
                  </p>
                ) : null}
              </div>
            }
            right={
              <div className="flex h-full flex-col gap-3">
                <div>
                  <div className="font-retro text-sm text-foreground">Graduation threshold</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Bonding volume before DEX graduation.</p>
                </div>
                <div className="grid gap-2">
                  {graduationOptions.map((option) => {
                    const selected = graduationTargetWei === option.targetWei;
                    const isTest = option.id === "test";
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setGraduationTargetWei(option.targetWei)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition",
                          selected
                            ? isTest
                              ? "border-orange-300 bg-orange-400/15 text-orange-100"
                              : "border-accent bg-accent/15 text-foreground"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-accent/60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-retro text-sm">{option.label}</span>
                          <span className="font-retro text-[10px] uppercase tracking-[0.12em]">{option.title}</span>
                        </div>
                        <p className="mt-1 text-[0.68rem] leading-4 opacity-90">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-border/50 bg-background/25 p-3">
                  <div className="mb-2 font-retro text-sm text-foreground">Launch Safety</div>
                  <LaunchpadSafetyStatus status={launchpadSafetyStatus} compact embedded />
                </div>
                <Button type="button" className="mwz-button mwz-button-orange mt-auto h-11 font-retro" onClick={goNext}>
                  Next
                </Button>
              </div>
            }
          />
        ) : null}

        {/* STEP 5 — confirm */}
        {step === 5 ? (
          <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 py-2">
            {preview}
            <div className="w-full space-y-2 rounded-xl border border-border/50 bg-background/30 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-retro text-foreground">{mode === "deploy" ? "Direct deploy" : "Draft"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Name</span>
                <span className="truncate font-medium text-foreground">{formData.name || "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Ticker</span>
                <span className="font-medium text-foreground">{normalizedTicker ? `$${normalizedTicker}` : "—"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Graduation</span>
                <span className="text-foreground">{selectedGraduation?.label || "—"}</span>
              </div>
              {!creatorWallet ? (
                <p className="pt-1 text-xs text-orange-300">Connect your wallet before launching.</p>
              ) : null}
              {mode === "deploy" && !directDeployRouteReady ? (
                <p className="pt-1 text-xs text-orange-300">
                  Direct deploy is not ready in this environment — go back and choose Draft, or try again when contracts are live.
                </p>
              ) : null}
              {creatorEligibilityError ? (
                <p className="pt-1 text-xs text-orange-300">{creatorEligibilityError}</p>
              ) : null}
            </div>

            {mode === "deploy" ? (
              <Button
                type="button"
                className="mwz-button mwz-button-orange h-12 w-full font-retro text-base"
                disabled={isDeploying || isDrafting || !directDeployRouteReady}
                onClick={() => void handleDeployNow()}
              >
                <Rocket className="mr-2 h-5 w-5" />
                {isDeploying ? "Deploying… waiting for confirmation" : "Deploy now"}
              </Button>
            ) : (
              <Button
                type="button"
                className="mwz-button h-12 w-full font-retro text-base"
                disabled={isDrafting || isDeploying}
                onClick={() => void handleCreateDraft()}
              >
                <FileText className="mr-2 h-5 w-5" />
                {isDrafting ? "Signing & saving draft…" : "Save Draft"}
              </Button>
            )}
            <p className="text-center text-[11px] text-muted-foreground">
              {mode === "deploy"
                ? "Your wallet will prompt to sign and pay gas. Stay on this page until the contract deploys — then we open Token Details."
                : "One signature to save. No gas. Next stop: promotion setup / edit page."}
            </p>
          </div>
        ) : null}
      </CreateWizardShell>
    </ContentContainer>
  );
};

export default Create;
