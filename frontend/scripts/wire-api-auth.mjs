import fs from "fs";

const path = "frontend/api/server.mjs";
let c = fs.readFileSync(path, "utf8");

if (!c.includes('from "./lib/apiAuth.js"')) {
  c = c.replace(
    'import voteCounts from "./vote_counts.js";\n',
    'import voteCounts from "./vote_counts.js";\nimport { withAdminOrOps, withInternalAuth } from "./lib/apiAuth.js";\n',
  );
}

// Wrap internal handlers at mount time
const internalWraps = [
  ['internalAirdropsCalculate', "internal/airdrops/calculate"],
  ['internalAirdropsPublish', "internal/airdrops/publish"],
  ['internalRewardBatches', "internal/rewards/batches"],
  ['internalRewardBatchPublish', "internal/rewards/batches/:id/publish"],
  ['internalRewardBatchPause', "internal/rewards/batches/:id/pause"],
  ['internalRewardBatchClose', "internal/rewards/batches/:id/close"],
  ['internalRewardOps', "internal/rewards/ops"],
  ['internalRewardPublications', "internal/rewards/publications"],
  ['internalRewardRouting', "internal/rewards/ops/routing"],
  ['internalRewardClaimVault', "internal/rewards/ops/claim-vault"],
  ['internalRewardEpochStatus', "internal/rewards/ops/epoch-status"],
  ['internalRewardAlerts', "internal/rewards/ops/alerts"],
  ['internalRewardAdminActions', "internal/rewards/ops/admin-actions"],
  ['internalAirdropDraws', "internal/rewards/airdrops/draws"],
  ['internalAirdropDrawRun', "internal/rewards/airdrops/epochs/:epochId/draws/run"],
];

for (const [fn, label] of internalWraps) {
  // Avoid double-wrapping
  const re = new RegExp(`wrap\\(${fn}\\)`, "g");
  c = c.replace(re, `wrap(withInternalAuth(${fn}, "${label}"))`);
}

// Security mutations + sensitive admin lists
const adminWraps = [
  ['securityCreators', "security/creators"],
  ['securityClusters', "security/clusters"],
  ['securityManualReview', "security/manual-review"],
  ['securityMassDeployers', "security/mass-deployers"],
  ['securityAuditLog', "security/audit-log"],
  ['securityRecruiterPayouts', "security/recruiter-payouts"],
  ['securityCreatorTier', "security/creator/tier"],
  ['securityCreatorRestrict', "security/creator/restrict"],
  ['securityCreatorManualReview', "security/creator/manual-review"],
  ['securityClusterRestrict', "security/cluster/restrict"],
  ['securityWalletRestrict', "security/wallet/restrict"],
  ['securityContractAction', "security/contracts"],
  ['adminRewardOverview', "admin/rewards/overview"],
  ['adminRewardBatches', "admin/rewards/batches"],
  ['adminRewardBatchById', "admin/rewards/batches/:id"],
  ['adminRewardLedger', "admin/rewards/ledger"],
  ['adminRewardAlerts', "admin/rewards/alerts"],
  ['adminRewardAuditLog', "admin/rewards/audit-log"],
];

for (const [fn, label] of adminWraps) {
  const re = new RegExp(`wrap\\(${fn}\\)`, "g");
  // securityContractAction mounted twice — wrap both
  c = c.replace(re, `wrap(withAdminOrOps(${fn}, "${label}"))`);
}

// Don't double-wrap if script re-run
c = c.replace(/withInternalAuth\(withInternalAuth\(([^,]+), "([^"]+)"\), "[^"]+"\)/g, 'withInternalAuth($1, "$2")');
c = c.replace(/withAdminOrOps\(withAdminOrOps\(([^,]+), "([^"]+)"\), "[^"]+"\)/g, 'withAdminOrOps($1, "$2")');

fs.writeFileSync(path, c);
console.log("wired auth wrappers");
