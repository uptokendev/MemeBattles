import { Link } from "react-router-dom";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useMockEvents } from "@/hooks/useMockEventRuntime";

const statusActions = {
  scheduled: { label: "Deploy event", status: "deploying" as const },
  deploying: { label: "Go live", status: "live" as const },
  live: { label: "Complete event", status: "completed" as const },
  completed: null,
};

const bracketLabels = {
  registration: "Registration",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  finals: "Finals",
  completed: "Completed",
};

const eventTypeLabels = {
  battle_weekend: "Battle weekend",
  battle_night: "Battle night",
  featured_rivalry: "Featured rivalry",
  tournament: "Tournament",
  seasonal_league: "Seasonal league",
};

function formatWhen(value: string) {
  return new Date(value).toLocaleDateString();
}

function EventEntrantCard({ item }: { item: ArenaCampaignRailItem }) {
  return (
    <div className="min-w-[250px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TacticalTag label={item.rankLabel} tone="hot" />
        <TacticalTag label={item.statusLabel} tone={item.statusTone} />
      </div>
      <div className="mt-3 text-base font-semibold text-white">{item.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.24em] text-white/45">{item.symbol}</div>
      <div className="mt-3 text-xs text-white/60">{item.detail}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={item.href}>Token details</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/war-room?search=${encodeURIComponent(item.symbol || item.title)}`}>War Room</Link>
        </Button>
      </div>
    </div>
  );
}

function EventSurfaceCard({
  event,
  onAdvance,
  onAdvanceBracket,
}: {
  event: ReturnType<typeof useMockEvents>["events"][number];
  onAdvance: () => void;
  onAdvanceBracket?: () => void;
}) {
  const nextStatusAction = statusActions[event.status];
  const bracketLabel = event.type === "tournament" && event.bracketStage ? bracketLabels[event.bracketStage] : null;
  const tone = event.status === "live" ? "success" : event.type === "tournament" ? "sponsored" : "default";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TacticalTag label={eventTypeLabels[event.type]} tone={event.type === "tournament" ? "sponsored" : "default"} />
            <TacticalTag label={event.status} tone={tone} />
            {bracketLabel ? <TacticalTag label={bracketLabel} tone="hot" /> : null}
          </div>
          <div className="mt-3 text-lg font-semibold text-white">{event.title}</div>
          <div className="mt-2 text-sm text-white/65">{event.summary}</div>
          <div className="mt-3 text-xs text-white/55">
            {event.participantCount} participants · Starts {formatWhen(event.startsAt)} · Ends {formatWhen(event.endsAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.type === "tournament" ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/tournament/${event.id}`}>Open bracket</Link>
            </Button>
          ) : null}
          {postGradFlags.mocks && nextStatusAction ? (
            <Button size="sm" onClick={onAdvance}>
              {nextStatusAction.label}
            </Button>
          ) : null}
          {postGradFlags.mocks && event.type === "tournament" && event.status !== "completed" && onAdvanceBracket ? (
            <Button size="sm" variant="outline" onClick={onAdvanceBracket}>
              Advance bracket
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PostGradEvents = () => {
  const { events, archivedEvents, transitionMockEvent, advanceTournamentBracket } = useMockEvents();
  const { railItems: eventEntrants, hasRealCampaigns, loading: eventEntrantsLoading } = useArenaCampaignFeed(10);

  const liveEvents = events.filter((event) => event.status === "live");
  const upcomingEvents = events.filter((event) => event.status === "scheduled" || event.status === "deploying");
  const tournaments = events.filter((event) => event.type === "tournament");

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,20,26,0.94),rgba(8,9,12,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena events</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Scheduled competition, tournament watch, and event history.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">Track what is live, what is coming up next, which tournaments need attention, and what already completed in the Arena cycle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${liveEvents.length} live`} tone="success" />
            <TacticalTag label={`${upcomingEvents.length} upcoming`} tone="default" />
            <TacticalTag label={`${archivedEvents.length} archived`} tone="sponsored" />
            <TacticalTag label={`${hasRealCampaigns ? eventEntrants.length : 0} entrants`} tone="hot" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Live now</div>
          <div className="mt-2 text-lg font-semibold text-white">{liveEvents[0]?.title ?? "No live event"}</div>
          <div className="mt-1 text-sm text-white/60">{liveEvents[0] ? `${liveEvents[0].participantCount} participants in motion` : "The next event will appear here when it goes live."}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Next up</div>
          <div className="mt-2 text-lg font-semibold text-white">{upcomingEvents[0]?.title ?? "No scheduled event"}</div>
          <div className="mt-1 text-sm text-white/60">{upcomingEvents[0] ? `Starts ${formatWhen(upcomingEvents[0].startsAt)}` : "The schedule is clear right now."}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Tournament watch</div>
          <div className="mt-2 text-lg font-semibold text-white">{tournaments[0]?.title ?? "No tournament scheduled"}</div>
          <div className="mt-1 text-sm text-white/60">{tournaments[0]?.bracketStage ? `Current stage: ${bracketLabels[tournaments[0].bracketStage]}` : "Bracket updates appear here when available."}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Event entrants</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Memecoins in the event picture</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">When the live campaign feed is available it appears here, so event planning can be viewed against the current market lineup.</p>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Campaign feed" : eventEntrantsLoading ? "Loading" : "Awaiting feed"} tone="success" />
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {hasRealCampaigns ? (
            eventEntrants.map((item) => <EventEntrantCard key={item.id} item={item} />)
          ) : eventEntrantsLoading ? (
            [0, 1, 2].map((index) => (
              <div key={index} className="min-w-[250px] rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="h-4 w-24 rounded-full bg-white/10" />
                <div className="mt-4 h-5 w-32 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-44 rounded-full bg-white/10" />
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Event entrants will appear here when the live campaign feed is available.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Live events</div>
            <div className="mt-1 text-xl font-semibold text-white">Events already in motion</div>
          </div>
          <TacticalTag label={`${liveEvents.length} active`} tone="success" />
        </div>
        <div className="space-y-3">
          {liveEvents.length ? (
            liveEvents.map((event) => (
              <EventSurfaceCard
                key={event.id}
                event={event}
                onAdvance={() => transitionMockEvent(event.id, statusActions[event.status]!.status)}
                onAdvanceBracket={event.type === "tournament" ? () => advanceTournamentBracket(event.id) : undefined}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              No event is live right now.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Upcoming</div>
            <div className="mt-1 text-xl font-semibold text-white">Scheduled and deploying</div>
          </div>
          <TacticalTag label={`${upcomingEvents.length} queued`} tone="default" />
        </div>
        <div className="space-y-3">
          {upcomingEvents.length ? (
            upcomingEvents.map((event) => (
              <EventSurfaceCard
                key={event.id}
                event={event}
                onAdvance={() => transitionMockEvent(event.id, statusActions[event.status]!.status)}
                onAdvanceBracket={event.type === "tournament" ? () => advanceTournamentBracket(event.id) : undefined}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              No scheduled events are waiting in the queue.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Tournament watch</div>
            <div className="mt-1 text-xl font-semibold text-white">Bracket-linked events</div>
          </div>
          <TacticalTag label={`${tournaments.length} tracked`} tone="sponsored" />
        </div>
        <div className="space-y-3">
          {tournaments.length ? (
            tournaments.map((event) => (
              <EventSurfaceCard
                key={event.id}
                event={event}
                onAdvance={() => transitionMockEvent(event.id, statusActions[event.status]!.status)}
                onAdvanceBracket={() => advanceTournamentBracket(event.id)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              No tournament event is currently tracked.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Archive</div>
            <div className="mt-1 text-xl font-semibold text-white">Completed event history</div>
          </div>
          <TacticalTag label={`${archivedEvents.length} stored`} tone="sponsored" />
        </div>
        <div className="mt-4 space-y-3">
          {archivedEvents.length ? (
            archivedEvents.map((event) => (
              <div key={`${event.id}-${event.completedAt}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{event.title}</div>
                      <TacticalTag label={eventTypeLabels[event.type]} tone="sponsored" />
                    </div>
                    <div className="mt-2 text-xs text-white/55">
                      Completed {new Date(event.completedAt).toLocaleString()} · {event.participantCount} participants
                    </div>
                    <div className="mt-2 text-sm text-white/70">{event.summary}</div>
                  </div>
                  {event.type === "tournament" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/tournament/${event.id}`}>Open bracket</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Completed events will appear here as the schedule progresses.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default PostGradEvents;
