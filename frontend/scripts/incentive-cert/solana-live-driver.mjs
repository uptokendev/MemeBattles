import fs from 'node:fs/promises';
import path from 'node:path';

function pass(name, evidence) { return { name, status: 'PASS', evidence }; }
function fail(name, error) { return { name, status: 'FAIL', evidence: String(error?.message || error || 'verification failed') }; }
function block(name, evidence) { return { name, status: 'BLOCK', evidence }; }

async function readEvidence() {
  const configured = String(process.env.CERT_EVIDENCE_FILE || '').trim();
  if (!configured) throw new Error('CERT_EVIDENCE_FILE is required for live Solana certification');
  const file = path.resolve(configured);
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  return { file, data: parsed };
}

async function verifyLeague({ pool, verifySolanaLeagueClaimTransaction, evidence, chainId }) {
  const name = 'league live settlement';
  try {
    const item = evidence.league;
    if (!item?.txHash || !item?.period || !item?.epochStart || !item?.category || !item?.rank) throw new Error('League evidence is incomplete');
    const { rows } = await pool.query(
      `select recipient_address, amount_raw::text as amount_raw
         from public.league_epoch_winners
        where chain_id=$1 and period=$2 and epoch_start=$3::timestamptz and category=$4 and rank=$5
        limit 1`,
      [chainId, item.period, item.epochStart, item.category, Number(item.rank)],
    );
    const winner = rows[0];
    if (!winner) throw new Error('League winner row not found');
    const verification = await verifySolanaLeagueClaimTransaction({
      chainId,
      period: item.period,
      epochStart: item.epochStart,
      category: item.category,
      rank: Number(item.rank),
      recipient: String(winner.recipient_address),
      amountRaw: String(winner.amount_raw),
      txHash: String(item.txHash),
    });
    const claim = await pool.query(
      `select claimed_at, signature
         from public.league_epoch_claims
        where chain_id=$1 and period=$2 and epoch_start=$3::timestamptz and category=$4 and rank=$5
        limit 1`,
      [chainId, item.period, item.epochStart, item.category, Number(item.rank)],
    );
    if (!claim.rows[0]?.claimed_at) throw new Error('League DB claim is not marked claimed');
    if (String(claim.rows[0]?.signature || '') !== String(item.txHash)) throw new Error('League DB signature does not match confirmed transaction');
    return pass(name, `${item.txHash} :: recipient=${winner.recipient_address} amount=${winner.amount_raw} slot=${verification?.slot ?? 'confirmed'}`);
  } catch (error) { return fail(name, error); }
}

async function verifyLedgerReward({ pool, verifySolanaRewardClaim, evidence, key, label, chainId, requireReconciliationAudit = false }) {
  const name = `${label} live settlement`;
  try {
    const item = evidence[key];
    if (!item?.rewardLedgerId || !item?.txHash) throw new Error(`${label} evidence is incomplete`);
    const { rows } = await pool.query(`select * from public.reward_ledger where id=$1::uuid and chain::text=$2::text limit 1`, [item.rewardLedgerId, String(chainId)]);
    const row = rows[0];
    if (!row) throw new Error(`${label} reward_ledger row not found`);
    const verification = await verifySolanaRewardClaim({ row, txHash: String(item.txHash), walletAddress: String(row.wallet_address) });
    if (String(row.status) !== 'claimed') throw new Error(`${label} reward ledger status is ${row.status}, expected claimed`);
    if (String(row.claim_tx_hash || '') !== String(item.txHash)) throw new Error(`${label} DB transaction hash mismatch`);

    if (requireReconciliationAudit) {
      const audit = await pool.query(
        `select action, tx_hash, metadata
           from public.reward_audit_logs
          where reward_ledger_id=$1::uuid and action='claim_reconciled_onchain' and tx_hash=$2
          order by created_at desc limit 1`,
        [item.rewardLedgerId, item.txHash],
      );
      const recovered = audit.rows[0];
      if (!recovered) throw new Error('Squad cross-session reconciliation audit row is missing');
      const metadata = recovered.metadata && typeof recovered.metadata === 'object' ? recovered.metadata : {};
      if (String(metadata.reconciliationSource || metadata?.claimVerification?.reconciliationSource || '') !== 'deterministic_claim_receipt') {
        throw new Error('Squad reconciliation audit is not tagged deterministic_claim_receipt');
      }
    }

    return pass(name, `${item.txHash} :: ledger=${item.rewardLedgerId} wallet=${row.wallet_address} amount=${row.amount} receipt=${verification.claimReceiptAddress}`);
  } catch (error) { return fail(name, error); }
}

async function verifyRecruiter({ pool, verifySolanaRewardLaneClaim, evidence, chainId }) {
  const name = 'recruiter live settlement';
  try {
    const item = evidence.recruiter;
    if (!item?.recruiterClaimId || !item?.txHash) throw new Error('Recruiter evidence is incomplete');
    const { rows } = await pool.query(
      `select c.id, c.status as recruiter_status, c.tx_hash, c.payout_wallet,
              s.status as settlement_status, s.amount_lamports::text as amount_lamports,
              s.tx_hash as settlement_tx_hash,
              b.chain_id, b.epoch_id::text as epoch_id
         from public.recruiter_reward_claims c
         join public.solana_reward_lane_claims s
           on s.lane='recruiter' and s.source_type='recruiter_reward_claim' and s.source_ref=c.id::text
         join public.solana_reward_lane_batches b on b.id=s.batch_id
        where c.id=$1 and b.chain_id=$2
        limit 1`,
      [item.recruiterClaimId, chainId],
    );
    const row = rows[0];
    if (!row) throw new Error('Prepared recruiter settlement row not found');
    const verification = await verifySolanaRewardLaneClaim({
      lane: 'recruiter',
      chainId,
      epochId: row.epoch_id,
      walletAddress: row.payout_wallet,
      amountLamports: row.amount_lamports,
      txHash: String(item.txHash),
    });
    if (String(row.recruiter_status) !== 'confirmed') throw new Error(`Recruiter claim status is ${row.recruiter_status}, expected confirmed`);
    if (String(row.settlement_status) !== 'claimed') throw new Error(`Recruiter settlement status is ${row.settlement_status}, expected claimed`);
    if (String(row.tx_hash || '') !== String(item.txHash) || String(row.settlement_tx_hash || '') !== String(item.txHash)) throw new Error('Recruiter DB transaction hash mismatch');
    return pass(name, `${item.txHash} :: claim=${item.recruiterClaimId} wallet=${row.payout_wallet} amount=${row.amount_lamports} receipt=${verification.claimReceiptAddress}`);
  } catch (error) { return fail(name, error); }
}

function operatorChecks(evidence) {
  const manual = evidence.operatorChecks || {};
  return [
    manual.wrongWalletRejected === true
      ? pass('Wrong-wallet live rejection', 'Operator recorded rejection in the real UI/wallet flow.')
      : block('Wrong-wallet live rejection', 'Set operatorChecks.wrongWalletRejected=true only after the real wrong-wallet attempt is rejected.'),
    manual.duplicateRejected === true
      ? pass('Duplicate claim live stress test', 'Operator recorded duplicate rejection after the original confirmed claim.')
      : block('Duplicate claim live stress test', 'Set operatorChecks.duplicateRejected=true only after the real duplicate attempt is rejected.'),
    manual.squadBrowserClosedAfterConfirmation === true
      ? pass('Crash-after-payment recovery', 'Squad test deliberately closed/interrupted the first session after chain confirmation; DB recovery is independently checked by audit row.')
      : block('Crash-after-payment recovery', 'Set operatorChecks.squadBrowserClosedAfterConfirmation=true only after the deliberate cross-session Squad test.'),
  ];
}

export async function runCertification({ chain, config }) {
  if (chain !== 'solana') return [block('Live certification driver configured', 'solana-live-driver.mjs only certifies Solana; run with CERT_CHAIN=solana.')];
  const { file, data } = await readEvidence();
  const chainId = Number(data.chainId || 0);
  if (chainId !== 102 || config.solanaCluster !== 'devnet') {
    return [block('Solana devnet isolation', `Refusing evidence chainId=${chainId} cluster=${config.solanaCluster}; expected chainId=102/devnet.`)];
  }

  const [{ pool }, { verifySolanaRewardClaim }, { verifySolanaRewardLaneClaim }, { verifySolanaLeagueClaimTransaction }] = await Promise.all([
    import('../../server/db.js'),
    import('../../api/lib/solanaRewardClaim.js'),
    import('../../api/lib/solanaRewardLane.js'),
    import('../../api/lib/solanaLeagueClaimVerification.js'),
  ]);

  const results = [pass('Solana devnet isolation', `Evidence=${file} chainId=102 cluster=devnet`)];
  try {
    results.push(await verifyLeague({ pool, verifySolanaLeagueClaimTransaction, evidence: data, chainId }));
    results.push(await verifyLedgerReward({ pool, verifySolanaRewardClaim, evidence: data, key: 'airdropTrader', label: 'airdrop_trader', chainId }));
    results.push(await verifyLedgerReward({ pool, verifySolanaRewardClaim, evidence: data, key: 'airdropCreator', label: 'airdrop_creator', chainId }));
    results.push(await verifyRecruiter({ pool, verifySolanaRewardLaneClaim, evidence: data, chainId }));
    results.push(await verifyLedgerReward({ pool, verifySolanaRewardClaim, evidence: data, key: 'squad', label: 'squad', chainId, requireReconciliationAudit: true }));
    results.push(...operatorChecks(data));
    const financialFailures = results.filter((item) => item.status === 'FAIL' || item.status === 'BLOCK');
    results.push(financialFailures.length
      ? block('DB/blockchain reconciliation', `${financialFailures.length} live requirement(s) are not certified.`)
      : pass('DB/blockchain reconciliation', 'All supplied Solana devnet settlements strictly verify on-chain and match canonical DB state.'));
  } finally {
    await pool.end().catch(() => {});
  }
  return results;
}
