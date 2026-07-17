import { expect } from "chai";
import { ethers } from "hardhat";

const addTopazLiquidity = "addLiquidityETH(address,bool,uint256,uint256,uint256,address,uint256)";

async function deployFixture() {
  const [owner, recipient] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("MockTopazFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy(await factory.getAddress(), await owner.getAddress());
  await router.waitForDeployment();

  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy("Router More", "RMR", ethers.parseEther("1000"), await owner.getAddress());
  await token.waitForDeployment();

  return { owner, recipient, factory, router, token };
}

describe("MockRouter additional edge cases", function () {
  it("reuses the same volatile pool on repeated liquidity adds", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const wrapped = await router.WETH();

    await token.mint(await owner.getAddress(), 30n);
    await token.approve(await router.getAddress(), 30n);

    await router[addTopazLiquidity](tokenAddress, false, 10n, 0n, 0n, await recipient.getAddress(), 1n, { value: 5n });
    const poolAddress = await factory.getPool(tokenAddress, wrapped, false);
    await router[addTopazLiquidity](tokenAddress, false, 20n, 0n, 0n, await recipient.getAddress(), 1n, { value: 7n });

    expect(await factory.getPool(tokenAddress, wrapped, false)).to.eq(poolAddress);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq(42n);
    const reserves = await pool.getReserves();
    expect(reserves[0]).to.eq(20n);
    expect(reserves[1]).to.eq(7n);
  });

  it("allows zero token liquidity and still mints native-denominated LP in the mock", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();

    await token.approve(await router.getAddress(), 0n);
    await router[addTopazLiquidity](tokenAddress, false, 0n, 0n, 0n, await recipient.getAddress(), 1n, { value: 9n });

    const pool = await ethers.getContractAt("MockTopazPool", await factory.getPool(tokenAddress, await router.WETH(), false));
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq(9n);
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });

  it("topaz volatile liquidity reuses the canonical pool", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();

    await token.mint(await owner.getAddress(), 10n);
    await token.approve(await router.getAddress(), 10n);

    await router[addTopazLiquidity](tokenAddress, false, 4n, 0n, 0n, await recipient.getAddress(), 1n, { value: 3n });
    const poolAddress = await factory.getPool(tokenAddress, await router.WETH(), false);
    await router[addTopazLiquidity](tokenAddress, false, 6n, 0n, 0n, await recipient.getAddress(), 1n, { value: 5n });

    expect(await factory.getPool(tokenAddress, await router.WETH(), false)).to.eq(poolAddress);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);
    expect(await pool.balanceOf(await recipient.getAddress())).to.eq(18n);
  });
});
