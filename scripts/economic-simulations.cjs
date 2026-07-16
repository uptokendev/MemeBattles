#!/usr/bin/env node
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
  const finalCurvePrice = currentPrice(curveSupply, config.basePrice, config.priceSlope);
  const graduationProtocolFee = fee(grossCurveRaise, config.protocolFeeBps);
  const remainingAfterFee = grossCurveRaise - graduationProtocolFee;
  const liquidityNative = (remainingAfterFee * config.liquidityBps) / MAX_BPS;
  const lpTokensDesired = finalCurvePrice === 0n ? 0n : mulDiv(liquidityNative, WAD, finalCurvePrice);
  const lpAllocationSufficient = lpTokensDesired <= liquiditySupply;
  const unusedLiquidityTokens = lpAllocationSufficient ? liquiditySupply - lpTokensDesired : 0n;

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
    overshoot,
    finalCurvePrice,
    graduationProtocolFee,
    liquidityNative,
    lpTokensDesired,
    lpAllocationSufficient,
    unusedLiquidityTokens,
  };
}

function simulate(config = DEFAULT_CONFIG) {
  const normalized = buildConfig(config);
  const scenarios = normalized.nativeUsdPrices.map((price) => simulateScenario(normalized, price));
  const failedScenarios = scenarios.filter((scenario) => !scenario.graduationReachedAtSellout || !scenario.lpAllocationSufficient);
  return {
    config: normalized,
    scenarios,
    ok: failedScenarios.length === 0,
    failedScenarios,
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
    overshootNative: formatDecimal(scenario.overshoot),
    finalCurvePriceNative: formatDecimal(scenario.finalCurvePrice),
    graduationProtocolFeeNative: formatDecimal(scenario.graduationProtocolFee),
    liquidityNative: formatDecimal(scenario.liquidityNative),
    lpTokensDesired: formatDecimal(scenario.lpTokensDesired),
    lpAllocationSufficient: scenario.lpAllocationSufficient,
    unusedLiquidityTokens: formatDecimal(scenario.unusedLiquidityTokens),
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
  };
}

function parseArgs(argv) {
  const overrides = {};
  let strict = false;
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
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "--help") {
      return { help: true, strict: false, overrides: {} };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { overrides, strict };
}

function printHelp() {
  console.log(`Usage: node scripts/economic-simulations.cjs [options]\n\nOptions:\n  --prices <csv>         Native/USD prices to simulate, e.g. 100,300,600\n  --target-usd <value>   USD graduation target, default 30000\n  --liquidity-bps <bps>  Graduation native liquidity bps, default 8000\n  --strict               Exit non-zero when any scenario fails acceptance checks\n`);
}

function main(argv = process.argv.slice(2), io = console) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return { ok: true, status: 0 };
  }
  const result = simulate(buildConfig(parsed.overrides));
  io.log(JSON.stringify(simulationToJson(result), null, 2));
  return { ok: result.ok, status: parsed.strict && !result.ok ? 1 : 0 };
}

module.exports = {
  DEFAULT_CONFIG,
  MAX_BPS,
  WAD,
  area,
  buildConfig,
  ceilDiv,
  currentPrice,
  fee,
  formatDecimal,
  main,
  nativeTargetForUsd,
  parseArgs,
  parseDecimal,
  scenarioToJson,
  simulate,
  simulateScenario,
  simulationToJson,
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
