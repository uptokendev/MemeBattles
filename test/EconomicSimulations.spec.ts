import { expect } from "chai";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const {
  WAD,
  buildConfig,
  externalCaseToOverrides,
  main,
  nativeTargetForUsd,
  parseArgs,
  parseDecimal,
  readSuiteConfig,
  simulate,
  simulateScenario,
  simulateSuite,
  simulationToJson,
  suiteToJson,
} = require("../scripts/economic-simulations.cjs");

describe("economic simulation script", function () {
  const fixturePath = "config/economic-scenarios.json";
  const outputPath = "output/test-economic-simulation-results.json";

  afterEach(() => {
    if (existsSync(path.join(process.cwd(), outputPath))) rmSync(path.join(process.cwd(), outputPath));
  });

  it("matches GraduationOracle ceiling math for USD native targets", async () => {
    expect(nativeTargetForUsd(30_000n * WAD, 600n * WAD)).to.eq(50n * WAD);
    expect(nativeTargetForUsd(1n, 600n * WAD)).to.eq(1n);
    expect(() => nativeTargetForUsd(1n, 0n)).to.throw("nativeUsdPrice must be positive");
  });

  it("models a compact curve that can graduate and fit its LP allocation", async () => {
    const config = buildConfig({
      totalSupply: 1_000n * WAD,
      curveBps: 5_000n,
      liquidityTokenBps: 4_000n,
      basePrice: 1_000_000_000_000n,
      priceSlope: 1_000_000_000n,
      graduationTargetUsd: parseDecimal("0.1"),
      liquidityBps: 8_000n,
      protocolFeeBps: 200n,
      nativeUsdPrices: [600n * WAD],
    });

    const scenario = simulateScenario(config, 600n * WAD);

    expect(scenario.graduationReachedAtSellout).to.eq(true);
    expect(scenario.lpAllocationSufficient).to.eq(true);
    expect(scenario.lpTokensDesired <= scenario.liquiditySupply).to.eq(true);
    expect(scenario.overshoot > 0n).to.eq(true);
  });

  it("flags scenarios that cannot graduate before curve sellout", async () => {
    const result = simulate(buildConfig({
      totalSupply: 1_000n * WAD,
      curveBps: 5_000n,
      liquidityTokenBps: 4_000n,
      basePrice: 1_000_000_000_000n,
      priceSlope: 0n,
      graduationTargetUsd: 10_000n * WAD,
      nativeUsdPrices: [600n * WAD],
    }));

    expect(result.ok).to.eq(false);
    expect(result.failedScenarios).to.have.length(1);
    expect(result.failedScenarios[0].graduationReachedAtSellout).to.eq(false);
  });

  it("flags scenarios whose graduation liquidity needs more tokens than reserved", async () => {
    const result = simulate(buildConfig({
      totalSupply: 1_000n * WAD,
      curveBps: 9_000n,
      liquidityTokenBps: 100n,
      basePrice: 1_000_000_000_000n,
      priceSlope: 0n,
      graduationTargetUsd: parseDecimal("0.01"),
      liquidityBps: 10_000n,
      protocolFeeBps: 0n,
      nativeUsdPrices: [600n * WAD],
    }));

    expect(result.ok).to.eq(false);
    expect(result.failedScenarios[0].lpAllocationSufficient).to.eq(false);
    expect(result.failedScenarios[0].requiredLiquidityTokenBps > result.config.liquidityTokenBps).to.eq(true);
    expect(result.failedScenarios[0].maxSafeLiquidityBps < result.config.liquidityBps).to.eq(true);
  });

  it("serializes bigint simulation outputs and tuning diagnostics into reviewable JSON", async () => {
    const result = simulate(buildConfig({ nativeUsdPrices: [600n * WAD] }));
    const json = simulationToJson(result);

    expect(json.config.graduationTargetUsd).to.eq("30000");
    expect(json.scenarios).to.have.length(1);
    expect(json.scenarios[0].nativeUsdPrice).to.eq("600");
    expect(json.scenarios[0]).to.have.property("grossCurveRaiseNative").that.is.a("string");
    expect(json.scenarios[0]).to.have.property("requiredLiquidityTokenBps").that.is.a("string");
    expect(json.scenarios[0]).to.have.property("maxSafeLiquidityBps").that.is.a("string");
    expect(json.scenarios[0]).to.have.property("raiseToTargetRatio").that.is.a("string");
  });

  it("loads and simulates the Phase 16 economic scenario fixture", async () => {
    const suiteConfig = readSuiteConfig(fixturePath);
    const suite = simulateSuite(suiteConfig);
    const json = suiteToJson(suite);

    expect(suiteConfig.name).to.eq("phase-16-default-economics");
    expect(json.name).to.eq("phase-16-default-economics");
    expect(json.cases.map((entry: { name: string }) => entry.name)).to.deep.eq(["production-candidate", "local-rehearsal-compact"]);
    expect(json.cases[0].scenarios).to.have.length(5);
    expect(json.cases[0].failedScenarios[0].requiredLiquidityTokenBps).to.eq("3450");
    expect(json.cases[0].failedScenarios[0].maxSafeLiquidityBps).to.eq("2318");
    expect(json.cases[1].ok).to.eq(true);
  });

  it("normalizes external case fields into simulator config overrides", async () => {
    const overrides = externalCaseToOverrides({
      totalSupplyTokens: "123.5",
      curveBps: "7000",
      liquidityTokenBps: "2000",
      basePriceNative: "0.0001",
      priceSlopeNative: "0.000000002",
      graduationTargetUsd: "25000",
      liquidityBps: "7500",
      protocolFeeBps: "150",
      nativeUsdPrices: ["300", "600"],
    });

    expect(overrides.totalSupply).to.eq(parseDecimal("123.5"));
    expect(overrides.curveBps).to.eq(7_000n);
    expect(overrides.basePrice).to.eq(parseDecimal("0.0001"));
    expect(overrides.nativeUsdPrices).to.deep.eq([300n * WAD, 600n * WAD]);
  });

  it("parses CLI overrides, suite paths, output paths, and strict mode", async () => {
    const parsed = parseArgs(["--prices", "300,600", "--target-usd", "25000.5", "--liquidity-bps", "7500", "--strict"]);
    const suiteParsed = parseArgs(["--config", fixturePath, "--output", outputPath]);

    expect(parsed.strict).to.eq(true);
    expect(parsed.overrides.nativeUsdPrices).to.deep.eq([300n * WAD, 600n * WAD]);
    expect(parsed.overrides.graduationTargetUsd).to.eq(parseDecimal("25000.5"));
    expect(parsed.overrides.liquidityBps).to.eq(7_500n);
    expect(suiteParsed.configPath).to.eq(fixturePath);
    expect(suiteParsed.outputPath).to.eq(outputPath);
  });

  it("writes suite output files for acceptance review", async () => {
    const logs: string[] = [];
    const result = main(["--config", fixturePath, "--output", outputPath], { log: (message: string) => logs.push(message) });
    const written = JSON.parse(readFileSync(path.join(process.cwd(), outputPath), "utf8"));

    expect(result.status).to.eq(0);
    expect(written.name).to.eq("phase-16-default-economics");
    expect(written.cases).to.have.length(2);
    expect(written.cases[0].failedScenarios[0].requiredLiquidityTokenBps).to.eq("3450");
    expect(logs[0]).to.include("[economics] wrote");
  });

  it("only fails the CLI on bad scenarios when strict mode is requested", async () => {
    const logs: string[] = [];
    const io = { log: (message: string) => logs.push(message) };

    const relaxed = main(["--prices", "600", "--target-usd", "1000000000"], io);
    const strict = main(["--prices", "600", "--target-usd", "1000000000", "--strict"], io);

    expect(relaxed.status).to.eq(0);
    expect(relaxed.ok).to.eq(false);
    expect(strict.status).to.eq(1);
    expect(strict.ok).to.eq(false);
    expect(JSON.parse(logs[0]).ok).to.eq(false);
  });
});
