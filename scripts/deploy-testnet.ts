import { ethers } from "hardhat";

async function main() {
  const router = process.env.PANCAKE_V2_ROUTER!;
  const treasuryRouter = process.env.TREASURY_ROUTER_ADDRESS!;
  const protocolFeeBps = BigInt(process.env.PROTOCOL_FEE_BPS ?? "200");

  if (!router) throw new Error("Missing PANCAKE_V2_ROUTER");
  if (!treasuryRouter) throw new Error("Missing TREASURY_ROUTER_ADDRESS");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Router:", router);
  console.log("TreasuryRouter:", treasuryRouter);

  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const implementation = await Campaign.deploy();
  await implementation.waitForDeployment();
  const implementationAddr = await implementation.getAddress();
  console.log("LaunchCampaign implementation deployed:", implementationAddr);

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(router, treasuryRouter, implementationAddr);
  await factory.waitForDeployment();

  const factoryAddr = await factory.getAddress();
  console.log("LaunchFactory deployed:", factoryAddr);

  // Optional: set protocol fee (constructor sets 200 already)
  if (protocolFeeBps !== 200n) {
    const tx = await factory.setProtocolFee(protocolFeeBps);
    await tx.wait();
    console.log("ProtocolFeeBps set:", protocolFeeBps.toString());
  }

  // Optional: setConfig if you want to override defaults
  // await (await factory.setConfig({ ... })).wait();

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
