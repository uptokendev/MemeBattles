import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Swords, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";

type LeagueOverlayCardProps = {
  className?: string;
};

export function LeagueOverlayCard({ className }: LeagueOverlayCardProps) {
  const navigate = useNavigate();

  return (
    <div
  className={cn(
    "pointer-events-auto mt-8 w-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shadow-[0_26px_70px_-38px_rgba(0,0,0,0.95)] transition-colors hover:border-accent/50",
    className
  )}
>
      <div className="grid min-h-[192px] grid-cols-[132px_minmax(0,1fr)] sm:grid-cols-[148px_minmax(0,1fr)] md:min-h-[210px] md:grid-cols-[168px_minmax(0,1fr)]">
  <div className="relative flex items-center justify-center border-r border-border/40 bg-gradient-to-br from-background/90 via-card/85 to-background/95 p-4">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,227,23,0.08),transparent_52%),radial-gradient(circle_at_80%_18%,rgba(240,106,26,0.10),transparent_34%)]" />
    <img
      src="/assets/leaguelogo.png"
      alt="MemeWarzone"
      className="relative z-10 h-30 w-30 object-contain drop-shadow-[0_0_22px_rgba(240,106,26,0.18)] sm:h-34 sm:w-34 md:h-38 md:w-38"
      draggable={false}
    />
  </div>

        <div className="flex min-w-0 flex-col justify-between p-4 md:p-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[16px] font-bold uppercase tracking-[0.22em] text-accent/90">
              <Trophy className="h-4 w-4" />
              Battle Leagues
            </div>
            <div className="text-lg font-semibold leading-tight text-foreground md:text-xl">
              Enter the leagues. Climb the rankings. Claim the spotlight.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className="w-full" onClick={() => navigate("/create")}>
              
              Start a Battle
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/battle-leagues")}>
              
              Go to Leagues
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
