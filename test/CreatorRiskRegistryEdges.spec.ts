import { expect } from "chai";
import { ethers, network } from "hardhat";

async function increaseTime(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function deployRegistryFixture() {
  const [owner, creator, recorder, alice, bob] = await ethers.getSigners();

  const CreatorRegistry = await ethers.getContractFactory("CreatorRegistry");
  const creatorRegistry = await CreatorRegistry.deploy();
  await creatorRegistry.waitForDeployment();

  const RiskRegistry = await ethers.getContractFactory("RiskRegistry");
  const riskRegistry = await RiskRegistry.deploy();
  await riskRegistry.waitForDeployment();

  return { owner, creator, recorder, alice, bob, creatorRegistry, riskRegistry };
}

describe("CreatorRegistry and RiskRegistry edge cases", function () {
  it("stores trust score, restriction, and manual-review profile state", async () => {
    const { creator, creatorRegistry } = await deployRegistryFixture();
    const creatorAddress = await creator.getAddress();

    await expect(creatorRegistry.setCreatorTrustScore(creatorAddress, 88n))
      .to.emit(creatorRegistry, "CreatorTrustScoreUpdated")
      .withArgs(creatorAddress, 88n);
    await expect(creatorRegistry.setCreatorRestricted(creatorAddress, true))
      .to.emit(creatorRegistry, "CreatorRestrictedUpdated")
      .withArgs(creatorAddress, true);
    await expect(creatorRegistry.setManualReviewRequired(creatorAddress, true))
      .to.emit(creatorRegistry, "CreatorManualReviewUpdated")
      .withArgs(creatorAddress, true);

    const profile = await creatorRegistry.getCreatorProfile(creatorAddress);
    expect(profile.tier).to.eq(0);
    expect(profile.trustScore).to.eq(88n);
    expect(profile.liveBondingCount).to.eq(0n);
    expect(profile.restricted).to.eq(true);
    expect(profile.manualReviewRequired).to.eq(true);
  });

  it("lets the owner revoke launch recorder access", async () => {
    const { creator, recorder, creatorRegistry } = await deployRegistryFixture();
    const creatorAddress = await creator.getAddress();
    const recorderAddress = await recorder.getAddress();

    await expect(creatorRegistry.setLaunchRecorder(recorderAddress, true))
      .to.emit(creatorRegistry, "LaunchRecorderUpdated")
      .withArgs(recorderAddress, true);
    await creatorRegistry.connect(recorder).recordLaunch(creatorAddress);

    await expect(creatorRegistry.setLaunchRecorder(recorderAddress, false))
      .to.emit(creatorRegistry, "LaunchRecorderUpdated")
      .withArgs(recorderAddress, false);
    await increaseTime(24 * 60 * 60 + 1);
    await expect(creatorRegistry.connect(recorder).recordLaunch(creatorAddress)).to.be.revertedWithCustomError(
      creatorRegistry,
      "NotLaunchRecorder"
    );
  });

  it("exposes tier rule fallbacks and rejects invalid enum values", async () => {
    const { creatorRegistry } = await deployRegistryFixture();

    const unknownRules = await creatorRegistry.getRulesForTier(0);
    const newCreatorRules = await creatorRegistry.getRulesForTier(1);
    expect(unknownRules.maxLiveBonding).to.eq(newCreatorRules.maxLiveBonding);
    expect(unknownRules.creatorBuyCapWei).to.eq(newCreatorRules.creatorBuyCapWei);

    await expect(creatorRegistry.getRulesForTier(4)).to.be.revertedWithCustomError(creatorRegistry, "InvalidTier");
  });

  it("returns false for zero-address canLaunch and can-trade checks", async () => {
    const { creatorRegistry, riskRegistry } = await deployRegistryFixture();

    expect(await creatorRegistry.canLaunch(ethers.ZeroAddress)).to.eq(false);
    expect(await riskRegistry.canWalletTrade(ethers.ZeroAddress)).to.eq(false);
    expect(await riskRegistry.canCreatorLaunch(ethers.ZeroAddress, 3)).to.eq(false);
  });

  it("allows unrestricted wallets with unknown clusters and only applies cluster size to creator launches", async () => {
    const { creator, riskRegistry } = await deployRegistryFixture();
    const creatorAddress = await creator.getAddress();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("large-unrestricted-cluster"));

    expect(await riskRegistry.canWalletTrade(creatorAddress)).to.eq(true);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 3)).to.eq(true);
    await expect(riskRegistry.assertWalletCanTrade(creatorAddress)).to.not.be.reverted;
    await expect(riskRegistry.assertCreatorCanLaunch(creatorAddress, 3)).to.not.be.reverted;

    await riskRegistry.setWalletCluster(creatorAddress, clusterId);
    expect(await riskRegistry.canWalletTrade(creatorAddress)).to.eq(true);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 3)).to.eq(true);

    await riskRegistry.setClusterRisk(clusterId, 99, 1, false);
    expect(await riskRegistry.canWalletTrade(creatorAddress)).to.eq(true);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 3)).to.eq(false);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 0)).to.eq(true);
    await expect(riskRegistry.assertWalletCanTrade(creatorAddress)).to.not.be.reverted;
    await expect(riskRegistry.assertCreatorCanLaunch(creatorAddress, 0)).to.not.be.reverted;
  });

  it("clears a wallet cluster by setting the cluster id back to zero", async () => {
    const { creator, riskRegistry } = await deployRegistryFixture();
    const creatorAddress = await creator.getAddress();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("cleared-cluster"));

    await riskRegistry.setWalletCluster(creatorAddress, clusterId);
    await riskRegistry.setClusterRisk(clusterId, 99, 1, false);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 3)).to.eq(false);

    await expect(riskRegistry.setWalletCluster(creatorAddress, ethers.ZeroHash))
      .to.emit(riskRegistry, "WalletClusterUpdated")
      .withArgs(creatorAddress, ethers.ZeroHash);
    expect(await riskRegistry.canCreatorLaunch(creatorAddress, 3)).to.eq(true);
    const wallet = await riskRegistry.getWalletRisk(creatorAddress);
    expect(wallet.clusterId).to.eq(ethers.ZeroHash);
  });
});
