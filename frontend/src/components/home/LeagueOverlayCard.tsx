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
        "pointer-events-auto relative w-[260px] md:w-[300px] overflow-hidden rounded-[1.6rem] border border-white/10",
        "bg-[linear-gradient(180deg,rgba(58,62,70,0.96),rgba(16,18,22,0.99))]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.40),0_18px_40px_rgba(0,0,0,0.30)]",
         className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-[linear-gradient(90deg,#f8cf45_0%,#ff9726_55%,#ff5a0d_100%)]" />

      <div className="relative h-[172px] overflow-hidden border-b border-white/10">
        <img
          src="/assets/MemeBattleLeague.png"
          alt="Meme Battles League"
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,170,60,0.18),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.58))]" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-black/35 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-300 backdrop-blur-sm">
          <Trophy className="h-3.5 w-3.5" />
          Live Leagues
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
       </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-stone-400">Epochs</div>
            <div className="mt-1 text-sm font-semibold text-stone-100">Weekly</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-[0.08em] text-stone-400">Rewards</div>
            <div className="mt-1 text-sm font-semibold text-stone-100">Monthly</div>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="text-base font-semibold uppercase tracking-[0.05em] text-stone-100">
            Battle starts with a coin.
          </div>
          <div className="text-xs leading-relaxed text-stone-400">
            Launch a campaign, climb the rankings, and fight for weekly and monthly league rewards.
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Button
            className="w-full font-retro"
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
