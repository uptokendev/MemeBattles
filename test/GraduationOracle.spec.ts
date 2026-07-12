import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const WAD = ethers.parseEther("1");
const USD_30K = ethers.parseUnits("30000", 18);
const MAX_AGE = 3600n;

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

async function deployOracleFixture(decimals = 8) {
  const Feed = await ethers.getContractFactory("MockUsdPriceFeed");
  const feed = await Feed.deploy(decimals);
  await feed.waitForDeployment();

  const Oracle = await ethers.getContractFactory("GraduationOracle");
  const oracle = await Oracle.deploy(await feed.getAddress(), MAX_AGE);
  await oracle.waitForDeployment();

  return { feed, oracle };
}

async function setFreshPrice(feed: any, price: string, decimals = 8) {
  const now = await latestTimestamp();
  await feed.setRoundData(1n, ethers.parseUnits(price, decimals), now, now, 1n);
}

describe("GraduationOracle", function () {
  it("stores immutable feed settings and has no admin price setter", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);

    expect(await oracle.priceFeed()).to.eq(await feed.getAddress());
    expect(await oracle.maxPriceAge()).to.eq(MAX_AGE);

    const functionNames = oracle.interface.fragments
      .filter((fragment: any) => fragment.type === "function")
      .map((fragment: any) => fragment.name);
    expect(functionNames).to.not.include("setPrice");
    expect(functionNames).to.not.include("setNativeUsdPrice");
    expect(functionNames).to.not.include("setPriceFeed");
  });

  it("rejects invalid constructor configuration", async () => {
    const Oracle = await ethers.getContractFactory("GraduationOracle");
    const { feed } = await loadFixture(deployOracleFixture);

    await expect(Oracle.deploy(ethers.ZeroAddress, MAX_AGE)).to.be.revertedWithCustomError(Oracle, "PriceFeedZero");
    await expect(Oracle.deploy(await feed.getAddress(), 0n)).to.be.revertedWithCustomError(Oracle, "MaxPriceAgeZero");
  });

  it("reads and normalizes native USD prices from feed decimals", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);
    await setFreshPrice(feed, "612.34");

    expect(await oracle.nativeUsdPrice()).to.eq(ethers.parseUnits("612.34", 18));

    const { feed: feed18, oracle: oracle18 } = await deployOracleFixture(18);
    await setFreshPrice(feed18, "612.34", 18);
    expect(await oracle18.nativeUsdPrice()).to.eq(ethers.parseUnits("612.34", 18));
  });

  it("converts a fixed USD threshold into the current native target", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);

    await setFreshPrice(feed, "600");
    expect(await oracle.nativeTargetForUsd(USD_30K)).to.eq(ethers.parseEther("50"));

    await setFreshPrice(feed, "750");
    expect(await oracle.nativeTargetForUsd(USD_30K)).to.eq(ethers.parseEther("40"));
  });

  it("handles exact, below, and above threshold graduation boundaries", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);
    await setFreshPrice(feed, "600");

    const target = ethers.parseEther("50");
    expect(await oracle.graduationReached(target, USD_30K)).to.eq(true);
    expect(await oracle.graduationReached(target - 1n, USD_30K)).to.eq(false);
    expect(await oracle.graduationReached(target + 1n, USD_30K)).to.eq(true);
  });

  it("rejects zero, negative, stale, and incomplete oracle answers", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);
    const now = await latestTimestamp();

    await feed.setRoundData(1n, 0n, now, now, 1n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "InvalidPrice");

    await feed.setRoundData(1n, -1n, now, now, 1n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "InvalidPrice");

    await feed.setRoundData(2n, ethers.parseUnits("600", 8), now, now, 1n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "IncompleteRound");

    await feed.setRoundData(3n, ethers.parseUnits("600", 8), now - MAX_AGE - 1n, now - MAX_AGE - 1n, 3n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "StalePrice");
  });

  it("handles very high and low valid prices", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);

    await setFreshPrice(feed, "3000");
    expect(await oracle.nativeTargetForUsd(USD_30K)).to.eq(ethers.parseEther("10"));

    await setFreshPrice(feed, "300");
    expect(await oracle.nativeTargetForUsd(USD_30K)).to.eq(ethers.parseEther("100"));
  });

  it("uses ceiling math for non-even targets", async () => {
    const { feed, oracle } = await loadFixture(deployOracleFixture);
    await setFreshPrice(feed, "700");

    const expected = (USD_30K * WAD + ethers.parseUnits("700", 18) - 1n) / ethers.parseUnits("700", 18);
    expect(await oracle.nativeTargetForUsd(USD_30K)).to.eq(expected);
  });

  it("reverts safely instead of wrapping on extreme feed values", async () => {
    const { feed, oracle } = await deployOracleFixture(0);
    const now = await latestTimestamp();

    await feed.setRoundData(1n, ethers.MaxInt256, now, now, 1n);
    await expect(oracle.nativeUsdPrice()).to.be.reverted;
  });

  it("does not accept native assets", async () => {
    const [deployer] = await ethers.getSigners();
    const { oracle } = await loadFixture(deployOracleFixture);

    await expect(deployer.sendTransaction({ to: await oracle.getAddress(), value: 1n })).to.be.reverted;
  });
});
