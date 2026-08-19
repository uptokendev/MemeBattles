const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const owner = process.env.REWARD_DISTRIBUTOR_OWNER || deployer.address;

  if (!hre.ethers.isAddress(owner)) {
    throw new Error("REWARD_DISTRIBUTOR_OWNER must be a valid EVM address when provided");
  }

  const RewardDistributor = await hre.ethers.getContractFactory("RewardDistributor");
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name === "bscMainnet") {
    if (Number(network.chainId) !== 56) throw new Error(`bscMainnet must resolve chain ID 56, got ${network.chainId}`);
    if (!process.env.REWARD_DISTRIBUTOR_OWNER) throw new Error("REWARD_DISTRIBUTOR_OWNER is required for bscMainnet");
    if (owner.toLowerCase() === deployer.address.toLowerCase()) throw new Error("bscMainnet RewardDistributor owner must not be the deployer");
  }
  const distributor = await RewardDistributor.deploy(owner);
  await distributor.waitForDeployment();

  const address = await distributor.getAddress();
  const deploymentTx = distributor.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;
  const runtimeCode = await hre.ethers.provider.getCode(address);

  const artifact = {
    contract: "RewardDistributor",
    address,
    owner,
    deployer: deployer.address,
    network: hre.network.name,
    chainId: Number(network.chainId),
    blockNumber: receipt?.blockNumber ?? null,
    transactionHash: deploymentTx?.hash ?? null,
    runtimeCodeHash: hre.ethers.keccak256(runtimeCode),
    verified: false,
  };
  const outFile = path.join(__dirname, "..", "deployments", `${hre.network.name}.reward-distributor.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify(artifact, null, 2));
  console.log(`Saved ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
