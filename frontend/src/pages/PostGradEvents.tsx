import { EventCard, MockModeBanner, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
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

const PostGradEvents = () => {
  const { events, transitionMockEvent, advanceTournamentBracket, resetMockEventRuntime } = useMockEvents();

  return (
    <div className="space-y-6 px-1 pb-10">
      {postGradFlags.mocks ? <MockModeBanner subject="Events sandbox" /> : null}

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,20,26,0.94),rgba(8,9,12,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Events and tournaments</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Deployment lane for scheduled post-grad competition.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">The event scheduler, deploy-to-event flow, and tournament progression now have a mock runtime so QA can move the frontend through realistic states without waiting for backend contracts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Schedule ready" tone="success" />
            <TacticalHint label="Progression note" body="Each event card can now move from scheduled to live to completed, and tournament brackets can advance in mock mode." />
            {postGradFlags.mocks ? (
              <Button variant="outline" size="sm" onClick={resetMockEventRuntime}>
                Reset mock events
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {events.map((event) => {
          const nextStatusAction = statusActions[event.status];
          const bracketLabel = event.type === "tournament" && event.bracketStage ? bracketLabels[event.bracketStage] : null;

          return (
            <div key={event.id} className="space-y-3">
              <EventCard
                event={event}
                href={event.type === "tournament" ? `/tournament/${event.id}` : undefined}
                ctaLabel={event.type === "tournament" ? "Open bracket" : undefined}
              />
              {postGradFlags.mocks ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.22em] text-white/45">
                    <span>Mock controls</span>
                    {bracketLabel ? <span>Stage: {bracketLabel}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextStatusAction ? (
                      <Button size="sm" onClick={() => transitionMockEvent(event.id, nextStatusAction.status)}>
                        {nextStatusAction.label}
                      </Button>
                    ) : null}
                    {event.type === "tournament" && event.status !== "completed" ? (
                      <Button size="sm" variant="outline" onClick={() => advanceTournamentBracket(event.id)}>
                        Advance bracket
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PostGradEvents;
