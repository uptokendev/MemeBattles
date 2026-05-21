import { useParams } from "react-router-dom";
import { EventCard, MockModeBanner, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { PostGradStatusStrip } from "@/components/postgrad/PostGradStatusStrip";
import { Button } from "@/components/ui/button";
import { postGradFlags } from "@/features/postgrad/config";
import { useMockEventDetails } from "@/hooks/useMockEventRuntime";

const statusActions = {
  scheduled: { label: "Deploy tournament", status: "deploying" as const },
  deploying: { label: "Go live", status: "live" as const },
  live: { label: "Complete tournament", status: "completed" as const },
  completed: null,
};

const stageCards = [
  {
    key: "registration",
    title: "Registration",
    body: "Seeding from battle activity, holder growth, and featured placements is locked in here before the bracket starts.",
  },
  {
    key: "quarterfinals",
    title: "Quarterfinals",
    body: "Seed 1 vs Seed 8, Seed 4 vs Seed 5, plus the remaining opening matchups to establish momentum.",
  },
  {
    key: "semifinals",
    title: "Semifinals",
    body: "Quarterfinal winners collapse into the two headline clashes that drive the finals storyline.",
  },
  {
    key: "finals",
    title: "Finals",
    body: "The last two tokens battle for featured placement, crown status, and league seeding advantage.",
  },
  {
    key: "completed",
    title: "Completed",
    body: "The winner is settled, placement bonuses are awarded, and the tournament is ready for archive surfaces.",
  },
] as const;

const TournamentDetails = () => {
  const { id } = useParams();
  const { event: tournament, transitionMockEvent, advanceTournamentBracket, resetMockEventRuntime } = useMockEventDetails(id);

  if (!tournament) return null;

  const currentStage = tournament.bracketStage ?? "registration";
  const currentStageIndex = stageCards.findIndex((stage) => stage.key === currentStage);
  const nextStatusAction = statusActions[tournament.status];

  return (
    <div className="space-y-6 px-1 pb-10">
      {postGradFlags.mocks ? <MockModeBanner subject="Tournament sandbox" /> : null}
      <PostGradStatusStrip />

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,19,25,0.94),rgba(8,8,11,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Tournament scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Bracket route, matchups, and advancement states.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This page now carries an interactive mock bracket so the tournament flow can be walked through before the real event engine lands.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={tournament.status} tone={tournament.status === "live" ? "success" : "sponsored"} />
            <TacticalTag label={currentStage.replaceAll("_", " ")} tone="hot" />
            <TacticalHint label="Advancement" body="Move the tournament through deployment, live bracket rounds, and completion to validate the route and state presentation." />
            {postGradFlags.mocks ? (
              <Button variant="outline" size="sm" onClick={resetMockEventRuntime}>
                Reset mock events
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <EventCard event={tournament} />

      {postGradFlags.mocks ? (
        <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Mock tournament controls</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {nextStatusAction ? (
              <Button size="sm" onClick={() => transitionMockEvent(tournament.id, nextStatusAction.status)}>
                {nextStatusAction.label}
              </Button>
            ) : null}
            {tournament.status !== "completed" && currentStage !== "completed" ? (
              <Button size="sm" variant="outline" onClick={() => advanceTournamentBracket(tournament.id)}>
                Advance bracket stage
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {stageCards.map((stage, index) => {
          const active = index === currentStageIndex;
          const complete = currentStageIndex > index || currentStage === "completed";

          return (
            <div
              key={stage.key}
              className={[
                "rounded-2xl border p-4 text-sm transition-colors",
                active ? "border-orange-400/30 bg-orange-500/10 text-white" : "border-white/10 bg-black/25 text-white/70",
                complete && !active ? "border-emerald-400/20 bg-emerald-500/10" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">{stage.title}</div>
                {active ? <TacticalTag label="Current" tone="hot" /> : complete ? <TacticalTag label="Cleared" tone="success" /> : null}
              </div>
              <div className="mt-3 text-sm leading-6">{stage.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TournamentDetails;
