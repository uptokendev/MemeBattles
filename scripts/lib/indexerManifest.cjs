const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const CONTRACTS = [
  ["LaunchFactory", ["factory", "factoryAddress"]],
  ["LaunchCampaignImplementation", ["campaignImplementation"]],
  ["TreasuryRouter", ["TreasuryRouterV2", "treasuryRouterV2", "treasuryRouter", "leagueRouter", "routerAddress"]],
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

const NATIVE_TREASURY_VAULT_EVENTS = [
  "Deposit(address,uint256,uint256)",
  "Withdraw(address,uint256,uint256)",
];

const EVENT_SIGNATURES = {
  LaunchFactory: [
    "CampaignCreated(uint256,address,address,address,string,string,string,string)",
    "FeeRecipientUpdated(address)",
    "RouterUpdated(address)",
    "GraduationOracleUpdated(address)",
    "ProtocolFeeUpdated(uint256)",
    "RouteProfilesUpdated(uint8,uint8)",
    "RouteAuthorityUpdated(address)",
    "LaunchProtectionConfigUpdated(uint256,uint256,uint256)",
    "LiveEnabled(uint64)",
    "GlobalPauseUpdated(bool)",
    "CreatePauseUpdated(bool)",
    "RegistriesUpdated(address,address)",
    "RequireAuthorizedTradingUpdated(bool)",
    "CampaignPauseUpdated(address,bool,bool,bool,bool)",
    "CampaignGraduated(address,address,address,address)",
  ],
  LaunchCampaign: [
    "TokensPurchased(address,uint256,uint256)",
    "TokensSold(address,uint256,uint256)",
    "NativeEscrowed(address,uint256)",
    "NativeClaimed(address,uint256)",
    "CampaignPauseStateUpdated(bool,bool,bool,bool)",
    "RequireAuthorizedTradingUpdated(bool)",
    "CampaignFinalized(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "GraduationLiquidityCapped(uint256,uint256,uint256,uint256)",
  ],
  TreasuryRouter: [
    "Forwarded(address,uint256)",
    "ForwardFailed(address,uint256)",
    "ForwardingPaused(bool)",
    "VaultProposed(address,uint64)",
    "VaultActivated(address,address)",
    "WeeklyLeagueVaultProposed(address,uint64)",
    "WeeklyLeagueVaultActivated(address,address)",
    "MonthlyLeagueTreasuryProposed(address,uint64)",
    "MonthlyLeagueTreasuryActivated(address,address)",
    "RecruiterRewardsVaultUpdated(address,address)",
    "CommunityRewardsVaultUpdated(address,address)",
    "ProtocolRevenueVaultUpdated(address,address)",
    "LeagueSplitUpdated(uint16,uint16)",
    "PermanentLpLockerUpdated(address,address)",
    "AuthorizedLpLockerUpdated(address,bool)",
    "PrimaryLpLockerUpdated(address,address)",
    "LpNativeRouted(address,address,uint256)",
    "LpTokenRouted(address,address,address,uint256)",
    "LeagueRouted(uint256,uint256)",
    "RouteExecuted(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256)",
  ],
  TreasuryVaultV2: [
    "OperatorUpdated(address)",
    "RootPosterUpdated(address)",
    "CapsUpdated(uint256,uint256)",
    "PayoutsPaused(bool)",
    "Payout(address,uint256)",
    "ClaimCapsUpdated(uint256,uint256)",
    "ClaimsPaused(bool)",
    "EpochRootSet(uint256,bytes32,uint256)",
    "Claimed(uint256,address,uint256,bytes32)",
    "Withdraw(address,uint256)",
  ],
  RecruiterRewardsVault: [
    ...NATIVE_TREASURY_VAULT_EVENTS,
    "OperatorUpdated(address)",
    "PayoutCapsUpdated(uint256,uint256)",
    "PayoutsPaused(bool)",
    "Payout(address,uint256)",
  ],
  CommunityRewardsVault: [
    "RouterUpdated(address,address)",
    "RewardDistributorUpdated(address,address)",
    "AirdropOperatorUpdated(address,address)",
    "AirdropDeposited(address,uint256,uint256)",
    "SquadPoolDeposited(address,uint256,uint256)",
    "AirdropWithdrawn(address,uint256,uint256)",
    "SquadPoolWithdrawn(address,uint256,uint256)",
    "AirdropBatchFunded(bytes32,bytes32,address,uint256,uint64,uint256)",
  ],
  ProtocolRevenueVault: NATIVE_TREASURY_VAULT_EVENTS,
  CreatorRegistry: [
    "CreatorTierUpdated(address,uint8)",
    "CreatorTrustScoreUpdated(address,uint256)",
    "CreatorRestrictedUpdated(address,bool)",
    "CreatorManualReviewUpdated(address,bool)",
    "LaunchRecorderUpdated(address,bool)",
    "CreatorLaunchRecorded(address,uint256,uint256)",
    "CreatorGraduationRecorded(address,uint256)",
  ],
  RiskRegistry: [
    "WalletRiskUpdated(address,uint8,bool)",
    "WalletClusterUpdated(address,bytes32)",
    "ClusterRiskUpdated(bytes32,uint256,uint8,bool)",
  ],
  PermanentLpLocker: [
    "LpTokenRegistered(address)",
    "GraduationPoolRegistered(address,address,address,address,address,address,uint256,uint16,uint16)",
    "CreatorPayoutRecipientUpdated(address,address,address)",
    "LpPermanentlyLocked(address,address,uint256,uint256)",
    "FeesHarvested(address,address,address,uint256,uint256,uint256)",
    "HarvestPaymentPending(address,address,address,uint256,bool)",
    "PendingTokenClaimed(address,address,uint256)",
    "PendingNativeClaimed(address,uint256)",
    "PendingProtocolTokenRouted(address,uint256)",
    "PendingProtocolNativeRouted(uint256)",
    "UnregisteredTokenRecovered(address,address,uint256)",
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

function optionalAddress(label, value, sourceLabel) {
  if (!value) return null;
  return requireAddress(label, value, sourceLabel);
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

  const topazContracts = deployment.topazInfrastructure?.contracts || {};
  const launchRouter = deployment.topazRouterAdapter || deployment.router || deployment.topazRouter;
  const productionTopazRouter = deployment.productionTopazRouter || topazContracts.Router || deployment.topazRouter || deployment.router;

  return {
    schemaVersion: 1,
    network: deployment.network || "unknown",
    chainId: Number(deployment.chainId),
    deploymentBlock: deployment.deploymentBlock ?? deployment.blockNumber ?? null,
    contracts,
    launchRouter: requireAddress("LaunchRouter", launchRouter, sourceLabel),
    topazRouter: requireAddress("TopazRouter", productionTopazRouter, sourceLabel),
    topazRouterAdapter: optionalAddress("TopazRouterAdapter", deployment.topazRouterAdapter, sourceLabel),
    topazInfrastructure: deployment.topazInfrastructure || null,
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
