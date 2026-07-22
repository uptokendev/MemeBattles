#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildFrontendEnv } = require("./lib/frontendEnv.cjs");
const { buildFactoryRegistry } = require("./lib/indexerManifest.cjs");

const target = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const deploymentFile = process.env.DEPLOYMENT_FILE
  ? path.resolve(process.env.DEPLOYMENT_FILE)
  : path.join(__dirname, "..", "deployments", `${target}.json`);
const frontendEnvFile = process.env.FRONTEND_ENV_FILE
  ? path.resolve(process.env.FRONTEND_ENV_FILE)
  : path.join(path.dirname(deploymentFile), `${target}.frontend.env`);

function readDeployment() {
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}. Run deploy first or set DEPLOYMENT_FILE.`);
  }
  return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

function pickAddress(deployment, canonicalName, fallbacks = []) {
  const contracts = deployment.contracts || {};
  for (const key of [canonicalName, ...fallbacks]) {
    if (typeof contracts[key] === "string" && contracts[key]) return contracts[key];
    if (typeof deployment[key] === "string" && deployment[key]) return deployment[key];
  }
  return "";
}

function printValue(label, value) {
  console.log(`${label.padEnd(34)} ${value || "unset"}`);
}

function printAddress(deployment, label, canonicalName, fallbacks = []) {
  printValue(label, pickAddress(deployment, canonicalName, fallbacks));
}

function resolvedContracts(deployment) {
  return {
    LaunchFactory: pickAddress(deployment, "LaunchFactory", ["factory", "factoryAddress"]),
    TreasuryRouter: pickAddress(deployment, "TreasuryRouter", ["TreasuryRouterV2", "treasuryRouterV2", "treasuryRouter", "leagueRouter", "routerAddress"]),
    PermanentLpLocker: pickAddress(deployment, "PermanentLpLocker", ["permanentLpLocker"]),
  };
}

const deployment = readDeployment();
const routing = deployment.routing || {};
const postDeployActions = deployment.postDeployActions || [];

console.log(`[deployment-summary] file: ${deploymentFile}`);
printValue("network", deployment.network || target);
printValue("chainId", deployment.chainId);
printValue("deployer", deployment.deployer);
printValue("treasurySafe", deployment.treasurySafe);
printValue("protocolFeeBps", deployment.protocolFeeBps);
printValue("topazRouter", deployment.topazRouter || deployment.router);
printValue("graduationPriceFeed", deployment.graduationPriceFeed);
printValue("graduationMaxPriceAge", deployment.graduationMaxPriceAge);

console.log("\n[deployment-summary] core contracts");
printAddress(deployment, "LaunchFactory", "LaunchFactory", ["factory", "factoryAddress"]);
printAddress(deployment, "LaunchCampaignImplementation", "LaunchCampaignImplementation", ["campaignImplementation"]);
printAddress(deployment, "TreasuryRouter", "TreasuryRouter", ["TreasuryRouterV2", "treasuryRouterV2", "treasuryRouter", "leagueRouter", "routerAddress"]);
printAddress(deployment, "TreasuryRouterV2", "TreasuryRouterV2", ["treasuryRouterV2"]);
printAddress(deployment, "TreasuryVaultV2", "TreasuryVaultV2", ["LeagueTreasury", "leagueTreasury", "treasuryVault", "vault"]);
printAddress(deployment, "RecruiterRewardsVault", "RecruiterRewardsVault", ["recruiterRewardsVault", "recruiterVault"]);
printAddress(deployment, "CommunityRewardsVault", "CommunityRewardsVault", ["communityRewardsVault", "communityVault"]);
printAddress(deployment, "ProtocolRevenueVault", "ProtocolRevenueVault", ["protocolRevenueVault", "protocolVault"]);
printAddress(deployment, "CreatorRegistry", "CreatorRegistry", ["creatorRegistry"]);
printAddress(deployment, "RiskRegistry", "RiskRegistry", ["riskRegistry"]);
printAddress(deployment, "GraduationOracle", "GraduationOracle", ["graduationOracle"]);
printAddress(deployment, "PermanentLpLocker", "PermanentLpLocker", ["permanentLpLocker"]);
printAddress(deployment, "UPVoteTreasury", "UPVoteTreasury", ["voteTreasury", "voteTreasuryAddress"]);

console.log("\n[deployment-summary] factory registry");
try {
  const factoryRegistry = buildFactoryRegistry(deployment, resolvedContracts(deployment), deploymentFile);
  printValue("activeFactory", factoryRegistry.activeFactory);
  printValue("activeGeneration", factoryRegistry.activeGeneration);
  for (const factory of factoryRegistry.factories) {
    console.log(
      `- ${factory.generation} address=${factory.address} creation=${factory.creationEnabled} trading=${factory.tradingEnabled} support=${factory.supportEnabled} block=${factory.deploymentBlock ?? "unset"}`
    );
  }
} catch (error) {
  printValue("status", `invalid: ${error.message}`);
  process.exitCode = 1;
}

console.log("\n[deployment-summary] routing");
printValue("factoryTradeRouteProfile", routing.factoryTradeRouteProfile);
printValue("factoryFinalizeRouteProfile", routing.factoryFinalizeRouteProfile);
printValue("factoryRouteAuthority", routing.factoryRouteAuthority);
printValue("weeklyLeagueVault", routing.weeklyLeagueVault || routing.activeLeagueVault);
printValue("monthlyLeagueTreasury", routing.monthlyLeagueTreasury);
printValue("weeklyLeagueBps", routing.weeklyLeagueBps);
printValue("monthlyLeagueBps", routing.monthlyLeagueBps);
printValue("unifiedRouterModeActive", routing.unifiedRouterModeActive);

console.log("\n[deployment-summary] frontend env");
try {
  const frontendEnv = buildFrontendEnv(deployment, deploymentFile);
  printValue("status", "valid");
  printValue("file", fs.existsSync(frontendEnvFile) ? frontendEnvFile : `${frontendEnvFile} (not written yet)`);
  printValue("entries", frontendEnv.trim().split("\n").length);
} catch (error) {
  printValue("status", `invalid: ${error.message}`);
  process.exitCode = 1;
}

console.log("\n[deployment-summary] post deploy actions");
if (postDeployActions.length === 0) {
  console.log("none");
} else {
  for (const action of postDeployActions) console.log(`- ${action}`);
}
