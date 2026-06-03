import { useEffect, useMemo, useRef, useState } from "react";
import { Swords, Target, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Battle } from "@/features/postgrad/contracts";
import { PostGradCoinCard } from "@/components/postgrad/PostGradCoinCard";
import {
  type RivalCandidate,
  type BattlefieldMetrics,
  getOpenRivals,
  rankRivalsBySimilarity,
  calculateBattlefieldSimilarity,
  extractBattlefieldMetrics,
  formatCompactBattleMetric,
} from "@/lib/battle/battleSimilarity";

type ScanPhase = "idle" | "scanning" | "locked";

interface BattlefieldMatrixScannerProps {
  openForBattleQueue: Battle[];
  userCoins: Array<{
    campaignAddress: string;
    name: string;
    ticker: string;
    marketCap?: string | number;
  }>;
  onChallenge: (battleId: string, rivalName: string, rivalSymbol: string) => void;
  className?: string;
}

const MATRIX_ROWS = 9;
const SCAN_DURATION_MS = 2850;
const TICK_INTERVAL = 85;

const FLAIR_LABELS = ["COHESION", "MOMENTUM", "HEAT", "SYNERGY", "TACTICAL", "VELOCITY", "RATING", "SIGMA"] as const;

function generateFlairLine(baseMetrics: BattlefieldMetrics, seed: number, row: number): string {
  const idx = (seed + row) % FLAIR_LABELS.length;
  const label = FLAIR_LABELS[idx];
  // Derive fancy numbers from real metrics + deterministic noise
  const mc = baseMetrics.marketCapUsd || 42000;
  const h = baseMetrics.holderCount || 420;
  const v = baseMetrics.volumeUsd || 18000;

  const n1 = ((mc * (0.7 + ((seed * 7 + row) % 17) / 41)) % 97) + 3;
  const n2 = ((h * (0.6 + ((seed * 11 + row * 3) % 13) / 29)) % 88) + 11;
  const n3 = ((v * (0.55 + ((seed * 5 + row * 2) % 19) / 37)) % 94) + 6;

  return `${label} ${n1.toFixed(1)}  H${n2.toFixed(0)}  V${n3.toFixed(0)}`;
}

function formatRealLine(p: BattleParticipant | any, metrics: BattlefieldMetrics): string {
  const sym = String(p?.symbol || p?.tokenName || "???").toUpperCase().slice(0, 6);
  const mc = formatCompactBattleMetric(metrics.marketCapUsd, "mc");
  const h = formatCompactBattleMetric(metrics.holderCount, "holders");
  const v = formatCompactBattleMetric(metrics.volumeUsd, "vol");
  return `${sym}  MC${mc}  H${h}  VOL${v}`;
}

export function BattlefieldMatrixScanner({
  openForBattleQueue,
  userCoins,
  onChallenge,
  className = "",
}: BattlefieldMatrixScannerProps) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [matrixLines, setMatrixLines] = useState<string[][]>([]);
  const [lockedRival, setLockedRival] = useState<RivalCandidate | null>(null);
  const [scanMessage, setScanMessage] = useState("BATTLEFIELD QUIET");
  const [liveSimilarities, setLiveSimilarities] = useState<number[]>([]);
  const [selectedRefIndex, setSelectedRefIndex] = useState(0); // which of user's coins to use as reference

  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const openRivals = useMemo(() => getOpenRivals(openForBattleQueue), [openForBattleQueue]);

  // Reference coin selection (user can choose which of their coins to match against)
  const selectedReferenceCoin = userCoins[selectedRefIndex] || userCoins[0];

  // Pre-compute ranked list based on the currently selected reference coin (client-side, instant)
  const { rankedRivals, referenceMetrics, referenceLabel } = useMemo(() => {
    if (!openRivals.length) return { rankedRivals: [] as RivalCandidate[], referenceMetrics: null as BattlefieldMetrics | null, referenceLabel: "No reference" };

    let ref: BattlefieldMetrics | null = null;
    let label = "Average";

    if (selectedReferenceCoin) {
      const mc = typeof selectedReferenceCoin.marketCap === "number"
        ? selectedReferenceCoin.marketCap
        : parseFloat(String(selectedReferenceCoin.marketCap || "0").replace(/[^0-9.]/g, "")) || 25000;

      ref = {
        marketCapUsd: Math.max(4000, mc),
        holderCount: Math.max(100, Math.floor(Math.sqrt(mc) * 2.0)),
        volumeUsd: Math.max(2500, Math.floor(mc * 0.65)),
      };
      label = `${selectedReferenceCoin.ticker || selectedReferenceCoin.name}`;
    }

    if (!ref) {
      const top = openRivals.slice(0, 3);
      const avgMc = top.reduce((s, r) => s + r.metrics.marketCapUsd, 0) / (top.length || 1);
      const avgH = top.reduce((s, r) => s + r.metrics.holderCount, 0) / (top.length || 1);
      const avgV = top.reduce((s, r) => s + r.metrics.volumeUsd, 0) / (top.length || 1);
      ref = {
        marketCapUsd: avgMc || 38000,
        holderCount: Math.floor(avgH) || 380,
        volumeUsd: avgV || 21000,
      };
    }

    const ranked = rankRivalsBySimilarity(openRivals, ref);
    return { rankedRivals: ranked, referenceMetrics: ref, referenceLabel: label };
  }, [openRivals, selectedReferenceCoin]);

  const topCurated = useMemo(() => rankedRivals.slice(0, 4), [rankedRivals]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const stopScan = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPhase("idle");
    setProgress(0);
    setMatrixLines([]);
  };

  const startAutoselectScan = () => {
    if (!rankedRivals.length) {
      setScanMessage("NO OPEN RIVALS DETECTED");
      return;
    }

    stopScan();
    setPhase("scanning");
    setProgress(0);
    setLockedRival(null);
    setLiveSimilarities(rankedRivals.map(() => Math.random() * 0.35 + 0.25)); // start noisy
    setScanMessage("ANALYZING BATTLEFIELD — DEPLOYING MATRIX");

    startTimeRef.current = Date.now();

    // Seed the initial matrix with a mix of real + flair lines from all candidates
    const initial: string[][] = Array.from({ length: 5 }, (_, col) => {
      const rival = rankedRivals[col % rankedRivals.length];
      return Array.from({ length: MATRIX_ROWS }, (_, row) => {
        if (row % 2 === 0 && rival) {
          return formatRealLine(rival.participant, rival.metrics);
        }
        return generateFlairLine(rival?.metrics || { marketCapUsd: 42000, holderCount: 420, volumeUsd: 19000 }, col * 17 + row, row);
      });
    });
    setMatrixLines(initial);

    // Rapid matrix rain tick
    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const p = Math.min(1, elapsed / SCAN_DURATION_MS);
      setProgress(p);

      // Update live similarity "evaluations" — they converge toward the real ranked values (very cool effect)
      setLiveSimilarities((prev) => {
        return rankedRivals.map((rival, idx) => {
          const target = rival.similarity ?? 0.5;
          const current = prev[idx] ?? 0.4;
          const noise = (1 - p) * (Math.sin(elapsed / 180 + idx) * 0.11);
          return Math.max(0.12, Math.min(0.99, current * 0.62 + target * 0.38 + noise));
        });
      });

      // Update matrix columns — each tick, shift + inject fresh intel lines
      setMatrixLines((prev) => {
        return prev.map((col, colIdx) => {
          const rival = rankedRivals[colIdx % rankedRivals.length];
          const base = rival?.metrics || { marketCapUsd: 38000, holderCount: 300, volumeUsd: 15000 };

          // Scroll effect: drop top, append new
          const next = col.slice(1);
          const rowIdx = Math.floor(elapsed / TICK_INTERVAL) + colIdx * 3;
          const useReal = (rowIdx % 3) === 0 && rival;

          const newLine = useReal
            ? formatRealLine(rival.participant, rival.metrics)
            : generateFlairLine(base, colIdx * 31 + rowIdx, rowIdx % MATRIX_ROWS);

          next.push(newLine);
          return next;
        });
      });

      // Dynamic header messages during scan
      if (p > 0.82) setScanMessage("CONVERGING ON OPTIMAL RIVAL — SIMILARITY VECTOR LOCKED");
      else if (p > 0.61) setScanMessage("NORMALIZING MC / HOLDERS / VOLUME — CROSS REFERENCING");
      else if (p > 0.33) setScanMessage("INGESTING OPEN QUEUE METRICS — PHANTOM BATTLE PROFILES ACTIVE");

      if (elapsed >= SCAN_DURATION_MS) {
        // Lock the winner (highest similarity from pre-ranked list)
        const winner = rankedRivals[0];
        setLockedRival(winner);
        setPhase("locked");
        setScanMessage(`RIVAL ACQUIRED — SIMILARITY ${(winner.similarity ?? 0.87).toFixed(2)}`);
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, TICK_INTERVAL);
  };

  const confirmLockedRival = () => {
    if (!lockedRival) return;
    const p = lockedRival.participant;
    const name = String(p?.tokenName || p?.symbol || "Unknown rival");
    const sym = String(p?.symbol || "???");
    onChallenge(lockedRival.battle.id, name, sym);
    // Reset after action
    setTimeout(() => {
      stopScan();
      setLockedRival(null);
    }, 180);
  };

  const resetAfterLock = () => {
    stopScan();
    setLockedRival(null);
  };

  const hasRivals = openRivals.length > 0;

  return (
    <div className={`mwz-hud-frame p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Target className="h-4 w-4 text-accent" />
          <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Find a Rival — Open for Battle</span>
        </div>
        <div className="font-retro text-[10px] text-muted-foreground">
          {hasRivals ? `${openRivals.length} OPEN` : "QUEUE EMPTY"}
        </div>
      </div>

      {/* Reference coin selector - big usability + "manual pick → autoselect" flow */}
      {userCoins.length > 1 && phase === "idle" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Matching against:</span>
          {userCoins.map((coin, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRefIndex(idx)}
              className={`rounded px-2 py-0.5 font-retro transition ${selectedRefIndex === idx
                ? "bg-accent/20 text-accent border border-accent/50"
                : "border border-border/40 hover:bg-card/40 text-muted-foreground"
              }`}
            >
              ${coin.ticker || coin.name}
            </button>
          ))}
        </div>
      )}

      {/* Curated quick list (always visible, pre-fetched) */}
      {phase === "idle" && (
        <>
          {hasRivals ? (
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              {topCurated.map((r, idx) => {
                const p = r.participant;
                const sim = r.similarity ?? calculateBattlefieldSimilarity(referenceMetrics || r.metrics, r.metrics);
                return (
                  <PostGradCoinCard
                    key={`${r.battle.id}-${idx}`}
                    imageUrl={p?.imageUrl || p?.logoUri}
                    name={p?.tokenName || p?.symbol || "Rival"}
                    symbol={p?.symbol}
                    metrics={
                      <div className="text-sm">
                        <div className="text-muted-foreground">
                          MC {formatCompactBattleMetric(r.metrics.marketCapUsd, "mc")} · H {formatCompactBattleMetric(r.metrics.holderCount, "holders")} · V {formatCompactBattleMetric(r.metrics.volumeUsd, "vol")}
                        </div>
                        <div className="mt-1 text-accent font-retro text-xs">
                          {(sim * 100).toFixed(0)}% MATCH vs {referenceLabel}
                        </div>
                      </div>
                    }
                    actions={
                      <Button
                        size="sm"
                        onClick={() => {
                          setLockedRival(r);
                          setPhase("locked");
                          setScanMessage(`MANUAL LOCK — SIMILARITY ${sim.toFixed(2)}`);
                        }}
                      >
                        Analyze
                      </Button>
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="mb-3 rounded border border-border/40 bg-card/10 p-3 text-sm text-muted-foreground">
              No coins currently waiting in the open-for-battle queue. Check back or open one of your own coins for battle.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={startAutoselectScan}
              disabled={!hasRivals}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              AUTODETECT BEST RIVAL FOR {referenceLabel.toUpperCase()}
            </Button>
            <div className="text-[10px] text-muted-foreground">
              Pre-fetched • MC/Holders/Volume vs your {referenceLabel}
            </div>
          </div>
        </>
      )}

      {/* The actual matrix scanner (replaces list while active) */}
      {(phase === "scanning" || phase === "locked") && (
        <div className="mt-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-retro text-sm text-accent flex items-center gap-2">
              {scanMessage}
              {phase === "scanning" && referenceLabel && (
                <span className="text-[10px] text-muted-foreground">· vs {referenceLabel}</span>
              )}
            </div>
            <button onClick={phase === "locked" ? resetAfterLock : stopScan} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Matrix rain area — pure CSS + rapid text updates for that "cool" feel */}
          <div className="relative overflow-hidden rounded border border-accent/30 bg-[#050706] p-3 font-mono text-[10px] leading-[1.05] tracking-[0.5px] text-emerald-400/90">
            {/* Subtle scanline overlay */}
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(transparent,transparent_2px,rgba(255,122,26,0.035)_2px,rgba(255,122,26,0.035)_3px)]" />

            {/* Live similarity convergence row — makes the "autoselect" feel magical */}
            {phase === "scanning" && liveSimilarities.length > 0 && (
              <div className="mb-2 grid grid-cols-5 gap-1.5 text-[9px] font-retro text-orange-400/80">
                {liveSimilarities.map((sim, idx) => (
                  <div key={idx} className="text-center tabular-nums">
                    {(sim * 100).toFixed(0)}%
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-5 gap-1.5">
              {matrixLines.length > 0 ? (
                matrixLines.map((col, colIdx) => {
                  const isLeading = phase === "scanning" && liveSimilarities.length > 0 && 
                    liveSimilarities[colIdx] === Math.max(...liveSimilarities);
                  return (
                    <div
                      key={colIdx}
                      className={`space-y-px overflow-hidden border-r border-white/5 pr-1 last:border-r-0 transition-all duration-200 ${isLeading ? "scale-[1.03] ring-1 ring-accent/60 bg-accent/5" : ""}`}
                    >
                      {col.map((line, rowIdx) => (
                        <div
                          key={rowIdx}
                          className={`truncate transition-all ${isLeading ? "text-emerald-300" : "text-emerald-400/80"}`}
                          style={{
                            opacity: 0.55 + ((rowIdx % 3) * 0.12),
                            transform: phase === "scanning" ? `translateY(${((Date.now() / 40) % 3) - 1}px)` : undefined,
                          }}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-5 py-6 text-center text-muted-foreground">DEPLOYING INTEL MATRIX...</div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-px w-full bg-white/10">
              <div
                className="h-px bg-accent transition-all"
                style={{ width: `${Math.floor(progress * 100)}%` }}
              />
            </div>
          </div>

          {phase === "locked" && lockedRival && (
            <div className="mwz-hud-frame border-accent/70 bg-accent/5 p-4">
              {/* Mini VS Preview */}
              <div className="mb-3 flex items-center justify-center gap-4 text-center">
                <div className="min-w-[110px]">
                  <div className="font-retro text-[10px] text-muted-foreground">YOUR COIN</div>
                  <div className="font-retro text-sm text-foreground">{referenceLabel}</div>
                </div>

                <div className="font-retro text-accent text-lg tracking-[3px] px-2">VS</div>

                <div className="min-w-[110px]">
                  <div className="font-retro text-[10px] text-muted-foreground">RIVAL</div>
                  <div className="font-retro text-sm text-foreground">
                    {lockedRival.participant?.symbol || lockedRival.participant?.tokenName}
                  </div>
                </div>
              </div>

              {/* Why this match? - metric breakdown */}
              <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                {(() => {
                  const ref = referenceMetrics || { marketCapUsd: 0, holderCount: 0, volumeUsd: 0 };
                  const riv = lockedRival.metrics;
                  const mcDiff = ((riv.marketCapUsd - ref.marketCapUsd) / (ref.marketCapUsd || 1)) * 100;
                  const hDiff = ((riv.holderCount - ref.holderCount) / (ref.holderCount || 1)) * 100;
                  const vDiff = ((riv.volumeUsd - ref.volumeUsd) / (ref.volumeUsd || 1)) * 100;

                  return (
                    <>
                      <div className="rounded bg-card/30 p-1.5">
                        <div className="text-muted-foreground">Market Cap</div>
                        <div className="font-retro text-foreground">{(mcDiff > 0 ? "+" : "")}{mcDiff.toFixed(0)}%</div>
                      </div>
                      <div className="rounded bg-card/30 p-1.5">
                        <div className="text-muted-foreground">Holders</div>
                        <div className="font-retro text-foreground">{(hDiff > 0 ? "+" : "")}{hDiff.toFixed(0)}%</div>
                      </div>
                      <div className="rounded bg-card/30 p-1.5">
                        <div className="text-muted-foreground">Volume</div>
                        <div className="font-retro text-foreground">{(vDiff > 0 ? "+" : "")}{vDiff.toFixed(0)}%</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-retro text-base text-foreground">
                    RIVAL LOCKED — {(lockedRival.similarity ?? 0).toFixed(2)} SIMILARITY
                  </div>
                  <div className="text-xs text-muted-foreground">
                    MC {formatCompactBattleMetric(lockedRival.metrics.marketCapUsd, "mc")} · 
                    Holders {formatCompactBattleMetric(lockedRival.metrics.holderCount, "holders")} · 
                    Vol {formatCompactBattleMetric(lockedRival.metrics.volumeUsd, "vol")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={resetAfterLock}>
                    SCAN AGAIN
                  </Button>
                  <Button size="sm" onClick={confirmLockedRival} className="gap-2">
                    <Swords className="h-4 w-4" />
                    INITIATE CHALLENGE
                  </Button>
                </div>
              </div>
            </div>
          )}

          {phase === "scanning" && (
            <div className="text-[10px] text-muted-foreground">
              All calculations performed client-side on pre-fetched queue. No server roundtrip during scan.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
