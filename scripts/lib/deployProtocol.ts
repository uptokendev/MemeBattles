import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function mustEnv(name: string, fallback?: string): string {
  const v = (process.env[name] ?? fallback ?? "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function numEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bigintEnv(name: string, fallback?: bigint): bigint | undefined {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  return BigInt(raw);
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function routeProfileEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 2) {
    throw new Error(`Invalid ${name}: expected 0, 1, or 2`);
  }
  return n;
}

function writeDeployment(networkName: string, data: unknown) {
  const outDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${networkName}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function resolveRouterAddress(deployerAddress: string): Promise<string> {
  const explicitRouter = (
    process.env.PANCAKE_ROUTER ??
    process.env.PANCAKE_V2_ROUTER ??
    process.env.ROUTER_ADDRESS ??
    ""
  ).trim();
  if (explicitRouter) {
    return explicitRouter;
  }

  const deployMock = process.env.DEPLOY_MOCK_ROUTER === "true";
  if (!deployMock) {
    throw new Error(
      "Missing router address. Set PANCAKE_ROUTER, PANCAKE_V2_ROUTER, or ROUTER_ADDRESS. For local testing only, set DEPLOY_MOCK_ROUTER=true."
    );
  }

  console.warn("[deploy] No router configured; deploying MockV2Factory + MockRouter for local/testing use.");
  const wrapped = (process.env.MOCK_ROUTER_WRAPPED ?? deployerAddress).trim();

  const V2Factory = await ethers.getContractFactory("MockV2Factory");
  const v2Factory = await V2Factory.deploy();
  await v2Factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  const mockRouter = await Router.deploy(await v2Factory.getAddress(), wrapped);
  await mockRouter.waitForDeployment();

  const routerAddress = await mockRouter.getAddress();
  console.log("MockV2Factory:", await v2Factory.getAddress());
  console.log("MockRouter:", routerAddress);
  return routerAddress;
}

export async function deployProtocol() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const net = await ethers.provider.getNetwork();

  const routerAddress = await resolveRouterAddress(deployerAddress);
  const treasurySafe = mustEnv("TREASURY_SAFE", process.env.FEE_RECIPIENT ?? deployerAddress);
  const upgradeDelaySeconds = numEnv("UPGRADE_DELAY_SECONDS", 2 * 24 * 60 * 60);
  const protocolFeeBps = BigInt(numEnv("PROTOCOL_FEE_BPS", 200));
  const operator = String(process.env.LEAGUE_PAYOUT_OPERATOR ?? ethers.ZeroAddress).trim();
  const rootPoster = String(process.env.LEAGUE_ROOT_POSTER ?? ethers.ZeroAddress).trim();

  const payoutMaxPerTx = bigintEnv("LEAGUE_PAYOUT_MAX_PER_TX");
  const payoutDailyCap = bigintEnv("LEAGUE_PAYOUT_DAILY_CAP");
  const claimMaxPerTx = bigintEnv("LEAGUE_CLAIM_MAX_PER_TX");
  const claimMaxEpochTotal = bigintEnv("LEAGUE_CLAIM_MAX_EPOCH_TOTAL");
  const enableLeaguePayouts = boolEnv("ENABLE_LEAGUE_PAYOUTS", false);
  const enableLeagueClaims = boolEnv("ENABLE_LEAGUE_CLAIMS", false);
  const recruiterPayoutOperator = String(process.env.RECRUITER_PAYOUT_OPERATOR ?? ethers.ZeroAddress).trim();
  const recruiterPayoutMaxPerTx = bigintEnv("RECRUITER_PAYOUT_MAX_PER_TX");
  const recruiterPayoutDailyCap = bigintEnv("RECRUITER_PAYOUT_DAILY_CAP");
  const enableRecruiterPayouts = boolEnv("ENABLE_RECRUITER_PAYOUTS", false);
  const tradeRouteProfile = routeProfileEnv("PHASE1_TRADE_ROUTE_PROFILE", 1);
  const finalizeRouteProfile = routeProfileEnv("PHASE1_FINALIZE_ROUTE_PROFILE", 1);
  const routeAuthority = String(process.env.ROUTE_AUTHORITY_ADDRESS ?? "").trim();

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${net.chainId.toString()}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log("Router:", routerAddress);
  console.log("Treasury Safe:", treasurySafe);
  console.log("Upgrade delay (seconds):", upgradeDelaySeconds);
  console.log("Protocol fee bps:", protocolFeeBps.toString());
  console.log("League payout operator:", operator);
  console.log("League root poster:", rootPoster);
  console.log("League payout max/tx:", payoutMaxPerTx?.toString() ?? "unset");
  console.log("League payout daily cap:", payoutDailyCap?.toString() ?? "unset");
  console.log("League claim max/tx:", claimMaxPerTx?.toString() ?? "unset");
  console.log("League claim max epoch total:", claimMaxEpochTotal?.toString() ?? "unset");
  console.log("Enable league payouts:", enableLeaguePayouts);
  console.log("Enable league claims:", enableLeagueClaims);
  console.log("Recruiter payout operator:", recruiterPayoutOperator);
  console.log("Recruiter payout max/tx:", recruiterPayoutMaxPerTx?.toString() ?? "unset");
  console.log("Recruiter payout daily cap:", recruiterPayoutDailyCap?.toString() ?? "unset");
  console.log("Enable recruiter payouts:", enableRecruiterPayouts);
  console.log("Factory trade route profile:", tradeRouteProfile);
  console.log("Factory finalize route profile:", finalizeRouteProfile);
  console.log("Route authority:", routeAuthority || "unset");

  const canAdminConfigure = treasurySafe.toLowerCase() === deployerAddress.toLowerCase();
  console.log("Can configure admin-owned routing immediately:", canAdminConfigure);
  const postDeployActions: string[] = [];

  const Vault = await ethers.getContractFactory("TreasuryVaultV2");
  const vault = await Vault.deploy(treasurySafe, operator, rootPoster);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("LeagueTreasury (TreasuryVaultV2):", vaultAddress);

  if (payoutMaxPerTx !== undefined || payoutDailyCap !== undefined) {
    const tx = await vault.setCaps(payoutMaxPerTx ?? 0n, payoutDailyCap ?? 0n);
    await tx.wait();
    console.log("Configured payout caps");
  }

  if (claimMaxPerTx !== undefined || claimMaxEpochTotal !== undefined) {
    const tx = await vault.setClaimCaps(claimMaxPerTx ?? 0n, claimMaxEpochTotal ?? 0n);
    await tx.wait();
    console.log("Configured claim caps");
  }

  if (enableLeaguePayouts) {
    const tx = await vault.setPayoutsPaused(false);
    await tx.wait();
    console.log("Unpaused operator payout lane");
  }

  if (enableLeagueClaims) {
    const tx = await vault.setClaimsPaused(false);
    await tx.wait();
    console.log("Unpaused Merkle claim lane");
  }

  const Router = await ethers.getContractFactory("TreasuryRouter");
  const leagueRouter = await Router.deploy(treasurySafe, vaultAddress, upgradeDelaySeconds);
  await leagueRouter.waitForDeployment();
  const leagueRouterAddress = await leagueRouter.getAddress();
  console.log("TreasuryRouter:", leagueRouterAddress);

  const RecruiterVault = await ethers.getContractFactory("RecruiterRewardsVault");
  const recruiterVault = await RecruiterVault.deploy(treasurySafe);
  await recruiterVault.waitForDeployment();
  const recruiterVaultAddress = await recruiterVault.getAddress();
  console.log("RecruiterRewardsVault:", recruiterVaultAddress);

  if (canAdminConfigure) {
    if (recruiterPayoutOperator !== ethers.ZeroAddress && (await recruiterVault.operator()).toLowerCase() !== recruiterPayoutOperator.toLowerCase()) {
      const tx = await recruiterVault.setOperator(recruiterPayoutOperator);
      await tx.wait();
      console.log("Recruiter payout operator set:", recruiterPayoutOperator);
    }

    if (recruiterPayoutMaxPerTx !== undefined || recruiterPayoutDailyCap !== undefined) {
      const tx = await recruiterVault.setPayoutCaps(recruiterPayoutMaxPerTx ?? 0n, recruiterPayoutDailyCap ?? 0n);
      await tx.wait();
      console.log("Configured recruiter payout caps");
    }

    if (enableRecruiterPayouts) {
      const tx = await recruiterVault.setPayoutsPaused(false);
      await tx.wait();
      console.log("Unpaused recruiter operator payout lane");
    }
  } else {
    if (recruiterPayoutOperator !== ethers.ZeroAddress) {
      postDeployActions.push(`RecruiterRewardsVault.setOperator(${recruiterPayoutOperator})`);
    }
    if (recruiterPayoutMaxPerTx !== undefined || recruiterPayoutDailyCap !== undefined) {
      postDeployActions.push(`RecruiterRewardsVault.setPayoutCaps(${recruiterPayoutMaxPerTx ?? 0n}, ${recruiterPayoutDailyCap ?? 0n})`);
    }
    if (enableRecruiterPayouts) {
      postDeployActions.push("RecruiterRewardsVault.setPayoutsPaused(false)");
    }
  }

  const CommunityVault = await ethers.getContractFactory("CommunityRewardsVault");
  const communityVault = await CommunityVault.deploy(
    treasurySafe,
    canAdminConfigure ? leagueRouterAddress : ethers.ZeroAddress
  );
  await communityVault.waitForDeployment();
  const communityVaultAddress = await communityVault.getAddress();
  console.log("CommunityRewardsVault:", communityVaultAddress);

  const ProtocolVault = await ethers.getContractFactory("ProtocolRevenueVault");
  const protocolVault = await ProtocolVault.deploy(treasurySafe);
  await protocolVault.waitForDeployment();
  const protocolVaultAddress = await protocolVault.getAddress();
  console.log("ProtocolRevenueVault:", protocolVaultAddress);

  if (canAdminConfigure) {
    let tx = await leagueRouter.setRecruiterRewardsVault(recruiterVaultAddress);
    await tx.wait();
    console.log("Router recruiter vault set:", recruiterVaultAddress);

    tx = await leagueRouter.setCommunityRewardsVault(communityVaultAddress);
    await tx.wait();
    console.log("Router community vault set:", communityVaultAddress);

    tx = await leagueRouter.setProtocolRevenueVault(protocolVaultAddress);
    await tx.wait();
    console.log("Router protocol vault set:", protocolVaultAddress);
  } else {
    postDeployActions.push(`TreasuryRouter.setRecruiterRewardsVault(${recruiterVaultAddress})`);
    postDeployActions.push(`TreasuryRouter.setCommunityRewardsVault(${communityVaultAddress})`);
    postDeployActions.push(`TreasuryRouter.setProtocolRevenueVault(${protocolVaultAddress})`);
    postDeployActions.push(`CommunityRewardsVault.setRouter(${leagueRouterAddress})`);
    console.warn("[deploy] Treasury safe differs from deployer; router/community admin wiring left for multisig execution.");
  }

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(routerAddress, leagueRouterAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("LaunchFactory:", factoryAddress);

  if ((await factory.feeRecipient()) !== leagueRouterAddress) {
    const tx = await factory.setFeeRecipient(leagueRouterAddress);
    await tx.wait();
    console.log("FeeRecipient set to TreasuryRouter for unified Phase 1 routing:", leagueRouterAddress);
  }

  if ((await factory.tradeRouteProfile()) !== BigInt(tradeRouteProfile) || (await factory.finalizeRouteProfile()) !== BigInt(finalizeRouteProfile)) {
    const tx = await factory.setRouteProfiles(tradeRouteProfile, finalizeRouteProfile);
    await tx.wait();
    console.log("Factory route profiles set:", { tradeRouteProfile, finalizeRouteProfile });
  }

  if (routeAuthority && (await factory.routeAuthority()).toLowerCase() !== routeAuthority.toLowerCase()) {
    const tx = await factory.setRouteAuthority(routeAuthority);
    await tx.wait();
    console.log("Factory route authority set:", routeAuthority);
  }

  if ((await factory.protocolFeeBps()) !== protocolFeeBps) {
    const tx = await factory.setProtocolFee(protocolFeeBps);
    await tx.wait();
    console.log("ProtocolFeeBps set:", protocolFeeBps.toString());
  }

  const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
  const voteTreasury = await UPVoteTreasury.deploy(treasurySafe, treasurySafe);
  await voteTreasury.waitForDeployment();
  const voteTreasuryAddress = await voteTreasury.getAddress();
  console.log("UPVoteTreasury:", voteTreasuryAddress);

  const deployment = {
    network: network.name,
    chainId: Number(net.chainId),
    deployer: deployerAddress,
    router: routerAddress,
    treasurySafe,
    upgradeDelaySeconds,
    protocolFeeBps: protocolFeeBps.toString(),
    leaguePayoutOperator: operator,
    leagueRootPoster: rootPoster,
    leaguePayoutMaxPerTx: payoutMaxPerTx?.toString() ?? null,
    leaguePayoutDailyCap: payoutDailyCap?.toString() ?? null,
    leagueClaimMaxPerTx: claimMaxPerTx?.toString() ?? null,
    leagueClaimMaxEpochTotal: claimMaxEpochTotal?.toString() ?? null,
    enableLeaguePayouts,
    enableLeagueClaims,
    recruiterPayoutOperator,
    recruiterPayoutMaxPerTx: recruiterPayoutMaxPerTx?.toString() ?? null,
    recruiterPayoutDailyCap: recruiterPayoutDailyCap?.toString() ?? null,
    enableRecruiterPayouts,
    canAdminConfigure,
    contracts: {
      LeagueTreasury: vaultAddress,
      TreasuryVaultV2: vaultAddress,
      TreasuryRouter: leagueRouterAddress,
      RecruiterRewardsVault: recruiterVaultAddress,
      CommunityRewardsVault: communityVaultAddress,
      ProtocolRevenueVault: protocolVaultAddress,
      LaunchFactory: factoryAddress,
      UPVoteTreasury: voteTreasuryAddress,
    },
    routing: {
      activeLeagueVault: vaultAddress,
      recruiterRewardsVault: canAdminConfigure ? recruiterVaultAddress : null,
      recruiterPayoutOperator: recruiterPayoutOperator !== ethers.ZeroAddress ? recruiterPayoutOperator : null,
      recruiterPayoutMaxPerTx: recruiterPayoutMaxPerTx?.toString() ?? null,
      recruiterPayoutDailyCap: recruiterPayoutDailyCap?.toString() ?? null,
      recruiterPayoutsEnabled: canAdminConfigure ? enableRecruiterPayouts : null,
      communityRewardsVault: canAdminConfigure ? communityVaultAddress : null,
      protocolRevenueVault: canAdminConfigure ? protocolVaultAddress : null,
      factoryFeeRecipient: leagueRouterAddress,
      factoryTradeRouteProfile: tradeRouteProfile,
      factoryFinalizeRouteProfile: finalizeRouteProfile,
      factoryRouteAuthority: routeAuthority || null,
      unifiedRouterModeActive: true,
    },
    postDeployActions,
  };

  const file = writeDeployment(network.name, deployment);
  console.log("\nSaved deployment:", file);
  console.log("\nCanonical deploy path: hardhat run scripts/deploy.ts --network <network>");
  console.log("\nFrontend env:");
  console.log(`VITE_FACTORY_ADDRESS_${deployment.chainId}=${factoryAddress}`);
  console.log(`VITE_VOTE_TREASURY_ADDRESS_${deployment.chainId}=${voteTreasuryAddress}`);
  console.log(`VITE_TREASURY_ROUTER_ADDRESS_${deployment.chainId}=${leagueRouterAddress}`);
  console.log(`VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_${deployment.chainId}=${communityVaultAddress}`);
  console.log(`VITE_RECRUITER_REWARDS_VAULT_ADDRESS_${deployment.chainId}=${recruiterVaultAddress}`);
  console.log(`VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_${deployment.chainId}=${protocolVaultAddress}`);
  console.log("\nPhase 1 routing topology:");
  console.log("- LaunchFactory feeRecipient -> TreasuryRouter (unified mode trigger):", leagueRouterAddress);
  console.log("- Factory route profiles: trade=", tradeRouteProfile, "finalize=", finalizeRouteProfile);
  console.log("- Factory route authority:", routeAuthority || "(not set)");
  console.log("- League trade slice -> TreasuryRouter -> LeagueTreasury:", leagueRouterAddress, "->", vaultAddress);
  console.log("- Recruiter-directed slices -> RecruiterRewardsVault:", recruiterVaultAddress);
  console.log("- Community slices -> CommunityRewardsVault:", communityVaultAddress);
  console.log("- Residual protocol share -> ProtocolRevenueVault:", protocolVaultAddress);
  console.log("- Legacy protocol treasury safe remains admin/operator for vault control:", treasurySafe);
  console.log("- League vault lanes start paused by default and only activate if caps + role envs are configured.");
  if (postDeployActions.length) {
    console.log("\nPending multisig/admin actions:");
    for (const action of postDeployActions) console.log(`- ${action}`);
  }

  return deployment;
}
