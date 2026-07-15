import { expect } from "chai";
import { ethers } from "hardhat";

const MAX_AGE = 3600n;
const WAD = ethers.parseEther("1");

async function latestTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

async function deployOracle(decimals = 8) {
  const Feed = await ethers.getContractFactory("MockUsdPriceFeed");
  const feed = await Feed.deploy(decimals);
  await feed.waitForDeployment();

  const Oracle = await ethers.getContractFactory("GraduationOracle");
  const oracle = await Oracle.deploy(await feed.getAddress(), MAX_AGE);
  await oracle.waitForDeployment();

  return { feed, oracle };
}

async function setRound(feed: any, answer: bigint, updatedAt?: bigint, roundId = 1n, answeredInRound = 1n) {
  const timestamp = updatedAt ?? (await latestTimestamp());
  await feed.setRoundData(roundId, answer, timestamp, timestamp, answeredInRound);
}

describe("GraduationOracle precision edges", function () {
  it("normalizes feeds with more than 18 decimals", async () => {
    const { feed, oracle } = await deployOracle(20);
    await setRound(feed, ethers.parseUnits("612.34", 20));

    expect(await oracle.nativeUsdPrice()).to.eq(ethers.parseUnits("612.34", 18));
  });

  it("rejects high-decimal prices that normalize down to zero", async () => {
    const { feed, oracle } = await deployOracle(20);
    await setRound(feed, 99n);

    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "InvalidPrice");
  });

  it("treats zero USD target as already reached and needing zero native", async () => {
    const { feed, oracle } = await deployOracle();

    await setRound(feed, ethers.parseUnits("600", 8));
    expect(await oracle.nativeTargetForUsd(0n)).to.eq(0n);
    expect(await oracle.graduationReached(0n, 0n)).to.eq(true);
  });

  it("ceil-rounds tiny USD targets up to one wei of native", async () => {
    const { feed, oracle } = await deployOracle();

    await setRound(feed, ethers.parseUnits("600", 8));
    expect(await oracle.nativeTargetForUsd(1n)).to.eq(1n);
  });

  it("rejects future and zero timestamp feed rounds as stale", async () => {
    const { feed, oracle } = await deployOracle();
    const now = await latestTimestamp();

    await setRound(feed, ethers.parseUnits("600", 8), 0n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "StalePrice");

    await setRound(feed, ethers.parseUnits("600", 8), now + 60n);
    await expect(oracle.nativeUsdPrice()).to.be.revertedWithCustomError(oracle, "StalePrice");
  });

  it("uses floor math for graduationReached value checks", async () => {
    const { feed, oracle } = await deployOracle();
    const threshold = ethers.parseUnits("1", 18);

    await setRound(feed, ethers.parseUnits("4", 8));
    expect(await oracle.graduationReached(WAD / 4n, threshold)).to.eq(true);
    expect(await oracle.graduationReached(WAD / 4n - 1n, threshold)).to.eq(false);
  });
});
