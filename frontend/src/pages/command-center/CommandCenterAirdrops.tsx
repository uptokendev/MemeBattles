import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { Gift, Trophy } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { fetchAirdropCurrent, fetchAirdropWinners, type AirdropCurrent, type AirdropWinner } from "@/lib/rewardProgramsApi";

const ZERO_RAW = "0";
const LAMPORTS_PER_SOL = 1_000_000_000;

function isSolanaAirdrop(chainId?: number | null): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

function nativeSymbol(chainId?: number | null, fallback?: string | null): "BNB" | "SOL" | string {
  return fallback || (isSolanaAirdrop(chainId) ? "SOL" : "BNB");
}

function pageTitle(chainId?: number | null): string {
  return isSolanaAirdrop(chainId) ? "SOL Airdrops" : "BNB Airdrops";
}

function formatNativeAmount(raw: string, chainId?: number | null): string {
  try {
    if (isSolanaAirdrop(chainId)) {
      const value = Number(BigInt(raw || ZERO_RAW)) / LAMPORTS_PER_SOL;
      return value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 6 });
    }

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

function formatDate(value?: string | null): string {
  if (!value) return "Pending";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Pending";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCountdown(targetIso: string | null | undefined, nowMs: number): string {
  if (!targetIso) return "Pending";
  const target = new Date(targetIso);
  const diffMs = target.getTime() - nowMs;
  if (!Number.isFinite(target.getTime())) return "Pending";
  if (diffMs <= 0) return "Drop pending";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return days + "d " + hours + "h " + minutes + "m";
  if (hours > 0) return hours + "h " + minutes + "m";
  return minutes + "m";
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "ready": return "Ready";
    case "drop_complete": return "Drop Complete";
    case "claim_open": return "Claim Open";
    case "closed": return "Closed";
    case "funding":
    default:
      return "Funding";
  }
}

function winnerType(winner: AirdropWinner): string {
  if (winner.role === "creator" || winner.program === "airdrop_creator") return "Creator";
  return "Trader";
}

export default function CommandCenterAirdrops() {
  const { chainId } = useCommandCenterData();
  const [current, setCurrent] = useState<AirdropCurrent | null>(null);
  const [winners, setWinners] = useState<AirdropWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchAirdropCurrent(chainId),
      fetchAirdropWinners({ chainId, limit: 12 }),
    ])
      .then(([currentPayload, winnerItems]) => {
        if (cancelled) return;
        setCurrent(currentPayload);
        setWinners(Array.isArray(winnerItems) ? winnerItems : []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(String(err?.message || err || "Failed to load airdrops"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chainId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const activeChainId = current?.chainId || chainId;
  const symbol = nativeSymbol(activeChainId, current?.tokenSymbol);
  const nextDropAt = current?.nextDropAt || null;
  const countdown = formatCountdown(nextDropAt, nowMs);

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader title={pageTitle(activeChainId)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <CommandCenterCard className="min-h-[180px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Prize Pool</p>
                <div className="mt-5 font-retro text-4xl text-foreground md:text-5xl">
                  {formatNativeAmount(current?.prizePoolAmount || ZERO_RAW, activeChainId)} {symbol}
                </div>
                {current?.prizePoolUsd ? (
                  <p className="mt-2 text-sm text-muted-foreground">${Number(current.prizePoolUsd).toLocaleString()} estimated</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-accent/30 bg-accent/10 p-3 text-accent">
                <Gift className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="rounded-full border border-border/50 px-2.5 py-1">Chain: {nativeSymbol(activeChainId)}</span>
              <span className="rounded-full border border-border/50 px-2.5 py-1">{statusLabel(current?.status)}</span>
            </div>
          </CommandCenterCard>

          <CommandCenterCard>
            <p className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Next drop in</p>
            <div className="mt-4 font-retro text-3xl text-foreground md:text-4xl">{countdown}</div>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>{nextDropAt ? new Date(nextDropAt).toLocaleString() : "Next drop time pending"}</p>
              <p>{current?.epochLabel || "Next weekly airdrop"}</p>
            </div>
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
                  key={`${winner.epochId}-${winner.walletAddress}-${winner.program}`}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 shrink-0 text-accent" />
                        <p className="truncate font-retro text-sm text-foreground">{shortenAddress(winner.walletAddress)}</p>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {formatDate(winner.date || winner.createdAt)} - {winner.epochLabel || "Weekly"} - {winnerType(winner)}
                      </p>
                    </div>
                    <p className="shrink-0 font-retro text-sm text-foreground">
                      {formatNativeAmount(winner.amount || winner.payoutAmount, winner.chainId)} {winner.tokenSymbol || nativeSymbol(winner.chainId)}
                    </p>
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
