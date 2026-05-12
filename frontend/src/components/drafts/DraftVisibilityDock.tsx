import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Eye, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { fetchCampaignDraft, saveDraftPromotion, type DraftVisibility, type PrepareDraftBundle } from "@/lib/draftApi";
import { signDraftAction } from "@/lib/draftAuth";

const visibilityOptions: Array<{ value: DraftVisibility; label: string; help: string }> = [
  { value: "public", label: "Public", help: "Listed and shareable." },
  { value: "unlisted", label: "Unlisted", help: "Shareable by direct link." },
  { value: "private", label: "Private", help: "Owner-only draft." },
];

export function DraftVisibilityDock() {
  const { draftId = "" } = useParams();
  const wallet = useWallet();
  const [bundle, setBundle] = useState<PrepareDraftBundle | null>(null);
  const [visibility, setVisibility] = useState<DraftVisibility>("private");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    void fetchCampaignDraft(draftId, wallet.account)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
        setVisibility(data.draft.visibility || "private");
      })
      .catch(() => {
        if (cancelled) return;
        setBundle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [draftId, wallet.account]);

  const saveVisibility = async () => {
    if (!bundle || !draftId) return;
    if (!wallet.account || !wallet.signer) {
      toast.error("Connect the draft owner wallet before saving visibility.");
      return;
    }

    const draft = bundle.draft;
    if (draft.creatorWallet.toLowerCase() !== wallet.account.toLowerCase()) {
      toast.error("Only the draft owner wallet can change visibility.");
      return;
    }

    setSaving(true);
    try {
      const auth = await signDraftAction({
        signer: wallet.signer,
        walletAddress: wallet.account,
        chainId: draft.chainId,
        action: "save_promotion",
        draftId,
      });

      const updated = await saveDraftPromotion(draftId, {
        auth,
        missionStatement: bundle.promotion.missionStatement,
        roadmap: bundle.promotion.roadmap,
        launchStrategy: bundle.promotion.launchStrategy,
        telegramUrl: bundle.promotion.telegramUrl,
        discordUrl: bundle.promotion.discordUrl,
        xUrl: bundle.promotion.xUrl,
        websiteUrl: bundle.promotion.websiteUrl,
        docs: bundle.promotion.docs,
        creatorNote: bundle.promotion.creatorNote,
        bannerUrl: bundle.promotion.bannerUrl,
        shareMessage: bundle.promotion.shareMessage,
        visibility,
      });

      setBundle(updated);
      setVisibility(updated.draft.visibility || visibility);
      toast.success(`Draft visibility set to ${updated.draft.visibility}.`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save visibility.");
    } finally {
      setSaving(false);
    }
  };

  if (!bundle) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-[30.5rem] z-40 hidden w-[21.5rem] xl:block">
      <div className="pointer-events-auto mwz-card border-orange-400/40 bg-black/80 p-3 shadow-xl backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">// Visibility</div>
            <div className="font-retro text-sm uppercase tracking-[0.12em] text-foreground">Access control</div>
          </div>
          <Button type="button" onClick={saveVisibility} disabled={saving} size="sm" className="mwz-button h-8 px-3 font-retro text-xs">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving" : "Save"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {visibilityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setVisibility(option.value)}
              className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                visibility === option.value
                  ? "border-orange-400 bg-orange-400/15 text-orange-200"
                  : "border-border/50 bg-background/40 text-muted-foreground hover:border-orange-400/50 hover:text-foreground"
              }`}
            >
              <Eye className="mx-auto mb-1 h-3.5 w-3.5" />
              <div className="font-retro text-[10px] uppercase tracking-[0.12em]">{option.label}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Public lists the page. Unlisted keeps it link-only. Private hides it from everyone except the owner.
        </p>
      </div>
    </div>
  );
}
