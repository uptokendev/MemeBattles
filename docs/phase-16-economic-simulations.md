# Phase 16 Economic Simulations

Phase 16 is covered by a deterministic simulator that mirrors the launch curve economics used by the contracts:

- native graduation target from USD and native/USD price
- curve sellout raise and buyer spend including protocol fee
- graduation liquidity native amount after protocol fee
- final curve price used as the opening DEX price
- LP token demand versus reserved liquidity allocation

## Scenario fixture

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

## Interpreting results

The simulator returns JSON with an `ok` flag. A false `ok` means at least one configured scenario failed an economic acceptance check, such as not graduating before sellout or needing more LP tokens than the reserved liquidity allocation.

By default, the CLI exits successfully so reviewers can inspect the JSON even when a scenario is risky. Add `--strict` when a pipeline should fail on any economic risk:

```bash
node scripts/economic-simulations.cjs --config config/economic-scenarios.json --strict
```

Phase 16 should be treated as closed when:

- `test/EconomicSimulations.spec.ts` passes.
- `npm run economics:simulate:acceptance` writes the acceptance JSON.
- Any `ok: false` production scenario has been intentionally accepted or the economics have been retuned until the suite is `ok: true`.
