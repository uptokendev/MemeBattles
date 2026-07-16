#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const WAD = 10n ** 18n;
const MAX_BPS = 10_000n;

const DEFAULT_CONFIG = {
  totalSupply: 1_000_000_000n * WAD,
  curveBps: 8_800n,
  liquidityTokenBps: 1_000n,
  basePrice: 50_000_000_000_000n,
  priceSlope: 1_000_000_000n,
  graduationTargetUsd: 30_000n * WAD,
  liquidityBps: 8_000n,
  protocolFeeBps: 200n,
  nativeUsdPrices: [100n, 300n, 600n, 1_000n, 2_000n].map((price) => price * WAD),
};

function parseDecimal(value, decimals = 18) {
  if (typeof value === "bigint") return value;
  const raw = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid decimal value: ${value}`);
  const [whole, fraction = ""] = raw.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function parseBps(value, label) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be an integer bps value`);
  return BigInt(value);
}

function formatDecimal(value, decimals = 18, precision = 6) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  if (precision === 0) return `${negative ? "-" : ""}${whole.toString()}`;
  const fractionString = fraction.toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fractionString ? `.${fractionString}` : ""}`;
}

function ceilDiv(numerator, denominator) {
  if (denominator === 0n) throw new Error("division by zero");
  if (numerator === 0n) return 0n;
  return ((numerator - 1n) / denominator) + 1n;
}

function mulDiv(n, m, d) {
  if (d === 0n) throw new Error("division by zero");
  return (n * m) / d;
}

function assertBps(value, label) {
  if (value < 0n || value > MAX_BPS) throw new Error(`${label} must be between 0 and 10000 bps`);
}

function area(x, basePrice, priceSlope) {
  const linear = mulDiv(x, basePrice, WAD);
  const slopeTerm = mulDiv(priceSlope, x * x, 2n * WAD * WAD);
  return linear + slopeTerm;
}

function currentPrice(sold, basePrice, priceSlope) {
  return basePrice + mulDiv(priceSlope, sold, WAD);
}

function fee(amountWei, protocolFeeBps) {
  if (protocolFeeBps === 0n) return 0n;
  return (amountWei * protocolFeeBps) / MAX_BPS;
}

function nativeTargetForUsd(usdAmount, nativeUsdPrice) {
  if (nativeUsdPrice <= 0n) throw new Error("nativeUsdPrice must be positive");
  if (usdAmount === 0n) return 0n;
  return ceilDiv(usdAmount * WAD, nativeUsdPrice);
}

function buildConfig(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  assertBps(config.curveBps, "curveBps");
  assertBps(config.liquidityTokenBps, "liquidityTokenBps");
  assertBps(config.liquidityBps, "liquidityBps");
  assertBps(config.protocolFeeBps, "protocolFeeBps");
  if (config.curveBps + config.liquidityTokenBps > MAX_BPS) {
    throw new Error("curveBps + liquidityTokenBps cannot exceed 10000 bps");
  }
  if (config.totalSupply <= 0n) throw new Error("totalSupply must be positive");
  if (!config.nativeUsdPrices.length) throw new Error("at least one native/USD price is required");
  return config;
}

function externalCaseToOverrides(caseConfig = {}) {
  const nativeUsdPrices = caseConfig.nativeUsdPrices || caseConfig.prices;
  const overrides = {};
  if (caseConfig.totalSupplyTokens !== undefined) overrides.totalSupply = parseDecimal(caseConfig.totalSupplyTokens);
  if (caseConfig.curveBps !== undefined) overrides.curveBps = parseBps(caseConfig.curveBps, "curveBps");
  if (caseConfig.liquidityTokenBps !== undefined) overrides.liquidityTokenBps = parseBps(caseConfig.liquidityTokenBps, "liquidityTokenBps");
  if (caseConfig.basePriceNative !== undefined) overrides.basePrice = parseDecimal(caseConfig.basePriceNative);
  if (caseConfig.priceSlopeNative !== undefined) overrides.priceSlope = parseDecimal(caseConfig.priceSlopeNative);
  if (caseConfig.graduationTargetUsd !== undefined) overrides.graduationTargetUsd = parseDecimal(caseConfig.graduationTargetUsd);
  if (caseConfig.liquidityBps !== undefined) overrides.liquidityBps = parseBps(caseConfig.liquidityBps, "liquidityBps");
  if (caseConfig.protocolFeeBps !== undefined) overrides.protocolFeeBps = parseBps(caseConfig.protocolFeeBps, "protocolFeeBps");
  if (nativeUsdPrices !== undefined) {
    if (!Array.isArray(nativeUsdPrices)) throw new Error("nativeUsdPrices must be an array");
    overrides.nativeUsdPrices = nativeUsdPrices.map((price) => parseDecimal(price));
  }
  return overrides;
}

function maxLiquidityBpsForReserve(liquiditySupply, finalCurvePrice, remainingAfterFee) {
  if (remainingAfterFee === 0n) return MAX_BPS;
  return mulDiv(liquiditySupply * finalCurvePrice, MAX_BPS, WAD * remainingAfterFee);
}

function simulateScenario(config, nativeUsdPrice) {
  const curveSupply = (config.totalSupply * config.curveBps) / MAX_BPS;
  const liquiditySupply = (config.totalSupply * config.liquidityTokenBps) / MAX_BPS;
  const creatorReserve = config.totalSupply - curveSupply - liquiditySupply;
  const grossCurveRaise = area(curveSupply, config.basePrice, config.priceSlope);
  const tradeProtocolFee = fee(grossCurveRaise, config.protocolFeeBps);
  const totalBuyerSpend = grossCurveRaise + tradeProtocolFee;
  const nativeTarget = nativeTargetForUsd(config.graduationTargetUsd, nativeUsdPrice);
  const graduationReachedAtSellout = grossCurveRaise >= nativeTarget;
  const overshoot = graduationReachedAtSellout ? grossCurveRaise - nativeTarget : 0n;
  const raiseToTargetRatio = nativeTarget === 0n ? 0n : mulDiv(grossCurveRaise, WAD, nativeTarget);
  const finalCurvePrice = currentPrice(curveSupply, config.basePrice, config.priceSlope);
  const graduationProtocolFee = fee(grossCurveRaise, config.protocolFeeBps);
  const remainingAfterFee = grossCurveRaise - graduationProtocolFee;
  const desiredLiquidityNative = (remainingAfterFee * config.liquidityBps) / MAX_BPS;
  const desiredLpTokens = finalCurvePrice === 0n ? 0n : mulDiv(desiredLiquidityNative, WAD, finalCurvePrice);
  const lpAllocationSufficient = desiredLpTokens <= liquiditySupply;
  const lpAllocationCapped = desiredLpTokens > liquiditySupply;
  const lpTokensUsed = lpAllocationCapped ? liquiditySupply : desiredLpTokens;
  const liquidityNativeUsed = finalCurvePrice === 0n ? 0n : mulDiv(lpTokensUsed, finalCurvePrice, WAD);
  const nativeReturnedByCap = desiredLiquidityNative > liquidityNativeUsed ? desiredLiquidityNative - liquidityNativeUsed : 0n;
  const unusedLiquidityTokens = liquiditySupply > lpTokensUsed ? liquiditySupply - lpTokensUsed : 0n;
  const requiredLiquidityTokenBps = ceilDiv(desiredLpTokens * MAX_BPS, config.totalSupply);
  const maxSafeLiquidityBps = maxLiquidityBpsForReserve(liquiditySupply, finalCurvePrice, remainingAfterFee);
  const graduationExecutable = graduationReachedAtSellout && lpTokensUsed > 0n && liquidityNativeUsed > 0n;

  return {
    nativeUsdPrice,
    curveSupply,
    liquiditySupply,
    creatorReserve,
    grossCurveRaise,
    tradeProtocolFee,
    totalBuyerSpend,
    nativeTarget,
    graduationReachedAtSellout,
    graduationExecutable,
    overshoot,
    raiseToTargetRatio,
    finalCurvePrice,
    graduationProtocolFee,
    remainingAfterFee,
    desiredLiquidityNative,
    desiredLpTokens,
    liquidityNative: liquidityNativeUsed,
    lpTokensDesired: desiredLpTokens,
    lpTokensUsed,
    lpAllocationSufficient,
    lpAllocationCapped,
    nativeReturnedByCap,
    unusedLiquidityTokens,
    requiredLiquidityTokenBps,
    maxSafeLiquidityBps,
  };
}

function simulate(config = DEFAULT_CONFIG) {
  const normalized = buildConfig(config);
  const scenarios = normalized.nativeUsdPrices.map((price) => simulateScenario(normalized, price));
  const failedScenarios = scenarios.filter((scenario) => !scenario.graduationExecutable);
  const warningScenarios = scenarios.filter((scenario) => scenario.lpAllocationCapped);
  return {
    config: normalized,
    scenarios,
    ok: failedScenarios.length === 0,
    failedScenarios,
    warningScenarios,
  };
}

function simulateSuite(suiteConfig) {
  const cases = (suiteConfig.cases || []).map((caseConfig, index) => {
    const result = simulate(buildConfig(externalCaseToOverrides(caseConfig)));
    return {
      name: caseConfig.name || `case-${index + 1}`,
      result,
    };
  });
  const failedCases = cases.filter((entry) => !entry.result.ok);
  const warningCases = cases.filter((entry) => entry.result.warningScenarios.length > 0);
  return {
    name: suiteConfig.name || "economic-simulation-suite",
    ok: failedCases.length === 0,
    cases,
    failedCases,
    warningCases,
  };
}

function scenarioToJson(scenario) {
  return {
    nativeUsdPrice: formatDecimal(scenario.nativeUsdPrice),
    curveSupplyTokens: formatDecimal(scenario.curveSupply),
    liquiditySupplyTokens: formatDecimal(scenario.liquiditySupply),
    creatorReserveTokens: formatDecimal(scenario.creatorReserve),
    grossCurveRaiseNative: formatDecimal(scenario.grossCurveRaise),
    tradeProtocolFeeNative: formatDecimal(scenario.tradeProtocolFee),
    totalBuyerSpendNative: formatDecimal(scenario.totalBuyerSpend),
    nativeTarget: formatDecimal(scenario.nativeTarget),
    graduationReachedAtSellout: scenario.graduationReachedAtSellout,
    graduationExecutable: scenario.graduationExecutable,
    overshootNative: formatDecimal(scenario.overshoot),
    raiseToTargetRatio: formatDecimal(scenario.raiseToTargetRatio),
    finalCurvePriceNative: formatDecimal(scenario.finalCurvePrice),
    graduationProtocolFeeNative: formatDecimal(scenario.graduationProtocolFee),
    remainingAfterFeeNative: formatDecimal(scenario.remainingAfterFee),
    desiredLiquidityNative: formatDecimal(scenario.desiredLiquidityNative),
    liquidityNative: formatDecimal(scenario.liquidityNative),
    lpTokensDesired: formatDecimal(scenario.lpTokensDesired),
    lpTokensUsed: formatDecimal(scenario.lpTokensUsed),
    lpAllocationSufficient: scenario.lpAllocationSufficient,
    lpAllocationCapped: scenario.lpAllocationCapped,
    nativeReturnedByCap: formatDecimal(scenario.nativeReturnedByCap),
    unusedLiquidityTokens: formatDecimal(scenario.unusedLiquidityTokens),
    requiredLiquidityTokenBps: scenario.requiredLiquidityTokenBps.toString(),
    maxSafeLiquidityBps: scenario.maxSafeLiquidityBps.toString(),
  };
}

function simulationToJson(result) {
  return {
    ok: result.ok,
    config: {
      totalSupplyTokens: formatDecimal(result.config.totalSupply),
      curveBps: result.config.curveBps.toString(),
      liquidityTokenBps: result.config.liquidityTokenBps.toString(),
      basePriceNative: formatDecimal(result.config.basePrice),
      priceSlopeNative: formatDecimal(result.config.priceSlope),
      graduationTargetUsd: formatDecimal(result.config.graduationTargetUsd),
      liquidityBps: result.config.liquidityBps.toString(),
      protocolFeeBps: result.config.protocolFeeBps.toString(),
    },
    scenarios: result.scenarios.map(scenarioToJson),
    failedScenarios: result.failedScenarios.map(scenarioToJson),
    warningScenarios: result.warningScenarios.map(scenarioToJson),
  };
}

function suiteToJson(suite) {
  return {
    name: suite.name,
    ok: suite.ok,
    cases: suite.cases.map((entry) => ({
      name: entry.name,
      ...simulationToJson(entry.result),
    })),
    failedCases: suite.failedCases.map((entry) => entry.name),
    warningCases: suite.warningCases.map((entry) => entry.name),
  };
}

function readSuiteConfig(configPath) {
  const resolved = path.resolve(process.cwd(), configPath);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeOutput(outputPath, payload) {
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`);
  return resolved;
}

function parseArgs(argv) {
  const overrides = {};
  let strict = false;
  let configPath;
  let outputPath;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--prices") {
      if (!next) throw new Error("--prices requires a comma-separated list");
      overrides.nativeUsdPrices = next.split(",").map((value) => parseDecimal(value));
      i += 1;
    } else if (arg === "--target-usd") {
      if (!next) throw new Error("--target-usd requires a value");
      overrides.graduationTargetUsd = parseDecimal(next);
      i += 1;
    } else if (arg === "--liquidity-bps") {
      if (!next) throw new Error("--liquidity-bps requires a value");
      overrides.liquidityBps = BigInt(next);
      i += 1;
    } else if (arg === "--config") {
      if (!next) throw new Error("--config requires a path");
      configPath = next;
      i += 1;
    } else if (arg === "--output") {
      if (!next) throw new Error("--output requires a path");
      outputPath = next;
      i += 1;
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "--help") {
      return { help: true, strict: false, overrides: {} };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (configPath && Object.keys(overrides).length > 0) {
    throw new Error("Use either --config or direct override flags, not both");
  }
  return { configPath, outputPath, overrides, strict };
}

function printHelp() {
  console.log(`Usage: node scripts/economic-simulations.cjs [options]\n\nOptions:\n  --prices <csv>         Native/USD prices to simulate, e.g. 100,300,600\n  --target-usd <value>   USD graduation target, default 30000\n  --liquidity-bps <bps>  Graduation native liquidity bps, default 8000\n  --config <path>        Read a JSON suite from config/economic-scenarios.json style input\n  --output <path>        Write the JSON result to a file instead of stdout\n  --strict               Exit non-zero when any scenario cannot execute graduation\n`);
}

function main(argv = process.argv.slice(2), io = console) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return { ok: true, status: 0 };
  }

  const payload = parsed.configPath
    ? suiteToJson(simulateSuite(readSuiteConfig(parsed.configPath)))
    : simulationToJson(simulate(buildConfig(parsed.overrides)));

  if (parsed.outputPath) {
    const written = writeOutput(parsed.outputPath, payload);
    io.log(`[economics] wrote ${written}`);
  } else {
    io.log(JSON.stringify(payload, null, 2));
  }

  return { ok: payload.ok, status: parsed.strict && !payload.ok ? 1 : 0 };
}

module.exports = {
  DEFAULT_CONFIG,
  MAX_BPS,
  WAD,
  area,
  buildConfig,
  ceilDiv,
  currentPrice,
  externalCaseToOverrides,
  fee,
  formatDecimal,
  main,
  maxLiquidityBpsForReserve,
  nativeTargetForUsd,
  parseArgs,
  parseBps,
  parseDecimal,
  readSuiteConfig,
  scenarioToJson,
  simulate,
  simulateScenario,
  simulateSuite,
  simulationToJson,
  suiteToJson,
  writeOutput,
};

if (require.main === module) {
  try {
    const result = main();
    if (result.status !== 0) process.exitCode = result.status;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
