import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock3, Rocket, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationTierSelector } from "@/components/launchpad/GraduationTierSelector";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { fetchCampaignDraft, type PrepareDraftBundle } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";
import { apiFetch } from "@/lib/apiBase";
import { getChainLabel, isSolanaChainId } from "@/lib/chainConfig";
import { DEFAULT_GRADUATION_TARGET_WEI, graduationTierLabel } from "@/lib/graduationTiers";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";
import { deployScheduledDraftCampaignV2 } from "@/lib/scheduledLaunchClientV2";
import { getScheduledFactoryAddress } from "@/lib/scheduledFactoryConfig";

const DRAFT_PUSH_LIVE_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_DRAFT_PUSH_LIVE_ENABLED || import.meta.env.VITE_ENABLE_DRAFT_PUSH_LIVE || "")
    .trim()
    .toLowerCase(),
);

function canPushLive(status?: string) {
  return status === "promotion_published" || status === "ready_to_launch";
}

function sameWallet(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function markDraftDeployment(input: {
  draftId: string;
  auth: any;
  campaignAddress: string;
  tokenAddress?: string;
  deployTxHash?: string;
  scheduledLaunchAt?: number;
}) {
  const res = await apiFetch(`/api/drafts/${encodeURIComponent(input.draftId)}/deploy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      auth: input.auth,
      campaignAddress: input.campaignAddress,
      tokenAddress: input.tokenAddress || null,
      deployTxHash: input.deployTxHash || null,
      scheduledLaunchAt: input.scheduledLaunchAt || null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
  return json;
}

export default function PushDraftLive() {
  const { draftId = "" } = useParams();
  const navigate = useNavigate();
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const launchpad = useLaunchpad();

  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [graduationTargetWei, setGraduationTargetWei] = useState(DEFAULT_GRADUATION_TARGET_WEI);
  const [launchAtInput, setLaunchAtInput] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));

  const viewerWallet = wallet.account || solanaWallet.solanaAccount || null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCampaignDraft(draftId, viewerWallet)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch((err) => toast.error(err?.message || "Draft not found"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, viewerWallet]);

  const draft = bundle?.draft;
  const draftIsSolana = isSolanaChainId(Number(draft?.chainId));
  const ownerConnected = sameWallet(draft?.creatorWallet, wallet.account);
  const logoURI = useMemo(() => resolveImageUri(draft?.logoUrl) || draft?.logoUrl || "", [draft?.logoUrl]);
  const chainLabel = draft ? getChainLabel(Number(draft.chainId)) : "Unknown";
  const selectedTier = graduationTierLabel(graduationTargetWei);
  const scheduledFactoryAddress = useMemo(
    () => getScheduledFactoryAddress(Number(draft?.chainId || 0), launchpad.factoryAddress),
    [draft?.chainId, launchpad.factoryAddress],
  );

  const deploy = async () => {
    if (!draft) return;
    if (!DRAFT_PUSH_LIVE_ENABLED) return toast.error("Push Live is locked until the platform launch switch is enabled.");
    if (draftIsSolana) return toast.error("Solana live deployment remains gated until the Solana launch program is connected.");
    if (!wallet.account || !wallet.signer) return toast.error("Connect the draft owner wallet first.");
    if (!ownerConnected) return toast.error("Only the draft owner wallet can deploy this draft.");
    if (Number(wallet.chainId) !== Number(draft.chainId)) return toast.error(`Switch your wallet to ${chainLabel}.`);
    if (!canPushLive(draft.status)) return toast.error("Publish the promotion page before deployment.");
    if (!logoURI) return toast.error("Draft needs a saved logo URL before deployment.");
    if (mode === "scheduled" && !scheduledFactoryAddress) {
      return toast.error("Scheduled LaunchFactory is not configured for this network.");
    }
    if (mode === "now" && !launchpad.factoryAddress) {
      return toast.error("LaunchFactory is not configured for this network.");
    }

    const deployAuth = await signDraftAction({
      signer: wallet.signer,
      walletAddress: wallet.account,
      chainId: draft.chainId,
      action: "deploy_draft",
      draftId: draft.id,
    });

    setSubmitting(true);
    try {
      if (mode === "scheduled") {
        const launchAt = Math.floor(new Date(launchAtInput).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);
        if (!Number.isInteger(launchAt) || launchAt < now + 5 * 60) {
          throw new Error("Choose a launch time at least five minutes in the future.");
        }
        if (launchAt > now + 30 * 24 * 60 * 60) {
          throw new Error("Scheduled launches cannot be more than 30 days away.");
        }

        const created = await deployScheduledDraftCampaignV2({
          signer: wallet.signer,
          auth: deployAuth,
          chainId: draft.chainId,
          factoryAddress: scheduledFactoryAddress,
          draftId: draft.id,
          launchAt,
          graduationTargetWei,
        });
        if (!created.campaignAddress) throw new Error("Scheduled campaign was deployed but its address could not be read from the receipt.");

        await markDraftDeployment({
          draftId: draft.id,
          auth: deployAuth,
          campaignAddress: created.campaignAddress,
          tokenAddress: created.tokenAddress,
          deployTxHash: created.txHash,
          scheduledLaunchAt: launchAt,
        });

        toast.success(`${selectedTier} campaign deployed. Trading opens automatically at the countdown.`);
        navigate(`/prepare/${draft.slug}`);
        return;
      }

      const created = await launchpad.createCampaign({
        name: draft.name,
        symbol: draft.ticker.toUpperCase(),
        logoURI,
        xAccount: draft.xUrl || bundle?.promotion?.xUrl || "",
        website: draft.websiteUrl || bundle?.promotion?.websiteUrl || "",
        extraLink: draft.otherUrl || "",
        basePriceWei: 0n,
        priceSlopeWei: 0n,
        graduationTargetWei,
        lpReceiver: "",
      });

      if (!created.campaignAddress) throw new Error("Campaign was deployed but its address could not be read from the receipt.");
      await markDraftDeployment({
        draftId: draft.id,
        auth: deployAuth,
        campaignAddress: created.campaignAddress,
        tokenAddress: created.tokenAddress,
        deployTxHash: String((created as any)?.hash || ""),
      });

      toast.success(`${selectedTier} campaign is live.`);
      navigate(`/token/${created.tokenAddress || created.campaignAddress}`);
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.reason || err?.message || "Draft deployment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-4xl py-20 text-center font-retro text-muted-foreground">Loading draft...</div>;
  if (!draft || !bundle) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-retro text-4xl text-foreground">Draft not found</h1>
        <Button asChild className="mwz-button mt-6 font-retro"><Link to="/profile?tab=drafts">Back to Drafts</Link></Button>
      </div>
    );
  }

  const blocked = submitting || !DRAFT_PUSH_LIVE_ENABLED || draftIsSolana || !canPushLive(draft.status);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mwz-card p-5 md:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400">Prepare Mode</div>
            <h1 className="mwz-section-title mt-1 text-3xl text-success md:text-4xl">Deploy Draft</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Choose the graduation tier and deploy immediately, or pay gas now and arm a countdown that blocks trading until launch time.
            </p>
          </div>
          <Button asChild variant="outline" className="mwz-button h-10 font-retro text-xs">
            <Link to={`/drafts/${draft.id}/promotion`}>Back to Setup</Link>
          </Button>
        </div>

        <div className="mb-5 grid gap-4 md:grid-cols-[140px_1fr]">
          <div className="mwz-card overflow-hidden border-success/35 bg-black/70">
            <img src={logoURI || "/placeholder.svg"} alt={draft.name} className="aspect-square h-full w-full object-cover" />
          </div>
          <div className="mwz-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> {chainLabel} · ${draft.ticker} · {draft.status.replace(/_/g, " ")}
            </div>
            <h2 className="mt-3 font-retro text-2xl text-foreground">{draft.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{bundle.promotion.missionStatement || draft.description || "No mission statement saved yet."}</p>
          </div>
        </div>

        <GraduationTierSelector
          chainId={Number(draft.chainId)}
          value={graduationTargetWei}
          onChange={setGraduationTargetWei}
          disabled={submitting}
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={`mwz-card p-4 text-left ${mode === "now" ? "border-success/60 bg-success/10" : "border-border"}`}
          >
            <div className="flex items-center gap-2 font-retro text-lg text-foreground"><Rocket className="h-4 w-4" /> Deploy now</div>
            <p className="mt-2 text-sm text-muted-foreground">Pay gas, deploy the campaign, and open trading immediately.</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("scheduled")}
            className={`mwz-card p-4 text-left ${mode === "scheduled" ? "border-orange-400/60 bg-orange-500/10" : "border-border"}`}
          >
            <div className="flex items-center gap-2 font-retro text-lg text-foreground"><Clock3 className="h-4 w-4" /> Deploy with countdown</div>
            <p className="mt-2 text-sm text-muted-foreground">Pay gas now. The contract exists immediately, but trading remains blocked until the selected time.</p>
          </button>
        </div>

        {mode === "scheduled" ? (
          <div className="mwz-card mt-4 p-4">
            <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trading opens at</label>
            <Input
              type="datetime-local"
              value={launchAtInput}
              onChange={(event) => setLaunchAtInput(event.target.value)}
              min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
              max={toLocalInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}
              className="mt-2 max-w-md"
              disabled={submitting}
            />
          </div>
        ) : null}

        {!ownerConnected && !draftIsSolana ? <p className="mt-4 text-sm text-orange-300">Connect the draft owner wallet before deployment.</p> : null}
        {!DRAFT_PUSH_LIVE_ENABLED ? <p className="mt-4 text-sm text-orange-300">Draft deployment is currently disabled by the launch switch.</p> : null}

        <Button onClick={deploy} disabled={blocked} className="mwz-button mwz-button-orange mt-5 h-12 w-full justify-center font-retro">
          {submitting ? "Confirming Deployment..." : mode === "scheduled" ? `Deploy ${selectedTier} Countdown Campaign` : `Deploy ${selectedTier} Campaign Now`}
        </Button>
      </div>
    </div>
  );
}
