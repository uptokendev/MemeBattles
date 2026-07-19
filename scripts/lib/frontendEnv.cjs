const fs = require("node:fs");
const path = require("node:path");

function pickAddress(deployment, canonicalName, fallbacks = []) {
  const contracts = deployment.contracts || {};
  for (const key of [canonicalName, ...fallbacks]) {
    if (typeof contracts[key] === "string" && contracts[key]) return contracts[key];
    if (typeof deployment[key] === "string" && deployment[key]) return deployment[key];
  }
  return "";
}

function requireAddress(label, value, sourceLabel) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value || "")) {
    throw new Error(`${label}: missing or invalid address in ${sourceLabel}`);
  }
  return value;
}

function optionalAddressLine(name, value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "") ? `${name}=${value}` : null;
}

function buildFrontendEnv(deployment, sourceLabel = "deployment") {
  const chainId = deployment.chainId;
  if (!chainId) throw new Error(`chainId missing in ${sourceLabel}`);

  const suffix = String(chainId);
  const topazContracts = deployment.topazInfrastructure?.contracts || {};
  const productionTopazRouter =
    deployment.productionTopazRouter || topazContracts.Router || deployment.topazRouter || deployment.router;

  const lines = [
    `VITE_FACTORY_ADDRESS_${suffix}=${requireAddress("LaunchFactory", pickAddress(deployment, "LaunchFactory", ["factory", "factoryAddress"]), sourceLabel)}`,
    `VITE_VOTE_TREASURY_ADDRESS_${suffix}=${requireAddress("UPVoteTreasury", pickAddress(deployment, "UPVoteTreasury", ["voteTreasury", "voteTreasuryAddress"]), sourceLabel)}`,
    `VITE_TREASURY_ROUTER_ADDRESS_${suffix}=${requireAddress("TreasuryRouter", pickAddress(deployment, "TreasuryRouter", ["treasuryRouter", "leagueRouter", "routerAddress"]), sourceLabel)}`,
    `VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_${suffix}=${requireAddress("CommunityRewardsVault", pickAddress(deployment, "CommunityRewardsVault", ["communityRewardsVault", "communityVault"]), sourceLabel)}`,
    `VITE_RECRUITER_REWARDS_VAULT_ADDRESS_${suffix}=${requireAddress("RecruiterRewardsVault", pickAddress(deployment, "RecruiterRewardsVault", ["recruiterRewardsVault", "recruiterVault"]), sourceLabel)}`,
    `VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_${suffix}=${requireAddress("ProtocolRevenueVault", pickAddress(deployment, "ProtocolRevenueVault", ["protocolRevenueVault", "protocolVault"]), sourceLabel)}`,
    `VITE_CREATOR_REGISTRY_ADDRESS_${suffix}=${requireAddress("CreatorRegistry", pickAddress(deployment, "CreatorRegistry", ["creatorRegistry"]), sourceLabel)}`,
    `VITE_RISK_REGISTRY_ADDRESS_${suffix}=${requireAddress("RiskRegistry", pickAddress(deployment, "RiskRegistry", ["riskRegistry"]), sourceLabel)}`,
    `VITE_GRADUATION_ORACLE_ADDRESS_${suffix}=${requireAddress("GraduationOracle", pickAddress(deployment, "GraduationOracle", ["graduationOracle"]), sourceLabel)}`,
    `VITE_TOPAZ_ROUTER_ADDRESS_${suffix}=${requireAddress("TopazRouter", productionTopazRouter, sourceLabel)}`,
    `VITE_PERMANENT_LP_LOCKER_ADDRESS_${suffix}=${requireAddress("PermanentLpLocker", pickAddress(deployment, "PermanentLpLocker", ["permanentLpLocker"]), sourceLabel)}`,
    `VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_${suffix}=${requireAddress("LaunchCampaignImplementation", pickAddress(deployment, "LaunchCampaignImplementation", ["campaignImplementation"]), sourceLabel)}`,
  ];

  const optionalLines = [
    optionalAddressLine(`VITE_TREASURY_VAULT_ADDRESS_${suffix}`, pickAddress(deployment, "TreasuryVaultV2", ["LeagueTreasury", "leagueTreasury", "treasuryVault", "vault"])),
    optionalAddressLine(`VITE_LAUNCH_ROUTER_ADDRESS_${suffix}`, deployment.topazRouterAdapter || deployment.router),
    optionalAddressLine(`VITE_TOPAZ_ROUTER_ADAPTER_ADDRESS_${suffix}`, deployment.topazRouterAdapter),
    optionalAddressLine(`VITE_TOPAZ_FACTORY_ADDRESS_${suffix}`, topazContracts.PoolFactory),
    optionalAddressLine(`VITE_TOPAZ_FACTORY_REGISTRY_ADDRESS_${suffix}`, topazContracts.FactoryRegistry),
    optionalAddressLine(`VITE_TOPAZ_WBNB_ADDRESS_${suffix}`, topazContracts.WBNB),
    optionalAddressLine(`VITE_TOPAZ_POOL_IMPLEMENTATION_ADDRESS_${suffix}`, topazContracts.PoolImplementation),
  ].filter(Boolean);

  return `${[...lines, ...optionalLines].join("\n")}\n`;
}

function writeFrontendEnv(deployment, outFile, sourceLabel = "deployment") {
  const output = buildFrontendEnv(deployment, sourceLabel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output);
  return output;
}

module.exports = {
  buildFrontendEnv,
  writeFrontendEnv,
};
