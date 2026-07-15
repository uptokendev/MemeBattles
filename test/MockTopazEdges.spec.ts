import { expect } from "chai";
import { ethers } from "hardhat";

const DEAD = "0x000000000000000000000000000000000000dEaD";
const addPancakeLiquidity = "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)";
const addTopazLiquidity = "addLiquidityETH(address,bool,uint256,uint256,uint256,address,uint256)";

async function deployFixture() {
  const [owner, recipient] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("MockTopazFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockTopazRouter");
  const router = await Router.deploy(await factory.getAddress(), await owner.getAddress());
  await router.waitForDeployment();

  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy("Token", "TKN", ethers.parseEther("1000"), await owner.getAddress());
  await token.waitForDeployment();

  return { owner, recipient, factory, router, token };
}

async function prepareLiquidity(token: any, router: any, owner: any, amount: bigint) {
  await token.connect(owner).mint(await owner.getAddress(), amount);
  await token.connect(owner).approve(await router.getAddress(), amount);
}

function parsedRouterEvents(router: any, receipt: any, eventName: string) {
  return receipt.logs
    .map((log: any) => {
      try {
        return router.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((event: any) => event?.name === eventName);
}

describe("MockTopaz router edge cases", function () {
  it("pancake-style addLiquidityETH emits only LiquidityAdded events", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("3");
    const bnbAmount = ethers.parseEther("0.2");
    const tokenAddress = await token.getAddress();

    await prepareLiquidity(token, router, owner, tokenAmount);
    const tx = await router.connect(owner)[addPancakeLiquidity](
      tokenAddress,
      tokenAmount,
      0n,
      0n,
      await recipient.getAddress(),
      1n,
      { value: bnbAmount }
    );
    const receipt = await tx.wait();

    const liquidityEvents = parsedRouterEvents(router, receipt, "LiquidityAdded");
    const topazEvents = parsedRouterEvents(router, receipt, "TopazLiquidityAdded");
    expect(liquidityEvents).to.have.length(2);
    expect(topazEvents).to.have.length(0);
    expect(liquidityEvents[0].args.to).to.eq(await recipient.getAddress());
    expect(liquidityEvents[1].args.to).to.eq(DEAD);

    const poolAddress = await factory.getPool(tokenAddress, await router.WETH(), false);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq(tokenAmount + bnbAmount);
  });

  it("topaz-style liquidity mirrors events to the dead address when recipient is not dead", async () => {
    const { owner, recipient, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("2");
    const bnbAmount = ethers.parseEther("0.1");
    const tokenAddress = await token.getAddress();

    await prepareLiquidity(token, router, owner, tokenAmount);
    const tx = await router.connect(owner)[addTopazLiquidity](
      tokenAddress,
      false,
      tokenAmount,
      0n,
      0n,
      await recipient.getAddress(),
      1n,
      { value: bnbAmount }
    );
    const receipt = await tx.wait();

    const liquidityEvents = parsedRouterEvents(router, receipt, "LiquidityAdded");
    const topazEvents = parsedRouterEvents(router, receipt, "TopazLiquidityAdded");
    expect(liquidityEvents).to.have.length(2);
    expect(topazEvents).to.have.length(2);
    expect(topazEvents[0].args.to).to.eq(await recipient.getAddress());
    expect(topazEvents[1].args.to).to.eq(DEAD);
  });

  it("does not duplicate dead-address mirror events when recipient is already dead", async () => {
    const { owner, router, token } = await deployFixture();
    const tokenAmount = ethers.parseEther("1");
    const bnbAmount = ethers.parseEther("0.05");
    const tokenAddress = await token.getAddress();

    await prepareLiquidity(token, router, owner, tokenAmount);
    const tx = await router.connect(owner)[addTopazLiquidity](tokenAddress, false, tokenAmount, 0n, 0n, DEAD, 1n, {
      value: bnbAmount,
    });
    const receipt = await tx.wait();

    expect(parsedRouterEvents(router, receipt, "LiquidityAdded")).to.have.length(1);
    expect(parsedRouterEvents(router, receipt, "TopazLiquidityAdded")).to.have.length(1);
  });

  it("updates reserves to the latest liquidity addition", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const firstTokenAmount = ethers.parseEther("1");
    const secondTokenAmount = ethers.parseEther("4");
    const firstBnbAmount = ethers.parseEther("0.1");
    const secondBnbAmount = ethers.parseEther("0.3");

    await prepareLiquidity(token, router, owner, firstTokenAmount + secondTokenAmount);
    await router.connect(owner)[addTopazLiquidity](tokenAddress, false, firstTokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
      value: firstBnbAmount,
    });
    await router.connect(owner)[addTopazLiquidity](tokenAddress, false, secondTokenAmount, 0n, 0n, await recipient.getAddress(), 1n, {
      value: secondBnbAmount,
    });

    const pool = await ethers.getContractAt("MockTopazPool", await factory.getPool(tokenAddress, await router.WETH(), false));
    const reserves = await pool.getReserves();
    expect(reserves[0]).to.eq(secondTokenAmount);
    expect(reserves[1]).to.eq(secondBnbAmount);
    expect(await pool.totalSupply()).to.eq(firstTokenAmount + firstBnbAmount + secondTokenAmount + secondBnbAmount);
  });
});
