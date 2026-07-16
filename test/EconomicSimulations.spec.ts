import { expect } from "chai";

const {
  WAD,
  buildConfig,
  main,
  nativeTargetForUsd,
  parseArgs,
  parseDecimal,
  simulate,
  simulateScenario,
  simulationToJson,
} = require("../scripts/economic-simulations.cjs");

describe("economic simulation script", function () {
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
  });

  it("serializes bigint simulation outputs into reviewable JSON", async () => {
    const result = simulate(buildConfig({ nativeUsdPrices: [600n * WAD] }));
    const json = simulationToJson(result);

    expect(json.config.graduationTargetUsd).to.eq("30000");
    expect(json.scenarios).to.have.length(1);
    expect(json.scenarios[0].nativeUsdPrice).to.eq("600");
    expect(json.scenarios[0]).to.have.property("grossCurveRaiseNative").that.is.a("string");
  });

  it("parses CLI overrides and strict mode", async () => {
    const parsed = parseArgs(["--prices", "300,600", "--target-usd", "25000.5", "--liquidity-bps", "7500", "--strict"]);

    expect(parsed.strict).to.eq(true);
    expect(parsed.overrides.nativeUsdPrices).to.deep.eq([300n * WAD, 600n * WAD]);
    expect(parsed.overrides.graduationTargetUsd).to.eq(parseDecimal("25000.5"));
    expect(parsed.overrides.liquidityBps).to.eq(7_500n);
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
