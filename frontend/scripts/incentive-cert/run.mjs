import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCertConfig, REWARD_TYPES } from './config.mjs';
import { createReport, printReport } from './report.mjs';
import { runSourceAudit } from './source-audit.mjs';

const config = loadCertConfig();
const report = createReport({ mode: config.execute ? 'EXECUTE' : 'PREFLIGHT', chain: config.chain, epochId: config.epochId || null });
await runSourceAudit({ root: process.cwd(), report });

report.add('Creator LP fee harvesting', 'SKIP', { evidence: 'Excluded: BNB/Topaz and Solana/Meteora already verified end-to-end by founder.' }, 'shared');

const chains = config.chain === 'all' ? ['bnb', 'solana'] : [config.chain];
if (!config.execute) {
  for (const chain of chains) {
    for (const type of REWARD_TYPES) report.add(`${type} live settlement`, 'SKIP', { evidence: 'Preflight only; no funds moved.' }, chain);
    report.add('Duplicate claim live stress test', 'SKIP', { evidence: 'Preflight only; run self-test for harness invariant.' }, chain);
    report.add('Crash-after-payment recovery', 'SKIP', { evidence: 'Preflight only; live proof requires execution driver.' }, chain);
    report.add('DB/blockchain reconciliation', 'SKIP', { evidence: 'Preflight only; live proof requires execution driver.' }, chain);
  }
} else {
  const driverPath = String(process.env.CERT_DRIVER_MODULE || '').trim();
  if (!driverPath) {
    for (const chain of chains) report.add('Live certification driver configured', 'BLOCK', { evidence: 'CERT_DRIVER_MODULE must point at the production-path adapter.' }, chain);
  } else {
    const driver = await import(pathToFileURL(path.resolve(driverPath)).href);
    if (typeof driver.runCertification !== 'function') throw new Error('CERT_DRIVER_MODULE must export runCertification(ctx)');
    for (const chain of chains) {
      const results = await driver.runCertification({ chain, config, rewardTypes: REWARD_TYPES });
      for (const result of results || []) report.add(result.name, result.status, { evidence: result.evidence }, chain);
    }
  }
}

const data = printReport(report);
const outDir = path.resolve(process.env.CERT_REPORT_DIR || 'artifacts/incentive-cert');
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `report-${Date.now()}.json`);
await fs.writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Report: ${outFile}`);

if (data.summary.FAIL || data.summary.BLOCK) process.exitCode = 1;
