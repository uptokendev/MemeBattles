#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const target = process.argv[2] || process.env.HARDHAT_NETWORK || "hardhat";
const deploymentFile = process.env.DEPLOYMENT_FILE
  ? path.resolve(process.env.DEPLOYMENT_FILE)
  : path.join(__dirname, "..", "deployments", `${target}.json`);

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

function requireAddress(label, value) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value || "")) {
    throw new Error(`${label}: missing or invalid address in ${deploymentFile}`);
  }
  return value;
}

function buildFrontendEnv(deployment) {
  const chainId = deployment.chainId;
  if (!chainId) throw new Error(`chainId missing in ${deploymentFile}`);

  const suffix = String(chainId);
  const lines = [
    `VITE_FACTORY_ADDRESS_${suffix}=${requireAddress("LaunchFactory", pickAddress(deployment, "LaunchFactory", ["factory", "factoryAddress"]))}`,
    `VITE_VOTE_TREASURY_ADDRESS_${suffix}=${requireAddress("UPVoteTreasury", pickAddress(deployment, "UPVoteTreasury", ["voteTreasury", "voteTreasuryAddress"]))}`,
    `VITE_TREASURY_ROUTER_ADDRESS_${suffix}=${requireAddress("TreasuryRouter", pickAddress(deployment, "TreasuryRouter", ["treasuryRouter", "leagueRouter", "routerAddress"]))}`,
    `VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_${suffix}=${requireAddress("CommunityRewardsVault", pickAddress(deployment, "CommunityRewardsVault", ["communityRewardsVault", "communityVault"]))}`,
    `VITE_RECRUITER_REWARDS_VAULT_ADDRESS_${suffix}=${requireAddress("RecruiterRewardsVault", pickAddress(deployment, "RecruiterRewardsVault", ["recruiterRewardsVault", "recruiterVault"]))}`,
    `VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_${suffix}=${requireAddress("ProtocolRevenueVault", pickAddress(deployment, "ProtocolRevenueVault", ["protocolRevenueVault", "protocolVault"]))}`,
    `VITE_CREATOR_REGISTRY_ADDRESS_${suffix}=${requireAddress("CreatorRegistry", pickAddress(deployment, "CreatorRegistry", ["creatorRegistry"]))}`,
    `VITE_RISK_REGISTRY_ADDRESS_${suffix}=${requireAddress("RiskRegistry", pickAddress(deployment, "RiskRegistry", ["riskRegistry"]))}`,
    `VITE_GRADUATION_ORACLE_ADDRESS_${suffix}=${requireAddress("GraduationOracle", pickAddress(deployment, "GraduationOracle", ["graduationOracle"]))}`,
    `VITE_TOPAZ_ROUTER_ADDRESS_${suffix}=${requireAddress("TopazRouter", deployment.topazRouter || deployment.router)}`,
    `VITE_PERMANENT_LP_LOCKER_ADDRESS_${suffix}=${requireAddress("PermanentLpLocker", pickAddress(deployment, "PermanentLpLocker", ["permanentLpLocker"]))}`,
    `VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_${suffix}=${requireAddress("LaunchCampaignImplementation", pickAddress(deployment, "LaunchCampaignImplementation", ["campaignImplementation"]))}`,
  ];

  return `${lines.join("\n")}\n`;
}

const deployment = readDeployment();
const output = buildFrontendEnv(deployment);
const outFile = process.env.FRONTEND_ENV_FILE
  ? path.resolve(process.env.FRONTEND_ENV_FILE)
  : path.join(path.dirname(deploymentFile), `${target}.frontend.env`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output);

console.log(`[frontend-env] Loaded deployment: ${deploymentFile}`);
console.log(`[frontend-env] Wrote: ${outFile}`);
console.log(output.trimEnd());
