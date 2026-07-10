import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function mustEnv(name: string, fallback?: string): string {
  const v = (process.env[name] ?? fallback ?? "").trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function numEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function writeDeployment(networkName: string, data: any) {
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${networkName}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const routerAddress = mustEnv("PANCAKE_ROUTER", process.env.ROUTER_ADDRESS);
  const treasurySafe = mustEnv("TREASURY_SAFE", process.env.FEE_RECIPIENT);
  const upgradeDelaySeconds = numEnv("UPGRADE_DELAY_SECONDS", 2 * 24 * 60 * 60);
  const protocolFeeBps = BigInt(numEnv("PROTOCOL_FEE_BPS", 200));

  console.log("Router:", routerAddress);
  console.log("Treasury Safe:", treasurySafe);
  console.log("Upgrade delay (seconds):", upgradeDelaySeconds);
  console.log("Protocol fee bps:", protocolFeeBps.toString());

  // 1) League Vault (custody) owned by Treasury Safe
  const Vault = await ethers.getContractFactory("TreasuryVault");
  const vault = await Vault.deploy(treasurySafe);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("TreasuryVault:", vaultAddr);

  // 2) League Router (receiver) admin = Treasury Safe
  const Router = await ethers.getContractFactory("TreasuryRouter");
  const leagueRouter = await Router.deploy(treasurySafe, vaultAddr, upgradeDelaySeconds);
  await leagueRouter.waitForDeployment();
  const leagueRouterAddr = await leagueRouter.getAddress();
  console.log("TreasuryRouter (Protocol + League Receiver):", leagueRouterAddr);

  // 3) Locked campaign implementation for EIP-1167 clones
  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const campaignImplementation = await Campaign.deploy();
  await campaignImplementation.waitForDeployment();
  const campaignImplementationAddr = await campaignImplementation.getAddress();
  console.log("LaunchCampaign implementation:", campaignImplementationAddr);

  // 4) Factory (dex router + treasury router + campaign implementation)
  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(routerAddress, leagueRouterAddr, campaignImplementationAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("LaunchFactory:", factoryAddr);

  // 5) Ensure protocol fee matches your config
  try {
    const current = await factory.protocolFeeBps();
    if (BigInt(current) !== protocolFeeBps) {
      const tx2 = await factory.setProtocolFee(protocolFeeBps);
      await tx2.wait();
      console.log("ProtocolFeeBps set:", protocolFeeBps.toString());
    }
  } catch (e) {
    console.warn("[deployAll] Could not set protocol fee (skipping):", (e as any)?.message ?? e);
  }

  // 6) UPVoteTreasury (League votes). Owner + feeReceiver are Treasury Safe.
  const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
  const voteTreasury = await UPVoteTreasury.deploy(treasurySafe, treasurySafe);
  await voteTreasury.waitForDeployment();
  const voteTreasuryAddr = await voteTreasury.getAddress();
  console.log("UPVoteTreasury:", voteTreasuryAddr);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    router: routerAddress,
    treasurySafe,
    upgradeDelaySeconds,
    protocolFeeBps: protocolFeeBps.toString(),
    contracts: {
      TreasuryVault: vaultAddr,
      TreasuryRouter: leagueRouterAddr,
      LaunchCampaignImplementation: campaignImplementationAddr,
      LaunchFactory: factoryAddr,
      UPVoteTreasury: voteTreasuryAddr,
    },
  };

  const file = writeDeployment(network.name, out);
  console.log("\nSaved deployment:", file);

  console.log("\nFrontend env (Vite):");
  console.log(`VITE_FACTORY_ADDRESS_${out.chainId}=${factoryAddr}`);
  console.log(`VITE_VOTE_TREASURY_ADDRESS_${out.chainId}=${voteTreasuryAddr}`);
  console.log("\nLeague funds:");
  console.log("- Protocol fees and league slice -> TreasuryRouter -> TreasuryVault:", leagueRouterAddr, "->", vaultAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
