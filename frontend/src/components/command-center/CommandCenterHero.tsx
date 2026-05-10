import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

type CommandCenterHeroProps = {
  walletAddress: string;
};

export function CommandCenterHero({ walletAddress }: CommandCenterHeroProps) {
  const short = shortenWallet(walletAddress);

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
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-accent/35 bg-accent/10 font-retro text-xl text-accent md:h-20 md:w-20">
            MW
          </div>
          <div className="min-w-0">
            <div className="mb-1 font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              Private Command Center
            </div>
            <h1 className="truncate font-retro text-xl text-foreground md:text-2xl">
              {short || "Connected wallet"}
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
                href={`/profile/${encodeURIComponent(walletAddress)}`}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/35 px-3 py-1 transition hover:border-accent/50 hover:text-foreground"
              >
                Public profile
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <div className="rounded-2xl border border-border/50 bg-card/35 p-3">
            <div className="font-retro text-lg text-foreground">0</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Followers</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/35 p-3">
            <div className="font-retro text-lg text-foreground">0</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Following</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/35 p-3">
            <div className="font-retro text-lg text-foreground">0</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Coins</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border/50 bg-card/25 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-retro text-sm text-foreground">Rank progress</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Rank data will plug in during the Overview/Home Base batch. Missing data stays safe in Phase 1.
            </div>
          </div>
          <Button variant="outline" className="font-retro" disabled>
            Rank pending
          </Button>
        </div>
      </div>
    </section>
  );
}
