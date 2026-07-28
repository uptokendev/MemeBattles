import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertCode, resolveContracts } from "./verify-deployment";

const TESTNET_CHAIN_ID = 97n;
const MAINNET_CHAIN_ID = 56n;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function boolEnv(name: string, fallback = false): boolean {
  const value = rawEnv(name).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function requireAddress(label: string, value: string): string {
  if (!ADDRESS_RE.test(value || "")) throw new Error(`${label}: missing or invalid address: ${value || "<empty>"}`);
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label}: zero address is not allowed.`);
  return address;
}

function loadBaseDeployment() {
  const file = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Base deployment file not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseMonthlyCap(baseDeployment: any): bigint {
  const configured = rawEnv("MONTHLY_LEAGUE_CAP_USD");
  if (configured) {
    const value = ethers.parseUnits(configured, 18);
    if (value <= 0n) throw new Error("MONTHLY_LEAGUE_CAP_USD must be positive when provided.");
    return value;
  }
  return BigInt(baseDeployment.monthlyLeagueCapUsd ?? baseDeployment.routing?.monthlyLeagueCapUsd ?? 0);
}

async function hasContractCode(address: string): Promise<boolean> {
  return (await ethers.provider.getCode(address)) !== "0x";
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === MAINNET_CHAIN_ID) {
    throw new Error("Refusing minimal test TreasuryRouterV2 migration on BSC mainnet (chain 56).");
  }
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`This migration is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: baseFile, deployment: baseDeployment } = loadBaseDeployment();
  const contracts = resolveContracts(baseDeployment);
  const [deployer] = await ethers.getSigners();
  const deployerAddress = ethers.getAddress(await deployer.getAddress());
  const deploymentBlock = await ethers.provider.getBlockNumber();

  if (baseDeployment.treasuryRouterVersion === "v2" || contracts.TreasuryRouterV2) {
    throw new Error(
      "Base deployment already declares TreasuryRouterV2. Use the original legacy deployments/<network>.json as DEPLOYMENT_FILE when replacing a bad staged V2 deployment.",
    );
  }

  const manifestTreasuryAdmin = requireAddress("Manifest treasury admin", baseDeployment.treasurySafe);
  const configuredTreasuryAdmin = rawEnv("TREASURY_ADMIN_ADDRESS");
  const treasuryAdmin = requireAddress(
    "Treasury admin",
    configuredTreasuryAdmin || manifestTreasuryAdmin,
  );
  const treasuryAdminIsContract = await hasContractCode(treasuryAdmin);
  const canAdminConfigure = treasuryAdmin.toLowerCase() === deployerAddress.toLowerCase();
  const allowExternalTreasuryAdmin = boolEnv("ALLOW_EXTERNAL_TREASURY_ADMIN", false);

  if (!canAdminConfigure && !allowExternalTreasuryAdmin) {
    const adminType = treasuryAdminIsContract ? "contract/Safe" : "EOA wallet";
    throw new Error(
      `Treasury admin ${treasuryAdmin} is a different ${adminType} from deployer ${deployerAddress}. ` +
        "Refusing to deploy another Router V2 that this signer cannot configure. " +
        "For this testnet deployment set TREASURY_ADMIN_ADDRESS to a wallet controlled by the loaded DEPLOYER_PK. " +
        "To intentionally use an external Safe/admin, also set ALLOW_EXTERNAL_TREASURY_ADMIN=true.",
    );
  }

  if (!canAdminConfigure && !treasuryAdminIsContract) {
    console.warn(
      `[treasury-v2-minimal] WARNING: external treasury admin ${treasuryAdmin} is an EOA. ` +
        "The deployment will require that wallet's private key for all admin wiring.",
    );
  }

  const weeklyLeagueVault = requireAddress(
    "Existing weekly league vault",
    contracts.WeeklyLeagueVault || contracts.TreasuryVaultV2,
  );
  const recruiterRewardsVault = requireAddress("Existing RecruiterRewardsVault", contracts.RecruiterRewardsVault);
  const protocolRevenueVault = requireAddress("Existing ProtocolRevenueVault", contracts.ProtocolRevenueVault);
  const graduationOracle = requireAddress("Existing GraduationOracle", contracts.GraduationOracle);
  const oldPermanentLpLocker = requireAddress("Existing PermanentLpLocker", contracts.PermanentLpLocker);
  const legacyTreasuryRouter = requireAddress("Legacy TreasuryRouter", contracts.TreasuryRouter);
  const legacyCommunityRewardsVault = requireAddress("Legacy CommunityRewardsVault", contracts.CommunityRewardsVault);

  await assertCode("Existing weekly league vault", weeklyLeagueVault);
  await assertCode("Existing RecruiterRewardsVault", recruiterRewardsVault);
  await assertCode("Existing ProtocolRevenueVault", protocolRevenueVault);
  await assertCode("Existing GraduationOracle", graduationOracle);
  await assertCode("Existing PermanentLpLocker", oldPermanentLpLocker);
  await assertCode("Legacy TreasuryRouter", legacyTreasuryRouter);
  await assertCode("Legacy CommunityRewardsVault", legacyCommunityRewardsVault);

  const rootPosterRaw = rawEnv("LEAGUE_ROOT_POSTER") || String(baseDeployment.leagueRootPoster ?? ethers.ZeroAddress);
  const rootPoster = ADDRESS_RE.test(rootPosterRaw) ? ethers.getAddress(rootPosterRaw) : ethers.ZeroAddress;
  const upgradeDelaySeconds = Number(baseDeployment.upgradeDelaySeconds ?? 2 * 24 * 60 * 60);
  if (!Number.isInteger(upgradeDelaySeconds) || upgradeDelaySeconds < 60 * 60) {
    throw new Error(`Invalid upgrade delay ${upgradeDelaySeconds}; TreasuryRouterV2 requires at least 3600 seconds.`);
  }
  const monthlyCapUsd = parseMonthlyCap(baseDeployment);

  console.log(`[treasury-v2-minimal] base deployment: ${baseFile}`);
  console.log(`[treasury-v2-minimal] chainId=${net.chainId.toString()} network=${network.name}`);
  console.log(`[treasury-v2-minimal] deployer=${deployerAddress}`);
  console.log(`[treasury-v2-minimal] manifest treasury admin=${manifestTreasuryAdmin}`);
  console.log(`[treasury-v2-minimal] selected treasury admin=${treasuryAdmin}`);
  console.log(`[treasury-v2-minimal] treasury admin type=${treasuryAdminIsContract ? "contract/Safe" : "EOA wallet"}`);
  console.log(`[treasury-v2-minimal] deployer can configure=${canAdminConfigure}`);
  console.log(`[treasury-v2-minimal] reusing weekly=${weeklyLeagueVault}`);
  console.log(`[treasury-v2-minimal] reusing recruiter=${recruiterRewardsVault}`);
  console.log(`[treasury-v2-minimal] reusing protocol=${protocolRevenueVault}`);
  console.log(`[treasury-v2-minimal] preserving legacy locker=${oldPermanentLpLocker}`);
  console.log(`[treasury-v2-minimal] preserving legacy router=${legacyTreasuryRouter}`);
  console.log(`[treasury-v2-minimal] preserving legacy community vault=${legacyCommunityRewardsVault}`);

  const Charity = await ethers.getContractFactory("CharityTreasury");
  const charity = await Charity.deploy(treasuryAdmin);
  await charity.waitForDeployment();
  const charityTreasury = await charity.getAddress();

  const Monthly = await ethers.getContractFactory("MonthlyLeagueTreasury");
  const monthly = await Monthly.deploy(treasuryAdmin, rootPoster, graduationOracle, charityTreasury, monthlyCapUsd);
  await monthly.waitForDeployment();
  const monthlyLeagueTreasury = await monthly.getAddress();

  const RouterV2 = await ethers.getContractFactory("TreasuryRouterV2");
  const routerV2 = await RouterV2.deploy(treasuryAdmin, weeklyLeagueVault, monthlyLeagueTreasury, upgradeDelaySeconds);
  await routerV2.waitForDeployment();
  const treasuryRouterV2 = await routerV2.getAddress();

  // CommunityRewardsVault permits exactly one router. A dedicated V2 instance preserves V1 support for legacy factories.
  const Community = await ethers.getContractFactory("CommunityRewardsVault");
  const communityV2 = await Community.deploy(treasuryAdmin, treasuryRouterV2);
  await communityV2.waitForDeployment();
  const communityRewardsVaultV2 = await communityV2.getAddress();

  const postDeployActions: string[] = [];
  if (canAdminConfigure) {
    await (await routerV2.setRecruiterRewardsVault(recruiterRewardsVault)).wait();
    await (await routerV2.setCommunityRewardsVault(communityRewardsVaultV2)).wait();
    await (await routerV2.setProtocolRevenueVault(protocolRevenueVault)).wait();
    await (await routerV2.setAuthorizedLpLocker(oldPermanentLpLocker, true)).wait();
    await (await routerV2.setPrimaryLpLocker(oldPermanentLpLocker)).wait();
  } else {
    postDeployActions.push(`TreasuryRouterV2.setRecruiterRewardsVault(${recruiterRewardsVault})`);
    postDeployActions.push(`TreasuryRouterV2.setCommunityRewardsVault(${communityRewardsVaultV2})`);
    postDeployActions.push(`TreasuryRouterV2.setProtocolRevenueVault(${protocolRevenueVault})`);
    postDeployActions.push(`TreasuryRouterV2.setAuthorizedLpLocker(${oldPermanentLpLocker}, true)`);
    postDeployActions.push(`TreasuryRouterV2.setPrimaryLpLocker(${oldPermanentLpLocker})`);
  }

  const outFile = rawEnv("TREASURY_V2_OUTPUT_FILE")
    ? path.resolve(rawEnv("TREASURY_V2_OUTPUT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.treasury-v2-staged.json`);

  const nextDeployment = {
    ...baseDeployment,
    network: network.name,
    chainId: Number(net.chainId),
    treasurySafe: treasuryAdmin,
    treasuryAdmin,
    treasuryRouterVersion: "v2",
    weeklyLeagueVault,
    monthlyLeagueTreasury,
    monthlyLeagueTreasuryDeployed: true,
    monthlyLeagueCapUsd: monthlyCapUsd.toString(),
    charityTreasury,
    charityTreasuryDeployed: true,
    weeklyLeagueBps: 3000,
    monthlyLeagueBps: 7000,
    canAdminConfigure,
    contracts: {
      ...(baseDeployment.contracts || {}),
      LegacyTreasuryRouter: legacyTreasuryRouter,
      LegacyCommunityRewardsVault: legacyCommunityRewardsVault,
      TreasuryRouter: treasuryRouterV2,
      TreasuryRouterV2: treasuryRouterV2,
      WeeklyLeagueVault: weeklyLeagueVault,
      MonthlyLeagueTreasury: monthlyLeagueTreasury,
      CharityTreasury: charityTreasury,
      CommunityRewardsVault: communityRewardsVaultV2,
      CommunityRewardsVaultV2: communityRewardsVaultV2,
      RecruiterRewardsVault: recruiterRewardsVault,
      ProtocolRevenueVault: protocolRevenueVault,
      PermanentLpLocker: oldPermanentLpLocker,
    },
    routing: {
      ...(baseDeployment.routing || {}),
      activeLeagueVault: weeklyLeagueVault,
      weeklyLeagueVault,
      monthlyLeagueTreasury,
      monthlyLeagueCapUsd: monthlyCapUsd.toString(),
      charityTreasury,
      weeklyLeagueBps: 3000,
      monthlyLeagueBps: 7000,
      recruiterRewardsVault,
      communityRewardsVault: communityRewardsVaultV2,
      protocolRevenueVault,
      factoryFeeRecipient: treasuryRouterV2,
      permanentLpLocker: oldPermanentLpLocker,
      permanentLpLockerAuthorized: canAdminConfigure,
      unifiedRouterModeActive: true,
    },
    treasuryV2Migration: {
      stagedAt: new Date().toISOString(),
      deploymentBlock,
      baseDeployment: baseFile,
      deployer: deployerAddress,
      manifestTreasuryAdmin,
      treasuryAdmin,
      treasuryAdminType: treasuryAdminIsContract ? "contract" : "eoa",
      legacyTreasuryRouter,
      legacyCommunityRewardsVault,
      reusedContracts: {
        weeklyLeagueVault,
        recruiterRewardsVault,
        protocolRevenueVault,
        graduationOracle,
        oldPermanentLpLocker,
      },
      deployedContracts: {
        TreasuryRouterV2: treasuryRouterV2,
        MonthlyLeagueTreasury: monthlyLeagueTreasury,
        CharityTreasury: charityTreasury,
        CommunityRewardsVaultV2: communityRewardsVaultV2,
      },
      readyForFactoryDeployment: postDeployActions.length === 0,
    },
    legacyPostDeployActions: baseDeployment.postDeployActions ?? [],
    postDeployActions,
  };

  writeJson(outFile, nextDeployment);

  console.log(`\n[treasury-v2-minimal] TreasuryRouterV2=${treasuryRouterV2}`);
  console.log(`[treasury-v2-minimal] MonthlyLeagueTreasury=${monthlyLeagueTreasury}`);
  console.log(`[treasury-v2-minimal] CharityTreasury=${charityTreasury}`);
  console.log(`[treasury-v2-minimal] CommunityRewardsVaultV2=${communityRewardsVaultV2}`);
  console.log(`[treasury-v2-minimal] staged deployment=${outFile}`);

  if (postDeployActions.length) {
    console.log("\n[treasury-v2-minimal] required external admin actions before factory deployment:");
    for (const action of postDeployActions) console.log(`- ${action}`);
  } else {
    console.log("[treasury-v2-minimal] V2 reward routing configured and verified by the controlling deployer wallet.");
    console.log("[treasury-v2-minimal] Staged deployment is ready for scheduled factory deployment.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
