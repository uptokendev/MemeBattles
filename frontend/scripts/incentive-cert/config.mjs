export const CHAINS = Object.freeze({
  bnb: Object.freeze({ key: 'bnb', defaultChainId: 97, forbiddenChainIds: [56] }),
  solana: Object.freeze({ key: 'solana', defaultCluster: 'devnet', forbiddenClusters: ['mainnet-beta'] }),
});

export const REWARD_TYPES = Object.freeze(['league', 'airdrop_trader', 'airdrop_creator', 'recruiter', 'squad']);
export const SAFETY_PHRASE = 'I_UNDERSTAND_THIS_SENDS_TEST_FUNDS';

const asBool = (value) => ['1', 'true'].includes(String(value ?? '').trim().toLowerCase());

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.length ? rest.join('=') : true;
  }
  return out;
}

export function loadCertConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const chain = String(args.chain || env.CERT_CHAIN || 'all').toLowerCase();
  if (!['bnb', 'solana', 'all'].includes(chain)) throw new Error(`Unsupported --chain=${chain}`);

  const execute = asBool(env.CERT_EXECUTE);
  const bnbChainId = Number(env.CERT_BNB_CHAIN_ID || CHAINS.bnb.defaultChainId);
  const solanaCluster = String(env.CERT_SOLANA_CLUSTER || CHAINS.solana.defaultCluster);
  const epochId = String(env.CERT_EPOCH_ID || '').trim();

  if (execute) {
    if (!epochId) throw new Error('CERT_EPOCH_ID is required when CERT_EXECUTE=1');
    if (String(env.CERT_ALLOW_TESTNET_EXECUTION || '') !== SAFETY_PHRASE) {
      throw new Error(`CERT_ALLOW_TESTNET_EXECUTION must equal ${SAFETY_PHRASE}`);
    }
    if ((chain === 'bnb' || chain === 'all') && CHAINS.bnb.forbiddenChainIds.includes(bnbChainId)) {
      throw new Error(`Refusing certification execution on BNB mainnet chainId ${bnbChainId}`);
    }
    if ((chain === 'solana' || chain === 'all') && CHAINS.solana.forbiddenClusters.includes(solanaCluster)) {
      throw new Error(`Refusing certification execution on Solana ${solanaCluster}`);
    }
  }

  return Object.freeze({ chain, execute, bnbChainId, solanaCluster, epochId });
}
