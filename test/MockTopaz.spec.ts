import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockTopaz factory/router", function () {
  async function deployFixture() {
    const [owner, recipient, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const Router = await ethers.getContractFactory("MockTopazRouter");
    const router = await Router.deploy(await factory.getAddress(), await owner.getAddress());
    await router.waitForDeployment();

    const Token = await ethers.getContractFactory("LaunchToken");
    const tokenA = await Token.deploy("Token A", "TKA", ethers.parseEther("1000"), await owner.getAddress());
    const tokenB = await Token.deploy("Token B", "TKB", ethers.parseEther("1000"), await owner.getAddress());
    await tokenA.waitForDeployment();
    await tokenB.waitForDeployment();

    return { owner, recipient, other, factory, router, tokenA, tokenB };
  }

  it("creates and reuses distinct volatile and stable pools for the same token pair", async () => {
    const { factory, tokenA, tokenB } = await deployFixture();
    const tokenAAddress = await tokenA.getAddress();
    const tokenBAddress = await tokenB.getAddress();

    const volatilePoolAddress = await factory.createPool.staticCall(tokenAAddress, tokenBAddress, false);
    await factory.createPool(tokenAAddress, tokenBAddress, false);
    const stablePoolAddress = await factory.createPool.staticCall(tokenBAddress, tokenAAddress, true);
    await factory.createPool(tokenBAddress, tokenAAddress, true);

    expect(volatilePoolAddress).to.not.eq(ethers.ZeroAddress);
    expect(stablePoolAddress).to.not.eq(ethers.ZeroAddress);
    expect(volatilePoolAddress).to.not.eq(stablePoolAddress);
    expect(await factory.getPool(tokenAAddress, tokenBAddress, false)).to.eq(volatilePoolAddress);
    expect(await factory.getPool(tokenBAddress, tokenAAddress, false)).to.eq(volatilePoolAddress);
    expect(await factory.getPair(tokenAAddress, tokenBAddress)).to.eq(volatilePoolAddress);
    expect(await factory.getPool(tokenAAddress, tokenBAddress, true)).to.eq(stablePoolAddress);

    const volatilePool = await ethers.getContractAt("MockTopazPool", volatilePoolAddress);
    const stablePool = await ethers.getContractAt("MockTopazPool", stablePoolAddress);
    expect(await volatilePool.stable()).to.eq(false);
    expect(await stablePool.stable()).to.eq(true);
  });

  it("setPool stores sorted tokens and stable flag", async () => {
    const { factory, tokenA, tokenB } = await deployFixture();
    const Pool = await ethers.getContractFactory("MockTopazPool");
    const pool = await Pool.deploy();
    await pool.waitForDeployment();

    const tokenAAddress = await tokenA.getAddress();
    const tokenBAddress = await tokenB.getAddress();
    await factory.setPool(tokenBAddress, tokenAAddress, true, await pool.getAddress());

    const expectedToken0 = tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase() ? tokenAAddress : tokenBAddress;
    const expectedToken1 = tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase() ? tokenBAddress : tokenAAddress;

    expect(await factory.getPool(tokenAAddress, tokenBAddress, true)).to.eq(await pool.getAddress());
    expect(await pool.token0()).to.eq(expectedToken0);
    expect(await pool.token1()).to.eq(expectedToken1);
    expect(await pool.stable()).to.eq(true);
  });

  it("router addLiquidityETH creates a volatile pool, transfers tokens, sets reserves, and mints LP", async () => {
    const { owner, recipient, factory, router, tokenA } = await deployFixture();
    const tokenAddress = await tokenA.getAddress();
    const wrapped = await router.WETH();
    const tokenAmount = ethers.parseEther("10");
    const bnbAmount = ethers.parseEther("0.5");

    await tokenA.connect(owner).mint(await owner.getAddress(), tokenAmount);
    await tokenA.connect(owner).approve(await router.getAddress(), tokenAmount);

    await expect(
      router.connect(owner).addLiquidityETH(tokenAddress, false, tokenAmount, 0n, 0n, await recipient.getAddress(), 123456n, {
        value: bnbAmount,
      })
    )
      .to.emit(router, "TopazLiquidityAdded")
      .withArgs(tokenAddress, false, tokenAmount, bnbAmount, await recipient.getAddress());

    const poolAddress = await factory.getPool(tokenAddress, wrapped, false);
    expect(poolAddress).to.not.eq(ethers.ZeroAddress);

    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    expect(await tokenA.balanceOf(await router.getAddress())).to.eq(tokenAmount);
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq(tokenAmount + bnbAmount);
    const reserves = await pool.getReserves();
    expect(reserves[0]).to.eq(tokenAmount);
    expect(reserves[1]).to.eq(bnbAmount);
  });

  it("router reuses an existing volatile pool and accumulates LP supply", async () => {
    const { owner, recipient, factory, router, tokenA } = await deployFixture();
    const tokenAddress = await tokenA.getAddress();
    const tokenAmount = ethers.parseEther("2");
    const bnbAmount = ethers.parseEther("0.1");

    await tokenA.connect(owner).mint(await owner.getAddress(), tokenAmount * 2n);
    await tokenA.connect(owner).approve(await router.getAddress(), tokenAmount * 2n);

    await router.connect(owner).addLiquidityETH(tokenAddress, false, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
      value: bnbAmount,
    });
    const poolAddress = await factory.getPool(tokenAddress, await router.WETH(), false);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    const firstSupply = await pool.totalSupply();

    await router.connect(owner).addLiquidityETH(tokenAddress, false, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
      value: bnbAmount,
    });

    expect(await factory.getPool(tokenAddress, await router.WETH(), false)).to.eq(poolAddress);
    expect(await pool.totalSupply()).to.eq(firstSupply + tokenAmount + bnbAmount);
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq((tokenAmount + bnbAmount) * 2n);
  });

  it("router rejects stable liquidity requests", async () => {
    const { owner, recipient, router, tokenA } = await deployFixture();
    const tokenAmount = ethers.parseEther("1");

    await tokenA.connect(owner).mint(await owner.getAddress(), tokenAmount);
    await tokenA.connect(owner).approve(await router.getAddress(), tokenAmount);

    await expect(
      router.connect(owner).addLiquidityETH(await tokenA.getAddress(), true, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: ethers.parseEther("0.01"),
      })
    ).to.be.revertedWith("stable pool unsupported");
  });
});
