const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const owner = process.env.REWARD_DISTRIBUTOR_OWNER || deployer.address;

  if (!hre.ethers.isAddress(owner)) {
    throw new Error("REWARD_DISTRIBUTOR_OWNER must be a valid EVM address when provided");
  }

  const RewardDistributor = await hre.ethers.getContractFactory("RewardDistributor");
  const distributor = await RewardDistributor.deploy(owner);
  await distributor.waitForDeployment();

  const address = await distributor.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  console.log(JSON.stringify({
    contract: "RewardDistributor",
    address,
    owner,
    deployer: deployer.address,
    network: hre.network.name,
    chainId: Number(network.chainId),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
