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

  return {
    chain,
    period,
    epoch: pendingEpoch(period, epochOffset),
    payoutPolicy: policy,
    prize: {
      basis: chain === 'solana' ? 'solana_pending' : 'bnb_summary_pending',
      capReached: cap.capReached,
      charityReserveUsd: cap.charityReserveUsd,
      monthlyPlayerPrizeCapUsd: cap.monthlyPlayerPrizeCapUsd,
      playerPrizePoolUsd: cap.playerPrizePoolUsd,
      generatedUsd: cap.generatedUsd,
      warning: chain === 'solana'
        ? 'Solana prize feed pending.'
        : 'BNB summary endpoint scaffolded; legacy category feeds remain the source of truth.',
    },
    leagues: pendingLeagues(chain),
    currentLeaders: [],
    history: [],
  };
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function rawToUsd(raw, bnbUsd) {
  const rawString = String(raw ?? '0');
  let whole = 0n;
  try {
    whole = BigInt(rawString);
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
  const proxyReq = {
    ...req,
    method: 'GET',
    url,
    originalUrl: url,
    query: undefined,
  };

  if (category === 'recruiter_league') {
    await leagueRecruiter(proxyReq, res);
  } else {
    await league(proxyReq, res);
  }

  const payload = body() || {};
  return { statusCode: res.statusCode || 200, payload };
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

function pickCurrentLeaders(leagues) {
  return leagues
    .map((leagueResult) => {
      const leader = Array.isArray(leagueResult.rows) ? leagueResult.rows[0] : null;
      if (!leader) return null;
      return {
        league: leagueResult.key,
        title: leagueResult.title,
        rank: leader.rank || 1,
        wallet: firstDefined(leader.wallet, leader.walletAddress, leader.buyer_address, leader.creator_address, leader.recipient_address),
        campaignAddress: leader.campaign_address,
        name: leader.name || leader.displayName || null,
        symbol: leader.symbol || null,
        estimatedPayoutUsd: leader.estimatedPayoutUsd || 0,
        row: leader,
      };
    })
    .filter(Boolean);
}

function pickEpoch(leagues, period, epochOffset) {
  for (const leagueResult of leagues) {
    if (leagueResult?.epoch) return leagueResult.epoch;
  }
  return pendingEpoch(period, epochOffset);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return badMethod(res);

  const q = getQuery(req);
  const chain = normChain(q.chain);
  const period = normPeriod(q.period);
  const epochOffset = normEpochOffset(q.epochOffset, period);
  const chainId = clampInt(q.chainId ?? 97, 1, 999999, 97);
  const limit = clampInt(q.limit ?? 10, 1, 50, 10);

  if (chain === 'solana') {
    return json(res, 200, buildPendingSummary({ chain, period, epochOffset }));
  }

  try {
    const policy = getPayoutPolicy(period);
    const results = await Promise.all(
      LEAGUES.map(async (leagueMeta) => {
        try {
          const result = await callLegacyLeague(req, { category: leagueMeta.key, chainId, period, epochOffset, limit });
          return normalizeLeagueResult(leagueMeta, result, policy);
        } catch (error) {
          console.error(`[api/league/summary] ${leagueMeta.key} failed`, error);
          return {
            key: leagueMeta.key,
            title: leagueMeta.title,
            status: 'error',
            entrants: 0,
            rows: [],
            warning: 'League aggregation failed.',
          };
        }
      })
    );

    return json(res, 200, {
      chain,
      chainId,
      period,
      epoch: pickEpoch(results, period, epochOffset),
      payoutPolicy: policy,
      prize: summarizePrize(results, period, policy),
      leagues: results,
      currentLeaders: pickCurrentLeaders(results),
      history: [],
    });
  } catch (error) {
    console.error('[api/league/summary]', error);
    return json(res, 500, { error: 'Server error' });
  }
}
