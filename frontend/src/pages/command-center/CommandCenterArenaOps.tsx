import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, Database, Flame, ShieldAlert, Trophy } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";
import { useArenaEventFeed, type ArenaEventSummary } from "@/hooks/useArenaEventFeed";
import { useArenaLeagueFeed } from "@/hooks/useArenaLeagueFeed";
import { useArenaWarPoolSummary } from "@/hooks/useArenaWarPoolFeed";

type Notice = {
  tone: "success" | "error";
  message: string;
};

type EventStatus = ArenaEventSummary["status"];

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

export default function CommandCenterArenaOps() {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const battles = useArenaBattleFeed();
  const events = useArenaEventFeed();
  const league = useArenaLeagueFeed();
  const warPools = useArenaWarPoolSummary();

  const liveBattleCount = battles.liveBattles.length;
  const queuedBattleCount = battles.openForBattleQueue.length;
  const archivedBattleCount = battles.archivedBattles.length;
  const liveEvents = events.events.filter((event) => event.status === "live");
  const scheduledEvents = events.events.filter((event) => event.status === "scheduled" || event.status === "deploying");

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

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Arena Ops"
        description="Private operational controls for the Arena runtime: battles, War Pools, events, and league state."
      />

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

      <CommandCenterCard title="Battle queues" description="Database-backed queue and live battle overview.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="mwz-hud-frame p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Open queue</div>
            <div className="mt-2 font-retro text-3xl text-foreground">{queuedBattleCount}</div>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to="/arena">Open Arena</Link>
            </Button>
          </div>
          <div className="mwz-hud-frame p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Live battles</div>
            <div className="mt-2 font-retro text-3xl text-foreground">{liveBattleCount}</div>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to="/arena/battles">Battle board</Link>
            </Button>
          </div>
          <div className="mwz-hud-frame p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Archived</div>
            <div className="mt-2 font-retro text-3xl text-foreground">{archivedBattleCount}</div>
            <p className="mt-4 text-xs text-muted-foreground">Settled/completed battle snapshots returned by the API.</p>
          </div>
        </div>
      </CommandCenterCard>

      <CommandCenterCard title="Event controls" description="Move Arena events through scheduled, deploying, live, and completed states.">
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

      <CommandCenterCard title="War Pool monitor" description="Durable War Pool summary from the Arena War Pool API.">
        {warPools.summary.pools.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warPools.summary.pools.map((pool) => (
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
              </div>
            ))}
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
