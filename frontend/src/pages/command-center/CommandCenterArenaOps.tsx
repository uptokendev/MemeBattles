import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, Database, Flame, RefreshCw, ShieldAlert, Trophy } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import type { Battle } from "@/features/postgrad/contracts";
import { fetchPostGradArenaOpsHealth, transitionPostGradBattle } from "@/features/postgrad/apiClient";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed, type ArenaEventSummary } from "@/hooks/useArenaEventFeed";
import { useArenaLeagueFeed } from "@/hooks/useArenaLeagueFeed";
import { useArenaWarPoolSummary, type ArenaWarPoolState } from "@/hooks/useArenaWarPoolFeed";

type Notice = {
  tone: "success" | "error";
  message: string;
};

type EventStatus = ArenaEventSummary["status"];
type BattleState = Battle["state"];

type ArenaOpsHealthCheck = {
  key: string;
  label: string;
  table: string;
  ok: boolean;
  count: number;
  error?: string;
};

type ArenaOpsHealth = {
  ok: boolean;
  databaseOk: boolean;
  databaseError?: string | null;
  checks: ArenaOpsHealthCheck[];
  missingTables: string[];
  importedTables: string[];
  durationMs: number;
  updatedAt: string;
};

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(source: string) {
  if (source === "api") return "Database API";
  if (source === "qa-runtime") return "QA Runtime";
  return "Empty";
}

function getNextEventStatus(status: EventStatus): EventStatus | null {
  if (status === "scheduled") return "deploying";
  if (status === "deploying") return "live";
  if (status === "live") return "completed";
  return null;
}

function getNextWarPoolState(state: ArenaWarPoolState): ArenaWarPoolState | null {
  if (state === "open") return "locked";
  if (state === "locked") return "settling";
  if (state === "settling") return "paid";
  return null;
}

function getBattlePrimaryAction(state: BattleState): BattleState | null {
  if (state === "open_for_battle") return "pending";
  if (state === "pending") return "accepted";
  if (state === "accepted") return "live";
  if (state === "live") return "completed";
  if (state === "completed") return "settled";
  return null;
}

function battleLabel(battle: Battle) {
  const [left, right] = battle.participants;
  return `${left?.symbol || left?.tokenName || "Left"} vs ${right?.symbol || right?.tokenName || "Right"}`;
}

async function transitionBattleViaApi(battleId: string, state: BattleState) {
  return transitionPostGradBattle(battleId, state);
}

async function fetchArenaOpsHealth(): Promise<ArenaOpsHealth | null> {
  const payload = await fetchPostGradArenaOpsHealth();
  if (!payload || typeof payload !== "object") return null;
  return payload as ArenaOpsHealth;
}

export default function CommandCenterArenaOps() {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [health, setHealth] = useState<ArenaOpsHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const battles = useArenaBattleFeed();
  const events = useArenaEventFeed();
  const league = useArenaLeagueFeed();
  const warPools = useArenaWarPoolSummary();

  const liveBattleCount = battles.liveBattles.length;
  const queuedBattleCount = battles.openForBattleQueue.length;
  const archivedBattleCount = battles.archivedBattles.length;
  const liveEvents = events.events.filter((event) => event.status === "live");
  const scheduledEvents = events.events.filter((event) => event.status === "scheduled" || event.status === "deploying");
  const allBattles = [...battles.openForBattleQueue, ...battles.liveBattles];

  const refreshHealth = async () => {
    setHealthLoading(true);
    const nextHealth = await fetchArenaOpsHealth().catch(() => null);
    setHealth(nextHealth);
    setHealthLoading(false);
    return Boolean(nextHealth);
  };

  useEffect(() => {
    void refreshHealth();
  }, []);

  const runAction = async (label: string, action: () => Promise<boolean>) => {
    setBusyAction(label);
    setNotice(null);
    try {
      const ok = await action();
      setNotice({ tone: ok ? "success" : "error", message: ok ? `${label} complete.` : `${label} failed. Check API logs or eligibility.` });
    } catch (error: any) {
      setNotice({ tone: "error", message: error?.message || `${label} failed.` });
    } finally {
      setBusyAction(null);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      battles.refreshFeed(),
      events.refreshFeed(),
      league.refreshFeed(),
      warPools.refreshSummary(),
      refreshHealth(),
    ]);
    return true;
  };

  const transitionBattle = async (battleId: string, state: BattleState) => {
    const ok = await transitionBattleViaApi(battleId, state);
    if (ok) {
      await Promise.all([battles.refreshFeed(), warPools.refreshSummary(), refreshHealth()]);
    }
    return ok;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <CommandCenterPageHeader
          title="Arena Ops"
          description="Private operational controls for the Arena runtime: battles, War Pools, events, and league state."
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busyAction === "Refresh ops data"}
          onClick={() => void runAction("Refresh ops data", refreshAll)}
          className="w-fit"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh ops data
        </Button>
      </div>

      {notice ? (
        <div className={`mwz-hud-frame p-3 text-sm ${notice.tone === "error" ? "text-rose-100" : "text-muted-foreground"}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="mwz-hud-frame p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Battle API</span>
          </div>
          <div className="font-retro text-xl text-foreground">{sourceLabel(battles.source)}</div>
          <div className="mt-2 text-xs text-muted-foreground">{queuedBattleCount} queued · {liveBattleCount} live</div>
        </div>

        <div className="mwz-hud-frame p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Flame className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">War Pools</span>
          </div>
          <div className="font-retro text-xl text-foreground">{formatUsd(warPools.summary.totalPotUsd)}</div>
          <div className="mt-2 text-xs text-muted-foreground">{warPools.summary.openPools} open · {warPools.summary.lockedPools} locked</div>
        </div>

        <div className="mwz-hud-frame p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">Events</span>
          </div>
          <div className="font-retro text-xl text-foreground">{events.events.length}</div>
          <div className="mt-2 text-xs text-muted-foreground">{liveEvents.length} live · {scheduledEvents.length} scheduled</div>
        </div>

        <div className="mwz-hud-frame p-4">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Trophy className="h-4 w-4 text-accent" />
            <span className="font-retro text-[10px] uppercase tracking-[0.16em]">League</span>
          </div>
          <div className="font-retro text-xl text-foreground">Week {league.season.week}</div>
          <div className="mt-2 text-xs text-muted-foreground">{league.season.label} · {league.season.state}</div>
        </div>
      </div>

      <CommandCenterCard title="Import health" description="Confirms the Arena and sponsorship tables are available in the active database.">
        {health ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <TacticalTag label={health.ok ? "all imports online" : "missing imports"} tone={health.ok ? "success" : "hot"} />
                <span className="text-xs text-muted-foreground">DB {health.databaseOk ? "connected" : "offline"} · checked {formatDateTime(health.updatedAt)} · {health.durationMs}ms</span>
              </div>
              <Button size="sm" variant="outline" disabled={healthLoading} onClick={() => void runAction("Refresh import health", refreshHealth)}>
                {healthLoading ? "Checking..." : "Refresh health"}
              </Button>
            </div>
            {health.databaseError ? <div className="mwz-hud-frame p-3 text-xs text-rose-100">{health.databaseError}</div> : null}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {health.checks.map((check) => (
                <div key={check.key} className="mwz-hud-frame p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">{check.label}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{check.table}</div>
                    </div>
                    <TacticalTag label={check.ok ? "ok" : "missing"} tone={check.ok ? "success" : "hot"} />
                  </div>
                  <div className="mt-3 font-retro text-xl text-foreground">{check.count.toLocaleString()}</div>
                  {check.error ? <div className="mt-2 line-clamp-2 text-[11px] text-rose-100">{check.error}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">
            {healthLoading ? "Checking Arena imports..." : "Arena import health is not available yet."}
          </div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Battle controls" description="Advance active battle records from queue to live, completed, and settled states.">
        {allBattles.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {allBattles.slice(0, 8).map((battle) => {
              const nextState = getBattlePrimaryAction(battle.state);
              const cancelable = battle.state === "open_for_battle" || battle.state === "pending" || battle.state === "accepted";
              return (
                <div key={battle.id} className="mwz-hud-frame p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-retro text-base text-foreground">{battleLabel(battle)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{battle.id}</div>
                    </div>
                    <TacticalTag label={battle.state.replaceAll("_", " ")} tone={battle.state === "live" ? "hot" : battle.state === "settled" ? "success" : "sponsored"} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/battle/${battle.id}`}>Open battle</Link>
                    </Button>
                    {nextState ? (
                      <Button size="sm" disabled={busyAction === `Battle ${nextState}`} onClick={() => void runAction(`Battle ${nextState}`, () => transitionBattle(battle.id, nextState))}>
                        Move to {nextState.replaceAll("_", " ")}
                      </Button>
                    ) : null}
                    {cancelable ? (
                      <Button size="sm" variant="outline" disabled={busyAction === "Cancel battle"} onClick={() => void runAction("Cancel battle", () => transitionBattle(battle.id, "cancelled"))}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">No active battle records returned by the API.</div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="Event controls" description="Move events through scheduled, deploying, live, and completed states.">
        {events.events.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {events.events.map((event) => {
              const nextStatus = getNextEventStatus(event.status);
              const canAdvanceBracket = event.type === "tournament" && event.bracketStage !== "completed";
              return (
                <div key={event.id} className="mwz-hud-frame p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-retro text-base text-foreground">{event.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{event.type.replaceAll("_", " ")} · {event.participantCount} participants</div>
                    </div>
                    <TacticalTag label={event.status} tone={event.status === "live" ? "hot" : event.status === "completed" ? "default" : "sponsored"} />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{event.summary}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Starts {formatDateTime(event.startsAt)}</span>
                    <span>Ends {formatDateTime(event.endsAt)}</span>
                    {event.bracketStage ? <span>Bracket {event.bracketStage}</span> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {nextStatus ? (
                      <Button size="sm" disabled={busyAction === `Event ${nextStatus}`} onClick={() => void runAction(`Event ${nextStatus}`, () => events.transitionEvent(event.id, nextStatus))}>
                        Move to {nextStatus}
                      </Button>
                    ) : null}
                    {canAdvanceBracket ? (
                      <Button size="sm" variant="outline" disabled={busyAction === "Advance bracket"} onClick={() => void runAction("Advance bracket", () => events.advanceTournamentBracket(event.id))}>
                        Advance bracket
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">No active events returned by the API.</div>
        )}
      </CommandCenterCard>

      <CommandCenterCard title="League controls" description="Advance weekly scores, rebalance divisions, and cycle season state.">
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="mwz-hud-frame p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4 text-accent" />
              Source: {sourceLabel(league.source)}
            </div>
            <div className="mt-3 font-retro text-xl text-foreground">{league.season.label}</div>
            <div className="mt-2 text-sm text-muted-foreground">State {league.season.state} · Week {league.season.week} · Pool {formatUsd(league.season.rewardPoolUsd)}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={busyAction === "Advance week"} onClick={() => void runAction("Advance week", league.advanceWeek)}>
                Advance week
              </Button>
              <Button size="sm" variant="outline" disabled={busyAction === "Rebalance divisions"} onClick={() => void runAction("Rebalance divisions", league.rebalanceDivisions)}>
                Rebalance divisions
              </Button>
              <Button size="sm" variant="outline" disabled={busyAction === "Cycle season"} onClick={() => void runAction("Cycle season", league.cycleSeasonState)}>
                Cycle season
              </Button>
            </div>
          </div>

          <div className="mwz-hud-frame p-4">
            <div className="mb-3 font-retro text-sm uppercase tracking-[0.14em] text-muted-foreground">Top standings</div>
            <div className="space-y-2">
              {league.season.entries.slice(0, 6).map((entry, index) => (
                <div key={entry.tokenId} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">#{index + 1} {entry.tokenName} <span className="text-muted-foreground">${entry.symbol}</span></div>
                    <div className="text-xs text-muted-foreground">{entry.division} · {entry.wins}-{entry.losses} · streak {entry.streak}</div>
                  </div>
                  <div className="font-retro text-sm text-accent">{entry.points}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CommandCenterCard>

      <CommandCenterCard title="War Pool controls" description="Monitor and advance durable War Pool settlement state.">
        {warPools.summary.pools.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warPools.summary.pools.map((pool) => {
              const nextState = getNextWarPoolState(pool.state);
              return (
                <div key={pool.battleId} className="mwz-hud-frame p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-retro text-sm text-foreground">{pool.battleId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Cutoff {formatDateTime(pool.cutoffAt)}</div>
                    </div>
                    <TacticalTag label={pool.state} tone={pool.state === "open" ? "success" : pool.state === "paid" ? "default" : "sponsored"} />
                  </div>
                  <div className="mt-4 font-retro text-xl text-foreground">{formatUsd(pool.totalPotUsd)}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{pool.entries.length} support entries</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/battle/${pool.battleId}`}>Battle detail</Link>
                    </Button>
                    {nextState ? (
                      <Button size="sm" disabled={busyAction === `War Pool ${nextState}`} onClick={() => void runAction(`War Pool ${nextState}`, () => warPools.transitionWarPool(pool.battleId, nextState))}>
                        Move to {nextState}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mwz-hud-frame p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mr-2 inline h-4 w-4 text-accent" />
            No War Pools have been created yet. Opening a battle detail page creates the pool record.
          </div>
        )}
      </CommandCenterCard>
    </div>
  );
}
