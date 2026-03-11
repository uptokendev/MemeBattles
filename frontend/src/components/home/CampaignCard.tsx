import { AthBar } from "@/components/token/AthBar";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { followCampaign, unfollowCampaign, isFollowingCampaign } from "@/lib/followApi";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { resolveImageUri } from "@/lib/media";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

export type CampaignCardVM = {
  campaignAddress: string;
  name: string;
  symbol: string;
  logoURI?: string;
  creator?: string;
  createdAt?: number; // unix seconds

  // Computed / hydrated fields
  marketCapUsdLabel?: string | null;
  athLabel?: string | null;
  progressPct?: number | null;
  isDexTrading?: boolean;
  votes24h?: number;
};

function shortAddr(addr?: string) {
  if (!addr) return "";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function timeAgoFromUnix(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - seconds);
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function CampaignCard({
  vm,
  chainIdForStorage,
  className,
}: {
  vm: CampaignCardVM;
  chainIdForStorage: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const wallet = useWallet();
  const { toast } = useToast();
  const [followBusy, setFollowBusy] = useState(false);
  const [followed, setFollowed] = useState(false);
  const addr = String(vm.campaignAddress ?? "").toLowerCase();
  const creatorAddr = String(vm.creator ?? "").trim();
  const canOpenProfile = creatorAddr.length > 0;
  const openProfile = () => {
    if (!canOpenProfile) return;
    navigate(`/profile?address=${encodeURIComponent(creatorAddr)}`);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!wallet.account) {
          if (alive) setFollowed(false);
          return;
        }
        const v = await isFollowingCampaign(wallet.account, addr, chainIdForStorage);
        if (alive) setFollowed(v);
      } catch {
        if (alive) setFollowed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [wallet.account, addr, chainIdForStorage]);

  const toggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!addr) return;

    if (!wallet.account) {
      toast({ title: "Connect wallet", description: "Connect your wallet to follow campaigns." });
      try {
        await wallet.connect();
      } catch {}
      return;
    }

    if (followBusy) return;
    setFollowBusy(true);
    const next = !followed;
    setFollowed(next); // optimistic
    try {
      if (next) {
        await followCampaign(wallet.account, addr, chainIdForStorage);
      } else {
        await unfollowCampaign(wallet.account, addr, chainIdForStorage);
      }
    } catch (err: any) {
      setFollowed(!next); // rollback
      toast({
        title: "Follow failed",
        description: String(err?.message ?? err ?? "Unknown error"),
      });
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex w-full max-w-[clamp(160px,20vw,210px)] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(58,62,70,0.96),rgba(17,19,23,0.99))]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.40),0_18px_40px_rgba(0,0,0,0.28)] transition-all hover:border-amber-400/28 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.40),0_20px_44px_rgba(0,0,0,0.34)]",
         className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-[linear-gradient(90deg,#f8cf45_0%,#ff9726_55%,#ff5a0d_100%)]" />

      {/* Image */}
      <button
        className="block w-full text-left"
        onClick={() => navigate(`/token/${addr}`)}
        aria-label={`Open ${vm.name}`}
      >
        <div className="relative aspect-square w-full overflow-hidden">
          <img
            src={resolveImageUri(vm.logoURI) || "/placeholder.svg"}
            alt={vm.name}
            className="h-full w-full object-cover bg-muted transition-transform duration-300 group-hover:scale-[1.04]"
             draggable={false}
            loading="lazy"
          />
          <div className="absolute inset-0 border-b border-white/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
         </div>
      </button>

      {/* Content */}
      <div className="flex aspect-square flex-col p-3.5 bg-[linear-gradient(180deg,rgba(62,66,74,0.14),rgba(0,0,0,0.02))]">
         {/* Title + upvotes */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold uppercase tracking-[0.03em] truncate">{vm.name}</div>
            <div className="text-xs text-stone-400 truncate">{vm.symbol ? `$${vm.symbol}` : ""}</div>
           </div>
          <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* Follow ⭐ */}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-xl border-white/10"
              onClick={toggleFollow}
              disabled={followBusy}
              aria-label={followed ? "Unfollow campaign" : "Follow campaign"}
              title={followed ? "Unfollow" : "Follow"}
            >
              <Star
  className={cn(
    "h-4 w-4 transition-all",
    followed
      ? "text-yellow-400 fill-yellow-400 scale-110 drop-shadow-[0_0_10px_rgba(250,204,21,0.45)]"
      : "text-muted-foreground/70"
  )}
/>
            </Button>

            {/* Upvote */}
            <UpvoteDialog campaignAddress={addr} />
          </div>
        </div>

        {/* Creator + time */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
           <div className="flex items-center gap-2 min-w-0">
            <img
              src="/assets/profile_placeholder.png"
              alt="Creator"
              className={cn(
                "w-7 h-7 rounded-full object-cover border border-white/15",
                canOpenProfile ? "cursor-pointer hover:border-accent/60" : ""
              )}
              draggable={false}
              role={canOpenProfile ? "button" : undefined}
              tabIndex={canOpenProfile ? 0 : undefined}
              onClick={(e) => {
                if (!canOpenProfile) return;
                e.stopPropagation();
                openProfile();
              }}
              onKeyDown={(e) => {
                if (!canOpenProfile) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  openProfile();
                }
              }}
            />
            <div
              className={cn(
                "text-xs text-stone-300 truncate",
                canOpenProfile ? "cursor-pointer hover:text-foreground" : ""
              )}
              role={canOpenProfile ? "button" : undefined}
              tabIndex={canOpenProfile ? 0 : undefined}
              onClick={(e) => {
                if (!canOpenProfile) return;
                e.stopPropagation();
                openProfile();
              }}
              onKeyDown={(e) => {
                if (!canOpenProfile) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  openProfile();
                }
              }}
            >
              {vm.creator ? shortAddr(vm.creator) : "—"}
            </div>
          </div>
          <div className="text-xs text-stone-400 shrink-0">{timeAgoFromUnix(vm.createdAt)}</div>
         </div>

        {/* Key stats */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2.5">
           <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.08em] text-stone-400">MCap</div>
            <div className="text-xs font-semibold truncate">{vm.marketCapUsdLabel ?? "—"}</div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-stone-400">UpVotes (24h)</div>
            <div className="text-xs font-semibold">{Number(vm.votes24h ?? 0)}</div>
          </div>
        </div>

        {/* ATH bar */}
        <div className="mt-3 rounded-xl border border-amber-400/15 bg-black/20 px-2 py-1.5">
          <AthBar
            currentLabel={vm.athLabel ?? null}
            storageKey={`ath:${String(chainIdForStorage)}:${addr}`}
            className="text-[10px]"
            barWidthPx={220}
            barMaxWidth="100%"
          />
        </div>

      </div>
    </div>
  );
}
