import { Link } from "react-router-dom";

import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { RichBattleCard } from "@/components/postgrad/RichBattleCard";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { getPostGradWarRoomSearchRoute } from "@/features/postgrad/identityRoutes";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";

function normalizeIdentity(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

const ArenaBattles = () => {
  const wallet = useWallet();
  const connectedCreator = normalizeIdentity(wallet.account);
  const commandCenterCoinsRoute = connectedCreator
    ? `/profile/${encodeURIComponent(connectedCreator)}/command/coins`
    : "/profile";

  const {
    liveBattles,
    openForBattleQueue,
    archivedBattles,
    source: battleSource,
  } = useArenaBattleFeed(connectedCreator || undefined);
  const {
    railItems: marketCandidates,
    hasRealCampaigns,
    loading: marketCandidatesLoading,
    source: marketCampaignSource,
  } = useArenaCampaignFeed(8);

  const marketFeedLabel = hasRealCampaigns
    ? "Campaign feed"
    : marketCandidatesLoading
      ? "Loading"
      : marketCampaignSource === "empty"
        ? "Feed unavailable"
        : "Arena feed";

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena battles</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Live matchups, open challenges, and recent battle recaps.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
              This page is now the public battle board. Creator battle controls moved into Command Center so the Arena can stay focused on active competition and the queue.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${openForBattleQueue.length} in queue`} tone="success" />
            <TacticalTag label={`${liveBattles.length} live`} tone="hot" />
            <TacticalTag label={`${hasRealCampaigns ? marketCandidates.length : 0} candidates`} tone="default" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/80">Command Center</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Battle opt-in moved</h2>
            <p className="mt-2 max-w-2xl text-sm text-cyan-50/75">
              Opening a coin for battle is now a private creator action inside Command Center Coins. Arena Battles keeps the public queue and live matchup board only.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to={commandCenterCoinsRoute}>Open Command Center</Link>
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Market candidates</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Battle-ready memecoins</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">
              The public campaign feed stays here as a scouting surface so current momentum can be checked alongside the battle queue.
            </p>
          </div>
          <TacticalTag label={marketFeedLabel} tone="success" />
        </div>
        <div className="mt-5">
          <ArenaCampaignRail
            items={hasRealCampaigns ? marketCandidates : []}
            rankTone="hot"
            loading={marketCandidatesLoading}
            emptyLabel={marketCampaignSource === "empty" ? "Battle candidate campaign data is not available on this branch yet." : "Battle candidates will appear here when the live campaign feed is available."}
            actionBuilder={(item) => [
              { label: "Token details", href: item.href },
              { label: "War Room", href: getPostGradWarRoomSearchRoute(item.symbol || item.title) },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Public feed</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Live battles</h2>
            </div>
            <TacticalTag label={`${liveBattles.length} active`} tone="hot" />
          </div>
          {liveBattles.length ? (
            liveBattles.map((battle) => (
              <RichBattleCard key={battle.id} battle={battle} ctaLabel="Open battle" />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              {battleSource === "empty" ? "Live battle data is not available on this branch yet." : "No live battles are active right now."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Open queue</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Open for battle</h2>
            </div>
            <TacticalTag label={`${openForBattleQueue.length} awaiting rivals`} tone="success" />
          </div>
          {openForBattleQueue.length ? (
            openForBattleQueue.map((battle) => (
              <RichBattleCard key={battle.id} battle={battle} ctaLabel="Open challenge" />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              {battleSource === "empty" ? "Open-for-battle queue data is not available on this branch yet." : "No memecoins are waiting in the battle queue right now."}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Recent settled</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Battle recaps</h2>
          </div>
          <TacticalTag label={`${archivedBattles.length} archived`} tone="sponsored" />
        </div>
        <div className="mt-4 space-y-4">
          {archivedBattles.length ? (
            archivedBattles.map((entry) => (
              <RichBattleCard key={`${entry.battle.id}-${entry.archivedAt}`} battle={entry.battle} ctaLabel="Open recap" />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              {battleSource === "empty" ? "Recent battle archive data is not available on this branch yet." : "Settled battles will appear here once recent results are available."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArenaBattles;
