import { ethers } from "hardhat";

/**
 * Safes (BSC testnet):
 * - Ops Safe:      0xd41B4185f9406312a1637CbD39A6c2038E46770d
 * - Treasury Safe: 0x20d71e7f04121C63A2664B19cB23b378d75B58C4
 *
 * For mainnet, set these to your production Safes (2-of-3) and install a Delay module on the Treasury Safe.
 */

const TREASURY_SAFE = "0x20d71e7f04121C63A2664B19cB23b378d75B58C4";

// Recommended: 48h on mainnet; you can shorten on testnet if you want faster iteration.
const UPGRADE_DELAY_SECONDS = 2 * 24 * 60 * 60;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const pancakeRouter = process.env.PANCAKE_ROUTER;
  if (!pancakeRouter) {
    throw new Error("Missing PANCAKE_ROUTER env var (PancakeSwap router address).");
  }

  // 1) Deploy VaultV2 (custody) admin = Treasury Safe
  // - operator: optional hot-wallet payout lane (can be 0x0 if you only use Merkle claims)
  // - rootPoster: optional automation key to publish epoch roots (can be 0x0; multisig can publish roots too)
  const operator = String(process.env.LEAGUE_PAYOUT_OPERATOR || ethers.ZeroAddress).trim();
  const rootPoster = String(process.env.LEAGUE_ROOT_POSTER || ethers.ZeroAddress).trim();
  const Vault = await ethers.getContractFactory("TreasuryVaultV2");
  const vault = await Vault.deploy(TREASURY_SAFE, operator, rootPoster);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("TreasuryVaultV2:", vaultAddr);

  // 2) Deploy Router (immutable receiver) admin = Treasury Safe
  const Router = await ethers.getContractFactory("TreasuryRouter");
  const leagueRouter = await Router.deploy(TREASURY_SAFE, vaultAddr, UPGRADE_DELAY_SECONDS);
  await leagueRouter.waitForDeployment();
  const leagueRouterAddr = await leagueRouter.getAddress();
  console.log("TreasuryRouter (League Receiver):", leagueRouterAddr);

  // 3) Deploy Factory (dex router + leagueReceiver)
  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(pancakeRouter, leagueRouterAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("LaunchFactory:", factoryAddr);

  // 4) Route protocol fees (buy/sell + finalize) to Treasury Safe
  const tx = await factory.setFeeRecipient(TREASURY_SAFE);
  await tx.wait();
  console.log("FeeRecipient set to Treasury Safe:", TREASURY_SAFE);

  console.log("\nSummary:");
  console.log("- Protocol fees go to:", TREASURY_SAFE);
  console.log("- League 0.25% goes to:", leagueRouterAddr, "(auto-forward to vault)");
  console.log("- League vault:", vaultAddr);
  console.log("- League payout operator:", operator);
  console.log("- League rootPoster:", rootPoster);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
