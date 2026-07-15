import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockFeeOnTransferERC20 rounding edges", function () {
  async function deployToken(feeBps: number) {
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const token = await FeeToken.deploy(feeBps);
    await token.waitForDeployment();
    return token;
  }

  it("rounds fees down for tiny transfers", async () => {
    const [holder, recipient] = await ethers.getSigners();
    const token = await deployToken(333);

    await token.mint(await holder.getAddress(), 2n);
    await token.connect(holder).transfer(await recipient.getAddress(), 2n);

    expect(await token.balanceOf(await recipient.getAddress())).to.eq(2n);
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(0n);
    expect(await token.totalSupply()).to.eq(2n);
  });

  it("supports a zero-fee token without emitting a burn balance", async () => {
    const [holder, recipient] = await ethers.getSigners();
    const token = await deployToken(0);

    await token.mint(await holder.getAddress(), 100n);
    await token.connect(holder).transfer(await recipient.getAddress(), 40n);

    expect(await token.balanceOf(await holder.getAddress())).to.eq(60n);
    expect(await token.balanceOf(await recipient.getAddress())).to.eq(40n);
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(0n);
  });

  it("charges the maximum supported fee exactly", async () => {
    const [holder, recipient] = await ethers.getSigners();
    const token = await deployToken(2000);
    const amount = ethers.parseEther("10");

    await token.mint(await holder.getAddress(), amount);
    await token.connect(holder).transfer(await recipient.getAddress(), amount);

    expect(await token.balanceOf(await recipient.getAddress())).to.eq(ethers.parseEther("8"));
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(ethers.parseEther("2"));
  });

  it("leaves remaining allowance after partial transferFrom", async () => {
    const [holder, spender, recipient] = await ethers.getSigners();
    const token = await deployToken(1000);

    await token.mint(await holder.getAddress(), 1000n);
    await token.connect(holder).approve(await spender.getAddress(), 1000n);
    await token.connect(spender).transferFrom(await holder.getAddress(), await recipient.getAddress(), 250n);

    expect(await token.allowance(await holder.getAddress(), await spender.getAddress())).to.eq(750n);
    expect(await token.balanceOf(await recipient.getAddress())).to.eq(225n);
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(25n);
  });
});
