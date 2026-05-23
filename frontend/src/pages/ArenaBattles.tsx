import { Link } from "react-router-dom";
import { CircleSlash, Rocket, ShieldAlert, Swords } from "lucide-react";
import { ArenaCampaignRail } from "@/components/postgrad/ArenaCampaignRailCard";
import { BattleCard, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { getPostGradTokenDetailRoute, getPostGradWarRoomSearchRoute } from "@/features/postgrad/identityRoutes";
import { getWarRoomCampaignMetrics, getWarRoomCampaignStatus } from "@/features/postgrad/warRoomMetrics";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useArenaBattleFeed } from "@/hooks/useArenaBattleFeed";

function normalizeIdentity(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function formatUsd(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function getBattleStateTone(state: string) {
  if (state === "live") return "hot" as const;
  if (state === "open_for_battle" || state === "accepted" || state === "pending") return "success" as const;
  if (state === "settled" || state === "completed") return "sponsored" as const;
  return "default" as const;
}

const ArenaBattles = () => {
  const wallet = useWallet();
  const {
    liveBattles,
    openForBattleQueue,
    archivedBattles,
    getBattleForToken,
    openCreatorCoinForBattle,
  } = useArenaBattleFeed();
  const { railItems: marketCandidates, hasRealCampaigns, loading: marketCandidatesLoading } = useArenaCampaignFeed(8);
  const { campaigns: creatorCampaigns, loading: creatorCampaignsLoading } = useArenaCampaignFeed(50);

  const connectedCreator = normalizeIdentity(wallet.account);
  const creatorCoins = creatorCampaigns.filter((campaign) => normalizeIdentity(campaign.creator) === connectedCreator);

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena battles</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Open your memecoins for battle and track the public queue.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This page is the creator-side battle surface. Review readiness, see why a coin is blocked when it is unavailable, and send eligible coins into the Arena when a slot is open.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label={`${creatorCoins.length} creator coins`} tone="sponsored" />
            <TacticalTag label={`${openForBattleQueue.length} in queue`} tone="success" />
            <TacticalTag label={`${liveBattles.length} live`} tone="hot" />
            <TacticalTag label={`${hasRealCampaigns ? marketCandidates.length : 0} candidates`} tone="default" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Market candidates</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Battle-ready memecoins</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">When the live campaign feed is available it appears here, so current market momentum can be reviewed alongside the battle queue and your own coin controls.</p>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Campaign feed" : marketCandidatesLoading ? "Loading" : "Arena feed"} tone="success" />
        </div>
        <div className="mt-5">
          <ArenaCampaignRail
            items={hasRealCampaigns ? marketCandidates : []}
            rankTone="hot"
            loading={marketCandidatesLoading}
            emptyLabel="Battle candidates will appear here when the live campaign feed is available."
            actionBuilder={(item) => [
              { label: "Token details", href: item.href },
              { label: "War Room", href: getPostGradWarRoomSearchRoute(item.symbol || item.title) },
            ]}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Your coins</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Creator battle controls</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">Each coin shows its current battle status, whether it can enter the Arena right now, and the next action available from this screen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TacticalTag label="Ready" tone="success" />
            <TacticalTag label="Queued" tone="sponsored" />
            <TacticalTag label="Live" tone="hot" />
            <TacticalTag label="Locked" tone="default" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {!wallet.isConnected ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 xl:col-span-2">
              Connect a wallet to load the memecoins created by that wallet and manage their battle readiness here.
            </div>
          ) : creatorCampaignsLoading ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 xl:col-span-2">
              Loading creator memecoins…
            </div>
          ) : creatorCoins.length ? (
            creatorCoins.map((campaign) => {
              const tokenRoute = getPostGradTokenDetailRoute(campaign.campaign);
              const battle = getBattleForToken(campaign.campaign) ?? (campaign.token ? getBattleForToken(campaign.token) : null);
              const metrics = getWarRoomCampaignMetrics(campaign, 0);
              const campaignStatus = getWarRoomCampaignStatus(campaign);
              const isQueued = battle ? ["open_for_battle", "pending", "accepted"].includes(battle.state) : false;
              const isLive = battle ? ["live", "completed", "settled"].includes(battle.state) : false;
              const isLocked = campaignStatus === "draft";
              const isReady = !battle && !isLocked;

              const statusLabel = isReady
                ? "Ready to open"
                : isLocked
                  ? "Locked"
                  : isQueued
                    ? "Already queued"
                    : isLive
                      ? "Already in battle"
                      : battle?.state.replaceAll("_", " ") ?? "Unavailable";

              const statusTone = isReady ? "success" : isLocked ? "default" : isQueued ? "sponsored" : "hot";

              const reason = isReady
                ? "This coin is active on the live campaign feed and currently free to open a new challenge."
                : isLocked
                  ? "This coin is still in draft or pre-live state, so it cannot open a battle yet."
                  : isQueued
                    ? "This coin already has an active challenge in the queue and is waiting for a rival or acceptance."
                    : "This coin is already assigned to a live or recently settled battle and cannot open another one yet.";

              return (
                <div key={campaign.campaign} className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xl font-semibold text-white">{campaign.name}</div>
                        <div className="text-xs uppercase tracking-[0.24em] text-white/45">{campaign.symbol}</div>
                        <TacticalTag label={statusLabel} tone={statusTone} />
                      </div>
                      <div className="mt-2 text-sm text-white/65">
                        MC {metrics.marketCapLabel !== "—" ? metrics.marketCapLabel : formatUsd(0)} · Liquidity {metrics.liquidityLabel !== "—" ? metrics.liquidityLabel : formatUsd(0)} · {metrics.holdersLabel} holders
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TacticalTag label={campaignStatus === "graduated" ? "Graduated" : campaignStatus === "bonding" ? "Bonding" : "Draft"} tone={campaignStatus === "graduated" ? "success" : campaignStatus === "bonding" ? "hot" : "default"} />
                      {!metrics.hasRichStats ? <TacticalTag label="Syncing" tone="default" /> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        {isReady ? <Rocket className="h-4 w-4 text-emerald-300" /> : isLocked ? <ShieldAlert className="h-4 w-4 text-white/55" /> : <CircleSlash className="h-4 w-4 text-orange-200" />}
                        Availability
                      </div>
                      <p className="mt-3 text-sm text-white/70">{reason}</p>
                      {battle ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <TacticalTag label={battle.state.replaceAll("_", " ")} tone={getBattleStateTone(battle.state)} />
                          <span>{battle.participants[0].symbol} vs {battle.participants[1].symbol}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Swords className="h-4 w-4 text-accent" />
                        Actions
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {tokenRoute ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={tokenRoute}>Token details</Link>
                          </Button>
                        ) : null}

                        {isReady ? (
                          <Button size="sm" onClick={() => openCreatorCoinForBattle(campaign.campaign)}>
                            Open for battle
                          </Button>
                        ) : battle ? (
                          <Button asChild size="sm">
                            <Link to={`/battle/${battle.id}`}>{isQueued ? "View queue" : "Open battle"}</Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            Unavailable
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 xl:col-span-2">
              No creator memecoins were found for the connected wallet on the current campaign feed.
            </div>
          )}
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
          {liveBattles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="Open battle" />
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Open queue</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Open for battle</h2>
            </div>
            <TacticalTag label={`${openForBattleQueue.length} awaiting rivals`} tone="success" />
          </div>
          {openForBattleQueue.map((battle) => (
            <BattleCard key={battle.id} battle={battle} ctaLabel="Open challenge" />
          ))}
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
              <BattleCard key={`${entry.battle.id}-${entry.archivedAt}`} battle={entry.battle} ctaLabel="Open recap" />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Settled battles will appear here once recent results are available.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArenaBattles;