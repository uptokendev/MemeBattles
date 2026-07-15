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

describe("CreatorRegistry and RiskRegistry", function () {
  it("maps unknown creators to new-creator rules and supports trusted/proven tiers", async () => {
    const { creator, creatorRegistry } = await deployRegistryFixture();

    const defaultRules = await creatorRegistry.getCreatorRules(await creator.getAddress());
    expect(defaultRules.maxLiveBonding).to.equal(3n);
    expect(defaultRules.cooldownSeconds).to.equal(24n * 60n * 60n);
    expect(defaultRules.creatorBuyLockSeconds).to.equal(24n * 60n * 60n);
    expect(defaultRules.creatorBuyCapWei).to.equal(ethers.parseEther("0.25"));
    expect(defaultRules.maxClusterWallets).to.equal(3n);

    await expect(creatorRegistry.setCreatorTier(await creator.getAddress(), 2))
      .to.emit(creatorRegistry, "CreatorTierUpdated")
      .withArgs(await creator.getAddress(), 2);
    const trustedRules = await creatorRegistry.getCreatorRules(await creator.getAddress());
    expect(trustedRules.maxLiveBonding).to.equal(5n);
    expect(trustedRules.creatorBuyLockSeconds).to.equal(6n * 60n * 60n);
    expect(trustedRules.creatorBuyCapWei).to.equal(ethers.parseEther("1"));
    expect(trustedRules.maxClusterWallets).to.equal(5n);

    await creatorRegistry.setCreatorTier(await creator.getAddress(), 3);
    const provenRules = await creatorRegistry.getCreatorRules(await creator.getAddress());
    expect(provenRules.maxLiveBonding).to.equal(10n);
    expect(provenRules.creatorBuyLockSeconds).to.equal(60n * 60n);
    expect(provenRules.creatorBuyCapWei).to.equal(ethers.parseEther("3"));
    expect(provenRules.maxClusterWallets).to.equal(10n);
  });

  it("enforces creator registry owner-only setters and zero-value validation", async () => {
    const { creator, alice, recorder, creatorRegistry } = await deployRegistryFixture();

    await expect(creatorRegistry.connect(alice).setLaunchRecorder(await recorder.getAddress(), true)).to.be.revertedWithCustomError(
      creatorRegistry,
      "OwnableUnauthorizedAccount"
    );
    await expect(creatorRegistry.setLaunchRecorder(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
      creatorRegistry,
      "RecorderZero"
    );
    await expect(creatorRegistry.setCreatorTier(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(creatorRegistry, "CreatorZero");
    await expect(creatorRegistry.setCreatorTier(await creator.getAddress(), 0)).to.be.revertedWithCustomError(
      creatorRegistry,
      "InvalidTier"
    );
    await expect(creatorRegistry.setCreatorTrustScore(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorZero"
    );
    await expect(creatorRegistry.setCreatorRestricted(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorZero"
    );
    await expect(creatorRegistry.setManualReviewRequired(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorZero"
    );
  });

  it("records launches only through authorized recorders and enforces cooldown/live limits", async () => {
    const { creator, recorder, alice, creatorRegistry } = await deployRegistryFixture();

    await expect(creatorRegistry.connect(alice).recordLaunch(await creator.getAddress())).to.be.revertedWithCustomError(
      creatorRegistry,
      "NotLaunchRecorder"
    );
    await creatorRegistry.setLaunchRecorder(await recorder.getAddress(), true);
    await expect(creatorRegistry.connect(recorder).recordLaunch(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorZero"
    );

    await expect(creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress()))
      .to.emit(creatorRegistry, "CreatorLaunchRecorded")
      .withArgs(await creator.getAddress(), 1n, await ethers.provider.getBlock("latest").then((block) => BigInt(block!.timestamp + 1)));
    await expect(creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress())).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorCooldown"
    );

    await increaseTime(24 * 60 * 60 + 1);
    await creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress());
    await increaseTime(24 * 60 * 60 + 1);
    await creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress());

    const profile = await creatorRegistry.getCreatorProfile(await creator.getAddress());
    expect(profile.liveBondingCount).to.equal(3n);
    expect(await creatorRegistry.canLaunch(await creator.getAddress())).to.equal(false);

    await increaseTime(24 * 60 * 60 + 1);
    await expect(creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress())).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorLiveLimit"
    );

    await expect(creatorRegistry.connect(recorder).recordGraduation(await creator.getAddress()))
      .to.emit(creatorRegistry, "CreatorGraduationRecorded")
      .withArgs(await creator.getAddress(), 2n);
    expect((await creatorRegistry.getCreatorProfile(await creator.getAddress())).liveBondingCount).to.equal(2n);
    expect(await creatorRegistry.canLaunch(await creator.getAddress())).to.equal(true);
  });

  it("blocks restricted and manual-review creators from canLaunch and recordLaunch", async () => {
    const { creator, recorder, creatorRegistry } = await deployRegistryFixture();
    await creatorRegistry.setLaunchRecorder(await recorder.getAddress(), true);

    await creatorRegistry.setCreatorRestricted(await creator.getAddress(), true);
    expect(await creatorRegistry.canLaunch(await creator.getAddress())).to.equal(false);
    await expect(creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress())).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorRestricted"
    );

    await creatorRegistry.setCreatorRestricted(await creator.getAddress(), false);
    await creatorRegistry.setManualReviewRequired(await creator.getAddress(), true);
    expect(await creatorRegistry.canLaunch(await creator.getAddress())).to.equal(false);
    await expect(creatorRegistry.connect(recorder).recordLaunch(await creator.getAddress())).to.be.revertedWithCustomError(
      creatorRegistry,
      "CreatorManualReview"
    );
  });

  it("does not underflow live bonding count when extra graduations are recorded", async () => {
    const { creator, recorder, creatorRegistry } = await deployRegistryFixture();
    await creatorRegistry.setLaunchRecorder(await recorder.getAddress(), true);

    await expect(creatorRegistry.connect(recorder).recordGraduation(await creator.getAddress()))
      .to.emit(creatorRegistry, "CreatorGraduationRecorded")
      .withArgs(await creator.getAddress(), 0n);
    expect((await creatorRegistry.getCreatorProfile(await creator.getAddress())).liveBondingCount).to.equal(0n);
  });

  it("enforces risk registry owner-only setters and zero-value validation", async () => {
    const { alice, bob, riskRegistry } = await deployRegistryFixture();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("cluster-a"));

    await expect(riskRegistry.connect(alice).setWalletRisk(await bob.getAddress(), 1, true)).to.be.revertedWithCustomError(
      riskRegistry,
      "OwnableUnauthorizedAccount"
    );
    await expect(riskRegistry.setWalletRisk(ethers.ZeroAddress, 1, true)).to.be.revertedWithCustomError(riskRegistry, "WalletZero");
    await expect(riskRegistry.setWalletCluster(ethers.ZeroAddress, clusterId)).to.be.revertedWithCustomError(riskRegistry, "WalletZero");
    await expect(riskRegistry.setClusterRisk(ethers.ZeroHash, 1, 1, false)).to.be.revertedWithCustomError(riskRegistry, "ClusterZero");
    await expect(riskRegistry.assertWalletCanTrade(ethers.ZeroAddress)).to.be.revertedWithCustomError(riskRegistry, "WalletZero");
    await expect(riskRegistry.assertCreatorCanLaunch(ethers.ZeroAddress, 3)).to.be.revertedWithCustomError(riskRegistry, "WalletZero");
  });

  it("blocks restricted wallets and restricted clusters from trading", async () => {
    const { alice, riskRegistry } = await deployRegistryFixture();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("restricted-cluster"));

    await riskRegistry.setWalletRisk(await alice.getAddress(), 5, true);
    expect(await riskRegistry.canWalletTrade(await alice.getAddress())).to.equal(false);
    await expect(riskRegistry.assertWalletCanTrade(await alice.getAddress())).to.be.revertedWithCustomError(riskRegistry, "WalletRestricted");

    await riskRegistry.setWalletRisk(await alice.getAddress(), 0, false);
    await riskRegistry.setWalletCluster(await alice.getAddress(), clusterId);
    await riskRegistry.setClusterRisk(clusterId, 2, 4, true);
    expect(await riskRegistry.canWalletTrade(await alice.getAddress())).to.equal(false);
    await expect(riskRegistry.assertWalletCanTrade(await alice.getAddress())).to.be.revertedWithCustomError(riskRegistry, "ClusterRestricted");
  });

  it("blocks creator launches for restricted wallets, restricted clusters, and oversized clusters", async () => {
    const { creator, riskRegistry } = await deployRegistryFixture();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("launch-cluster"));

    await riskRegistry.setWalletRisk(await creator.getAddress(), 5, true);
    expect(await riskRegistry.canCreatorLaunch(await creator.getAddress(), 3)).to.equal(false);
    await expect(riskRegistry.assertCreatorCanLaunch(await creator.getAddress(), 3)).to.be.revertedWithCustomError(
      riskRegistry,
      "WalletRestricted"
    );

    await riskRegistry.setWalletRisk(await creator.getAddress(), 0, false);
    await riskRegistry.setWalletCluster(await creator.getAddress(), clusterId);
    await riskRegistry.setClusterRisk(clusterId, 2, 4, true);
    expect(await riskRegistry.canCreatorLaunch(await creator.getAddress(), 3)).to.equal(false);
    await expect(riskRegistry.assertCreatorCanLaunch(await creator.getAddress(), 3)).to.be.revertedWithCustomError(
      riskRegistry,
      "ClusterRestricted"
    );

    await riskRegistry.setClusterRisk(clusterId, 4, 1, false);
    expect(await riskRegistry.canCreatorLaunch(await creator.getAddress(), 3)).to.equal(false);
    await expect(riskRegistry.assertCreatorCanLaunch(await creator.getAddress(), 3)).to.be.revertedWithCustomError(
      riskRegistry,
      "ClusterTooLarge"
    );

    expect(await riskRegistry.canCreatorLaunch(await creator.getAddress(), 0)).to.equal(true);
    await expect(riskRegistry.assertCreatorCanLaunch(await creator.getAddress(), 0)).to.not.be.reverted;
  });

  it("stores and returns wallet and cluster risk profiles", async () => {
    const { alice, riskRegistry } = await deployRegistryFixture();
    const clusterId = ethers.keccak256(ethers.toUtf8Bytes("profile-cluster"));

    await expect(riskRegistry.setWalletRisk(await alice.getAddress(), 7, true))
      .to.emit(riskRegistry, "WalletRiskUpdated")
      .withArgs(await alice.getAddress(), 7, true);
    await expect(riskRegistry.setWalletCluster(await alice.getAddress(), clusterId))
      .to.emit(riskRegistry, "WalletClusterUpdated")
      .withArgs(await alice.getAddress(), clusterId);
    await expect(riskRegistry.setClusterRisk(clusterId, 9, 6, false))
      .to.emit(riskRegistry, "ClusterRiskUpdated")
      .withArgs(clusterId, 9, 6, false);

    const wallet = await riskRegistry.getWalletRisk(await alice.getAddress());
    expect(wallet.riskLevel).to.equal(7);
    expect(wallet.restricted).to.equal(true);
    expect(wallet.clusterId).to.equal(clusterId);

    const cluster = await riskRegistry.getClusterRisk(clusterId);
    expect(cluster.size).to.equal(9n);
    expect(cluster.riskLevel).to.equal(6);
    expect(cluster.restricted).to.equal(false);
  });
});
