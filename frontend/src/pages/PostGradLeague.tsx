import { RankingsPanel, TacticalHint, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { arenaRankings } from "@/features/postgrad/mockData";

const PostGradLeague = () => {
  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(5,6,9,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Seasonal league scaffold</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Division, promotion, and reward surfaces.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">League views are now separated from the pre-grad experience so seasonal scoring, division movement, and archives can grow without destabilizing the live campaign routes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Division-ready" tone="sponsored" />
            <TacticalHint label="Reset hook" body="Seasonal resets and reward distribution can target this route once battle and event scoring are trusted." />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <RankingsPanel payload={arenaRankings[2]} icon="crown" />
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
          <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Division movement</div>
          <div className="mt-2 text-lg font-semibold text-white">Promotion / relegation placeholder</div>
          <ul className="mt-3 space-y-2 text-white/65">
            <li>Bronze → Silver → Gold → Apex divisions slot into this panel.</li>
            <li>Season history and archive cards can sit below current standings.</li>
            <li>Reward routing stays behind the league-specific feature gate until settlement is audited.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PostGradLeague;
