import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockUsdPriceFeed", function () {
  it("stores immutable decimals", async () => {
    const Feed = await ethers.getContractFactory("MockUsdPriceFeed");
    const feed8 = await Feed.deploy(8);
    const feed18 = await Feed.deploy(18);
    await feed8.waitForDeployment();
    await feed18.waitForDeployment();

    expect(await feed8.decimals()).to.eq(8n);
    expect(await feed18.decimals()).to.eq(18n);
  });

  it("returns zero round data before any update", async () => {
    const Feed = await ethers.getContractFactory("MockUsdPriceFeed");
    const feed = await Feed.deploy(8);
    await feed.waitForDeployment();

    const data = await feed.latestRoundData();
    expect(data[0]).to.eq(0n);
    expect(data[1]).to.eq(0n);
    expect(data[2]).to.eq(0n);
    expect(data[3]).to.eq(0n);
    expect(data[4]).to.eq(0n);
  });

  it("stores and overwrites full round data", async () => {
    const Feed = await ethers.getContractFactory("MockUsdPriceFeed");
    const feed = await Feed.deploy(8);
    await feed.waitForDeployment();

    await feed.setRoundData(1n, ethers.parseUnits("600", 8), 10n, 11n, 1n);
    let data = await feed.latestRoundData();
    expect(data[0]).to.eq(1n);
    expect(data[1]).to.eq(ethers.parseUnits("600", 8));
    expect(data[2]).to.eq(10n);
    expect(data[3]).to.eq(11n);
    expect(data[4]).to.eq(1n);

    await feed.setRoundData(2n, -1n, 20n, 21n, 1n);
    data = await feed.latestRoundData();
    expect(data[0]).to.eq(2n);
    expect(data[1]).to.eq(-1n);
    expect(data[2]).to.eq(20n);
    expect(data[3]).to.eq(21n);
    expect(data[4]).to.eq(1n);
  });
});
