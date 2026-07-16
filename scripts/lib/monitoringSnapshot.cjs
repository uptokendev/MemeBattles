const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_BPS = 10_000n;

function toBigInt(value, fallback = 0n) {
  if (value === undefined || value === null || value === "") return fallback;
  return BigInt(value);
}

function isZeroAddress(value) {
  return !value || String(value).toLowerCase() === ZERO_ADDRESS;
}

function ratioBps(numerator, denominator) {
  const n = toBigInt(numerator);
  const d = toBigInt(denominator);
  if (d === 0n) return 0n;
  const value = (n * MAX_BPS) / d;
  return value > MAX_BPS ? MAX_BPS : value;
}

function classifyCampaignSnapshot(snapshot, options = {}) {
  const nearGraduationBps = toBigInt(options.nearGraduationBps, 9_500n);
  const sold = toBigInt(snapshot.sold);
  const curveSupply = toBigInt(snapshot.curveSupply);
  const nativeBalance = toBigInt(snapshot.nativeBalance);
  const nativeTarget = toBigInt(snapshot.nativeTarget);
  const soldBps = ratioBps(sold, curveSupply);
  const nativeProgressBps = ratioBps(nativeBalance, nativeTarget);
  const remainingNativeToTarget = nativeBalance >= nativeTarget ? 0n : nativeTarget - nativeBalance;
  const alerts = [];

  let status = "bonding";
  if (snapshot.oracleError) {
    status = "oracle-error";
    alerts.push(`oracle: ${snapshot.oracleError}`);
  } else if (snapshot.launched) {
    status = "graduated";
    if (isZeroAddress(snapshot.dexPair)) {
      status = "graduated-missing-pair";
      alerts.push("graduated campaign has no recorded DEX pair");
    }
  } else if (snapshot.paused || snapshot.graduationPaused) {
    status = "blocked";
    if (snapshot.paused) alerts.push("campaign paused");
    if (snapshot.graduationPaused) alerts.push("graduation paused");
  } else if (curveSupply > 0n && sold >= curveSupply && nativeBalance < nativeTarget) {
    status = "cannot-graduate-at-sellout";
    alerts.push("curve supply sold out before native graduation target");
  } else if (nativeTarget > 0n && nativeBalance >= nativeTarget) {
    status = "ready-to-graduate";
  } else if (soldBps >= nearGraduationBps || nativeProgressBps >= nearGraduationBps) {
    status = "near-graduation";
  }

  if (!snapshot.launched) {
    if (snapshot.buyPaused) alerts.push("buys paused");
    if (snapshot.sellPaused) alerts.push("sells paused");
    if (snapshot.requireAuthorizedTrading) alerts.push("authorized trading required");
  }

  return {
    ...snapshot,
    status,
    soldBps: soldBps.toString(),
    nativeProgressBps: nativeProgressBps.toString(),
    remainingNativeToTarget: remainingNativeToTarget.toString(),
    alerts,
  };
}

function buildMonitoringSummary(classified) {
  const counts = {};
  const attention = [];
  for (const entry of classified) {
    counts[entry.status] = (counts[entry.status] || 0) + 1;
    if (entry.alerts.length > 0 || ["oracle-error", "blocked", "ready-to-graduate", "cannot-graduate-at-sellout", "graduated-missing-pair"].includes(entry.status)) {
      attention.push(entry);
    }
  }

  return {
    totalCampaigns: classified.length,
    counts,
    attentionCount: attention.length,
    attention,
  };
}

module.exports = {
  MAX_BPS,
  ZERO_ADDRESS,
  buildMonitoringSummary,
  classifyCampaignSnapshot,
  isZeroAddress,
  ratioBps,
  toBigInt,
};
