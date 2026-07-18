# Topaz Testnet Graduation Flow

This runbook connects the Minimal Topaz deployment from `MemeWarzone-Topaz` to the MemeBattles `devpostgrad` deployment and produces the acceptance report required for the Topaz rollout.

## 1. Deploy Minimal Topaz

From `MemeWarzone-Topaz` on BSC testnet:

```bash
npm run compile
npx hardhat deploy --network bscTestnet
npx hardhat run scripts/export-manifest.ts --network bscTestnet
```

The expected manifest is:

```text
deployments/bscTestnet/minimal-topaz.json
```

The manifest must include `contracts.Router`, `contracts.PoolFactory`, `contracts.WBNB`, `chainId: 97`, and `configuration.volatileFeeBps: 100`.

## 2. Deploy MemeBattles With The Topaz Manifest

Copy the Minimal Topaz manifest into the MemeBattles repo at `deployments/bscTestnet/minimal-topaz.json`, or point to it with `TOPAZ_MANIFEST`.

```bash
npm run deploy:check-env:bsc-testnet
TOPAZ_MANIFEST=deployments/bscTestnet/minimal-topaz.json npm run deploy:with-topaz-manifest:bsc-testnet
```

The deploy script reads the manifest, sets `TOPAZ_ROUTER` from `contracts.Router`, deploys the protocol, and runs deployment verification. Verification checks that the Topaz router exposes a factory/WBNB pair and that the factory volatile fee is exactly 100 bps.

## 3. Run A Graduation Scenario

Create a test campaign, buy until it graduates, confirm the graduated volatile Topaz pool, execute at least one buy and sell against the Topaz pool, then harvest LP fees through the locker path.

Record these values for the final report:

```json
{
  "campaign": "0x...",
  "token": "0x...",
  "creator": "0x...",
  "graduatedPool": "0x...",
  "graduationTx": "0x...",
  "buyTx": "0x...",
  "sellTx": "0x...",
  "harvestTx": "0x...",
  "lockerLpBalanceBeforeTrades": "0",
  "lockerLpBalanceAfterHarvest": "0",
  "claimedToken": "0",
  "claimedWbnb": "0",
  "creatorTokenReceived": "0",
  "creatorWbnbReceived": "0",
  "protocolTokenReceived": "0",
  "protocolWbnbReceived": "0",
  "finalCurvePrice": "0",
  "initialDexPrice": "0"
}
```

Save that file outside source control, for example `tmp/topaz-acceptance-input.json`.

## 4. Produce The Acceptance Report

Preflight mode checks deployment wiring and writes a report even before campaign evidence is available:

```bash
TOPAZ_MANIFEST=deployments/bscTestnet/minimal-topaz.json npm run testnet:topaz-graduation
```

Strict evidence mode fails if the campaign, pool, transaction, LP, and fee-harvest values are missing:

```bash
TOPAZ_MANIFEST=deployments/bscTestnet/minimal-topaz.json \
TOPAZ_ACCEPTANCE_INPUT=tmp/topaz-acceptance-input.json \
TOPAZ_ACCEPTANCE_REQUIRE_EVIDENCE=true \
npm run testnet:topaz-graduation
```

The script writes:

```text
reports/topaz-graduation-testnet-<timestamp>.json
```

The report validates BSC testnet chain id 97, Minimal Topaz manifest values, Topaz router/factory/WBNB bytecode, fixed volatile fee of 100 bps, MemeBattles deployment bytecode, optional campaign/token/pool bytecode, optional transaction receipts, pool reserves, pool stability, and the locker LP balance at report time.
