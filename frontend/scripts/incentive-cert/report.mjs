const SEVERITY = Object.freeze({ PASS: 0, WARN: 1, SKIP: 2, BLOCK: 3, FAIL: 4 });

export function createReport(meta = {}) {
  const checks = [];
  return {
    meta: { generatedAt: new Date().toISOString(), ...meta },
    checks,
    add(name, status, details = {}, chain = 'shared') {
      if (!(status in SEVERITY)) throw new Error(`Unknown certification status: ${status}`);
      checks.push({ name, chain, status, ...details });
    },
    summary() {
      const counts = { PASS: 0, WARN: 0, SKIP: 0, BLOCK: 0, FAIL: 0 };
      for (const check of checks) counts[check.status] += 1;
      return { counts, launchPass: counts.FAIL === 0 && counts.BLOCK === 0 };
    },
    toJSON() { return { meta: this.meta, checks, summary: this.summary() }; },
  };
}

export function printReport(report) {
  const data = report.toJSON();
  console.log('\nMemeWarzone Incentive Certification');
  console.log('==================================');
  for (const check of data.checks) {
    console.log(`${check.status.padEnd(5)} [${check.chain}] ${check.name}${check.evidence ? ` :: ${check.evidence}` : ''}`);
  }
  console.log('----------------------------------');
  console.log(JSON.stringify(data.summary));
  return data;
}
