import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

const REQUIRED_CHAIN_ID = 97n;
const REQUIRED_VOLATILE_FEE_BPS = 100n;

type AcceptanceReport = {
  chainId: number;
  topazRouter: string;
  topazPoolFactory: string;
  topazWbnb: string;
  volatileFeeBps: number;
  launchFactory: string;
  campaign: string;
  token: string;
  creator: string;
  permanentLpLocker: string;
  graduatedPool: string;
  graduationTx: string;
  poolStable: boolean;
  initialTokenReserve: string;
  initialWbnbReserve: string;
  finalCurvePrice: string;
  initialDexPrice: string;
  lockerLpBalanceBeforeTrades: string;
  lockerLpBalanceAfterHarvest: string;
  buyTx: string;
  sellTx: string;
  harvestTx: string;
  claimedToken: string;
  claimedWbnb: string;
  creatorTokenReceived: string;
  creatorWbnbReceived: string;
  protocolTokenReceived: string;
  protocolWbnbReceived: string;
  creatorShareBps: 8000;
  protocolShareBps: 2000;
  passed: boolean;
  checks: Record<string, boolean>;
  errors: string[];
};

function blankReport(chainId: number): AcceptanceReport {
  return {
    chainId,
    topazRouter: "",
    topazPoolFactory: "",
    topazWbnb: "",
    volatileFeeBps: 0,
    launchFactory: "",
    campaign: "",
    token: "",
    creator: "",
    permanentLpLocker: "",
    graduatedPool: "",
    graduationTx: "",
    poolStable: false,
    initialTokenReserve: "",
    initialWbnbReserve: "",
    finalCurvePrice: "",
    initialDexPrice: "",
    lockerLpBalanceBeforeTrades: "",
    lockerLpBalanceAfterHarvest: "",
    buyTx: "",
    sellTx: "",
    harvestTx: "",
    claimedToken: "",
    claimedWbnb: "",
    creatorTokenReceived: "",
    creatorWbnbReceived: "",
    protocolTokenReceived: "",
    protocolWbnbReceived: "",
    creatorShareBps: 8000,
    protocolShareBps: 2000,
    passed: false,
    checks: {},
    errors: [],
  };
}

function resolveTopazManifestPath() {
  if (process.env.TOPAZ_MANIFEST) return path.resolve(process.env.TOPAZ_MANIFEST);
  return path.join(__dirname, "..", "deployments", network.name, "minimal-topaz.json");
}

function loadTopazManifest() {
  const file = resolveTopazManifestPath();
  if (!fs.existsSync(file)) {
    throw new Error(`Minimal Topaz manifest not found: ${file}. Copy MemeWarzone-Topaz deployments/bscTestnet/minimal-topaz.json here or set TOPAZ_MANIFEST.`);
  }
  return { file, manifest: JSON.parse(fs.readFileSync(file, "utf8")) };
}

async function requireCode(report: AcceptanceReport, label: string, address: string) {
  const ok = !!address && address !== ethers.ZeroAddress && (await ethers.provider.getCode(address)) !== "0x";
  report.checks[`code.${label}`] = ok;
  if (!ok) report.errors.push(`${label} has no bytecode at ${address}`);
}

function expectEqual<T>(report: AcceptanceReport, label: string, actual: T, expected: T) {
  const ok = actual === expected;
  report.checks[label] = ok;
  if (!ok) report.errors.push(`${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  const chain = await ethers.provider.getNetwork();
  const report = blankReport(Number(chain.chainId));

  try {
    expectEqual(report, "chainId", chain.chainId.toString(), REQUIRED_CHAIN_ID.toString());

    const { manifest } = loadTopazManifest();
    report.topazRouter = manifest.contracts?.Router ?? "";
    report.topazPoolFactory = manifest.contracts?.PoolFactory ?? "";
    report.topazWbnb = manifest.contracts?.WBNB ?? "";
    report.volatileFeeBps = Number(manifest.configuration?.volatileFeeBps ?? 0);

    expectEqual(report, "manifest.chainId", String(manifest.chainId), String(Number(REQUIRED_CHAIN_ID)));
    expectEqual(report, "manifest.volatileFeeBps", String(report.volatileFeeBps), String(Number(REQUIRED_VOLATILE_FEE_BPS)));

    await requireCode(report, "TopazRouter", report.topazRouter);
    await requireCode(report, "TopazPoolFactory", report.topazPoolFactory);
    await requireCode(report, "TopazWBNB", report.topazWbnb);

    const router = new ethers.Contract(
      report.topazRouter,
      ["function defaultFactory() view returns (address)", "function weth() view returns (address)"],
      ethers.provider
    );
    const factoryFromRouter = await router.defaultFactory();
    const wbnbFromRouter = await router.weth();
    expectEqual(report, "router.defaultFactory", factoryFromRouter.toLowerCase(), report.topazPoolFactory.toLowerCase());
    expectEqual(report, "router.weth", wbnbFromRouter.toLowerCase(), report.topazWbnb.toLowerCase());

    const factory = new ethers.Contract(
      report.topazPoolFactory,
      ["function getFee(address pool, bool stable) view returns (uint256)"],
      ethers.provider
    );
    const volatileFee = await factory.getFee(ethers.ZeroAddress, false);
    report.volatileFeeBps = Number(volatileFee);
    expectEqual(report, "factory.volatileFeeBps", volatileFee.toString(), REQUIRED_VOLATILE_FEE_BPS.toString());

    const deployment = loadDeployment();
    const contracts = resolveContracts(deployment);
    report.launchFactory = contracts.LaunchFactory;
    report.permanentLpLocker = contracts.PermanentLpLocker;
    await requireCode(report, "LaunchFactory", report.launchFactory);
    await requireCode(report, "PermanentLpLocker", report.permanentLpLocker);

    report.passed = Object.values(report.checks).every(Boolean) && report.errors.length === 0;
  } catch (error: any) {
    report.errors.push(error?.message ?? String(error));
    report.passed = false;
  }

  const outDir = path.join(__dirname, "..", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `topaz-graduation-testnet-${Date.now()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[topaz-graduation] wrote ${outFile}`);

  if (!report.passed) {
    console.error("[topaz-graduation] acceptance failed");
    for (const error of report.errors) console.error(`[topaz-graduation] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("[topaz-graduation] acceptance preflight passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
