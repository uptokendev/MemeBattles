import { Copy, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

type CommandCenterHeroProps = {
  walletAddress: string;
};

export function CommandCenterHero({ walletAddress }: CommandCenterHeroProps) {
  const {
    displayName,
    avatarUrl,
    followersCount,
    followingCount,
    createdCount,
    loadingFollows,
  } = useCommandCenterData();

  const short = shortenWallet(walletAddress);
  const publicProfileBase = `/profile/${encodeURIComponent(walletAddress)}`;
  const commandBase = `${publicProfileBase}/command`;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy address");
    }
  };

  return (
    <section className="rounded-3xl border border-border/50 bg-background/85 p-4 shadow-2xl backdrop-blur-xl md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-accent/35 bg-accent/10 md:h-20 md:w-20">
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              <img src="/assets/ticker.png" alt="MemeWarzone" className="h-4 w-4 rounded-sm object-contain" />
              <span>Command Center</span>
            </div>
            <h1 className="truncate font-retro text-xl text-foreground md:text-2xl">
              {displayName || short || "Connected wallet"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="max-w-full truncate rounded-full border border-border/50 bg-card/35 px-3 py-1 font-mono">
                {walletAddress}
              </span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/35 px-3 py-1 transition hover:border-accent/50 hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <a
                href={publicProfileBase}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/35 px-3 py-1 transition hover:border-accent/50 hover:text-foreground"
              >
                Public profile
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <Link to={`${commandBase}/followers`} className="rounded-2xl border border-border/50 bg-card/35 p-3 transition hover:border-accent/50 hover:bg-card/50">
            <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : followersCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Followers</div>
          </Link>
          <Link to={`${commandBase}/following`} className="rounded-2xl border border-border/50 bg-card/35 p-3 transition hover:border-accent/50 hover:bg-card/50">
            <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : followingCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Following</div>
          </Link>
          <Link to={`${commandBase}/coins`} className="rounded-2xl border border-border/50 bg-card/35 p-3 transition hover:border-accent/50 hover:bg-card/50">
            <div className="font-retro text-lg text-foreground">{createdCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Coins</div>
          </Link>
        </div>
      </div>
    </section>
  );
}
