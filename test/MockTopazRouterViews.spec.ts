import { expect } from "chai";
import { ethers } from "hardhat";

const addTopazLiquidity = "addLiquidityETH(address,bool,uint256,uint256,uint256,address,uint256)";

describe("MockTopazRouter views and guards", function () {
  async function deployFixture() {
    const [owner, recipient] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const Router = await ethers.getContractFactory("MockTopazRouter");
    const router = await Router.deploy(await factory.getAddress(), await owner.getAddress());
    await router.waitForDeployment();

    const Token = await ethers.getContractFactory("LaunchToken");
    const token = await Token.deploy("Topaz View", "TVIEW", ethers.parseEther("1000"), await owner.getAddress());
    await token.waitForDeployment();

    return { owner, recipient, factory, router, token };
  }

  it("reports factory aliases and wrapped native address", async () => {
    const { owner, factory, router } = await deployFixture();

    expect(await router.factory()).to.eq(await factory.getAddress());
    expect(await router.poolFactory()).to.eq(await factory.getAddress());
    expect(await router.WETH()).to.eq(await owner.getAddress());
  });

  it("rejects stable liquidity before token transfer", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const amount = ethers.parseEther("1");

    await token.connect(owner).mint(await owner.getAddress(), amount);
    await token.connect(owner).approve(await router.getAddress(), amount);

    await expect(
      router.connect(owner)[addTopazLiquidity](await token.getAddress(), true, amount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: 1n,
      })
    ).to.be.revertedWith("stable pool unsupported");
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });

  it("reverts volatile liquidity when token allowance is absent", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const amount = ethers.parseEther("1");

    await token.connect(owner).mint(await owner.getAddress(), amount);
    await expect(
      router.connect(owner)[addTopazLiquidity](await token.getAddress(), false, amount, 0n, 0n, await recipient.getAddress(), 1n, {
        value: 1n,
      })
    ).to.be.reverted;
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });
});
