import {
  LEAGUES,
  getLimit,
  type LeagueChain,
  type LeagueDef,
  type LeagueKey,
  type LeaguePeriod,
} from "@/lib/leagues";

export type LeagueStatus = "loading" | "ready" | "empty" | "pending" | "error" | "claimable" | "finalized" | "expired" | "rolled_over";

export interface LeagueEpoch {
  period: LeaguePeriod;
  epochOffset: number;
  epochStart: string;
  epochEnd: string;
  rangeEnd: string;
  status: "live" | "finalized";
}

export interface LeaguePrizeMeta {
  basis?: string;
  period?: LeaguePeriod;
  computedAt?: string;
  totalLeagueFeeRaw?: string;
  leagueCount?: number;
  winners?: number;
  splitBps?: number[];
  potRaw?: string;
  payoutsRaw?: string[];
  rolloverRaw?: string;
  paidRaw?: string;
  availablePotRaw?: string;
  availablePayoutsRaw?: string[];
}

export interface LeaguePayoutPolicy {
  minWinners: number;
  paidFieldPct: number;
  alpha: number;
  monthlyPlayerPrizeCapUsd: number;
}

export interface CurrentLeagueLeader {
  leagueKey: LeagueKey;
  leagueTitle: string;
  label: string;
  metric: string;
}

export interface LeagueWinnerHistoryItem {
  id: string;
  label: string;
  leagueKey?: LeagueKey;
  completedAt?: string;
  winnerLabel?: string;
}

export interface LeagueSummaryCard {
  key: LeagueKey;
  title: string;
  status: LeagueStatus;
  entrants: number;
  rows: unknown[];
  prize?: LeaguePrizeMeta;
  warning?: string;
}

export interface LeagueDetail {
  key: LeagueKey;
  status: LeagueStatus;
  rows: unknown[];
  prize?: LeaguePrizeMeta;
  warning?: string;
}

export interface LeagueSummaryResponse {
  chain: LeagueChain;
  period: LeaguePeriod;
  epoch?: LeagueEpoch;
  prize?: LeaguePrizeMeta;
  payoutPolicy?: LeaguePayoutPolicy;
  leagues: LeagueSummaryCard[];
  selectedLeague?: LeagueDetail;
  currentLeaders: CurrentLeagueLeader[];
  history: LeagueWinnerHistoryItem[];
}

type LegacyLeagueResponse = {
  items?: unknown[];
  warning?: string;
  prize?: LeaguePrizeMeta;
  epoch?: LeagueEpoch;
  stats?: { campaignsCreated?: number };
};

export interface LoadLeagueSummaryOptions {
  chain: LeagueChain;
  chainId: number;
  period: LeaguePeriod;
  epochOffset: number;
}

function getStatus(rows: unknown[], warning?: string): LeagueStatus {
  if (warning) return "error";
  return rows.length ? "ready" : "empty";
}

function leaderLabel(row: any) {
  if (typeof row?.displayName === "string") return row.displayName;
  if (typeof row?.name === "string") return row.symbol ? `${row.name} (${row.symbol})` : row.name;
  if (typeof row?.wallet === "string") return row.wallet;
  if (typeof row?.campaign_address === "string") return row.campaign_address;
  return "Awaiting leader";
}

function metricFor(def: LeagueDef, row: any) {
  if (def.key === "fastest_finish") return row?.duration_seconds ? `${row.duration_seconds}s` : def.metricLabel;
  if (def.key === "biggest_hit") return row?.bnb_amount_raw ? "Largest buy" : def.metricLabel;
  if (def.key === "top_earner") return row?.profit_raw ? "Trader PnL" : def.metricLabel;
  if (def.key === "crowd_favorite") return row?.votes_count ? `${row.votes_count} votes` : def.metricLabel;
  if (def.key === "recruiter_league") return row?.weightedScore ? `${row.weightedScore} score` : def.metricLabel;
  return def.metricLabel;
}

export async function loadLeagueSummary({
  chain,
  chainId,
  period,
  epochOffset,
}: LoadLeagueSummaryOptions): Promise<LeagueSummaryResponse> {
  if (chain === "solana") {
    return {
      chain,
      period,
      leagues: LEAGUES.map((league) => ({
        key: league.key,
        title: league.title,
        status: "pending",
        entrants: 0,
        rows: [],
        warning: "Solana league feed pending. No Solana standings yet. Claims open after Solana league payouts are live.",
      })),
      currentLeaders: [],
      history: [],
    };
  }

  const results = await Promise.all(
    LEAGUES.map(async (league) => {
      const effectivePeriod = league.supports.includes(period) ? period : league.supports[0];
      const params = new URLSearchParams({
        chainId: String(chainId),
        period: effectivePeriod,
        epochOffset: String(effectivePeriod === period ? epochOffset : 0),
        limit: String(getLimit(league, effectivePeriod)),
        category: league.key,
      });

      try {
        const response = await fetch(`/api/league?${params.toString()}`);
        const json = (await response.json()) as LegacyLeagueResponse;
        return [league.key, json] as const;
      } catch (error) {
        return [league.key, { items: [], warning: "League feed unavailable." } satisfies LegacyLeagueResponse] as const;
      }
    }),
  );

  let epoch: LeagueEpoch | undefined;
  const leagues: LeagueSummaryCard[] = [];
  const currentLeaders: CurrentLeagueLeader[] = [];
  let prize: LeaguePrizeMeta | undefined;

  for (const [key, payload] of results) {
    const def = LEAGUES.find((league) => league.key === key)!;
    const rows = Array.isArray(payload.items) ? payload.items : [];
    const isRecruiterPending = key === "recruiter_league" && !rows.length;
    const status: LeagueStatus = isRecruiterPending ? "pending" : getStatus(rows, payload.warning);

    if (!epoch && payload.epoch) epoch = payload.epoch;
    if (!prize && payload.prize) prize = payload.prize;

    leagues.push({
      key,
      title: def.title,
      status,
      entrants: rows.length,
      rows,
      prize: payload.prize,
      warning: isRecruiterPending ? def.emptyStateCopy : payload.warning,
    });

    const top = rows[0] as any;
    if (top) {
      currentLeaders.push({
        leagueKey: key,
        leagueTitle: def.title,
        label: leaderLabel(top),
        metric: metricFor(def, top),
      });
    }
  }

  return {
    chain,
    period,
    epoch,
    prize,
    leagues,
    currentLeaders,
    history: [],
  };
}
