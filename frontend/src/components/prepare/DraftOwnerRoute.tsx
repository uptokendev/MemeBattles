import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { useWallet } from "@/contexts/WalletContext";
import { fetchCampaignDraft, type CampaignDraft } from "@/lib/draftApi";
import { isSolanaChainId } from "@/lib/chainConfig";

function sameWallet(a?: string | null, b?: string | null, solana = false) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  return solana ? left === right : left.toLowerCase() === right.toLowerCase();
}

function AccessState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <div className="mwz-card p-8">
        <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400">Prepare Mode Security</div>
        <h1 className="mt-3 font-retro text-3xl text-foreground">{title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
        <Button asChild variant="outline" className="mwz-button mt-6 font-retro text-xs">
          <Link to="/profile?tab=drafts">Back to My Drafts</Link>
        </Button>
      </div>
    </div>
  );
}

export function DraftOwnerRoute({ children }: { children: ReactNode }) {
  const { draftId = "" } = useParams();
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const connectedWallet = wallet.account || solanaWallet.solanaAccount || null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft(null);
    setError("");

    if (!connectedWallet) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    fetchCampaignDraft(draftId, connectedWallet)
      .then((bundle) => {
        if (!cancelled) setDraft(bundle.draft);
      })
      .catch((err: any) => {
        if (!cancelled) setError(String(err?.message || "Draft owner authorization failed."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connectedWallet, draftId]);

  if (loading) {
    return <div className="mx-auto max-w-4xl py-20 text-center font-retro text-muted-foreground">Verifying draft owner wallet...</div>;
  }

  if (!connectedWallet) {
    return <AccessState title="Owner Wallet Required" body="Connect the wallet that created this draft before opening its editor or deployment console." />;
  }

  if (!draft) {
    return <AccessState title="Draft Access Denied" body={error || "This draft could not be opened with the connected wallet."} />;
  }

  const solanaDraft = isSolanaChainId(Number(draft.chainId));
  const activeOwnerWallet = solanaDraft ? solanaWallet.solanaAccount : wallet.account;
  if (!sameWallet(draft.creatorWallet, activeOwnerWallet, solanaDraft)) {
    return <AccessState title="Wrong Wallet Connected" body="The connected wallet does not own this draft. Switch to the creator wallet to edit, publish, archive, schedule, or deploy it." />;
  }

  return <>{children}</>;
}
