import { Link } from "react-router-dom";
import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { getPostGradWarRoomSearchRoute } from "@/features/postgrad/identityRoutes";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import type { ArenaEventSummary } from "@/hooks/useArenaEventFeed";
import { useArenaEventFeed } from "@/hooks/useArenaEventFeed";

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

function EventSurfaceCard({ event }: { event: ArenaEventSummary }) {
  const bracketLabel = event.type === "tournament" && event.bracketStage ? bracketLabels[event.bracketStage] : null;
  const tone = event.status === "live" ? "success" : event.type === "tournament" ? "sponsored" : "default";

  return (
    <div className="mwz-hud-frame p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TacticalTag label={eventTypeLabels[event.type]} tone={event.type === "tournament" ? "sponsored" : "default"} />
            <TacticalTag label={event.status} tone={tone} />
            {bracketLabel ? <TacticalTag label={bracketLabel} tone="hot" /> : null}
          </div>
          <div className="mt-3 font-retro text-lg text-foreground">{event.title}</div>
          <div className="mt-2 text-sm text-muted-foreground">{event.summary}</div>
          <div className="mt-3 text-xs text-muted-foreground/80">
            {event.participantCount} participants · Starts {formatWhen(event.startsAt)} · Ends {formatWhen(event.endsAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.type === "tournament" ? (
            <Button asChild size="sm" variant="outline" className="font-retro">
              <Link to={`/tournament/${event.id}`}>Open bracket</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PostGradEvents = () => {
  const { events, archivedEvents, source: eventSource } = useArenaEventFeed();
  const { railItems: eventEntrants, hasRealCampaigns, loading: eventEntrantsLoading, source: campaignSource } = useArenaCampaignFeed(10);

  const liveEvents = events.filter((event) => event.status === "live");
  const upcomingEvents = events.filter((event) => event.status === "scheduled" || event.status === "deploying");
  const tournaments = events.filter((event) => event.type === "tournament");
  const eventEntrantFeedLabel = hasRealCampaigns ? "Campaign feed" : eventEntrantsLoading ? "Loading" : campaignSource === "empty" ? "Feed unavailable" : "Awaiting feed";

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="mwz-hud-frame p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena events</div>
            <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Scheduled competition, tournament watch, and event history.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Track what is live, what is coming up next, which tournaments need attention, and what already completed in the Arena cycle.</p>
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
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Live now</div>
          <div className="mt-2 font-retro text-lg text-foreground">{liveEvents[0]?.title ?? "No live event"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{liveEvents[0] ? `${liveEvents[0].participantCount} participants in motion` : eventSource === "empty" ? "Live event data is not available on this branch yet." : "The next event will appear here when it goes live."}</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Next up</div>
          <div className="mt-2 font-retro text-lg text-foreground">{upcomingEvents[0]?.title ?? "No scheduled event"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{upcomingEvents[0] ? `Starts ${formatWhen(upcomingEvents[0].startsAt)}` : eventSource === "empty" ? "Upcoming event data is not available on this branch yet." : "The schedule is clear right now."}</div>
        </div>
        <div className="mwz-hud-frame p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Tournament watch</div>
          <div className="mt-2 font-retro text-lg text-foreground">{tournaments[0]?.title ?? "No tournament scheduled"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{tournaments[0]?.bracketStage ? `Current stage: ${bracketLabels[tournaments[0].bracketStage]}` : eventSource === "empty" ? "Tournament event data is not available on this branch yet." : "Bracket updates appear here when available."}</div>
        </div>
      </section>

      <section className="mwz-hud-frame p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Event entrants</div>
            <h2 className="mt-1 font-retro text-2xl text-foreground">Memecoins in the event picture</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">When the live campaign feed is available it appears here, so event planning can be viewed against the current market lineup.</p>
          </div>
          <TacticalTag label={eventEntrantFeedLabel} tone="success" />
        </div>
        <div className="mt-5">
          <ArenaCampaignRail
            items={hasRealCampaigns ? eventEntrants : []}
            rankTone="hot"
            loading={eventEntrantsLoading}
            emptyLabel={campaignSource === "empty" ? "Event entrant campaign data is not available on this branch yet." : "Event entrants will appear here when the live campaign feed is available."}
            actionBuilder={(item) => [
              { label: "Token details", href: item.href },
              { label: "War Room", href: getPostGradWarRoomSearchRoute(item.symbol || item.title) },
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Live events</div>
            <div className="mt-1 font-retro text-xl text-foreground">Events already in motion</div>
          </div>
          <TacticalTag label={`${liveEvents.length} active`} tone="success" />
        </div>
        <div className="space-y-3">
          {liveEvents.length ? (
            liveEvents.map((event) => <EventSurfaceCard key={event.id} event={event} />)
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {eventSource === "empty" ? "Live event data is not available on this branch yet." : "No event is live right now."}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Upcoming</div>
            <div className="mt-1 font-retro text-xl text-foreground">Scheduled and deploying</div>
          </div>
          <TacticalTag label={`${upcomingEvents.length} queued`} tone="default" />
        </div>
        <div className="space-y-3">
          {upcomingEvents.length ? (
            upcomingEvents.map((event) => <EventSurfaceCard key={event.id} event={event} />)
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {eventSource === "empty" ? "Upcoming event data is not available on this branch yet." : "No scheduled events are waiting in the queue."}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Tournament watch</div>
            <div className="mt-1 font-retro text-xl text-foreground">Bracket-linked events</div>
          </div>
          <TacticalTag label={`${tournaments.length} tracked`} tone="sponsored" />
        </div>
        <div className="space-y-3">
          {tournaments.length ? (
            tournaments.map((event) => <EventSurfaceCard key={event.id} event={event} />)
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {eventSource === "empty" ? "Tournament event data is not available on this branch yet." : "No tournament event is currently tracked."}
            </div>
          )}
        </div>
      </section>

      <section className="mwz-hud-frame p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Archive</div>
            <div className="mt-1 font-retro text-xl text-foreground">Completed event history</div>
          </div>
          <TacticalTag label={`${archivedEvents.length} stored`} tone="sponsored" />
        </div>
        <div className="mt-4 space-y-3">
          {archivedEvents.length ? (
            archivedEvents.map((event) => (
              <div key={`${event.id}-${event.completedAt}`} className="mwz-hud-frame p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-retro text-sm text-foreground">{event.title}</div>
                      <TacticalTag label={eventTypeLabels[event.type]} tone="sponsored" />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground/80">
                      Completed {new Date(event.completedAt).toLocaleString()} · {event.participantCount} participants
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{event.summary}</div>
                  </div>
                  {event.type === "tournament" ? (
                    <Button asChild size="sm" variant="outline" className="font-retro">
                      <Link to={`/tournament/${event.id}`}>Open bracket</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">
              {eventSource === "empty" ? "Archived event data is not available on this branch yet." : "Completed events will appear here after they wrap."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default PostGradEvents;