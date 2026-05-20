import { EventCard, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { scheduledEvents } from "@/features/postgrad/mockData";

const TournamentDetails = () => {
  const tournament = scheduledEvents.find((event) => event.type === "tournament") ?? scheduledEvents[0];

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,19,25,0.94),rgba(8,8,11,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Tournament scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Bracket route, matchups, and advancement states.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">The route exists now so we can plug in live tournament state later instead of forcing bracket logic into ad hoc event pages.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Bracket shell" tone="hot" />
            <TacticalHint label="Advancement" body="Quarterfinal, semifinal, and finals progression can attach to this page once the tournament engine lands." />
          </div>
        </div>
      </section>

      <EventCard event={tournament} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Quarterfinals</div>
          <div className="mt-2 text-white">Seed 1 vs Seed 8</div>
          <div className="text-white/55">Seed 4 vs Seed 5</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Semifinals</div>
          <div className="mt-2 text-white">Winner QF1 vs Winner QF2</div>
          <div className="text-white/55">Winner QF3 vs Winner QF4</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Finals</div>
          <div className="mt-2 text-white">Semifinal winners</div>
          <div className="text-white/55">Winner receives featured placement and league seeding bonus</div>
        </div>
      </div>
    </div>
  );
};

export default TournamentDetails;
