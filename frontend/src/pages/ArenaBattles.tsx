import { Link } from "react-router-dom";
import { CircleSlash, Rocket, ShieldAlert, Swords } from "lucide-react";
import { BattleCard, TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import type { MockTokenProfile } from "@/features/postgrad/contracts";
import { getMockTokenById, getMockTokenRouteById } from "@/features/postgrad/mockRegistry";
import type { ArenaCampaignRailItem } from "@/hooks/useArenaCampaignFeed";
import { useArenaCampaignFeed } from "@/hooks/useArenaCampaignFeed";
import { useMockBattleLists } from "@/hooks/useMockBattleRuntime";

const CREATOR_COIN_IDS = ["circuit-wolf", "sleep-driver", "astro-frogs", "redline-rats"];

function formatUsd(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function getBattleStateTone(state: string) {
  if (state === "live") return "hot" as const;
  if (state === "open_for_battle" || state === "accepted" || state === "pending") return "success" as const;
  if (state === "settled" || state === "completed") return "sponsored" as const;
  return "default" as const;
}

function isTokenProfile(token: MockTokenProfile | null): token is MockTokenProfile {
  return Boolean(token);
}

function MarketBattleCandidateCard({ item }: { item: ArenaCampaignRailItem }) {
  return (
    <div className="min-w-[250px] rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TacticalTag label={item.rankLabel} tone="hot" />
        <TacticalTag label={item.statusLabel} tone={item.statusTone} />
      </div>
      <div className="mt-3 text-base font-semibold text-white">{item.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.24em] text-white/45">{item.symbol}</div>
      <div className="mt-3 text-xs text-white/60">{item.detail}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={item.href}>Token details</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/war-room?search=${encodeURIComponent(item.symbol || item.title)}`}>War Room</Link>
        </Button>
      </div>
    </div>
  );
}

const ArenaBattles = () => {
  const {
    liveBattles,
    openForBattleQueue,
    archivedBattles,
    getBattleForToken,
    createMockOpenForBattle,
  } = useMockBattleLists();
  const { railItems: marketCandidates, hasRealCampaigns, loading: marketCandidatesLoading } = useArenaCampaignFeed(8);

  const creatorCoins = CREATOR_COIN_IDS.map((tokenId) => getMockTokenById(tokenId)).filter(isTokenProfile);

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,18,24,0.94),rgba(6,7,10,0.98))] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Arena battles</div>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Open creator coins for battle, then track the public queue.</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">This page owns the founder-side battle workflow. Pick one of your coins, check whether it is eligible, see why it is blocked when it is not, and launch it into the Arena when a slot is free.</p>
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
            <h2 className="mt-1 text-2xl font-semibold text-white">Trending memecoins for battle discovery</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/65">Real campaign feed items are shown here when available. Creator controls below stay available for flow testing until battle eligibility is fully backed by the API.</p>
          </div>
          <TacticalTag label={hasRealCampaigns ? "Live feed" : marketCandidatesLoading ? "Loading" : "QA fallback"} tone="success" />
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {hasRealCampaigns ? (
            marketCandidates.map((item) => <MarketBattleCandidateCard key={item.id} item={item} />)
          ) : marketCandidatesLoading ? (
            [0, 1, 2].map((index) => (
              <div key={index} className="min-w-[250px] rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="h-4 w-24 rounded-full bg-white/10" />
                <div className="mt-4 h-5 w-32 rounded-full bg-white/10" />
                <div className="mt-3 h-3 w-44 rounded-full bg-white/10" />
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
              Campaign candidates will appear here when the live feed is available.
            </div>
          )}
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
          {creatorCoins.map((token) => {
            const tokenRoute = getMockTokenRouteById(token.id);
            const battle = getBattleForToken(token.id);
            const isQueued = battle ? ["open_for_battle", "pending", "accepted"].includes(battle.state) : false;
            const isLive = battle ? ["live", "completed", "settled"].includes(battle.state) : false;
            const isLocked = !token.battleEligible;
            const isReady = !battle && token.battleEligible;

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
              ? "This coin is eligible and not currently assigned to another battle slot."
              : isLocked
                ? "This coin is still under battle cooldown checks, so it cannot open a fresh challenge yet."
                : isQueued
                  ? "This coin already has an active challenge in the Arena queue and should wait for a rival or acceptance flow."
                  : "This coin is already allocated to a live or recently settled battle and cannot open another one yet.";

            return (
              <div key={token.id} className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,20,26,0.94),rgba(9,10,14,0.96))] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xl font-semibold text-white">{token.name}</div>
                      <div className="text-xs uppercase tracking-[0.24em] text-white/45">{token.symbol}</div>
                      <TacticalTag label={statusLabel} tone={statusTone} />
                    </div>
                    <div className="mt-2 text-sm text-white/65">MC {formatUsd(token.marketCapUsd)} · Liquidity {formatUsd(token.liquidityUsd)} · {token.holders.toLocaleString()} holders</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {token.tacticalTags.slice(0, 2).map((tag) => (
                      <TacticalTag key={`${token.id}-${tag}`} label={tag} tone={tag === "Featured" ? "hot" : tag === "Sponsored" ? "sponsored" : "default"} />
                    ))}
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
                        <Button size="sm" onClick={() => createMockOpenForBattle(token.id)}>
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
          })}
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
              Settled battles will appear here once battle resolution is available.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ArenaBattles;
