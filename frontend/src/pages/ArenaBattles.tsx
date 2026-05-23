import { Link } from "react-router-dom";

import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { RichBattleCardOrange } from "@/components/postgrad/RichBattleCardOrange";
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
      <section className="mwz-orange-frame p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mwz-orange-frame-label text-[10px]">Arena battles</div>
            <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Live matchups, open challenges, and recent battle recaps.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
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

      <section className="mwz-orange-frame p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mwz-orange-frame-label text-[10px]">Command Center</div>
            <h2 className="mt-1 font-retro text-2xl text-foreground">Battle opt-in moved</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Opening a coin for battle is now a private creator action inside Command Center Coins. Arena Battles keeps the public queue and live matchup board only.
            </p>
          </div>
          <Button asChild size="sm" className="mwz-button mwz-button-orange font-retro">
            <Link to={commandCenterCoinsRoute}>Open Command Center</Link>
          </Button>
        </div>
      </section>

      <section className="mwz-orange-frame-soft p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mwz-orange-frame-label text-[10px]">Market candidates</div>
            <h2 className="mt-1 font-retro text-2xl text-foreground">Battle-ready memecoins</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
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
              <div className="mwz-orange-frame-label text-[10px]">Public feed</div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Live battles</h2>
            </div>
            <TacticalTag label={`${liveBattles.length} active`} tone="hot" />
          </div>
          {liveBattles.length ? (
            liveBattles.map((battle) => (
              <RichBattleCardOrange key={battle.id} battle={battle} ctaLabel="Open battle" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Live battle data is not available on this branch yet." : "No live battles are active right now."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mwz-orange-frame-label text-[10px]">Open queue</div>
              <h2 className="mt-1 font-retro text-xl text-foreground">Open for battle</h2>
            </div>
            <TacticalTag label={`${openForBattleQueue.length} awaiting rivals`} tone="success" />
          </div>
          {openForBattleQueue.length ? (
            openForBattleQueue.map((battle) => (
              <RichBattleCardOrange key={battle.id} battle={battle} ctaLabel="Open challenge" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Open-for-battle queue data is not available on this branch yet." : "No memecoins are waiting in the battle queue right now."}
            </div>
          )}
        </div>
      </section>

      <section className="mwz-orange-frame-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mwz-orange-frame-label text-[10px]">Recent settled</div>
            <h2 className="mt-1 font-retro text-xl text-foreground">Battle recaps</h2>
          </div>
          <TacticalTag label={`${archivedBattles.length} archived`} tone="hot" />
        </div>
        <div className="mt-4 space-y-4">
          {archivedBattles.length ? (
            archivedBattles.map((entry) => (
              <RichBattleCardOrange key={`${entry.battle.id}-${entry.archivedAt}`} battle={entry.battle} ctaLabel="Open recap" />
            ))
          ) : (
            <div className="mwz-orange-frame-soft p-5 text-sm text-muted-foreground">
              {battleSource === "empty" ? "Recent battle archive data is not available on this branch yet." : "Settled battles will appear here once recent results are available."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArenaBattles;
