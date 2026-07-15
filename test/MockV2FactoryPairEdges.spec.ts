import { expect } from "chai";
import { ethers } from "hardhat";

function sorted(a: string, b: string) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

describe("MockV2Factory and MockV2Pair", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MockV2Factory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const Pair = await ethers.getContractFactory("MockV2Pair");
    const pair = await Pair.deploy();
    await pair.waitForDeployment();

    return { owner, alice, bob, factory, pair };
  }

  it("setPair stores the same sorted pair for either token order", async () => {
    const { alice, bob, factory, pair } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();
    const [token0, token1] = sorted(tokenA, tokenB);

    await factory.setPair(tokenB, tokenA, await pair.getAddress());

    expect(await factory.getPair(tokenA, tokenB)).to.eq(await pair.getAddress());
    expect(await factory.getPair(tokenB, tokenA)).to.eq(await pair.getAddress());
    expect(await pair.token0()).to.eq(token0);
    expect(await pair.token1()).to.eq(token1);
  });

  it("createPair is idempotent for reversed token order", async () => {
    const { alice, bob, factory } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();

    await factory.createPair(tokenA, tokenB);
    const first = await factory.getPair(tokenA, tokenB);
    await factory.createPair(tokenB, tokenA);

    expect(first).to.not.eq(ethers.ZeroAddress);
    expect(await factory.getPair(tokenB, tokenA)).to.eq(first);
  });

  it("setPool and createPool reject stable pools in the V2 mock", async () => {
    const { alice, bob, factory, pair } = await deployFixture();

    await expect(factory.setPool(await alice.getAddress(), await bob.getAddress(), true, await pair.getAddress())).to.be.revertedWith(
      "stable pool unsupported"
    );
    await expect(factory.createPool(await alice.getAddress(), await bob.getAddress(), true)).to.be.revertedWith(
      "stable pool unsupported"
    );
    await expect(factory.getPool(await alice.getAddress(), await bob.getAddress(), true)).to.be.revertedWith(
      "stable pool unsupported"
    );
  });

  it("setPool with volatile flag stores the pair and sorted tokens", async () => {
    const { alice, bob, factory, pair } = await deployFixture();
    const tokenA = await alice.getAddress();
    const tokenB = await bob.getAddress();
    const [token0, token1] = sorted(tokenA, tokenB);

    await factory.setPool(tokenA, tokenB, false, await pair.getAddress());

    expect(await factory.getPool(tokenB, tokenA, false)).to.eq(await pair.getAddress());
    expect(await pair.token0()).to.eq(token0);
    expect(await pair.token1()).to.eq(token1);
  });

  it("MockV2Pair mints and burns supply through setTotalSupply for the caller", async () => {
    const { owner, pair } = await deployFixture();

    await pair.connect(owner).setTotalSupply(100n);
    expect(await pair.totalSupply()).to.eq(100n);
    expect(await pair.balanceOf(await owner.getAddress())).to.eq(100n);

    await pair.connect(owner).setTotalSupply(40n);
    expect(await pair.totalSupply()).to.eq(40n);
    expect(await pair.balanceOf(await owner.getAddress())).to.eq(40n);
  });

  it("MockV2Pair rejects setTotalSupply burns beyond the caller balance", async () => {
    const { owner, alice, pair } = await deployFixture();

    await pair.connect(owner).setTotalSupply(100n);
    await expect(pair.connect(alice).setTotalSupply(10n)).to.be.revertedWith("insufficient mock balance");
    expect(await pair.totalSupply()).to.eq(100n);
  });

  it("MockV2Pair stores reserves with a block timestamp", async () => {
    const { pair } = await deployFixture();

    await pair.setReserves(123n, 456n);
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(123n);
    expect(reserves[1]).to.eq(456n);
    expect(reserves[2]).to.be.gt(0n);
  });
});
