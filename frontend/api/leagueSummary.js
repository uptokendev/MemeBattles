import { badMethod, getQuery, json } from '../server/http.js';
import { getPayoutPolicy, getCapMeta } from './leaguePayoutPolicy.js';

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

  return LEAGUES.map((league) => ({
    key: league.key,
    title: league.title,
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

export default async function handler(req, res) {
  if (req.method !== 'GET') return badMethod(res);

  const q = getQuery(req);
  const chain = normChain(q.chain);
  const period = normPeriod(q.period);
  const epochOffset = normEpochOffset(q.epochOffset, period);

  if (chain === 'solana') {
    return json(res, 200, buildPendingSummary({ chain, period, epochOffset }));
  }

  return json(res, 501, buildPendingSummary({ chain, period, epochOffset }));
}
