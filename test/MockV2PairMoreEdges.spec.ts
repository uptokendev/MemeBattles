import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockV2Pair additional edge cases", function () {
  async function deployPair() {
    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();
    await pair.waitForDeployment();
    return pair;
  }

  it("setTokens can overwrite token slots for reusable fixtures", async () => {
    const [a, b, c] = await ethers.getSigners();
    const pair = await deployPair();

    await pair.setTokens(await a.getAddress(), await b.getAddress());
    expect(await pair.token0()).to.eq(await a.getAddress());
    expect(await pair.token1()).to.eq(await b.getAddress());

    await pair.setTokens(await b.getAddress(), await c.getAddress());
    expect(await pair.token0()).to.eq(await b.getAddress());
    expect(await pair.token1()).to.eq(await c.getAddress());
  });

  it("mint accumulates balances and total supply across recipients", async () => {
    const [alice, bob] = await ethers.getSigners();
    const pair = await deployPair();

    await pair.mint(await alice.getAddress(), 11n);
    await pair.mint(await alice.getAddress(), 13n);
    await pair.mint(await bob.getAddress(), 17n);

    expect(await pair.balanceOf(await alice.getAddress())).to.eq(24n);
    expect(await pair.balanceOf(await bob.getAddress())).to.eq(17n);
    expect(await pair.totalSupply()).to.eq(41n);
  });

  it("setTotalSupply can increase again after a burn-like reduction", async () => {
    const [owner] = await ethers.getSigners();
    const pair = await deployPair();

    await pair.setTotalSupply(100n);
    await pair.setTotalSupply(25n);
    await pair.setTotalSupply(80n);

    expect(await pair.totalSupply()).to.eq(80n);
    expect(await pair.balanceOf(await owner.getAddress())).to.eq(80n);
  });

  it("setReserves overwrites previous reserves", async () => {
    const pair = await deployPair();

    await pair.setReserves(1n, 2n);
    await pair.setReserves(300n, 400n);
    const reserves = await pair.getReserves();

    expect(reserves[0]).to.eq(300n);
    expect(reserves[1]).to.eq(400n);
    expect(reserves[2]).to.be.gt(0n);
  });
});
