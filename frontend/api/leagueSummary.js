import { json } from '../server/http.js';
import { getPayoutPolicy } from './leaguePayoutPolicy.js';

export default async function handler(_req, res) {
  const policy = getPayoutPolicy('weekly');

  return json(res, 200, {
    success: true,
    generatedAt: new Date().toISOString(),
    chains: {
      bnb: { status: 'active', nativeSymbol: 'BNB' },
      solana: { status: 'pending', nativeSymbol: 'SOL' }
    },
    categories: {
      trader: {},
      creator: {},
      recruiter: {},
      squad: {},
      battlegrounds: {},
      warzone: {}
    },
    payoutPolicy: policy,
    history: [],
    leaders: {}
  });
}
