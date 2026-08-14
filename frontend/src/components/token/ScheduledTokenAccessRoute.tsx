import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Clock3, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { getActiveChainId } from "@/lib/chainConfig";
import { fetchPublicCampaignLifecycleDrafts, timestampSeconds, type CampaignDraftLifecycle } from "@/lib/scheduledLaunchApi";

function sameAddress(a?: string | null, b?: string | null) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  // Solana base58 is case-sensitive for identity, but lowercased URLs still appear;
  // use case-insensitive compare only as a recovery for mangled routes.
  if (left === right) return true;
  return left.toLowerCase() === right.toLowerCase();
}

function countdownLabel(launchAt: number, nowMs: number) {
  const remaining = Math.max(0, launchAt - Math.floor(nowMs / 1000));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function ScheduledTokenAccessRoute({ children }: { children: ReactNode }) {
  const { campaignAddress = "" } = useParams();
  const location = useLocation();
  const wallet = useWallet();
  const solanaWallet = useSolanaWallet();
  const [draft, setDraft] = useState<CampaignDraftLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const chainId = useMemo(() => {
    const configured = Number(new URLSearchParams(location.search).get("chainId") || 0);
    return configured > 0 ? configured : Number(getActiveChainId(wallet.chainId));
  }, [location.search, wallet.chainId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPublicCampaignLifecycleDrafts({ chainId, limit: 500 })
      .then((items) => {
        if (cancelled) return;
        const needle = String(campaignAddress).trim();
        const needleLower = needle.toLowerCase();
        setDraft(items.find((item) => {
          const c = String(item.campaignAddress || "").trim();
          const t = String(item.tokenAddress || "").trim();
          return c === needle || t === needle || c.toLowerCase() === needleLower || t.toLowerCase() === needleLower;
        }) || null);
      })
      .catch(() => {
        if (!cancelled) setDraft(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [campaignAddress, chainId]);

  const launchAt = timestampSeconds(draft?.scheduledLaunchAt);
  const restricted = Boolean(draft && launchAt && launchAt > Math.floor(nowMs / 1000));
  const isCreator =
    sameAddress(wallet.account, draft?.creatorWallet) ||
    sameAddress(solanaWallet.solanaAccount, draft?.creatorWallet);

  useEffect(() => {
    if (!restricted) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [restricted]);

  if (loading) {
    return <div className="mx-auto max-w-4xl py-20 text-center font-retro text-muted-foreground">Checking launch access...</div>;
  }

  if (restricted && !isCreator && draft && launchAt) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="mwz-card border-orange-400/35 p-8">
          <ShieldCheck className="mx-auto h-10 w-10 text-orange-300" />
          <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-orange-400">Scheduled campaign protection</div>
          <h1 className="mt-3 font-retro text-3xl text-foreground">Trading room opens at launch</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            This campaign is already deployed on-chain, but its TokenDetails workspace stays creator-only until the scheduled trading timestamp.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 border border-orange-400/35 bg-black/50 px-5 py-3 font-retro text-xl text-orange-200">
            <Clock3 className="h-5 w-5" />
            {countdownLabel(launchAt, nowMs)}
          </div>
          <div className="mt-6">
            <Button asChild className="mwz-button mwz-button-orange font-retro">
              <Link to={`/prepare/${encodeURIComponent(draft.slug)}`}>Open promotion page</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {restricted && isCreator && draft && launchAt ? (
        <div className="mx-auto mb-4 max-w-7xl border border-orange-400/35 bg-orange-500/5 px-4 py-3 text-center text-xs uppercase tracking-[0.14em] text-orange-200">
          Creator preview · public TokenDetails access opens in {countdownLabel(launchAt, nowMs)}
        </div>
      ) : null}
      {children}
    </>
  );
}
