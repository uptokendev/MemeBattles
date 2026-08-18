import fs from 'node:fs/promises';
import path from 'node:path';

const EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.sql', '.rs']);
const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'artifacts']);

async function walk(root, out = []) {
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

async function find(files, regex) {
  const hits = [];
  for (const file of files) {
    let text = '';
    try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
    regex.lastIndex = 0;
    if (regex.test(text)) hits.push(file);
  }
  return hits;
}

const evidence = (root, files) => files.slice(0, 6).map((file) => path.relative(root, file)).join(', ');
const isCertificationSource = (file) => file.split(path.sep).includes('incentive-cert');

export async function runSourceAudit({ root = process.cwd(), report }) {
  const files = await walk(root);
  const runtimeFiles = files.filter((file) => !isCertificationSource(file));
  const tests = [
    ['Weekly airdrop production machinery found', 'bnb', /weekly[-_ ]airdrop|airdrop:weekly|run-weekly-airdrop/i],
    ['Solana league-specific claim machinery found', 'solana', /solana[^\n]{0,100}league|league[^\n]{0,100}solana|claim_league/i],
    ['League root/Merkle finalization evidence found', 'shared', /league[^\n]{0,100}(merkle|root)|merkle[^\n]{0,100}league/i],
    ['Unified reward ledger found', 'shared', /reward_ledger/i],
    ['League winner materialization store found', 'shared', /league_epoch_winners/i],
    ['Recruiter reward path found', 'shared', /recruiter[^\n]{0,80}(reward|claim|payout)|reward[^\n]{0,80}recruiter/i],
    ['Squad reward path found', 'shared', /squad[^\n]{0,80}(reward|claim|payout)|reward[^\n]{0,80}squad/i],
    ['Reward history path found', 'shared', /reward[^\n]{0,80}history|history[^\n]{0,80}reward/i],
    ['Deterministic Solana receipt reconciliation found', 'solana', /getSignaturesForAddress|deterministic_claim_receipt|claim_reconciled_onchain/i],
    ['Strict Solana vault-delta verification found', 'solana', /vaultDelta|preBalance[^\n]{0,100}postBalance|SOLANA_CLAIM_VAULT_DELTA_MISMATCH/i],
  ];

  for (const [name, chain, regex] of tests) {
    const hits = await find(runtimeFiles, regex);
    report.add(name, hits.length ? 'PASS' : 'BLOCK', { evidence: evidence(root, hits) }, chain);
  }

  const idempotency = await find(runtimeFiles, /CLAIMING|claimed_at|idempot|claimReceipt|claim_receipt/i);
  report.add('Claim idempotency/recovery markers found', idempotency.length ? 'PASS' : 'BLOCK', { evidence: evidence(root, idempotency) }, 'shared');

  // Only inspect runtime sources. The certification script deliberately contains these
  // literal marker names so it can detect regressions; matching itself is not evidence
  // that the product claim rail is disabled.
  const solDisabled = await find(runtimeFiles, /SOLANA_CLAIMS_DISABLED|GENERIC_SOLANA_CLAIMS_DISABLED/i);
  report.add(
    solDisabled.length ? 'Generic Solana claim rail contains explicit disabled marker' : 'No explicit generic Solana-disabled runtime marker detected',
    solDisabled.length ? 'BLOCK' : 'PASS',
    { evidence: evidence(root, solDisabled) },
    'solana',
  );

  return { filesScanned: runtimeFiles.length };
}