# Topaz Testnet Rehearsal Mocks

Topaz's published agent and contract address material is mainnet-only. Until Topaz provides official BSC testnet router, factory, and WBNB addresses, use these rehearsal mocks only to keep MemeWarzone testnet deployment and graduation testing moving.

These contracts are not official Topaz deployments and do not satisfy final Topaz integration acceptance.

## What Gets Deployed

- `MockWBNB`: minimal wrapped native token with `deposit()` and `withdraw(uint256)`.
- `MockTopazFactory`: creates volatile/stable mock pools keyed like Topaz v2 pools.
- `MockTopazRouter`: implements the Topaz `addLiquidityETH(token, stable, amountTokenDesired, amountTokenMin, amountETHMin, to, deadline)` shape used by graduation.

The mock router mints LP tokens directly to the requested recipient, so MemeWarzone can rehearse permanent LP locking and locker registration on BSC testnet.

## Deploy On BSC Testnet

Set the normal BSC testnet deployer env first:

```bash
export BSC_TESTNET_RPC=...
export DEPLOYER_PK=...
export ACK_TOPAZ_REHEARSAL_TESTNET=true
npm run deploy:topaz-rehearsal:bsc-testnet
```

The script writes `deployments/topaz-rehearsal.bscTestnet.json` and prints:

```bash
TOPAZ_ROUTER=0x...
```

Use that `TOPAZ_ROUTER` value in the MemeWarzone BSC testnet deployment env.

## Guardrails

- Keep the deployment file and dashboard labels clear: rehearsal-only, not official Topaz.
- Do not use these addresses for production.
- Keep asking Topaz for official BSC testnet v2 router, pool factory, and WBNB addresses.
- When official Topaz testnet addresses are available, replace `TOPAZ_ROUTER` and rerun the BSC testnet acceptance checklist.
