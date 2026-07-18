import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { loadDeployment, resolveContracts } from "./verify-deployment";

const REQUIRED_CHAIN_ID = 97n;
const REQUIRED_VOLATILE_FEE_BPS = 100n;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;

type AcceptanceReport = {
  chainId: number;
  network: string;
  generatedAt: string;
  topazManifest: string;
  acceptanceInput: string;
  evidenceRequired: boolean;
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
  poolToken0: string;
  poolToken1: string;
  initialTokenReserve: string;
  initialWbnbReserve: string;
  currentTokenReserve: string;
  currentWbnbReserve: string;
  finalCurvePrice: string;
  initialDexPrice: string;
  lockerLpBalanceBeforeTrades: string;
  lockerLpBalanceAfterHarvest: string;
  currentLockerLpBalance: string;
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
  notes: string[];
};

type AcceptanceInput = Partial<Omit<AcceptanceReport, "checks" | "errors" | "passed" | "notes">>;

function blankReport(chainId: number): AcceptanceReport {
  return {
    chainId,
    network: network.name,
    generatedAt: new Date().toISOString(),
    topazManifest: "",
    acceptanceInput: "",
    evidenceRequired: envFlag("TOPAZ_ACCEPTANCE_REQUIRE_EVIDENCE"),
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
    poolToken0: "",
    poolToken1: "",
    initialTokenReserve: "",
    initialWbnbReserve: "",
    currentTokenReserve: "",
    currentWbnbReserve: "",
    finalCurvePrice: "",
    initialDexPrice: "",
    lockerLpBalanceBeforeTrades: "",
    lockerLpBalanceAfterHarvest: "",
    currentLockerLpBalance: "",
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
    notes: [],
  };
}

function envFlag(name: string) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] ?? "").toLowerCase());
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

function readJsonFile(file: string) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`Acceptance input file not found: ${resolved}`);
  return { file: resolved, data: JSON.parse(fs.readFileSync(resolved, "utf8")) as AcceptanceInput };
}

function loadAcceptanceInput(report: AcceptanceReport) {
  const file = process.env.TOPAZ_ACCEPTANCE_INPUT;
  if (file) {
    const input = readJsonFile(file);
    report.acceptanceInput = input.file;
    Object.assign(report, input.data);
  }

  const envMap: Record<string, keyof AcceptanceReport> = {
    ACCEPTANCE_CAMPAIGN: "campaign",
    ACCEPTANCE_TOKEN: "token",
    ACCEPTANCE_CREATOR: "creator",
    ACCEPTANCE_POOL: "graduatedPool",
    ACCEPTANCE_GRADUATION_TX: "graduationTx",
    ACCEPTANCE_BUY_TX: "buyTx",
    ACCEPTANCE_SELL_TX: "sellTx",
    ACCEPTANCE_HARVEST_TX: "harvestTx",
    ACCEPTANCE_LOCKER_LP_BEFORE: "lockerLpBalanceBeforeTrades",
    ACCEPTANCE_LOCKER_LP_AFTER: "lockerLpBalanceAfterHarvest",
    ACCEPTANCE_CLAIMED_TOKEN: "claimedToken",
    ACCEPTANCE_CLAIMED_WBNB: "claimedWbnb",
    ACCEPTANCE_CREATOR_TOKEN_RECEIVED: "creatorTokenReceived",
    ACCEPTANCE_CREATOR_WBNB_RECEIVED: "creatorWbnbReceived",
    ACCEPTANCE_PROTOCOL_TOKEN_RECEIVED: "protocolTokenReceived",
    ACCEPTANCE_PROTOCOL_WBNB_RECEIVED: "protocolWbnbReceived",
    ACCEPTANCE_FINAL_CURVE_PRICE: "finalCurvePrice",
    ACCEPTANCE_INITIAL_DEX_PRICE: "initialDexPrice",
  };

  const mutableReport = report as unknown as Record<string, string>;
  for (const [envName, key] of Object.entries(envMap)) {
    const value = process.env[envName];
    if (value) mutableReport[key] = value;
  }

  if (!report.acceptanceInput && Object.keys(envMap).some((name) => !!process.env[name])) {
    report.acceptanceInput = "environment";
  }
}

async function requireCode(report: AcceptanceReport, label: string, address: string) {
  const ok = !!address && address !== ethers.ZeroAddress && ADDRESS_RE.test(address) && (await ethers.provider.getCode(address)) !== "0x";
  report.checks[`code.${label}`] = ok;
  if (!ok) report.errors.push(`${label} has no bytecode at ${address || "<empty>"}`);
}

function expectEqual<T>(report: AcceptanceReport, label: string, actual: T, expected: T) {
  const ok = actual === expected;
  report.checks[label] = ok;
  if (!ok) report.errors.push(`${label}: expected ${expected}, got ${actual}`);
}

function expectTruthy(report: AcceptanceReport, label: string, value: unknown) {
  const ok = !!value;
  report.checks[label] = ok;
  if (!ok) report.errors.push(`${label}: expected a value`);
}

async function validateTx(report: AcceptanceReport, label: string, txHash: string) {
  if (!txHash) return;
  if (!TX_RE.test(txHash)) {
    report.checks[`tx.${label}.format`] = false;
    report.errors.push(`${label} tx is not a 32-byte transaction hash: ${txHash}`);
    return;
  }

  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  const exists = receipt !== null;
  report.checks[`tx.${label}.exists`] = exists;
  if (!exists) {
    report.errors.push(`${label} tx receipt not found: ${txHash}`);
    return;
  }

  const succeeded = receipt.status === 1;
  report.checks[`tx.${label}.status`] = succeeded;
  if (!succeeded) report.errors.push(`${label} tx failed: ${txHash}`);
}

async function enrichPoolEvidence(report: AcceptanceReport) {
  if (!report.graduatedPool) return;

  await requireCode(report, "GraduatedPool", report.graduatedPool);
  const pool = new ethers.Contract(
    report.graduatedPool,
    [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function stable() view returns (bool)",
      "function getReserves() view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast)",
      "function balanceOf(address owner) view returns (uint256)",
    ],
    ethers.provider
  );

  const [token0, token1, stable, reserves, currentLockerLpBalance] = await Promise.all([
    pool.token0(),
    pool.token1(),
    pool.stable(),
    pool.getReserves(),
    pool.balanceOf(report.permanentLpLocker),
  ]);

  report.poolToken0 = token0;
  report.poolToken1 = token1;
  report.poolStable = stable;
  report.currentLockerLpBalance = currentLockerLpBalance.toString();
  expectEqual(report, "pool.stable", stable, false);

  const reserve0 = reserves.reserve0 ?? reserves[0];
  const reserve1 = reserves.reserve1 ?? reserves[1];
  if (token0.toLowerCase() === report.topazWbnb.toLowerCase()) {
    report.currentWbnbReserve = reserve0.toString();
    report.currentTokenReserve = reserve1.toString();
  } else if (token1.toLowerCase() === report.topazWbnb.toLowerCase()) {
    report.currentTokenReserve = reserve0.toString();
    report.currentWbnbReserve = reserve1.toString();
  } else {
    report.errors.push(`Graduated pool ${report.graduatedPool} does not pair with WBNB ${report.topazWbnb}`);
    report.checks["pool.hasWbnb"] = false;
  }

  if (!report.lockerLpBalanceAfterHarvest) report.lockerLpBalanceAfterHarvest = report.currentLockerLpBalance;
}

async function enrichOptionalEvidence(report: AcceptanceReport) {
  if (report.campaign) await requireCode(report, "LaunchCampaign", report.campaign);
  if (report.token) await requireCode(report, "GraduatedToken", report.token);
  if (report.creator && !ADDRESS_RE.test(report.creator)) {
    report.checks["creator.format"] = false;
    report.errors.push(`creator is not a 20-byte address: ${report.creator}`);
  }

  await enrichPoolEvidence(report);
  await Promise.all([
    validateTx(report, "graduation", report.graduationTx),
    validateTx(report, "buy", report.buyTx),
    validateTx(report, "sell", report.sellTx),
    validateTx(report, "harvest", report.harvestTx),
  ]);
}

function requireEvidenceFields(report: AcceptanceReport) {
  if (!report.evidenceRequired) {
    report.notes.push("Set TOPAZ_ACCEPTANCE_REQUIRE_EVIDENCE=true to fail the report when final campaign, transaction, and harvest evidence is missing.");
    return;
  }

  for (const key of [
    "campaign",
    "token",
    "creator",
    "graduatedPool",
    "graduationTx",
    "buyTx",
    "sellTx",
    "harvestTx",
    "lockerLpBalanceBeforeTrades",
    "lockerLpBalanceAfterHarvest",
    "claimedToken",
    "claimedWbnb",
    "creatorTokenReceived",
    "creatorWbnbReceived",
    "protocolTokenReceived",
    "protocolWbnbReceived",
  ] as Array<keyof AcceptanceReport>) {
    expectTruthy(report, `evidence.${String(key)}`, report[key]);
  }
}

async function main() {
  const chain = await ethers.provider.getNetwork();
  const report = blankReport(Number(chain.chainId));

  try {
    loadAcceptanceInput(report);
    expectEqual(report, "chainId", chain.chainId.toString(), REQUIRED_CHAIN_ID.toString());

    const { file, manifest } = loadTopazManifest();
    report.topazManifest = file;
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

    await enrichOptionalEvidence(report);
    requireEvidenceFields(report);
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
  } else if (report.evidenceRequired) {
    console.log("[topaz-graduation] acceptance evidence passed");
  } else {
    console.log("[topaz-graduation] acceptance preflight passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
