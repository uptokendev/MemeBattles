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
  epochStart: string | null;
  epochEnd: string | null;
  rangeEnd: string | null;
  status: "live" | "finalized" | "pending";
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
  capReached?: boolean;
  charityReserveUsd?: number;
  monthlyPlayerPrizeCapUsd?: number;
  warning?: string;
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
  stats?: { campaignsCreated?: number; recruitersRanked?: number };
};

export interface LoadLeagueSummaryOptions {
  chain: LeagueChain;
  chainId: number;
  period: LeaguePeriod;
  epochOffset: number;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStatus(value: unknown, fallback: LeagueStatus = "empty"): LeagueStatus {
  const status = String(value || "").toLowerCase();
  if (["loading", "ready", "empty", "pending", "error", "claimable", "finalized", "expired", "rolled_over"].includes(status)) return status as LeagueStatus;
  return fallback;
}

function isLeagueKey(value: unknown): value is LeagueKey {
  return LEAGUES.some((league) => league.key === value);
}

function normalizeRecruiterRow(row: any, index: number) {
  return {
    ...row,
    rank: toNumber(row?.rank, index + 1),
    displayName: row?.displayName || row?.display_name || undefined,
    recruiterCode: row?.recruiterCode || row?.code || undefined,
    wallet: row?.wallet || row?.walletAddress || row?.wallet_address || undefined,
    linkedWallets: toNumber(row?.linkedWallets ?? row?.linkedWalletCount ?? row?.linked_wallet_count),
    linkedCreators: toNumber(row?.linkedCreators ?? row?.linkedCreatorsCount ?? row?.linked_creators_count),
    linkedTraders: toNumber(row?.linkedTraders ?? row?.linkedTradersCount ?? row?.linked_traders_count),
    activeSquadMembers: toNumber(row?.activeSquadMembers ?? row?.activeSquadMemberCount ?? row?.active_squad_member_count),
    referredVolumeUsd: toNumber(row?.referredVolumeUsd ?? row?.referred_volume_usd),
    weightedScore: toNumber(row?.weightedScore ?? row?.weighted_score),
    estimatedPayoutUsd: toNumber(row?.estimatedPayoutUsd ?? row?.estimated_payout_usd),
    claimStatus: row?.claimStatus || row?.claim_status || "Pending",
  };
}

function normalizeRows(def: LeagueDef, rows: unknown[]) {
  if (def.key === "recruiter_league") return rows.map((row, index) => normalizeRecruiterRow(row, index));
  return rows;
}

function getStatus(rows: unknown[], warning?: string): LeagueStatus {
  if (warning) return "error";
  return rows.length ? "ready" : "empty";
}

function leaderLabel(row: any) {
  if (typeof row?.displayName === "string") return row.displayName;
  if (typeof row?.recruiterCode === "string") return row.recruiterCode;
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
  if (def.key === "recruiter_league") return row?.weightedScore ? `${Number(row.weightedScore).toLocaleString()} score` : def.metricLabel;
  return def.metricLabel;
}

function solanaPendingSummary(chain: LeagueChain, period: LeaguePeriod, epochOffset: number): LeagueSummaryResponse {
  return {
    chain,
    period,
    epoch: { period, epochOffset, epochStart: null, epochEnd: null, rangeEnd: null, status: "pending" },
    payoutPolicy: { minWinners: period === "weekly" ? 3 : 5, paidFieldPct: 0.15, alpha: 0.72, monthlyPlayerPrizeCapUsd: 1_500_000 },
    prize: { capReached: false, charityReserveUsd: 0, monthlyPlayerPrizeCapUsd: 1_500_000, warning: "Solana prize feed pending." },
    leagues: LEAGUES.map((league) => ({
      key: league.key,
      title: league.title,
      status: "pending",
      entrants: 0,
      rows: [],
      warning: "Solana league feed pending. BNB standings and prize pools are not reused for Solana.",
    })),
    currentLeaders: [],
    history: [],
  };
}

function normalizeSummaryPayload(payload: any, chain: LeagueChain, period: LeaguePeriod, epochOffset: number): LeagueSummaryResponse | undefined {
  if (!payload || !Array.isArray(payload.leagues)) return undefined;

  const cards: LeagueSummaryCard[] = [];
  const leaders: CurrentLeagueLeader[] = [];

  for (const def of LEAGUES) {
    const incoming = payload.leagues.find((item: any) => item?.key === def.key);
    const rawRows = Array.isArray(incoming?.rows) ? incoming.rows : Array.isArray(incoming?.items) ? incoming.items : [];
    const rows = normalizeRows(def, rawRows);
    const status = toStatus(incoming?.status, getStatus(rows, incoming?.warning));

    cards.push({
      key: def.key,
      title: incoming?.title || def.title,
      status,
      entrants: toNumber(incoming?.entrants, rows.length),
      rows,
      prize: incoming?.prize,
      warning: incoming?.warning,
    });

    const top = rows[0] as any;
    if (top) leaders.push({ leagueKey: def.key, leagueTitle: def.title, label: leaderLabel(top), metric: metricFor(def, top) });
  }

  return {
    chain: payload.chain === "solana" || payload.chain === "bnb" ? payload.chain : chain,
    period: payload.period === "weekly" || payload.period === "monthly" ? payload.period : period,
    epoch: payload.epoch || { period, epochOffset, epochStart: null, epochEnd: null, rangeEnd: null, status: chain === "solana" ? "pending" : "live" },
    prize: payload.prize,
    payoutPolicy: payload.payoutPolicy,
    leagues: cards,
    selectedLeague: payload.selectedLeague && isLeagueKey(payload.selectedLeague.key)
      ? {
          key: payload.selectedLeague.key,
          status: toStatus(payload.selectedLeague.status),
          rows: normalizeRows(LEAGUES.find((league) => league.key === payload.selectedLeague.key)!, Array.isArray(payload.selectedLeague.rows) ? payload.selectedLeague.rows : []),
          prize: payload.selectedLeague.prize,
          warning: payload.selectedLeague.warning,
        }
      : undefined,
    currentLeaders: Array.isArray(payload.currentLeaders) && payload.currentLeaders.length ? payload.currentLeaders : leaders,
    history: Array.isArray(payload.history) ? payload.history : [],
  };
}

async function tryLoadFutureSummary({ chain, chainId, period, epochOffset }: LoadLeagueSummaryOptions) {
  const params = new URLSearchParams({ chain, chainId: String(chainId), period, epochOffset: String(epochOffset) });
  try {
    const response = await fetch(`/api/league/summary?${params.toString()}`);
    if (!response.ok) return undefined;
    const payload = await response.json();
    return normalizeSummaryPayload(payload, chain, period, epochOffset);
  } catch {
    return undefined;
  }
}

async function loadLegacySummary({ chain, chainId, period, epochOffset }: LoadLeagueSummaryOptions): Promise<LeagueSummaryResponse> {
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
      } catch {
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
    const rawRows = Array.isArray(payload.items) ? payload.items : [];
    const rows = normalizeRows(def, rawRows);
    const status = getStatus(rows, payload.warning);

    if (!epoch && payload.epoch) epoch = payload.epoch;
    if (!prize && payload.prize) prize = payload.prize;

    leagues.push({ key, title: def.title, status, entrants: rows.length, rows, prize: payload.prize, warning: payload.warning });

    const top = rows[0] as any;
    if (top) currentLeaders.push({ leagueKey: key, leagueTitle: def.title, label: leaderLabel(top), metric: metricFor(def, top) });
  }

  return { chain, period, epoch, prize, leagues, currentLeaders, history: [] };
}

export async function loadLeagueSummary(options: LoadLeagueSummaryOptions): Promise<LeagueSummaryResponse> {
  const futureSummary = await tryLoadFutureSummary(options);
  if (futureSummary) return futureSummary;
  if (options.chain === "solana") return solanaPendingSummary(options.chain, options.period, options.epochOffset);
  return loadLegacySummary(options);
}
