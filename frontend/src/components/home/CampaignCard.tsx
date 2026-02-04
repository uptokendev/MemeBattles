import { AthBar } from "@/components/token/AthBar";
import { UpvoteDialog } from "@/components/token/UpvoteDialog";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { resolveImageUri } from "@/lib/media";

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
  const addr = String(vm.campaignAddress ?? "").toLowerCase();
  const creatorAddr = String(vm.creator ?? "").trim();
  const canOpenProfile = creatorAddr.length > 0;
  const openProfile = () => {
    if (!canOpenProfile) return;
    navigate(`/profile?address=${encodeURIComponent(creatorAddr)}`);
  };

  return (
    <div
      className={cn(
        "group relative flex w-full max-w-[clamp(160px,20vw,210px)] flex-col rounded-2xl overflow-hidden border border-border/50 bg-card/60",
        "transition-all hover:border-accent/50 hover:shadow-[0_0_0_1px_rgba(255,159,28,0.18),0_18px_50px_-22px_rgba(255,120,0,0.38)]",
        className
      )}
    >
      {/* Image */}
      <button
        className="block w-full text-left"
        onClick={() => navigate(`/token/${addr}`)}
        aria-label={`Open ${vm.name}`}
      >
        <div className="relative aspect-square w-full">
          <img
            src={resolveImageUri(vm.logoURI) || "/placeholder.svg"}
            alt={vm.name}
            className="h-full w-full object-cover bg-muted"
            draggable={false}
            loading="lazy"
          />
          {/* subtle top fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        </div>
      </button>

      {/* Content */}
      <div className="flex aspect-square flex-col p-4">
        {/* Title + upvotes */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">{vm.name}</div>
            <div className="text-xs text-muted-foreground truncate">{vm.symbol ? `$${vm.symbol}` : ""}</div>
          </div>

          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            <UpvoteDialog campaignAddress={addr} />
          </div>
        </div>

        {/* Creator + time */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/assets/profile_placeholder.png"
              alt="Creator"
              className={cn(
                "w-7 h-7 rounded-full object-cover border border-border/60",
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
                "text-xs text-muted-foreground truncate",
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
          <div className="text-xs text-muted-foreground shrink-0">{timeAgoFromUnix(vm.createdAt)}</div>
        </div>

        {/* Key stats */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-muted-foreground">MCap</div>
            <div className="text-xs font-semibold truncate">{vm.marketCapUsdLabel ?? "—"}</div>
          </div>

          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">UpVotes (24h)</div>
            <div className="text-xs font-semibold">{Number(vm.votes24h ?? 0)}</div>
          </div>
        </div>

        {/* ATH bar */}
        <div className="mt-3">
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
