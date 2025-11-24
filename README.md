# Up.meme

Pump.fun–style bonding-curve launches for BSC. The `LaunchFactory` contract deploys a new `LaunchCampaign` and ERC20 `LaunchToken` for each creator, sells tokens along a linear bonding curve, and graduates to PancakeSwap liquidity once the graduation target or curve cap is reached. A Vite/React dapp lets you deploy campaigns, trade on the curve, and finalize liquidity.

## Repository layout
- `contracts/` — `LaunchFactory`, `LaunchCampaign`, `LaunchToken`, and a `MockRouter` for local testing.
- `scripts/deployFactory.ts` — deploys the factory, optionally with a mock router.
- `test/Launchpad.ts` — Hardhat tests covering create/buy/sell/finalize flows.
- `frontend/` — Vite + React UI (ethers v6) that drives the contracts via ABI files in `src/abi`.
- `hardhat.config.ts` — BSC mainnet/testnet + local hardhat network config.

## Prerequisites
- Node.js 20+ and npm
- A wallet/key with BNB for testnet/mainnet deployments
- (Optional) MetaMask or another injected provider for the frontend

## Install dependencies
```bash
npm install
npm install --prefix frontend
```

## Environment configuration
Create a root `.env` for contract work:
```
DEPLOYER_KEY=0x...          # hex private key; replace the sample key with your own
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=...         # optional, for verification
ROUTER_ADDRESS=0x...        # Pancake router; omit when using MockRouter locally
DEPLOY_MOCK_ROUTER=true     # set true to deploy MockRouter when ROUTER_ADDRESS is empty
MOCK_ROUTER_WRAPPED=0x...   # wrapped native token for MockRouter (defaults to deployer if unset)
FEE_RECIPIENT=0x...         # protocol fee receiver
PROTOCOL_FEE_BPS=250        # protocol fee in basis points (0–1000)
```

Frontend `.env` (in `frontend/.env`) expects:
```
VITE_FACTORY_ADDRESS=0x...        # LaunchFactory address
VITE_MOCK_ROUTER_ADDRESS=0x...    # only needed when showing mock router info in the UI
```

## Useful npm scripts
- `npm run build` — compile contracts with Hardhat.
- `npm test` — run Hardhat tests.
- `npm run frontend` — start the Vite dev server (front end).
- `npm run frontend:build` — type-check and build the frontend.

## Local development workflow
1. **Start a local chain** (optional): `npx hardhat node`.
2. **Deploy contracts**: `npx hardhat run scripts/deployFactory.ts --network localhost` (or `bsctestnet` / `bsc`). With `DEPLOY_MOCK_ROUTER=true` and no `ROUTER_ADDRESS`, a mock router is deployed automatically.
3. **Update the UI env**: copy the printed `FACTORY_ADDRESS` (and `MOCK_ROUTER_ADDRESS` if used) into `frontend/.env`.
4. **Run the frontend**: `npm run frontend` from the repo root, then open the shown localhost URL and connect your wallet to the same network.

## Testing
- **Unit tests**: `npm test` executes `test/Launchpad.ts`, covering campaign creation, buy/sell quotes, trading, and finalization.
- **Manual dapp checks**:
  - Create a campaign via the UI and confirm it appears in “Available Campaigns”.
  - Buy tokens with a small slippage setting; verify balances and `sold` increase.
  - Sell a portion back; ensure approvals succeed and BNB is returned.
  - Hit the graduation target (or curve cap) and finalize; confirm liquidity add call, unsold burn, creator reserve transfer, and protocol fee delivery to `feeRecipient`.
  - Validate rejection paths: buying after launch, selling more than `sold`, zero-amount inputs, and slippage protections.

## Deployment notes
- Mainnet/testnet RPC URLs and `DEPLOYER_KEY` must be present for `bsctestnet` / `bsc` networks.
- `ROUTER_ADDRESS` should point to the PancakeSwap router for the target chain.
- `PROTOCOL_FEE_BPS` max is enforced at 1000; configure before going live.
- The sample private key in `.env` is for Hardhat testing only—replace it for any real deployment.

## Frontend overview
- Connects to the configured factory, lists the latest campaigns (paginated in reverse order), and surfaces key metrics (price, sold/curve supply, graduation target, balances).
- Supports deploy, buy, sell with slippage controls, and permissionless finalize.
- Uses ethers v6 `BrowserProvider`; ensure your wallet network matches the factory deployment.
