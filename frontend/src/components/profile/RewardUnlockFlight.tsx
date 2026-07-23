import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

import type { LeagueClaimRecordedDetail } from "@/hooks/profile/useProfileRewards";
import { formatWeiToBnb } from "@/lib/rewardsApi";
import { getLeagueImage, getLeagueTitle } from "@/lib/leagueCabinet";

type FlightState = {
  detail: LeagueClaimRecordedDetail;
  start: DOMRect;
  flying: boolean;
};

function findClaimCardRect() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const claimingButton = buttons.find((button) =>
    button.textContent?.trim().toLowerCase().includes("claiming")
  );

  const card = claimingButton?.closest("div.rounded-xl") as HTMLElement | null;
  return (card ?? claimingButton)?.getBoundingClientRect() ?? null;
}

export function RewardUnlockFlight() {
  const [flight, setFlight] = useState<FlightState | null>(null);

  useEffect(() => {
    const onUnlocking = (event: Event) => {
      const detail = (event as CustomEvent<LeagueClaimRecordedDetail>).detail;
      if (!detail?.reward) return;

      const fallback = new DOMRect(
        window.innerWidth / 2 - 150,
        window.innerHeight * 0.68,
        300,
        150
      );
      const start = findClaimCardRect() ?? fallback;

      setFlight({ detail, start, flying: false });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setFlight((current) => (current ? { ...current, flying: true } : current));
        });
      });
    };

    window.addEventListener("memebattles:league-claim-unlocking", onUnlocking);
    return () => window.removeEventListener("memebattles:league-claim-unlocking", onUnlocking);
  }, []);

  useEffect(() => {
    if (!flight?.flying) return;
    const timer = window.setTimeout(() => setFlight(null), 760);
    return () => window.clearTimeout(timer);
  }, [flight?.flying]);

  if (!flight) return null;

  const reward = flight.detail.reward;
  const leagueTitle = getLeagueTitle(reward.category as Parameters<typeof getLeagueTitle>[0]);
  const amount = Number(formatWeiToBnb(reward.amountRaw)).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
  const targetWidth = Math.min(230, window.innerWidth - 32);
  const startWidth = Math.min(Math.max(flight.start.width, 220), 420);
  const startHeight = Math.min(Math.max(flight.start.height, 120), 220);
  const targetLeft = window.innerWidth / 2 - targetWidth / 2;
  const targetTop = Math.max(60, window.innerHeight / 2 - 170);

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      <div
        className={`absolute overflow-hidden rounded-2xl border bg-card/95 shadow-2xl transition-[left,top,width,height,transform,opacity,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          flight.flying
            ? "scale-90 border-accent opacity-0 blur-[1px] shadow-[0_0_70px_rgba(249,115,22,0.7)]"
            : "scale-100 border-accent/70 opacity-100 shadow-[0_0_36px_rgba(249,115,22,0.45)]"
        }`}
        style={{
          left: flight.flying ? targetLeft : flight.start.left,
          top: flight.flying ? targetTop : flight.start.top,
          width: flight.flying ? targetWidth : startWidth,
          height: flight.flying ? targetWidth : startHeight,
        }}
      >
        <img
          src={getLeagueImage(reward.category as Parameters<typeof getLeagueImage>[0])}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/20 via-background/65 to-background" />
        <div
          className={`absolute inset-y-0 -left-1/2 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/60 to-transparent transition-transform duration-700 ${
            flight.flying ? "translate-x-[650%]" : "translate-x-0"
          }`}
        />

        <div className="relative flex h-full items-center gap-4 p-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/60 bg-accent/20 transition-transform duration-700 ${
              flight.flying ? "rotate-[18deg] scale-125" : "rotate-0 scale-100"
            }`}
          >
            <Trophy className="h-7 w-7 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              Reward secured
            </div>
            <div className="mt-1 truncate font-retro text-base text-foreground">
              {leagueTitle}
            </div>
            <div className="mt-1 font-retro text-xs text-muted-foreground">
              #{reward.rank} · {amount} BNB
            </div>
          </div>
        </div>
      </div>

      <div
        className={`absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/60 transition-all duration-700 ${
          flight.flying ? "scale-[3.5] opacity-0" : "scale-0 opacity-60"
        }`}
      />
    </div>
  );
}
