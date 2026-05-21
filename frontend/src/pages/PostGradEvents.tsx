import { EventCard, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { scheduledEvents } from "@/features/postgrad/mockRegistry";

const PostGradEvents = () => {
  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,20,26,0.94),rgba(8,9,12,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Events and tournaments</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Deployment lane for scheduled post-grad competition.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">The event scheduler, deploy-to-event flow, and tournament progression can now land against stable route and card surfaces instead of improvising UI later.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Schedule ready" tone="success" />
            <TacticalHint label="Progression note" body="Each event card already exposes status, timing, and participant counts, which matches the next backend contract layer." />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {scheduledEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

export default PostGradEvents;
