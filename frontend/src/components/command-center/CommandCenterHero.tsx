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
    draftCount,
    loadingFollows,
    loadingDraftCount,
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

  const statLinkClass = "mwz-flat-card p-3 text-center transition hover:border-accent/45 hover:bg-white/[0.025]";

  return (
    <section className="mwz-flat-card p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden border border-accent/35 bg-accent/10 md:h-20 md:w-20">
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              <img src="/assets/ticker.png" alt="MemeWarzone" className="h-4 w-4 object-contain" />
              <span>Creator tools</span>
            </div>
            <h1 className="truncate font-retro text-xl text-foreground md:text-2xl">
              {displayName || short || "Connected wallet"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="max-w-full truncate border border-border/45 bg-white/[0.025] px-3 py-1 font-mono">
                {walletAddress}
              </span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-1 border border-border/45 bg-white/[0.025] px-3 py-1 transition hover:border-accent/50 hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
              <a
                href={publicProfileBase}
                className="inline-flex items-center gap-1 border border-border/45 bg-white/[0.025] px-3 py-1 transition hover:border-accent/50 hover:text-foreground"
              >
                Public profile
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center sm:min-w-[460px] sm:grid-cols-4">
          <Link to={`${commandBase}/followers`} className={statLinkClass}>
            <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : followersCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Followers</div>
          </Link>
          <Link to={`${commandBase}/following`} className={statLinkClass}>
            <div className="font-retro text-lg text-foreground">{loadingFollows ? "..." : followingCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Following</div>
          </Link>
          <Link to={commandBase} className={statLinkClass}>
            <div className="font-retro text-lg text-foreground">{createdCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Coins</div>
          </Link>
          <Link to={commandBase} className={statLinkClass}>
            <div className="font-retro text-lg text-foreground">{loadingDraftCount ? "..." : draftCount}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Drafts</div>
          </Link>
        </div>
      </div>
    </section>
  );
}
