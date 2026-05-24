import { useEffect, useState } from "react";
import { CalendarDays, Flag, TimerReset } from "lucide-react";
import { ArenaSubnav } from "@/components/arena/ArenaSubnav";
import { fetchArenaEvents, type ArenaEventsResponse, type ArenaSummaryItem } from "@/lib/arenaApi";

function EventColumn({ title, icon: Icon, items, empty }: { title: string; icon: typeof CalendarDays; items: ArenaSummaryItem[]; empty: string }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card/45 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold md:text-base">{title}</h2>
      </div>

      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <a
              key={`${title}:${item.id}`}
              href={item.href}
              className="block rounded-2xl border border-border/50 bg-background/20 px-4 py-3 transition-colors hover:border-accent/45 hover:bg-card/65"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.meta ? <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div> : null}
                </div>
                {item.status ? <span className="text-[11px] uppercase tracking-[0.12em] text-accent">{item.status}</span> : null}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-sm text-muted-foreground">
          {empty}
        </div>
      )}
    </section>
  );
}

export default function ArenaEvents() {
  const [data, setData] = useState<ArenaEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const next = await fetchArenaEvents();
        if (!cancelled) setData(next);
      } catch (error) {
        console.error("[ArenaEvents] failed to load", error);
        if (!cancelled) {
          setData({
            active: [],
            upcoming: [],
            tournaments: [],
            updatedAt: new Date().toISOString(),
            warning: "Events feed is not available yet.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-full pt-16 md:pt-16">
      <ArenaSubnav />

      <section className="mb-6 rounded-[28px] border border-border/60 bg-card/45 p-5 backdrop-blur-sm md:p-7">
        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-accent">Arena Events</div>
        <h1 className="text-2xl font-semibold md:text-4xl">Active events, upcoming cycles, and tournaments under one roof.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          This page is now locked as the event hub, with tournament access nested inside event cards rather than split into a separate product surface.
        </p>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-border/50 bg-card/35 px-4 py-8 text-sm text-muted-foreground">Loading events…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <EventColumn
            title="Active"
            icon={Flag}
            items={data?.active ?? []}
            empty="No active events are being published yet."
          />
          <EventColumn
            title="Upcoming"
            icon={CalendarDays}
            items={data?.upcoming ?? []}
            empty="Upcoming event scheduling will appear here."
          />
          <EventColumn
            title="Tournaments"
            icon={TimerReset}
            items={data?.tournaments ?? []}
            empty="Tournament entries will appear inside their parent events here."
          />
        </div>
      )}
    </div>
  );
}
