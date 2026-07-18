import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function requireAckForSharedNetwork() {
  if (network.name !== "bscTestnet") return;
  if ((process.env.ACK_TOPAZ_REHEARSAL_TESTNET ?? "").trim() === "true") return;
  throw new Error(
    "Set ACK_TOPAZ_REHEARSAL_TESTNET=true to deploy rehearsal-only Topaz mocks to BSC testnet. Do not use these addresses as official Topaz deployments."
  );
}

function writeDeployment(data: unknown) {
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `topaz-rehearsal.${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function main() {
  requireAckForSharedNetwork();

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const chain = await ethers.provider.getNetwork();
  const deploymentBlock = await ethers.provider.getBlockNumber();

  console.log(`[topaz-rehearsal] network=${network.name} chainId=${chain.chainId.toString()}`);
  console.log(`[topaz-rehearsal] deployer=${deployerAddress}`);
  console.log("[topaz-rehearsal] deploying rehearsal-only Topaz-compatible mocks");

  const WBNB = await ethers.getContractFactory("MockWBNB");
  const wbnb = await WBNB.deploy();
  await wbnb.waitForDeployment();
  const wbnbAddress = await wbnb.getAddress();

  const Factory = await ethers.getContractFactory("MockTopazFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  const Router = await ethers.getContractFactory("MockTopazRouter");
  const router = await Router.deploy(factoryAddress, wbnbAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  const deployment = {
    label: "Topaz-compatible rehearsal mocks only - not official Topaz",
    network: network.name,
    chainId: Number(chain.chainId),
    deploymentBlock,
    deployer: deployerAddress,
    contracts: {
      MockWBNB: wbnbAddress,
      MockTopazFactory: factoryAddress,
      MockTopazRouter: routerAddress,
    },
    env: {
      TOPAZ_ROUTER: routerAddress,
      MOCK_TOPAZ_WRAPPED: wbnbAddress,
    },
    notes: [
      "Use TOPAZ_ROUTER for BSC testnet rehearsal only.",
      "This does not replace official Topaz router acceptance.",
      "MockTopazRouter.addLiquidityETH mints volatile LP tokens to the requested recipient.",
    ],
  };

  const file = writeDeployment(deployment);
  console.log(`[topaz-rehearsal] MockWBNB=${wbnbAddress}`);
  console.log(`[topaz-rehearsal] MockTopazFactory=${factoryAddress}`);
  console.log(`[topaz-rehearsal] MockTopazRouter=${routerAddress}`);
  console.log(`[topaz-rehearsal] saved=${file}`);
  console.log("");
  console.log("Set this for rehearsal deployment:");
  console.log(`TOPAZ_ROUTER=${routerAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
