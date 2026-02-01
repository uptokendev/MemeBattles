import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type LeagueOverlayCardProps = {
  className?: string;
};

export function LeagueOverlayCard({ className }: LeagueOverlayCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "pointer-events-auto w-[260px] md:w-[300px] rounded-2xl overflow-hidden border border-border/50 bg-card/70 shadow-2xl",
        "backdrop-blur-md",
        className
      )}
    >
      <div className="relative">
        <img
          src="/assets/MemeBattleLeague.png"
          alt="Meme Battles League"
          className="w-full h-[160px] object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
      </div>

      <div className="p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold tracking-tight">Battle starts with a coin.</div>
          <div className="text-xs text-muted-foreground">Launch a campaign to enter leagues.</div>
        </div>

        <div className="mt-4 grid gap-2">
          <Button
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-retro"
            onClick={() => navigate("/create")}
          >
            Start a Battle
          </Button>
          <Button
            variant="outline"
            className="w-full font-retro"
            onClick={() => navigate("/battle-leagues")}
          >
            Go to Leagues
          </Button>
        </div>
      </div>
    </div>
  );
}
