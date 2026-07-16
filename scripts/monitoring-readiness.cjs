#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const REQUIRED_CONTRACTS = [
  ["LaunchFactory", ["factory", "factoryAddress"]],
  ["LaunchCampaignImplementation", ["campaignImplementation"]],
  ["TreasuryRouter", ["treasuryRouter", "leagueRouter", "routerAddress"]],
  ["TreasuryVaultV2", ["LeagueTreasury", "leagueTreasury", "treasuryVault", "vault"]],
  ["RecruiterRewardsVault", ["recruiterRewardsVault", "recruiterVault"]],
  ["CommunityRewardsVault", ["communityRewardsVault", "communityVault"]],
  ["ProtocolRevenueVault", ["protocolRevenueVault", "protocolVault"]],
  ["CreatorRegistry", ["creatorRegistry"]],
  ["RiskRegistry", ["riskRegistry"]],
  ["GraduationOracle", ["graduationOracle"]],
  ["PermanentLpLocker", ["permanentLpLocker"]],
  ["UPVoteTreasury", ["voteTreasury", "voteTreasuryAddress"]],
];

function isAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function pickAddress(deployment, canonicalName, fallbacks = []) {
  const contracts = deployment.contracts || {};
  for (const key of [canonicalName, ...fallbacks]) {
    if (typeof contracts[key] === "string" && contracts[key]) return contracts[key];
    if (typeof deployment[key] === "string" && deployment[key]) return deployment[key];
  }
  return "";
}

function addAddressCheck(result, label, value) {
  if (!isAddress(value)) result.errors.push(`${label}: missing or invalid address`);
}

function buildMonitoringReadiness(deployment, options = {}) {
  const target = options.target || deployment.network || "unknown";
  const result = {
    ok: true,
    target,
    errors: [],
    warnings: [],
    watch: {
      network: deployment.network || target,
      chainId: deployment.chainId ?? null,
      contracts: {},
      routing: deployment.routing || {},
      graduationPriceFeed: deployment.graduationPriceFeed || "",
      graduationMaxPriceAge: deployment.graduationMaxPriceAge ?? null,
      topazRouter: deployment.topazRouter || deployment.router || "",
    },
  };

  if (!deployment.network) result.warnings.push("network: missing from deployment artifact");
  if (deployment.chainId === undefined || deployment.chainId === null) result.errors.push("chainId: missing from deployment artifact");
  addAddressCheck(result, "topazRouter", result.watch.topazRouter);
  addAddressCheck(result, "graduationPriceFeed", result.watch.graduationPriceFeed);

  if (deployment.graduationMaxPriceAge === undefined || deployment.graduationMaxPriceAge === null) {
    result.errors.push("graduationMaxPriceAge: missing from deployment artifact");
  } else if (BigInt(deployment.graduationMaxPriceAge) <= 0n) {
    result.errors.push("graduationMaxPriceAge: must be positive");
  }

  for (const [name, fallbacks] of REQUIRED_CONTRACTS) {
    const address = pickAddress(deployment, name, fallbacks);
    result.watch.contracts[name] = address;
    addAddressCheck(result, name, address);
  }

  const routing = deployment.routing || {};
  if (routing.factoryTradeRouteProfile === undefined || routing.factoryTradeRouteProfile === null) {
    result.errors.push("routing.factoryTradeRouteProfile: missing");
  }
  if (routing.factoryFinalizeRouteProfile === undefined || routing.factoryFinalizeRouteProfile === null) {
    result.errors.push("routing.factoryFinalizeRouteProfile: missing");
  }
  addAddressCheck(result, "routing.factoryRouteAuthority", routing.factoryRouteAuthority || "");

  if (routing.unifiedRouterModeActive !== true) {
    result.warnings.push("routing.unifiedRouterModeActive: expected true for production monitoring");
  }

  const postDeployActions = deployment.postDeployActions || [];
  if (postDeployActions.length > 0) {
    result.warnings.push(`postDeployActions: ${postDeployActions.length} action(s) still pending`);
  }

  result.ok = result.errors.length === 0;
  return result;
}

function deploymentFileForTarget(target) {
  return process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(__dirname, "..", "deployments", `${target}.json`);
}

function readDeployment(file) {
  if (!fs.existsSync(file)) throw new Error(`Deployment file not found: ${file}. Run deploy first or set DEPLOYMENT_FILE.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function printReadiness(result, file) {
  console.log(`[monitoring] file: ${file}`);
  console.log(`[monitoring] target: ${result.target}`);
  console.log(`[monitoring] status: ${result.ok ? "ready" : "blocked"}`);

  if (result.errors.length > 0) {
    console.log("\n[monitoring] errors");
    for (const error of result.errors) console.log(`- ${error}`);
  }

  if (result.warnings.length > 0) {
    console.log("\n[monitoring] warnings");
    for (const warning of result.warnings) console.log(`- ${warning}`);
  }

  console.log("\n[monitoring] watch targets");
  console.log(`network=${result.watch.network}`);
  console.log(`chainId=${result.watch.chainId}`);
  console.log(`factory=${result.watch.contracts.LaunchFactory || "unset"}`);
  console.log(`graduationOracle=${result.watch.contracts.GraduationOracle || "unset"}`);
  console.log(`priceFeed=${result.watch.graduationPriceFeed || "unset"}`);
  console.log(`topazRouter=${result.watch.topazRouter || "unset"}`);
  console.log(`routeAuthority=${result.watch.routing.factoryRouteAuthority || "unset"}`);
}

function main(argv = process.argv.slice(2)) {
  const target = argv.find((arg) => !arg.startsWith("--")) || process.env.HARDHAT_NETWORK || "hardhat";
  const file = deploymentFileForTarget(target);
  const result = buildMonitoringReadiness(readDeployment(file), { target });
  printReadiness(result, file);
  return { ok: result.ok, status: result.ok ? 0 : 1, result };
}

module.exports = {
  REQUIRED_CONTRACTS,
  buildMonitoringReadiness,
  deploymentFileForTarget,
  isAddress,
  main,
  pickAddress,
  printReadiness,
  readDeployment,
};

if (require.main === module) {
  try {
    const result = main();
    if (!result.ok) process.exitCode = result.status;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
