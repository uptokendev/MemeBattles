import { useEffect, useMemo, useState } from "react";
import { formatEther } from "ethers";
import { Gift, Trophy } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { fetchAirdropWinners, type AirdropWinner } from "@/lib/rewardProgramsApi";

const ZERO_RAW = "0";

function formatBnb(raw: string): string {
  try {
    const value = Number(formatEther(BigInt(raw || ZERO_RAW)));
    return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
  } catch {
    return "0";
  }
}

function shortenAddress(address: string): string {
  if (!address) return "Unknown wallet";
  if (address.length <= 14) return address;
  return address.slice(0, 6) + "..." + address.slice(-4);
}

function getNextMondayUtc(): Date {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const daysUntilMonday = (8 - todayUtc.getUTCDay()) % 7 || 7;
  return new Date(todayUtc.getTime() + daysUntilMonday * 24 * 60 * 60 * 1000);
}

function formatCountdown(target: Date, nowMs: number): string {
  const diffMs = target.getTime() - nowMs;
  if (diffMs <= 0) return "Drop pending";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return days + "d " + hours + "h " + minutes + "m";
  if (hours > 0) return hours + "h " + minutes + "m";
  return minutes + "m";
}

function winnerType(program: string): string {
  return program === "airdrop_creator" ? "Creator" : "Trader";
}

export default function CommandCenterAirdrops() {
  const [winners, setWinners] = useState<AirdropWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAirdropWinners({ limit: 12 })
      .then((items) => {
        if (!cancelled) setWinners(Array.isArray(items) ? items : []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(String(err?.message || err || "Failed to load previous winners"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const nextDropAt = useMemo(() => getNextMondayUtc(), []);
  const countdown = formatCountdown(nextDropAt, nowMs);
  const currentPrizePoolRaw = ZERO_RAW;

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title="Warzone Airdrops" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <CommandCenterCard className="min-h-[180px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Prize Pool</p>
                <div className="mt-5 font-retro text-4xl text-foreground md:text-5xl">
                  {formatBnb(currentPrizePoolRaw)} BNB
                </div>
              </div>
              <div className="rounded-2xl border border-accent/30 bg-accent/10 p-3 text-accent">
                <Gift className="h-5 w-5" />
              </div>
            </div>
          </CommandCenterCard>

          <CommandCenterCard>
            <p className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Next drop in</p>
            <div className="mt-4 font-retro text-3xl text-foreground md:text-4xl">{countdown}</div>
          </CommandCenterCard>
        </div>

        <CommandCenterCard className="min-h-[376px]" title="Previous winners">
          {loading ? (
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              Loading previous winners...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : winners.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              No previous winners yet.
            </div>
          ) : (
            <div className="space-y-3">
              {winners.map((winner) => (
                <div
                  key={`${winner.drawId}-${winner.walletAddress}-${winner.program}`}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 shrink-0 text-accent" />
                        <p className="truncate font-retro text-sm text-foreground">{shortenAddress(winner.walletAddress)}</p>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {winnerType(winner.program)} winner #{winner.winnerRank}
                      </p>
                    </div>
                    <p className="shrink-0 font-retro text-sm text-foreground">{formatBnb(winner.payoutAmount)} BNB</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CommandCenterCard>
      </div>
    </div>
  );
}
