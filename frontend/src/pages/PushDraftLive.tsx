import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ethers } from "ethers";
import { Rocket, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/contexts/WalletContext";
import { fetchCampaignDraft, markDraftDeployed, type PrepareDraftBundle } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";
import { useLaunchpad } from "@/lib/launchpadClient";
import { resolveImageUri } from "@/lib/media";

const DRAFT_PUSH_LIVE_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_DRAFT_PUSH_LIVE_ENABLED || import.meta.env.VITE_ENABLE_DRAFT_PUSH_LIVE || "")
    .trim()
    .toLowerCase()
);

function canPushLive(status?: string) {
  return status === "promotion_published" || status === "ready_to_launch" || status === "scheduled";
}

export default function PushDraftLive() {
  const { draftId = "" } = useParams();
  const navigate = useNavigate();
  const wallet = useWallet();
  const { createCampaign, fetchCampaigns } = useLaunchpad();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [initialBuyBnb, setInitialBuyBnb] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCampaignDraft(draftId, wallet.account)
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
  }, [draftId, wallet.account]);

  const draft = bundle?.draft;
  const logoURI = useMemo(() => resolveImageUri(draft?.logoUrl) || draft?.logoUrl || "", [draft?.logoUrl]);

  const pushLive = async () => {
    if (!draft) return;

    if (!DRAFT_PUSH_LIVE_ENABLED) {
      toast.error("Push Live is locked until the platform launch switch is enabled.");
      return;
    }

    if (!wallet.account || !wallet.signer) {
      toast.error("Connect the draft owner wallet first.");
      return;
    }

    if (draft.creatorWallet.toLowerCase() !== wallet.account.toLowerCase()) {
      toast.error("Only the draft owner wallet can push this draft live.");
      return;
    }

    if (!canPushLive(draft.status)) {
      toast.error("Publish the promotion page before pushing this draft live.");
      return;
    }

    if (!logoURI) {
      toast.error("Draft needs a saved logo URL before it can go live.");
      return;
    }

    let parsedInitialBuy: bigint | undefined;
    const initialBuyBnbTrim = initialBuyBnb.trim();
    if (initialBuyBnbTrim) {
      try {
        parsedInitialBuy = ethers.parseEther(initialBuyBnbTrim);
      } catch {
        toast.error("Initial buy must be a valid BNB amount, for example 0.1");
        return;
      }
      if (parsedInitialBuy > ethers.parseEther("1")) {
        toast.error("Initial buy max is 1 BNB");
        return;
      }
    }

    setPushing(true);

    try {
      await createCampaign({
        name: draft.name,
        symbol: draft.ticker.toUpperCase(),
        logoURI,
        xAccount: draft.xUrl || bundle?.promotion?.xUrl || "",
        website: draft.websiteUrl || bundle?.promotion?.websiteUrl || "",
        extraLink: draft.otherUrl || "",
        initialBuyBnb,
        basePriceWei: 0n,
        priceSlopeWei: 0n,
        graduationTargetWei: 0n,
        lpReceiver: "",
      });

      const creator = wallet.account.toLowerCase();
      const symbol = draft.ticker.toUpperCase();
      let campaignAddress = "";
      let tokenAddress = "";

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const campaigns = (await fetchCampaigns()) || [];
        const matches = campaigns.filter((campaign) =>
          String(campaign.creator || "").toLowerCase() === creator &&
          String(campaign.symbol || "").toUpperCase() === symbol
        );

        matches.sort((a, b) => {
          const at = Number(a.createdAt || 0);
          const bt = Number(b.createdAt || 0);
          if (bt !== at) return bt - at;
          return Number(b.id || 0) - Number(a.id || 0);
        });

        if (matches[0]?.campaign) {
          campaignAddress = String(matches[0].campaign);
          tokenAddress = String(matches[0].token || matches[0].tokenAddress || "");
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      if (!campaignAddress) {
        toast.success("Campaign created. Draft deploy marker will need a manual refresh once indexing catches up.");
        navigate("/profile?tab=drafts");
        return;
      }

      const auth = await signDraftAction({
        signer: wallet.signer,
        walletAddress: wallet.account,
        chainId: draft.chainId,
        action: "deploy_draft",
        draftId: draft.id,
      });

      await markDraftDeployed(draft.id, {
        auth,
        campaignAddress,
        tokenAddress: tokenAddress || null,
        deployTxHash: null,
      });

      toast.success("Draft pushed live and linked to the campaign.");
      navigate(`/token/${campaignAddress}`);
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.reason || err?.message || "Failed to push draft live.");
    } finally {
      setPushing(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-4xl py-20 text-center font-retro text-muted-foreground">Loading draft...</div>;
  }

  if (!draft || !bundle) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <h1 className="font-retro text-4xl text-foreground">Draft not found</h1>
        <Button asChild className="mwz-button mt-6 font-retro"><Link to="/profile?tab=drafts">Back to Drafts</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mwz-card p-5 md:p-7">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400">Prepare Mode</div>
            <h1 className="mwz-section-title mt-1 text-3xl text-success md:text-4xl">Push Draft Live</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              This converts the published promotion draft into a normal live on-chain campaign, then marks the draft as deployed.
            </p>
          </div>
          <Button asChild variant="outline" className="mwz-button h-10 font-retro text-xs">
            <Link to={`/drafts/${draft.id}/promotion`}>Back to Setup</Link>
          </Button>
        </div>

        {!DRAFT_PUSH_LIVE_ENABLED ? (
          <div className="mwz-card mb-6 border-orange-400/50 bg-black/60 p-4 text-sm leading-6 text-orange-300">
            Push Live is currently locked. The deploy flow will unlock when the platform launch switch is enabled.
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="mwz-card overflow-hidden border-success/35 bg-black/70">
            <div className="relative aspect-square border-b border-success/25 bg-black">
              <img src={logoURI || "/placeholder.svg"} alt={draft.name} className="h-full w-full object-cover" />
              <div className="absolute left-2 top-2 inline-flex items-center gap-1 border border-success/55 bg-black/75 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-success">
                <ShieldCheck className="h-3 w-3" /> Ready
              </div>
            </div>
            <div className="p-3 text-success">
              <div className="mwz-section-title truncate text-lg">{draft.name}</div>
              <div className="mt-1 text-sm text-success/70">${draft.ticker}</div>
              <div className="mt-3 text-xs text-muted-foreground">Status: {draft.status.replace(/_/g, " ")}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="mwz-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Mission</div>
              <p className="mt-2 text-sm leading-6 text-success/75">
                {bundle.promotion.missionStatement || draft.description || "No mission statement saved yet."}
              </p>
            </div>

            <div className="mwz-card p-4">
              <label className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Initial buy (BNB, optional)</label>
              <Input
                value={initialBuyBnb}
                onChange={(e) => setInitialBuyBnb(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                disabled={!DRAFT_PUSH_LIVE_ENABLED}
                className="mt-2 h-12 border-border bg-background/50 font-retro"
              />
              <p className="mt-2 text-xs text-muted-foreground">Max 1 BNB. Leave empty for no initial buy.</p>
            </div>

            {!canPushLive(draft.status) ? (
              <div className="mwz-card border-orange-400/40 p-4 text-sm text-orange-300">
                Publish the promotion page before pushing this draft live.
              </div>
            ) : null}

            <Button
              onClick={pushLive}
              disabled={pushing || !DRAFT_PUSH_LIVE_ENABLED || !canPushLive(draft.status)}
              className="mwz-button mwz-button-orange h-12 w-full justify-center font-retro"
            >
              <Rocket className="mr-2 h-4 w-4" />
              {pushing ? "Pushing Live..." : DRAFT_PUSH_LIVE_ENABLED ? "Push Live Campaign" : "Push Live Locked"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
