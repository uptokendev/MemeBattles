import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function assertEq(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`[verify] ${label}: ok`);
}

function assertBigIntEq(label: string, actual: bigint, expected: bigint) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`[verify] ${label}: ok`);
}

function assertTrue(label: string, value: boolean) {
  if (!value) throw new Error(`${label}: expected true`);
  console.log(`[verify] ${label}: ok`);
}

function assertAddress(label: string, value: string) {
  if (!value || value === ethers.ZeroAddress) throw new Error(`${label}: expected non-zero address`);
}

export function hardhatEphemeralHint() {
  return network.name === "hardhat"
    ? " Hardhat's default network is ephemeral between commands; use npm run deploy:verify, or verify against a persistent localhost/testnet network."
    : "";
}

export async function assertCode(label: string, address: string) {
  if (!address || address === ethers.ZeroAddress) {
    throw new Error(
      `${label}: missing address in deployment file. Redeploy with the current scripts/deploy.ts or update DEPLOYMENT_FILE to a current deployment JSON.`
    );
  }
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label}: ${address} has no code on ${network.name}.${hardhatEphemeralHint()}`);
  console.log(`[verify] ${label} code: ok`);
}

async function readAddressGetter(label: string, address: string, candidates: string[]) {
  const errors: string[] = [];
  for (const candidate of candidates) {
    const contract = new ethers.Contract(address, [`function ${candidate}() view returns (address)`], ethers.provider);
    try {
      const value = await contract[candidate]();
      assertAddress(`${label}.${candidate}`, value);
      console.log(`[verify] ${label}.${candidate}: ok`);
      return { name: candidate, value };
    } catch (error: any) {
      errors.push(`${candidate}: ${error?.message ?? String(error)}`);
    }
  }
  throw new Error(`${label}: ${address} does not expose any of ${candidates.join(", ")}. ${errors.join(" | ")}`);
}

export async function assertTopazRouter(label: string, address: string) {
  await assertCode(label, address);

  try {
    const poolFactory = await readAddressGetter(label, address, ["defaultFactory", "poolFactory"]);
    const wrappedNative = await readAddressGetter(label, address, ["weth", "WETH"]);

    await assertCode(`${label}.${poolFactory.name}`, poolFactory.value);
    await assertCode(`${label}.${wrappedNative.name}`, wrappedNative.value);

    const factory = new ethers.Contract(
      poolFactory.value,
      ["function getFee(address pool, bool stable) view returns (uint256)"],
      ethers.provider
    );
    const volatileFeeBps = await factory.getFee(ethers.ZeroAddress, false);
    assertBigIntEq(`${label}.${poolFactory.name}.volatileFeeBps`, volatileFeeBps, 100n);
    console.log(`[verify] ${label} Minimal Topaz interface: ok`);
  } catch (error: any) {
    throw new Error(`${label}: ${address} does not expose the Topaz router interface. ${error?.message ?? String(error)}`);
  }
}

export function pickAddress(deployment: any, canonicalName: string, fallbacks: string[] = []) {
  const contracts = deployment.contracts ?? {};
  for (const key of [canonicalName, ...fallbacks]) {
    const fromContracts = contracts[key];
    if (typeof fromContracts === "string" && fromContracts) return fromContracts;
    const topLevel = deployment[key];
    if (typeof topLevel === "string" && topLevel) return topLevel;
  }
  return "";
}

export function resolveContracts(deployment: any) {
  return {
    TreasuryVaultV2: pickAddress(deployment, "TreasuryVaultV2", ["LeagueTreasury", "leagueTreasury", "treasuryVault", "vault"]),
    TreasuryRouter: pickAddress(deployment, "TreasuryRouter", ["TreasuryRouterV2", "treasuryRouterV2", "treasuryRouter", "leagueRouter", "routerAddress"]),
    RecruiterRewardsVault: pickAddress(deployment, "RecruiterRewardsVault", ["recruiterRewardsVault", "recruiterVault"]),
    CommunityRewardsVault: pickAddress(deployment, "CommunityRewardsVault", ["communityRewardsVault", "communityVault"]),
    ProtocolRevenueVault: pickAddress(deployment, "ProtocolRevenueVault", ["protocolRevenueVault", "protocolVault"]),
    CreatorRegistry: pickAddress(deployment, "CreatorRegistry", ["creatorRegistry"]),
    RiskRegistry: pickAddress(deployment, "RiskRegistry", ["riskRegistry"]),
    GraduationOracle: pickAddress(deployment, "GraduationOracle", ["graduationOracle"]),
    LaunchCampaignImplementation: pickAddress(deployment, "LaunchCampaignImplementation", ["campaignImplementation"]),
    LaunchFactory: pickAddress(deployment, "LaunchFactory", ["factory", "factoryAddress"]),
    PermanentLpLocker: pickAddress(deployment, "PermanentLpLocker", ["permanentLpLocker"]),
    UPVoteTreasury: pickAddress(deployment, "UPVoteTreasury", ["voteTreasury", "voteTreasuryAddress"]),
  };
}

export function loadDeployment() {
  const file = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(__dirname, "..", "deployments", `${network.name}.json`);

  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file not found: ${file}. Run scripts/deploy.ts first or set DEPLOYMENT_FILE.`);
  }

  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`[verify] Loaded deployment: ${file}`);
  return deployment;
}

export async function verifyDeployment(deployment: any) {
  const contracts = resolveContracts(deployment);

  for (const [name, address] of Object.entries(contracts)) {
    await assertCode(name, address);
  }

  const router = deployment.productionTopazRouter || deployment.topazInfrastructure?.contracts?.Router || deployment.topazRouter || deployment.router;
  await assertTopazRouter("TopazRouter", router);

  if (deployment.graduationPriceFeed) {
    await assertCode("GraduationPriceFeed", deployment.graduationPriceFeed);
  }

  if (deployment.routing?.factoryFeeRecipient) {
    assertEq("routing.factoryFeeRecipient", deployment.routing.factoryFeeRecipient, contracts.TreasuryRouter);
  }
  if (deployment.routing?.permanentLpLocker) {
    assertEq("routing.permanentLpLocker", deployment.routing.permanentLpLocker, contracts.PermanentLpLocker);
  }
  if (deployment.routing?.campaignImplementation) {
    assertEq("routing.campaignImplementation", deployment.routing.campaignImplementation, contracts.LaunchCampaignImplementation);
  }
  if (deployment.routing?.graduationOracle) {
    assertEq("routing.graduationOracle", deployment.routing.graduationOracle, contracts.GraduationOracle);
  }

  if (deployment.routing?.unifiedRouterModeActive !== undefined) {
    assertTrue("routing.unifiedRouterModeActive", Boolean(deployment.routing.unifiedRouterModeActive));
  }

  console.log("[verify] deployment wiring OK");
}

async function main() {
  await verifyDeployment(loadDeployment());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
