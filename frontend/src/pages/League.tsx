import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { Trophy, Users, Wallet, Zap } from "lucide-react";
import { ContentContainer } from "@/components/layout/ContentContainer";
import { TacticalTag } from "@/components/postgrad/PostGradPrimitives";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { getDefaultChainId, isAllowedChainId } from "@/lib/chainConfig";
import {
  LEAGUES,
  calculatePaidPlaces,
  calculatePayoutCurve,
  getPayoutPolicy,
  type LeagueChain,
  type LeagueDef,
  type LeagueKey,
  type Period,
} from "@/lib/leagues";
import { loadLeagueSummary, type LeaguePrizeMeta, type LeagueSummaryResponse } from "@/lib/leagueApi";
import { useBnbUsdPrice } from "@/hooks/useBnbUsdPrice";

type RecruiterRow = {
  rank?: number;
  displayName?: string;
  recruiterCode?: string;
  wallet?: string;
  linkedWallets?: number;
  linkedCreators?: number;
  linkedTraders?: number;
  activeSquadMembers?: number;
  referredVolumeUsd?: number;
  weightedScore?: number;
  estimatedPayoutUsd?: number;
  claimStatus?: string;
};

function shortAddr(value?: string | null) {
  const text = String(value ?? "");
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
}

function rawToBnb(raw?: string | null) {
  try {
    return Number(ethers.formatUnits(BigInt(String(raw ?? "0")), 18));
  } catch {
    return 0;
  }
}

function formatBnb(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 BNB";
  if (value >= 100) return `${value.toFixed(2)} BNB`;
  if (value >= 1) return `${value.toFixed(4)} BNB`;
  return `${value.toFixed(6)} BNB`;
}

function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatEpochEnd(summary?: LeagueSummaryResponse) {
  const end = summary?.epoch?.epochEnd || summary?.epoch?.rangeEnd;
  if (!end) return "Awaiting epoch";
  const date = new Date(end);
  if (Number.isNaN(date.getTime())) return "Awaiting epoch";
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getPrizeRaw(prize?: LeaguePrizeMeta) {
  return prize?.availablePotRaw ?? prize?.potRaw ?? prize?.totalLeagueFeeRaw ?? "0";
}

function rowLabel(def: LeagueDef, row: any) {
  if (def.rowType === "wallet") return shortAddr(row?.wallet);
  if (def.rowType === "recruiter") return row?.displayName || row?.recruiterCode || shortAddr(row?.wallet) || "Recruiter";
  return row?.name || row?.symbol || shortAddr(row?.campaign_address || row?.campaignAddress) || "Campaign";
}

function rowMetric(def: LeagueDef, row: any) {
  if (def.key === "perfect_run") return row?.duration_seconds ? `${row.duration_seconds}s / ${row?.sells_count ?? 0} sells` : def.metricLabel;
  if (def.key === "fastest_finish") return row?.duration_seconds ? `${row.duration_seconds}s` : def.metricLabel;
  if (def.key === "biggest_hit") return row?.bnb_amount_raw ? formatBnb(rawToBnb(row.bnb_amount_raw)) : def.metricLabel;
  if (def.key === "top_earner") return row?.profit_raw ? formatBnb(rawToBnb(row.profit_raw)) : def.metricLabel;
  if (def.key === "crowd_favorite") return row?.votes_count ? `${row.votes_count} votes` : def.metricLabel;
  if (def.key === "recruiter_league") return row?.weightedScore ? `${Number(row.weightedScore).toLocaleString()} score` : def.metricLabel;
  return def.metricLabel;
}

function getEpochOptions(period: Period) {
  const max = period === "weekly" ? 2 : 1;
  return Array.from({ length: max + 1 }, (_, offset) => ({
    offset,
    label: offset === 0 ? "Live epoch" : offset === 1 ? "Previous" : `${offset} back`,
  }));
}

function SegmentedControl<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex min-h-10 flex-wrap items-center gap-1 rounded-full border border-border/60 bg-background/45 p-1">
      {options.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={disabled || item.disabled}
          onClick={() => onChange(item.value)}
          className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40 ${value === item.value ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LeagueSwitch({ selected, period, onSelect }: { selected: LeagueKey; period: Period; onSelect: (key: LeagueKey) => void }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {LEAGUES.map((league) => {
        const active = league.key === selected;
        const validPeriod = league.supports.includes(period);
        return (
          <button key={league.key} type="button" onClick={() => onSelect(league.key)} className={["mwz-hud-frame min-h-[118px] p-4 text-left transition hover:border-accent/60", active ? "border-accent/70 bg-accent/10" : "bg-card/70"].join(" ")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-retro text-sm text-foreground">{league.title}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{league.metricLabel}</div>
              </div>
              <img src={league.image} alt="" className="h-9 w-9 shrink-0 object-contain opacity-80" draggable={false} />
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{league.ruleSummary}</p>
            {!validPeriod ? <div className="mt-2 text-[11px] text-accent">Monthly only for launch</div> : null}
          </button>
        );
      })}
    </section>
  );
}

function RecruiterLinks({ wallet, code }: { wallet?: string; code?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {code ? <Link to={`/recruiters/${code}`} className="text-xs font-semibold text-accent transition hover:text-foreground">Profile</Link> : null}
      {wallet ? <Link to={`/profile/${wallet}/command/recruiter`} className="text-xs font-semibold text-accent transition hover:text-foreground">Command</Link> : null}
    </div>
  );
}

function RecruiterEmptyActions() {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline" className="font-retro"><Link to="/recruiters">Recruiter leaderboard</Link></Button>
      <Button asChild size="sm" variant="outline" className="font-retro"><Link to="/recruiter">Recruiter hub</Link></Button>
    </div>
  );
}

function StandingsTable({ league, rows, status, pendingCopy, warningCopy }: { league: LeagueDef; rows: unknown[]; status?: string; pendingCopy?: string; warningCopy?: string }) {
  if (status === "pending") {
    return <div className="mwz-hud-frame p-5 text-sm text-muted-foreground"><div className="font-retro text-base text-foreground">{league.title} pending</div><p className="mt-2 max-w-2xl">{pendingCopy || league.emptyStateCopy}</p></div>;
  }
  if (status === "error") {
    return <div className="mwz-hud-frame p-5 text-sm text-muted-foreground"><div className="font-retro text-base text-foreground">{league.title} feed warning</div><p className="mt-2 max-w-2xl">{warningCopy || "This league feed returned a warning. Standings will appear when the API response is healthy."}</p>{league.key === "recruiter_league" ? <RecruiterEmptyActions /> : null}</div>;
  }
  if (!rows.length) {
    return <div className="mwz-hud-frame p-5 text-sm text-muted-foreground"><p className="max-w-2xl">{league.emptyStateCopy}</p>{league.key === "recruiter_league" ? <RecruiterEmptyActions /> : null}</div>;
  }

  if (league.rowType === "recruiter") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <tr className="border-b border-border/50"><th className="py-3 pr-3">Rank</th><th className="py-3 pr-3">Recruiter</th><th className="py-3 pr-3">Wallet</th><th className="py-3 pr-3">Network</th><th className="py-3 pr-3">Volume</th><th className="py-3 pr-3">Score</th><th className="py-3 pr-3">Payout</th><th className="py-3 pr-3">Claim</th><th className="py-3">Actions</th></tr>
          </thead>
          <tbody>
            {(rows as RecruiterRow[]).map((row, index) => (
              <tr key={`${row.wallet ?? row.recruiterCode ?? index}`} className="border-b border-border/30 align-top">
                <td className="py-3 pr-3 font-retro">#{row.rank ?? index + 1}</td>
                <td className="py-3 pr-3"><div className="font-semibold text-foreground">{row.displayName || "Recruiter"}</div><div className="text-xs text-muted-foreground">{row.recruiterCode || "Code pending"}</div></td>
                <td className="py-3 pr-3 text-muted-foreground">{shortAddr(row.wallet)}</td>
                <td className="py-3 pr-3 text-muted-foreground"><div>{row.linkedWallets ?? 0} wallets</div><div className="text-xs">{row.activeSquadMembers ?? 0} squad / {row.linkedCreators ?? 0} creators / {row.linkedTraders ?? 0} traders</div></td>
                <td className="py-3 pr-3">{formatUsd(Number(row.referredVolumeUsd ?? 0))}</td>
                <td className="py-3 pr-3">{Number(row.weightedScore ?? 0).toLocaleString()}</td>
                <td className="py-3 pr-3">{formatUsd(Number(row.estimatedPayoutUsd ?? 0))}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.claimStatus || "Pending"}</td>
                <td className="py-3"><RecruiterLinks wallet={row.wallet} code={row.recruiterCode} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 25).map((row: any, index) => (
        <div key={`${league.key}-${row?.campaign_address ?? row?.campaignAddress ?? row?.wallet ?? index}`} className="mwz-hud-frame p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-retro text-sm text-foreground">#{row?.rank ?? index + 1}</span><span className="truncate font-semibold text-foreground">{rowLabel(league, row)}</span>{row?.symbol ? <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{row.symbol}</span> : null}</div><div className="mt-1 truncate text-xs text-muted-foreground">{row?.campaign_address || row?.campaignAddress || row?.wallet || "Leaderboard row"}</div></div>
            <div className="text-sm font-semibold text-accent">{rowMetric(league, row)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function League({ chainId = 97 }: { chainId?: number }) {
  const wallet = useWallet();
  const defaultChain = getDefaultChainId();
  const walletChainId = wallet.isConnected && isAllowedChainId(wallet.chainId) ? Number(wallet.chainId) : Number(chainId ?? defaultChain);
  const activeBnbChainId = walletChainId === 56 ? 56 : 97;
  const { price: bnbUsd } = useBnbUsdPrice(true);

  const [chain, setChain] = useState<LeagueChain>("bnb");
  const [period, setPeriod] = useState<Period>("weekly");
  const [epochOffset, setEpochOffset] = useState(0);
  const [selectedLeagueKey, setSelectedLeagueKey] = useState<LeagueKey>("fastest_finish");
  const [summary, setSummary] = useState<LeagueSummaryResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const selectedLeague = LEAGUES.find((league) => league.key === selectedLeagueKey) ?? LEAGUES[0];
  const epochOptions = useMemo(() => getEpochOptions(period), [period]);

  useEffect(() => {
    if (!selectedLeague.supports.includes(period)) {
      setPeriod(selectedLeague.supports[0]);
      setEpochOffset(0);
    }
  }, [period, selectedLeague]);

  useEffect(() => {
    if (!epochOptions.some((option) => option.offset === epochOffset)) setEpochOffset(0);
  }, [epochOffset, epochOptions]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    loadLeagueSummary({ chain, chainId: activeBnbChainId, period, epochOffset })
      .then((next) => { if (!cancelled) setSummary(next); })
      .catch((err) => {
        console.error("[League] failed to load command center", err);
        if (!cancelled) {
          setSummary(undefined);
          setError("League feed unavailable.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeBnbChainId, chain, period, epochOffset]);

  const isSolana = chain === "solana";
  const selectedCard = summary?.leagues.find((league) => league.key === selectedLeagueKey);
  const rows = useMemo(() => (isSolana ? [] : selectedCard?.rows ?? []), [isSolana, selectedCard]);
  const selectedPrize = isSolana ? undefined : selectedCard?.prize;
  const summaryPrize = isSolana ? undefined : summary?.prize;
  const rawPrizeBnb = rawToBnb(getPrizeRaw(selectedPrize || summaryPrize));
  const rawGeneratedUsd = summaryPrize?.generatedUsd ?? (rawPrizeBnb * (bnbUsd || Number(summaryPrize?.bnbUsdPrice || 0)));
  const policy = summary?.payoutPolicy || getPayoutPolicy(period);
  const cappedPlayerPoolUsd = summaryPrize?.playerPrizePoolUsd ?? (isSolana ? 0 : period === "monthly" ? Math.min(rawGeneratedUsd, policy.monthlyPlayerPrizeCapUsd) : rawGeneratedUsd);
  const charityReserveUsd = summaryPrize?.charityReserveUsd ?? (isSolana ? 0 : period === "monthly" ? Math.max(0, rawGeneratedUsd - policy.monthlyPlayerPrizeCapUsd) : 0);
  const qualifiedEntrants = isSolana ? 0 : Math.max(selectedCard?.entrants ?? rows.length, rows.length);
  const computedPaidPlaces = calculatePaidPlaces(qualifiedEntrants, policy);
  const activePaidPlaces = qualifiedEntrants > 0 ? computedPaidPlaces : 0;
  const payoutCurve = activePaidPlaces > 0 ? calculatePayoutCurve(qualifiedEntrants, cappedPlayerPoolUsd, policy) : [];
  const previewRanks = payoutCurve.filter((row) => row.rank === 1 || row.rank === Math.ceil(activePaidPlaces / 2) || row.rank === activePaidPlaces);
  const selectedStatus = isSolana ? "pending" : selectedCard?.status;
  const capReached = Boolean(summaryPrize?.capReached || charityReserveUsd > 0);
  const solanaPendingCopy = "Solana league feed pending. BNB standings and prize pools are not reused for Solana. Claims open after Solana league payouts are live.";

  const handleSelectLeague = (key: LeagueKey) => {
    const next = LEAGUES.find((league) => league.key === key);
    if (next && !next.supports.includes(period)) {
      setPeriod(next.supports[0]);
      setEpochOffset(0);
    }
    setSelectedLeagueKey(key);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,120,32,0.18),transparent_30%),linear-gradient(180deg,rgba(10,12,16,0.98),rgba(5,6,8,1))] pt-14 text-foreground">
      <ContentContainer className="space-y-5 px-2 pb-10">
        <div className="flex flex-col gap-3 pt-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <SegmentedControl<LeagueChain> value={chain} options={[{ value: "bnb", label: "BNB" }, { value: "solana", label: "Solana" }]} onChange={(next) => setChain(next)} />
            <SegmentedControl<Period> value={period} disabled={selectedLeague.supports.length === 1} options={[{ value: "weekly", label: "Weekly", disabled: !selectedLeague.supports.includes("weekly") }, { value: "monthly", label: "Monthly", disabled: !selectedLeague.supports.includes("monthly") }]} onChange={(next) => { setPeriod(next); setEpochOffset(0); }} />
          </div>
          <SegmentedControl<number> value={epochOffset} options={epochOptions.map((item) => ({ value: item.offset, label: item.label }))} onChange={setEpochOffset} />
        </div>

        <section className="mwz-hud-frame p-5 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Prize League Command Center</div>
              <h1 className="mt-1 font-retro text-3xl text-foreground md:text-4xl">Six prize leagues, one payout cockpit.</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">BNB uses the real league feed. Solana stays pending until its own standings and claim feed are live.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TacticalTag label={isSolana ? "Solana pending" : "BNB live feed"} tone={isSolana ? "default" : "success"} />
              <TacticalTag label={`${period} / ${epochOffset === 0 ? "live" : `${epochOffset} back`}`} tone="sponsored" />
              <TacticalTag label={`Ends ${formatEpochEnd(summary)}`} tone="default" />
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="mwz-hud-frame p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"><Zap className="h-3.5 w-3.5" />Raw generated prize money</div><div className="mt-2 font-retro text-xl">{isSolana ? "SOL pending" : rawPrizeBnb > 0 ? formatBnb(rawPrizeBnb) : formatUsd(rawGeneratedUsd)}</div><div className="mt-1 text-xs text-muted-foreground">{isSolana ? "Solana prize feed pending." : formatUsd(rawGeneratedUsd)}</div></div>
          <div className="mwz-hud-frame p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Player prize cap</div><div className="mt-2 font-retro text-xl">{period === "monthly" ? formatUsd(policy.monthlyPlayerPrizeCapUsd) : "No weekly cap"}</div><div className="mt-1 text-xs text-muted-foreground">{period === "monthly" ? (capReached ? "Monthly cap reached." : "Monthly hard cap before charity overflow.") : "Weekly pools pay without the monthly cap."}</div></div>
          <div className="mwz-hud-frame p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Player prize pool</div><div className="mt-2 font-retro text-xl">{isSolana ? "Pending" : formatUsd(cappedPlayerPoolUsd)}</div><div className="mt-1 text-xs text-muted-foreground">{isSolana ? "No BNB-derived pool shown on Solana." : "Used for payout curve preview."}</div></div>
          <div className="mwz-hud-frame p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Charity reserve</div><div className="mt-2 font-retro text-xl">{isSolana ? "Pending" : formatUsd(charityReserveUsd)}</div><div className="mt-1 text-xs text-muted-foreground">{isSolana ? "Available after Solana prize publication." : "Overflow is not player-claimable."}</div></div>
          <div className="mwz-hud-frame p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"><Users className="h-3.5 w-3.5" />Active paid places</div><div className="mt-2 font-retro text-xl">{activePaidPlaces}</div><div className="mt-1 text-xs text-muted-foreground">Max(min winners, floor(entrants x 15%)).</div></div>
        </section>

        <LeagueSwitch selected={selectedLeagueKey} period={period} onSelect={handleSelectLeague} />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="mwz-hud-frame p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div><div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Standings</div><h2 className="mt-1 font-retro text-2xl text-foreground">{selectedLeague.title}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{selectedLeague.ruleSummary}</p></div>
                <TacticalTag label={`${qualifiedEntrants} qualified`} tone="success" />
              </div>
              <div className="mt-5">{error ? <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">{error}</div> : loading ? <div className="mwz-hud-frame p-5 text-sm text-muted-foreground">Loading league feed...</div> : <StandingsTable league={selectedLeague} rows={rows} status={selectedStatus} pendingCopy={isSolana ? solanaPendingCopy : selectedCard?.warning} warningCopy={selectedCard?.warning} />}</div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="mwz-hud-frame p-5"><div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Prize breakdown</div><h3 className="mt-1 font-retro text-xl">Poker-style payout depth</h3><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3 border-b border-border/40 pb-2"><span className="text-muted-foreground">Minimum winners</span><span>{policy.minWinners}</span></div><div className="flex justify-between gap-3 border-b border-border/40 pb-2"><span className="text-muted-foreground">Paid field</span><span>{Math.round(policy.paidFieldPct * 100)}%</span></div><div className="flex justify-between gap-3 border-b border-border/40 pb-2"><span className="text-muted-foreground">Curve alpha</span><span>{policy.alpha}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Future option</span><span>20% paid field ready</span></div></div></div>
              <div className="mwz-hud-frame p-5"><div className="text-[10px] uppercase tracking-[0.28em] text-accent/80">Payout curve preview</div><h3 className="mt-1 font-retro text-xl">Top / mid / min paid</h3><div className="mt-4 space-y-3">{previewRanks.length ? previewRanks.map((row) => <div key={row.rank} className="rounded-xl border border-border/40 bg-card/55 px-3 py-2"><div className="flex items-center justify-between gap-3"><span className="font-retro text-sm">Rank #{row.rank}</span><span className="text-sm font-semibold">{formatUsd(row.payoutUsd)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background/70"><div className="h-full bg-accent" style={{ width: `${Math.max(4, row.percentage * 100)}%` }} /></div></div>) : <div className="text-sm text-muted-foreground">{isSolana ? "Solana payout curve appears after Solana prize data is published." : "Preview appears when qualified entrants and prize data are available."}</div>}</div></div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="mwz-hud-frame p-5"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-accent/80"><Trophy className="h-4 w-4" />Current #1s</div><div className="mt-4 space-y-2">{!isSolana && summary?.currentLeaders.length ? summary.currentLeaders.map((leader) => <button key={leader.leagueKey} type="button" onClick={() => handleSelectLeague(leader.leagueKey)} className="w-full rounded-xl border border-border/40 bg-card/55 px-3 py-2 text-left transition hover:border-accent/60"><div className="text-[11px] text-muted-foreground">{leader.leagueTitle}</div><div className="truncate text-sm font-semibold">{leader.label}</div><div className="truncate text-[11px] text-accent">{leader.metric}</div></button>) : <div className="text-sm text-muted-foreground">{isSolana ? "Solana leaders pending." : "No leaders yet."}</div>}</div></div>
            <div className="mwz-hud-frame p-5"><div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Recent winners</div><div className="mt-4 space-y-2">{!isSolana && summary?.history.length ? summary.history.slice(0, 5).map((item) => <div key={item.id} className="rounded-xl border border-border/40 bg-card/55 px-3 py-2"><div className="text-sm font-semibold text-foreground">{item.winnerLabel || item.label}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.completedAt || "Finalized epoch"}</div></div>) : <div className="text-sm text-muted-foreground">{isSolana ? "Solana winner history pending." : "Winner history will appear once finalized league epochs are published."}</div>}</div></div>
            <div className="mwz-hud-frame p-5"><div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Major War League</div><div className="mt-2 font-retro text-lg">Post-grad competition lives in Arena.</div><p className="mt-2 text-sm text-muted-foreground">Prize Leagues are separate from the Major War League standings, divisions, and promotion/relegation flow.</p><Button asChild size="sm" variant="outline" className="mt-4 font-retro"><Link to="/arena/major-war-league">Open Major War League</Link></Button></div>
            <div className="mwz-hud-frame p-5"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-accent/80"><Wallet className="h-4 w-4" />Rewards</div><div className="mt-2 font-retro text-lg">Claims land in Profile Rewards.</div><p className="mt-2 text-sm text-muted-foreground">Claimable, finalized, expired, and rolled-over states are preserved for the backend summary contract.</p><Button asChild size="sm" variant="outline" className="mt-4 font-retro"><Link to="/profile?tab=rewards">Profile Rewards</Link></Button></div>
            <div className="mwz-hud-frame p-5"><div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Recruiter links</div><div className="mt-3 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="font-retro"><Link to="/recruiters">Leaderboard</Link></Button><Button asChild size="sm" variant="outline" className="font-retro"><Link to="/recruiter">Hub</Link></Button>{wallet.account ? <Button asChild size="sm" variant="outline" className="font-retro"><Link to={`/profile/${wallet.account}/command/recruiter`}>Command</Link></Button> : null}</div></div>
          </aside>
        </section>
      </ContentContainer>
    </div>
  );
}
