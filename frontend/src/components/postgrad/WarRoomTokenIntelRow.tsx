import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Coins, Gauge, Radar, ShieldCheck, Swords, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import type { ResolvedMockTokenProfile } from "@/features/postgrad/mockWarRoomRuntime";
import { getMockBattleById, getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import { useMockQuickTrades } from "@/hooks/useMockQuickTradeRuntime";
import { useMockWarPool } from "@/hooks/useMockWarPoolRuntime";

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const sentimentTone = {
  heating_up: "hot",
  stable: "success",
  volatile: "sponsored",
} as const;

const sentimentLabel = {
  heating_up: "Heating up",
  stable: "Stable",
  volatile: "Volatile",
} as const;

const styleLabel = {
  momentum: "Momentum",
  holder_grind: "Holder grind",
  whale_surge: "Whale surge",
  community_swarm: "Community swarm",
} as const;

const quickTradeStatusTone = {
  filled: "success",
  queued: "sponsored",
  rejected: "hot",
} as const;

export function WarRoomTokenIntelRow({
  token,
  onToggleWatch,
}: {
  token: ResolvedMockTokenProfile;
  onToggleWatch: (tokenId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quickTradeSide, setQuickTradeSide] = useState<"buy" | "sell">("buy");
  const [quickTradeSize, setQuickTradeSize] = useState(500);
  const battle = token.relatedBattleId ? getMockBattleById(token.relatedBattleId) : null;
  const { pool, supportWarPoolSide } = useMockWarPool(token.relatedBattleId);
  const { trades, submitMockQuickTrade, resetMockQuickTradeRuntime } = useMockQuickTrades(token.id);
  const tokenRoute = getMockTokenRouteById(token.id);

  const tokenPoolUsd = useMemo(() => {
    return pool?.entries.filter((entry) => entry.sideTokenId === token.id).reduce((total, entry) => total + entry.amountUsd, 0) ?? 0;
  }, [pool, token.id]);

  const tokenPoolShare = pool && pool.totalPotUsd > 0 ? Math.round((tokenPoolUsd / pool.totalPotUsd) * 100) : 0;
  const opponent = battle?.participants.find((participant) => participant.tokenId !== token.id && !participant.tokenId.startsWith("pending-"));
  const selfParticipant = battle?.participants.find((participant) => participant.tokenId === token.id);
  const latestTrade = trades[0] ?? null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="min-w-0 flex-1 rounded-xl text-left transition-colors hover:bg-white/5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-white">{token.name}</div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">{token.symbol}</div>
            <TacticalTag label={sentimentLabel[token.sentiment]} tone={sentimentTone[token.sentiment]} />
            <TacticalTag label={styleLabel[token.battleStyle]} tone="default" />
            {token.watched ? <TacticalTag label="Watched" tone="success" /> : null}
            {token.relatedBattleId ? <TacticalTag label="Battle linked" tone="hot" /> : null}
            {latestTrade ? <TacticalTag label={`Trade ${latestTrade.status}`} tone={quickTradeStatusTone[latestTrade.status]} /> : null}
          </div>
          <div className="mt-2 text-xs text-white/55">
            MC {formatUsd(token.marketCapUsd)} · Liquidity {formatUsd(token.liquidityUsd)} · Holders {token.holders.toLocaleString()} · Watchlists {token.effectiveWatchlistCount.toLocaleString()}
          </div>
          <div className="mt-2 text-sm text-white/70">{token.thesis}</div>
        </button>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button size="sm" variant={token.watched ? "default" : "outline"} onClick={() => onToggleWatch(token.id)}>
            {token.watched ? "Remove watch" : "Watch token"}
          </Button>
          {token.relatedBattleId ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/battle/${token.relatedBattleId}`}>Open battle</Link>
            </Button>
          ) : null}
          {tokenRoute ? (
            <Button asChild size="sm" variant="outline">
              <Link to={tokenRoute}>Open token</Link>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Gauge className="h-3.5 w-3.5" />Heat score</div>
                <div className="mt-1 text-sm font-semibold text-white">{token.sentiment === "heating_up" ? "98" : token.sentiment === "volatile" ? "84" : "72"}/100</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Radar className="h-3.5 w-3.5" />Intel lane</div>
                <div className="mt-1 text-sm font-semibold text-white">{styleLabel[token.battleStyle]}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45"><Coins className="h-3.5 w-3.5" />War Pool</div>
                <div className="mt-1 text-sm font-semibold text-white">{pool ? `${formatUsd(tokenPoolUsd)} · ${tokenPoolShare}%` : "No pool"}</div>
              </div>
            </div>

            {battle ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-accent/80"><Swords className="h-4 w-4" />Battle context</div>
                    <div className="mt-2 text-sm text-white/70">
                      {token.symbol} is matched against {opponent ? `${opponent.tokenName} (${opponent.symbol})` : "an awaiting rival"}. Current score: {selfParticipant?.score.toFixed(1) ?? "0.0"}.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TacticalTag label={battle.state.replaceAll("_", " ")} tone="hot" />
                    {pool ? <TacticalTag label={`Pool ${pool.state}`} tone={pool.state === "open" ? "success" : pool.state === "locked" ? "hot" : "sponsored"} /> : null}
                  </div>
                </div>
                {pool && pool.state === "open" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[250, 500, 1000].map((amount) => (
                      <Button key={amount} size="sm" variant="outline" onClick={() => supportWarPoolSide(battle.id, token.id, amount)}>
                        Support {formatUsd(amount)} side
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                No active battle attached yet. This row is ready for quick-match routing later.
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-accent/80"><ShieldCheck className="h-4 w-4" />Commander notes</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {token.commanderNotes.slice(0, 4).map((note) => (
                  <div key={note} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">{note}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cyan-100/75"><Zap className="h-4 w-4" />Quick trade sandbox</div>
            <div className="mt-2 text-sm text-cyan-50/80">Frontend-only order ticket that simulates queue, fill, and rejection responses without sending a transaction.</div>
            <div className="mt-4 grid gap-3">
              <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                {(["buy", "sell"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setQuickTradeSide(side)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition-colors ${quickTradeSide === side ? "bg-white text-black" : "text-white/60 hover:bg-white/10"}`}
                  >
                    {side}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[250, 500, 1000].map((amount) => (
                  <Button key={amount} size="sm" variant={quickTradeSize === amount ? "default" : "outline"} onClick={() => setQuickTradeSize(amount)}>
                    {formatUsd(amount)}
                  </Button>
                ))}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
                Mock intent: <span className="text-white">{quickTradeSide.toUpperCase()} {token.symbol} for {formatUsd(quickTradeSize)}</span>
              </div>
              <Button
                className="w-full justify-center"
                onClick={() => submitMockQuickTrade({
                  tokenId: token.id,
                  side: quickTradeSide,
                  amountUsd: quickTradeSize,
                  source: "war_room",
                })}
              >
                Submit mock trade
              </Button>
              {latestTrade ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
                  <div className="flex flex-wrap items-center gap-2">
                    <TacticalTag label={latestTrade.status} tone={quickTradeStatusTone[latestTrade.status]} />
                    <span className="text-white">{latestTrade.executionPriceLabel}</span>
                  </div>
                  <div className="mt-2 text-xs text-white/55">Impact {latestTrade.estimatedImpactBps} bps · {latestTrade.statusDetail}</div>
                </div>
              ) : null}
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-white/55">
                  <span>Recent mock tickets</span>
                  <Button size="sm" variant="ghost" onClick={resetMockQuickTradeRuntime}>Clear</Button>
                </div>
                <div className="mt-2 space-y-2">
                  {trades.slice(0, 3).length ? (
                    trades.slice(0, 3).map((trade) => (
                      <div key={trade.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65">
                        <div className="flex flex-wrap items-center gap-2">
                          <TacticalTag label={trade.status} tone={quickTradeStatusTone[trade.status]} />
                          <span>{trade.side.toUpperCase()} {formatUsd(trade.amountUsd)}</span>
                        </div>
                        <div className="mt-1 text-white/50">{trade.executionPriceLabel} · {trade.estimatedImpactBps} bps</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-white/45">No mock tickets yet.</div>
                  )}
                </div>
              </div>
              {tokenRoute ? (
                <Link to={tokenRoute} className="flex items-center justify-center gap-2 text-xs text-cyan-100/80 hover:text-cyan-50">
                  Open token details
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
