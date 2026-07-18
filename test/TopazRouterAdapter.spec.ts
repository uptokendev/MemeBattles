import { expect } from "chai";
import { ethers } from "hardhat";

async function deployToken(name: string, symbol: string, owner: any) {
  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy(name, symbol, ethers.parseEther("1000000"), await owner.getAddress());
  await token.waitForDeployment();
  return token;
}

describe("TopazRouterAdapter", function () {
  it("caches the production Topaz router factory and WBNB addresses", async () => {
    const [, owner] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WBNB = await ethers.getContractFactory("MockWBNB");
    const wbnb = await WBNB.deploy();
    await wbnb.waitForDeployment();

    const Router = await ethers.getContractFactory("MockTopazProductionRouter");
    const router = await Router.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();

    const Adapter = await ethers.getContractFactory("TopazRouterAdapter");
    const adapter = await Adapter.deploy(await router.getAddress());
    await adapter.waitForDeployment();

    expect(await adapter.poolFactory()).to.equal(await factory.getAddress());
    expect(await adapter.WETH()).to.equal(await wbnb.getAddress());
    expect(await adapter.topazRouter()).to.equal(await router.getAddress());
    expect(await owner.getAddress()).to.not.equal(ethers.ZeroAddress);
  });

  it("pulls approved campaign tokens, forwards them to production Topaz, and keeps no asset custody", async () => {
    const [owner, lpReceiver] = await ethers.getSigners();

    const token = await deployToken("Launch Token", "LAUNCH", owner);
    await token.mint(await owner.getAddress(), ethers.parseEther("10000"));
    await token.enableTrading();

    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WBNB = await ethers.getContractFactory("MockWBNB");
    const wbnb = await WBNB.deploy();
    await wbnb.waitForDeployment();

    const Router = await ethers.getContractFactory("MockTopazProductionRouter");
    const router = await Router.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();

    const Adapter = await ethers.getContractFactory("TopazRouterAdapter");
    const adapter = await Adapter.deploy(await router.getAddress());
    await adapter.waitForDeployment();

    const amountToken = ethers.parseEther("1000");
    const amountBnb = ethers.parseEther("2");
    await token.approve(await adapter.getAddress(), amountToken);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await adapter.addLiquidityETH(
      await token.getAddress(),
      false,
      amountToken,
      amountToken,
      amountBnb,
      await lpReceiver.getAddress(),
      deadline,
      { value: amountBnb }
    );

    const poolAddress = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);

    await expect(tx).to.emit(pool, "Transfer").withArgs(ethers.ZeroAddress, await lpReceiver.getAddress(), amountToken + amountBnb);
    expect(await token.balanceOf(await adapter.getAddress())).to.equal(0n);
    expect(await token.allowance(await adapter.getAddress(), await router.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(0n);
    expect(await pool.balanceOf(await lpReceiver.getAddress())).to.equal(amountToken + amountBnb);
  });

  it("rejects stable liquidity requests through the production router", async () => {
    const [owner, lpReceiver] = await ethers.getSigners();

    const token = await deployToken("Launch Token", "LAUNCH", owner);
    await token.mint(await owner.getAddress(), ethers.parseEther("10000"));
    await token.enableTrading();

    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WBNB = await ethers.getContractFactory("MockWBNB");
    const wbnb = await WBNB.deploy();
    await wbnb.waitForDeployment();

    const Router = await ethers.getContractFactory("MockTopazProductionRouter");
    const router = await Router.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();

    const Adapter = await ethers.getContractFactory("TopazRouterAdapter");
    const adapter = await Adapter.deploy(await router.getAddress());
    await adapter.waitForDeployment();

    const amountToken = ethers.parseEther("1000");
    await token.approve(await adapter.getAddress(), amountToken);

    await expect(
      adapter.addLiquidityETH(
        await token.getAddress(),
        true,
        amountToken,
        0,
        0,
        await lpReceiver.getAddress(),
        Math.floor(Date.now() / 1000) + 3600,
        { value: ethers.parseEther("2") }
      )
    ).to.be.revertedWithCustomError(router, "StablePoolUnsupported");
  });
});
