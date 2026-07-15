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
  const token = await Token.deploy("Router More", "RMR", ethers.parseEther("1000"), await owner.getAddress());
  await token.waitForDeployment();

  return { owner, recipient, factory, router, token };
}

describe("MockRouter additional edge cases", function () {
  it("reuses the same pair on repeated liquidity adds", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const wrapped = await router.WETH();

    await token.mint(await owner.getAddress(), 30n);
    await token.approve(await router.getAddress(), 30n);

    await router[addPancakeLiquidity](tokenAddress, 10n, 0n, 0n, await recipient.getAddress(), 1n, { value: 5n });
    const pairAddress = await factory.getPair(tokenAddress, wrapped);
    await router[addPancakeLiquidity](tokenAddress, 20n, 0n, 0n, await recipient.getAddress(), 1n, { value: 7n });

    expect(await factory.getPair(tokenAddress, wrapped)).to.eq(pairAddress);
    const pair = await ethers.getContractAt("MockV2Pair", pairAddress);
    expect(await pair.balanceOf(await recipient.getAddress())).to.eq(42n);
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(20n);
    expect(reserves[1]).to.eq(7n);
  });

  it("allows zero token liquidity and still mints native-denominated LP in the mock", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();

    await token.approve(await router.getAddress(), 0n);
    await router[addPancakeLiquidity](tokenAddress, 0n, 0n, 0n, await recipient.getAddress(), 1n, { value: 9n });

    const pair = await ethers.getContractAt("MockV2Pair", await factory.getPair(tokenAddress, await router.WETH()));
    expect(await pair.balanceOf(await recipient.getAddress())).to.eq(9n);
    expect(await token.balanceOf(await router.getAddress())).to.eq(0n);
  });

  it("topaz and pancake liquidity share the same volatile pair", async () => {
    const { owner, recipient, factory, router, token } = await deployFixture();
    const tokenAddress = await token.getAddress();

    await token.mint(await owner.getAddress(), 10n);
    await token.approve(await router.getAddress(), 10n);

    await router[addTopazLiquidity](tokenAddress, false, 4n, 0n, 0n, await recipient.getAddress(), 1n, { value: 3n });
    const pairAddress = await factory.getPair(tokenAddress, await router.WETH());
    await router[addPancakeLiquidity](tokenAddress, 6n, 0n, 0n, await recipient.getAddress(), 1n, { value: 5n });

    expect(await factory.getPair(tokenAddress, await router.WETH())).to.eq(pairAddress);
    const pair = await ethers.getContractAt("MockV2Pair", pairAddress);
    expect(await pair.balanceOf(await recipient.getAddress())).to.eq(18n);
  });
});
