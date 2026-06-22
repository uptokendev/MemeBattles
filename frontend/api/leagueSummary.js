import { badMethod, getQuery, json } from '../server/http.js';
import league from './league.js';
import leagueRecruiter from './leagueRecruiter.js';
import { calculatePayoutCurve, getPayoutPolicy, getCapMeta } from './leaguePayoutPolicy.js';

const LEAGUES = [
  { key: 'perfect_run', title: 'Perfect Run' },
  { key: 'fastest_finish', title: 'Fastest Finish' },
  { key: 'biggest_hit', title: 'Biggest Hit' },
  { key: 'top_earner', title: 'Top Earner' },
  { key: 'crowd_favorite', title: 'Crowd Favorite' },
  { key: 'recruiter_league', title: 'Recruiter League' },
];

const HISTORY_WEEKLY_OFFSETS = [1, 2];
const HISTORY_MONTHLY_OFFSETS = [1];

function normChain(value) {
  return String(value || 'bnb').toLowerCase() === 'solana' ? 'solana' : 'bnb';
}

function normPeriod(value) {
  return String(value || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
}

function normEpochOffset(value, period) {
  const max = period === 'monthly' ? 1 : 2;
  const n = Math.trunc(Number(value || 0));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function pendingEpoch(period, epochOffset) {
  return {
    period,
    epochOffset,
    epochStart: null,
    epochEnd: null,
    rangeEnd: null,
    status: 'pending',
  };
}

function pendingLeagues(chain) {
  const warning = chain === 'solana'
    ? 'Solana league feed pending. BNB standings and prize pools are not reused for Solana.'
    : 'BNB summary aggregation is not enabled yet. Frontend should use legacy /api/league fallback.';

  return LEAGUES.map((leagueMeta) => ({
    key: leagueMeta.key,
    title: leagueMeta.title,
    status: 'pending',
    entrants: 0,
    rows: [],
    warning,
  }));
}

function buildPendingSummary({ chain, period, epochOffset }) {
  const policy = getPayoutPolicy(period);
  const cap = getCapMeta(period, 0, policy);
  const epoch = pendingEpoch(period, epochOffset);
  const prize = {
    basis: chain === 'solana' ? 'solana_pending' : 'bnb_summary_pending',
    capReached: cap.capReached,
    charityReserveUsd: cap.charityReserveUsd,
    monthlyPlayerPrizeCapUsd: cap.monthlyPlayerPrizeCapUsd,
    playerPrizePoolUsd: cap.playerPrizePoolUsd,
    generatedUsd: cap.generatedUsd,
    warning: chain === 'solana'
      ? 'Solana prize feed pending.'
      : 'BNB summary endpoint scaffolded; legacy category feeds remain the source of truth.',
  };

  return {
    chain,
    period,
    epoch,
    current: { epoch, winners: [], prize },
    payoutPolicy: policy,
    prize,
    leagues: pendingLeagues(chain),
    currentLeaders: [],
    history: { weekly: [], monthly: [] },
    historyMeta: { weeklyOffsets: HISTORY_WEEKLY_OFFSETS, monthlyOffsets: HISTORY_MONTHLY_OFFSETS },
  };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function rawToUsd(raw, bnbUsd) {
  let whole = 0n;
  try {
    whole = BigInt(String(raw ?? '0'));
  } catch {
    return 0;
  }
  const usd = Number(whole) / 1e18 * bnbUsd;
  return Number.isFinite(usd) ? usd : 0;
}

function readBnbUsd() {
  const n = Number(process.env.BNB_USD_PRICE || process.env.LEAGUE_BNB_USD_PRICE || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function captureJson() {
  const chunks = [];
  return {
    res: {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      end(chunk) {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      },
    },
    body() {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  };
}

async function callLegacyLeague(req, { category, chainId, period, epochOffset, limit }) {
  const params = new URLSearchParams({
    category,
    chainId: String(chainId),
    period,
    epochOffset: String(epochOffset),
    limit: String(limit),
  });
  const url = `/api/league?${params.toString()}`;
  const { res, body } = captureJson();
  const proxyReq = { ...req, method: 'GET', url, originalUrl: url, query: undefined };

  if (category === 'recruiter_league') await leagueRecruiter(proxyReq, res);
  else await league(proxyReq, res);

  return { statusCode: res.statusCode || 200, payload: body() || {} };
}

function rankRows(rows, prize, policy) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const generatedUsd = rawToUsd(firstDefined(prize?.availablePotRaw, prize?.potRaw), readBnbUsd());
  const curve = calculatePayoutCurve(safeRows.length, generatedUsd, policy);

  return safeRows.map((row, index) => ({
    ...row,
    rank: Number(row?.rank || index + 1),
    estimatedPayoutUsd: curve[index]?.payoutUsd || 0,
    payoutPercentage: curve[index]?.percentage || 0,
  }));
}

function normalizeLeagueResult(meta, result, policy) {
  const payload = result?.payload || {};
  const rows = rankRows(payload.items || payload.rows || [], payload.prize, policy);
  const warning = firstDefined(payload.warning, result?.statusCode >= 400 ? payload.error : undefined);

  return {
    key: meta.key,
    title: meta.title,
    status: result?.statusCode >= 400 ? 'error' : warning ? 'warning' : 'ready',
    entrants: rows.length,
    rows,
    prize: payload.prize || null,
    epoch: payload.epoch || null,
    stats: payload.stats || null,
    warning,
  };
}

function summarizePrize(leagues, period, policy) {
  const bnbUsd = readBnbUsd();
  let generatedUsd = 0;
  let totalLeagueFeeRaw = '0';
  const byLeague = {};

  for (const leagueResult of leagues) {
    const prize = leagueResult.prize;
    if (!prize) continue;
    if (prize.totalLeagueFeeRaw && totalLeagueFeeRaw === '0') totalLeagueFeeRaw = String(prize.totalLeagueFeeRaw);
    const raw = firstDefined(prize.availablePotRaw, prize.potRaw, '0');
    const usd = rawToUsd(raw, bnbUsd);
    generatedUsd += usd;
    byLeague[leagueResult.key] = {
      potRaw: prize.potRaw,
      availablePotRaw: prize.availablePotRaw,
      paidRaw: prize.paidRaw,
      rolloverRaw: prize.rolloverRaw,
      estimatedUsd: usd,
      splitBps: prize.splitBps,
      basis: prize.basis,
    };
  }

  const cap = getCapMeta(period, generatedUsd, policy);
  return {
    basis: 'bnb_aggregated_legacy_categories',
    generatedUsd: cap.generatedUsd,
    playerPrizePoolUsd: cap.playerPrizePoolUsd,
    charityReserveUsd: cap.charityReserveUsd,
    monthlyPlayerPrizeCapUsd: cap.monthlyPlayerPrizeCapUsd,
    capApplies: cap.capApplies,
    capReached: cap.capReached,
    bnbUsdPrice: bnbUsd || null,
    totalLeagueFeeRaw,
    byLeague,
    warning: bnbUsd ? undefined : 'BNB_USD_PRICE is not configured; USD prize estimates are returned as 0 while raw BNB prize pools remain available.',
  };
}

function walletFromRow(row) {
  return firstDefined(row?.wallet, row?.walletAddress, row?.wallet_address, row?.buyer_address, row?.creator_address, row?.recipient_address, row?.address, null);
}

function winnerFromRow(row) {
  return {
    rank: Number(row?.rank || 1),
    wallet: walletFromRow(row),
    name: row?.name || row?.displayName || null,
    symbol: row?.symbol || null,
    campaignAddress: row?.campaign_address || row?.campaignAddress || null,
    estimatedPayoutUsd: row?.estimatedPayoutUsd || 0,
    payoutPercentage: row?.payoutPercentage || 0,
    row,
  };
}

function pickCurrentLeaders(leagues) {
  return leagues
    .map((leagueResult) => {
      const leader = Array.isArray(leagueResult.rows) ? leagueResult.rows[0] : null;
      return leader ? { league: leagueResult.key, title: leagueResult.title, ...winnerFromRow(leader) } : null;
    })
    .filter(Boolean);
}

function pickEpoch(leagues, period, epochOffset) {
  for (const leagueResult of leagues) {
    if (leagueResult?.epoch) return leagueResult.epoch;
  }
  return pendingEpoch(period, epochOffset);
}

function prizeSnapshot(prize) {
  return {
    basis: prize?.basis,
    generatedUsd: prize?.generatedUsd || 0,
    playerPrizePoolUsd: prize?.playerPrizePoolUsd || 0,
    charityReserveUsd: prize?.charityReserveUsd || 0,
    monthlyPlayerPrizeCapUsd: prize?.monthlyPlayerPrizeCapUsd || 0,
    capApplies: Boolean(prize?.capApplies),
    capReached: Boolean(prize?.capReached),
    bnbUsdPrice: prize?.bnbUsdPrice || null,
    totalLeagueFeeRaw: prize?.totalLeagueFeeRaw || '0',
    byLeague: prize?.byLeague || {},
    warning: prize?.warning,
  };
}

function leagueHistorySnapshot(leagueResult) {
  const rows = Array.isArray(leagueResult.rows) ? leagueResult.rows : [];
  return {
    key: leagueResult.key,
    title: leagueResult.title,
    status: leagueResult.status,
    entrants: leagueResult.entrants || rows.length,
    warning: leagueResult.warning,
    prize: leagueResult.prize || null,
    winners: rows.slice(0, Math.min(5, rows.length)).map(winnerFromRow),
  };
}

function buildHistoryEntry(period, epochOffset, summary) {
  const prize = prizeSnapshot(summary.prize);
  return {
    period,
    epochOffset,
    epoch: summary.epoch,
    prize,
    charity: {
      reserveUsd: prize.charityReserveUsd || 0,
      carriedForwardUsd: prize.charityReserveUsd || 0,
      source: prize.capReached ? 'monthly_cap_overflow' : 'none',
    },
    winners: summary.currentLeaders || [],
    leagues: (summary.leagues || []).map(leagueHistorySnapshot),
  };
}

async function buildHistory(req, { chainId, limit }) {
  const historyLimit = Math.max(1, Math.min(5, Number(limit) || 5));
  const weekly = await Promise.all(
    HISTORY_WEEKLY_OFFSETS.map(async (epochOffset) => buildHistoryEntry(
      'weekly',
      epochOffset,
      await aggregateBnbSummary(req, { chain: 'bnb', chainId, period: 'weekly', epochOffset, limit: historyLimit, includeHistory: false })
    ))
  );

  const monthly = await Promise.all(
    HISTORY_MONTHLY_OFFSETS.map(async (epochOffset) => buildHistoryEntry(
      'monthly',
      epochOffset,
      await aggregateBnbSummary(req, { chain: 'bnb', chainId, period: 'monthly', epochOffset, limit: historyLimit, includeHistory: false })
    ))
  );

  return { weekly, monthly };
}

async function aggregateBnbSummary(req, { chain, chainId, period, epochOffset, limit, includeHistory = true }) {
  const policy = getPayoutPolicy(period);
  const results = await Promise.all(
    LEAGUES.map(async (leagueMeta) => {
      try {
        const result = await callLegacyLeague(req, { category: leagueMeta.key, chainId, period, epochOffset, limit });
        return normalizeLeagueResult(leagueMeta, result, policy);
      } catch (error) {
        console.error(`[api/league/summary] ${leagueMeta.key} failed`, error);
        return { key: leagueMeta.key, title: leagueMeta.title, status: 'error', entrants: 0, rows: [], warning: 'League aggregation failed.' };
      }
    })
  );

  const epoch = pickEpoch(results, period, epochOffset);
  const prize = summarizePrize(results, period, policy);
  const currentLeaders = pickCurrentLeaders(results);
  const history = includeHistory ? await buildHistory(req, { chainId, limit }) : { weekly: [], monthly: [] };

  return {
    chain,
    chainId,
    period,
    epoch,
    current: { epoch, winners: currentLeaders, prize },
    payoutPolicy: policy,
    prize,
    leagues: results,
    currentLeaders,
    history,
    historyMeta: { weeklyOffsets: HISTORY_WEEKLY_OFFSETS, monthlyOffsets: HISTORY_MONTHLY_OFFSETS },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return badMethod(res);

  const q = getQuery(req);
  const chain = normChain(q.chain);
  const period = normPeriod(q.period);
  const epochOffset = normEpochOffset(q.epochOffset, period);
  const chainId = clampInt(q.chainId ?? 97, 1, 999999, 97);
  const limit = clampInt(q.limit ?? 10, 1, 50, 10);

  if (chain === 'solana') return json(res, 200, buildPendingSummary({ chain, period, epochOffset }));

  try {
    return json(res, 200, await aggregateBnbSummary(req, { chain, chainId, period, epochOffset, limit, includeHistory: true }));
  } catch (error) {
    console.error('[api/league/summary]', error);
    return json(res, 500, { error: 'Server error' });
  }
}
