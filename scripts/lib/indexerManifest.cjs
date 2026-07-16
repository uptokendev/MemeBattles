const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const CONTRACTS = [
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

const EVENT_SIGNATURES = {
  LaunchFactory: [
    "CampaignCreated(uint256,address,address,address,string,string,string,string)",
    "CampaignGraduated(address,address,address,address)",
    "RouteAuthorityUpdated(address)",
    "RequireAuthorizedTradingUpdated(bool)",
  ],
  LaunchCampaign: [
    "TokensPurchased(address,uint256,uint256)",
    "TokensSold(address,uint256,uint256)",
    "CampaignFinalized(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "GraduationLiquidityCapped(uint256,uint256,uint256,uint256)",
    "CampaignPauseStateUpdated(bool,bool,bool,bool)",
    "RequireAuthorizedTradingUpdated(bool)",
    "NativeEscrowed(address,uint256)",
    "NativeClaimed(address,uint256)",
  ],
  TreasuryRouter: [
    "Routed(uint8,uint8,address,uint256)",
  ],
  CreatorRegistry: [
    "CreatorRulesUpdated(address,uint8,bool,bool,uint256,uint256,uint256,uint256)",
    "LaunchRecorded(address,uint256)",
    "GraduationRecorded(address,uint256)",
  ],
  RiskRegistry: [
    "WalletRestrictionUpdated(address,bool)",
    "CreatorRestrictionUpdated(address,bool)",
    "ClusterWalletUpdated(address,bytes32)",
  ],
  PermanentLpLocker: [
    "LpTokenRegistered(address)",
  ],
};

function pickAddress(deployment, canonicalName, fallbacks = []) {
  const contracts = deployment.contracts || {};
  for (const key of [canonicalName, ...fallbacks]) {
    if (typeof contracts[key] === "string" && contracts[key]) return contracts[key];
    if (typeof deployment[key] === "string" && deployment[key]) return deployment[key];
  }
  return "";
}

function requireAddress(label, value, sourceLabel) {
  if (!ADDRESS_RE.test(value || "")) throw new Error(`${label}: missing or invalid address in ${sourceLabel}`);
  return ethers.getAddress(value);
}

function eventTopic(signature) {
  return ethers.id(signature);
}

function buildEventTopics() {
  return Object.fromEntries(
    Object.entries(EVENT_SIGNATURES).map(([contractName, signatures]) => [
      contractName,
      Object.fromEntries(signatures.map((signature) => [signature, eventTopic(signature)])),
    ])
  );
}

function buildIndexerManifest(deployment, sourceLabel = "deployment") {
  if (!deployment.chainId) throw new Error(`chainId missing in ${sourceLabel}`);
  const contracts = Object.fromEntries(
    CONTRACTS.map(([name, fallbacks]) => [name, requireAddress(name, pickAddress(deployment, name, fallbacks), sourceLabel)])
  );

  return {
    schemaVersion: 1,
    network: deployment.network || "unknown",
    chainId: Number(deployment.chainId),
    deploymentBlock: deployment.deploymentBlock ?? deployment.blockNumber ?? null,
    contracts,
    topazRouter: requireAddress("TopazRouter", deployment.topazRouter || deployment.router, sourceLabel),
    graduationPriceFeed: deployment.graduationPriceFeed
      ? requireAddress("GraduationPriceFeed", deployment.graduationPriceFeed, sourceLabel)
      : null,
    routing: deployment.routing || {},
    events: buildEventTopics(),
  };
}

function writeIndexerManifest(deployment, outFile, sourceLabel = "deployment") {
  const manifest = buildIndexerManifest(deployment, sourceLabel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

module.exports = {
  CONTRACTS,
  EVENT_SIGNATURES,
  buildEventTopics,
  buildIndexerManifest,
  eventTopic,
  pickAddress,
  requireAddress,
  writeIndexerManifest,
};
