import { expect } from "chai";
import { ethers } from "hardhat";

function sortAddresses(a: string, b: string) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

describe("MockV2Factory additional edge cases", function () {
  async function deployFixture() {
    const [alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MockV2Factory");
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const factory = await Factory.deploy();
    const firstPair = await Pair.deploy();
    const secondPair = await Pair.deploy();
    await factory.waitForDeployment();
    await firstPair.waitForDeployment();
    await secondPair.waitForDeployment();
    return { alice, bob, factory, firstPair, secondPair };
  }

  it("createPool with volatile flag creates the same pair returned by getPair", async () => {
    const { alice, bob, factory } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();
    const [token0, token1] = sortAddresses(tokenA, tokenB);

    await factory.createPool(tokenA, tokenB, false);
    const pairAddress = await factory.getPool(tokenB, tokenA, false);
    const pair = await ethers.getContractAt("MockV2Pair", pairAddress);

    expect(pairAddress).to.eq(await factory.getPair(tokenA, tokenB));
    expect(await pair.token0()).to.eq(token0);
    expect(await pair.token1()).to.eq(token1);
  });

  it("setPair overwrites an existing pair mapping", async () => {
    const { alice, bob, factory, firstPair, secondPair } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();

    await factory.setPair(tokenA, tokenB, await firstPair.getAddress());
    expect(await factory.getPair(tokenA, tokenB)).to.eq(await firstPair.getAddress());

    await factory.setPair(tokenB, tokenA, await secondPair.getAddress());
    expect(await factory.getPair(tokenA, tokenB)).to.eq(await secondPair.getAddress());
  });

  it("createPair reuses a manually registered pair", async () => {
    const { alice, bob, factory, firstPair } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();

    await factory.setPair(tokenA, tokenB, await firstPair.getAddress());
    await factory.createPair(tokenB, tokenA);

    expect(await factory.getPair(tokenA, tokenB)).to.eq(await firstPair.getAddress());
  });

  it("createPool reuses a manually registered volatile pool", async () => {
    const { alice, bob, factory, firstPair } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();

    await factory.setPool(tokenA, tokenB, false, await firstPair.getAddress());
    await factory.createPool(tokenB, tokenA, false);

    expect(await factory.getPool(tokenA, tokenB, false)).to.eq(await firstPair.getAddress());
  });
});
