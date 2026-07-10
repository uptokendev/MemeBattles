const hre = require("hardhat");

function requiredAddress(name) {
  const value = String(process.env[name] || "").trim();
  if (!hre.ethers.isAddress(value) || value === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return hre.ethers.getAddress(value);
}

async function sendIfNeeded(label, current, expected, send) {
  if (hre.ethers.getAddress(current) === hre.ethers.getAddress(expected)) {
    console.log(`${label}: already configured (${expected})`);
    return null;
  }
  const tx = await send();
  console.log(`${label}: submitted ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`${label} transaction failed`);
  console.log(`${label}: confirmed in block ${receipt.blockNumber}`);
  return tx.hash;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = hre.ethers.getAddress(await signer.getAddress());
  const vaultAddress = requiredAddress("COMMUNITY_REWARDS_VAULT_ADDRESS");
  const distributorAddress = requiredAddress("REWARD_DISTRIBUTOR_ADDRESS");
  const operatorAddress = process.env.AIRDROP_OPERATOR
    ? requiredAddress("AIRDROP_OPERATOR")
    : signerAddress;

  const vault = await hre.ethers.getContractAt("CommunityRewardsVault", vaultAddress, signer);
  const distributor = await hre.ethers.getContractAt("RewardDistributor", distributorAddress, signer);

  const [vaultAdmin, distributorOwner] = await Promise.all([vault.admin(), distributor.owner()]);
  if (hre.ethers.getAddress(vaultAdmin) !== signerAddress) {
    throw new Error(`Signer ${signerAddress} is not CommunityRewardsVault admin ${vaultAdmin}`);
  }
  if (hre.ethers.getAddress(distributorOwner) !== signerAddress) {
    throw new Error(`Signer ${signerAddress} is not RewardDistributor owner ${distributorOwner}`);
  }

  const transactions = {};
  transactions.rewardDistributor = await sendIfNeeded(
    "vault.rewardDistributor",
    await vault.rewardDistributor(),
    distributorAddress,
    () => vault.setRewardDistributor(distributorAddress),
  );
  transactions.distributorBatchOperator = await sendIfNeeded(
    "distributor.batchOperator",
    await distributor.batchOperator(),
    vaultAddress,
    () => distributor.setBatchOperator(vaultAddress),
  );
  transactions.airdropOperator = await sendIfNeeded(
    "vault.airdropOperator",
    await vault.airdropOperator(),
    operatorAddress,
    () => vault.setAirdropOperator(operatorAddress),
  );

  const network = await hre.ethers.provider.getNetwork();
  console.log(JSON.stringify({
    configured: true,
    network: hre.network.name,
    chainId: Number(network.chainId),
    signer: signerAddress,
    vaultAddress,
    distributorAddress,
    operatorAddress,
    transactions,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
