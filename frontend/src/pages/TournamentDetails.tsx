import { Link, useParams } from "react-router-dom";
import { EventCard, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useArenaEventDetails } from "@/hooks/useArenaEventFeed";

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
  const { event: tournament, source } = useArenaEventDetails(id);

  if (!tournament) {
    return (
      <div className="space-y-6 px-1 pb-10">
        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,19,25,0.94),rgba(8,8,11,0.98))] p-5 md:p-7">
          <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Tournament scaffold</div>
          <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Tournament details unavailable.</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
            {source === "empty"
              ? "Tournament detail data is not available on this branch yet."
              : "This tournament could not be resolved from the current event feed."}
          </p>
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link to="/arena/events">Back to events</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const currentStage = tournament.bracketStage ?? "registration";
  const currentStageIndex = stageCards.findIndex((stage) => stage.key === currentStage);
  const sourceLabel = source === "api" ? "Arena feed" : source === "qa-runtime" ? "Fallback feed" : "Feed unavailable";
  const sourceTone = source === "api" ? "success" : source === "qa-runtime" ? "sponsored" : "default";

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,19,25,0.94),rgba(8,8,11,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Tournament scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Bracket route, matchups, and advancement states.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This page tracks tournament status, bracket phase, and archive-readiness through the Arena event adapter.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={tournament.status} tone={tournament.status === "live" ? "success" : "sponsored"} />
            <TacticalTag label={currentStage.replaceAll("_", " ")} tone="hot" />
            <TacticalHint label="Bracket state" body="Use this page to read tournament progress, current stage, and archive readiness from the Arena event feed." />
            <TacticalTag label={sourceLabel} tone={sourceTone} />
          </div>
        </div>
      </section>

      <EventCard event={tournament} />

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
