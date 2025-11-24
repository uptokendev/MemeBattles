# LaunchIt Frontend

Vite + React UI for creating and trading LaunchIt campaigns. The app uses ethers v6 with an injected wallet (e.g., MetaMask) to talk to the deployed `LaunchFactory` and `LaunchCampaign` contracts.

## Features
- Configure a factory address and load the latest campaigns.
- Deploy new campaigns with name/symbol/metadata, base price, price slope, graduation target, and optional LP receiver.
- Inspect campaign metrics (price, sold vs curve supply, graduation target, curve balance, owner).
- Buy tokens from the bonding curve, sell back with slippage limits, and permissionlessly finalize to PancakeSwap liquidity when thresholds are met.

## Setup
```bash
npm install
```

Environment (`frontend/.env`):
```
VITE_FACTORY_ADDRESS=0x...        # LaunchFactory address (from your deployment)
VITE_MOCK_ROUTER_ADDRESS=0x...    # optional, only for local MockRouter visibility
```

## Scripts
- `npm run dev` — start the Vite dev server.
- `npm run build` — type-check and build for production.
- `npm run preview` — preview the production build locally.
- `npm run lint` — run ESLint.

## Local dev loop
1. From the repo root, deploy the contracts (see `../README.md` for env vars and `scripts/deployFactory.ts`). For a local Hardhat network, use `npx hardhat run scripts/deployFactory.ts --network localhost`.
2. Copy the printed `FACTORY_ADDRESS` (and `MOCK_ROUTER_ADDRESS` if using the mock) into `frontend/.env`.
3. Run `npm run dev`, open the provided URL, and connect your wallet on the same network.

## Manual UI checks
- Create a campaign and confirm it appears in the list.
- Buy a small token amount with 1% slippage and verify the quote matches the on-chain price.
- Sell part of your position; confirm BNB is returned and balances update.
- After reaching the graduation target or curve cap, finalize and verify liquidity was added and the campaign status flips to “Graduated”.
