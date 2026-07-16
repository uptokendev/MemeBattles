# Phase 16 Economic Simulations

Phase 16 is covered by a deterministic simulator that mirrors the launch curve economics used by the contracts:

- native graduation target from USD and native/USD price
- curve sellout raise and buyer spend including protocol fee
- graduation liquidity native amount after protocol fee
- final curve price used as the opening DEX price
- LP token demand versus reserved liquidity allocation
- capped-LP fallback diagnostics for economics that would otherwise overrun the reserved liquidity allocation

## Scenario Fixture

The default suite lives at:

```text
config/economic-scenarios.json
```

It currently includes:

- `production-candidate`: the default large-supply economics swept across multiple native/USD prices.
- `local-rehearsal-compact`: the compact curve used to keep local rehearsal fast and deterministic.

## Commands

Run the focused simulator tests:

```bash
npx hardhat test test/EconomicSimulations.spec.ts
```

Print the default single-config simulation:

```bash
npm run economics:simulate
```

Print the Phase 16 scenario suite:

```bash
npm run economics:simulate:suite
```

Write the suite output to an acceptance artifact:

```bash
npm run economics:simulate:acceptance
```

This writes:

```text
output/economic-simulation-results.json
```

## Interpreting Results

The simulator returns JSON with an `ok` flag. A false `ok` means at least one configured scenario cannot execute graduation, for example because the curve cannot reach the native graduation target before sellout.

LP allocation overruns are non-blocking. The contract caps graduation liquidity to the reserved LP token supply, recomputes matching native liquidity at the final curve price, and lets leftover native continue through the normal post-graduation payout path. The simulator reports those cases as `warningScenarios` rather than `failedScenarios`.

Each scenario includes tuning diagnostics:

- `raiseToTargetRatio`: gross curve raise divided by the USD graduation target converted to native.
- `requiredLiquidityTokenBps`: minimum token allocation needed to satisfy the configured graduation liquidity amount at the final curve price without using the cap.
- `maxSafeLiquidityBps`: maximum graduation native liquidity bps that fits inside the configured liquidity token allocation without using the cap.
- `lpAllocationCapped`: whether the non-blocking cap path is used.
- `nativeReturnedByCap`: native amount not used for LP because reserved liquidity tokens were the limiting side.

For the current `production-candidate`, strict mode should pass because graduation remains executable, but the suite should report a warning. At `liquidityBps = 8000`, the run would need about `3450` liquidity token bps to avoid capping, while the scenario reserves `1000`. With `liquidityTokenBps = 1000`, the maximum uncapped liquidity setting is about `2318` bps.

Add `--strict` when a pipeline should fail on true graduation blockers:

```bash
node scripts/economic-simulations.cjs --config config/economic-scenarios.json --strict
```

Phase 16 should be treated as closed when:

- `test/EconomicSimulations.spec.ts` passes.
- `npm run economics:simulate:acceptance` writes the acceptance JSON.
- Strict mode passes for the scenario suite.
- Any `warningScenarios` production case has been intentionally accepted or the economics have been retuned until the suite has no warnings.
