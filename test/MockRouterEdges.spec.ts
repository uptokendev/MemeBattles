import { expect } from "chai";
import { ethers } from "hardhat";

const addPancakeLiquidity = "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)";
const addTopazLiquidity = "addLiquidityETH(address,bool,uint256,uint256,uint256,address,uint256)";

async function deployFixture() {
  const [owner, recipient] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("MockV2Factory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy(await factory.getAddress(), await owner.getAddress());
  await router.waitForDeployment();

  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy("Mock Route", "MRT", ethers.parseEther("1000"), await owner.getAddress());
  await token.waitForDeployment();

  return { owner, recipient, factory, router, token };
}

async function mintAndApprove(token: any, router: any, owner: any, amount: bigint) {
  await token.connect(owner).mint(await owner.getAddress(), amount);
  await token.connect(owner).approve(await router.getAddress(), amount);
}

describe("MockRouter", function () {
  it("reports factory, poolFactory, and wrapped native address", async () => {
    const { owner, factory, router } = await deployFixture();

    expect(await router.factory()).to.eq(await factory.getAddress());
    expect(await router.poolFactory()).to.eq(await factory.getAddress());
    expect(await router.WETH()).to.eq(await owner.getAddress());
  });

  it("pancake-style liquidity creates a pair, transfers tokens, sets reserves, and mints LP", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("5");
    const bnbAmount = ethers.parseEther("0.25");
    const tokenAddress = await token.getAddress();

    await mintAndApprove(token, router, owner, tokenAmount);
    await expect(
      router.connect(owner)[addPancakeLiquidity](tokenAddress, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: bnbAmount,
      })
    )
      .to.emit(router, "LiquidityAdded")
      .withArgs(tokenAddress, tokenAmount, bnbAmount, await recipient.getAddress());

    const pairAddress = await factory.getPair(tokenAddress, await router.WETH());
    const pair = await ethers.getContractAt("MockV2Pair", pairAddress);
    const reserves = await pair.getReserves();

    expect(await token.balanceOf(await router.getAddress())).to.eq(tokenAmount);
    expect(await pair.balanceOf(await recipient.getAddress())).to.eq(tokenAmount + bnbAmount);
    expect(reserves[0]).to.eq(tokenAmount);
    expect(reserves[1]).to.eq(bnbAmount);
  });

  it("topaz-style volatile liquidity emits both router event shapes", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("2");
    const bnbAmount = ethers.parseEther("0.1");
    const tokenAddress = await token.getAddress();

    await mintAndApprove(token, router, owner, tokenAmount);
    const tx = router.connect(owner)[addTopazLiquidity](tokenAddress, false, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
      value: bnbAmount,
    });

    await expect(tx).to.emit(router, "LiquidityAdded").withArgs(tokenAddress, tokenAmount, bnbAmount, await recipient.getAddress());
    await expect(tx)
      .to.emit(router, "TopazLiquidityAdded")
      .withArgs(tokenAddress, false, tokenAmount, bnbAmount, await recipient.getAddress());
  });

  it("topaz-style stable liquidity requests are rejected before transfers", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("1");

    await mintAndApprove(token, router, owner, tokenAmount);
    await expect(
      router.connect(owner)[addTopazLiquidity](await token.getAddress(), true, tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: 1n,
      })
    ).to.be.revertedWith("stable pool unsupported");
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });

  it("fails liquidity when token allowance is missing", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("1");

    await token.connect(owner).mint(await owner.getAddress(), tokenAmount);
    await expect(
      router.connect(owner)[addPancakeLiquidity](await token.getAddress(), tokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: 1n,
      })
    ).to.be.reverted;
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });
});
