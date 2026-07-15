import { expect } from "chai";
import { ethers } from "hardhat";

describe("mock token contracts", function () {
  it("MockERC20 mints constructor supply to the configured holder", async () => {
    const [holder, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const supply = ethers.parseEther("123");
    const token = await MockERC20.deploy("Mock", "MOCK", supply, await holder.getAddress());
    await token.waitForDeployment();

    expect(await token.name()).to.eq("Mock");
    expect(await token.symbol()).to.eq("MOCK");
    expect(await token.decimals()).to.eq(18n);
    expect(await token.totalSupply()).to.eq(supply);
    expect(await token.balanceOf(await holder.getAddress())).to.eq(supply);
    expect(await token.balanceOf(await other.getAddress())).to.eq(0n);
  });

  it("MockERC20 supports normal transfer and allowance flows", async () => {
    const [holder, spender, recipient] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock", "MOCK", ethers.parseEther("10"), await holder.getAddress());
    await token.waitForDeployment();

    await expect(token.connect(holder).transfer(await recipient.getAddress(), ethers.parseEther("1")))
      .to.emit(token, "Transfer")
      .withArgs(await holder.getAddress(), await recipient.getAddress(), ethers.parseEther("1"));

    await token.connect(holder).approve(await spender.getAddress(), ethers.parseEther("2"));
    await token.connect(spender).transferFrom(await holder.getAddress(), await recipient.getAddress(), ethers.parseEther("2"));

    expect(await token.balanceOf(await recipient.getAddress())).to.eq(ethers.parseEther("3"));
    expect(await token.allowance(await holder.getAddress(), await spender.getAddress())).to.eq(0n);
  });

  it("MockFeeOnTransferERC20 validates fee bounds and exposes metadata", async () => {
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");

    await expect(FeeToken.deploy(2001)).to.be.revertedWith("fee too high");
    const token = await FeeToken.deploy(1000);
    await token.waitForDeployment();

    expect(await token.name()).to.eq("FeeToken");
    expect(await token.symbol()).to.eq("FEE");
    expect(await token.decimals()).to.eq(18n);
    expect(await token.feeBps()).to.eq(1000n);
  });

  it("MockFeeOnTransferERC20 burns transfer fees to address zero", async () => {
    const [holder, recipient] = await ethers.getSigners();
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const token = await FeeToken.deploy(1000);
    await token.waitForDeployment();

    const amount = ethers.parseEther("100");
    await token.mint(await holder.getAddress(), amount);
    await token.connect(holder).transfer(await recipient.getAddress(), amount);

    expect(await token.balanceOf(await recipient.getAddress())).to.eq(ethers.parseEther("90"));
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(ethers.parseEther("10"));
    expect(await token.balanceOf(await holder.getAddress())).to.eq(0n);
    expect(await token.totalSupply()).to.eq(amount);
  });

  it("MockFeeOnTransferERC20 charges fees and spends allowance in transferFrom", async () => {
    const [holder, spender, recipient] = await ethers.getSigners();
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const token = await FeeToken.deploy(500);
    await token.waitForDeployment();

    const amount = ethers.parseEther("20");
    await token.mint(await holder.getAddress(), amount);
    await token.connect(holder).approve(await spender.getAddress(), amount);

    await token.connect(spender).transferFrom(await holder.getAddress(), await recipient.getAddress(), amount);

    expect(await token.allowance(await holder.getAddress(), await spender.getAddress())).to.eq(0n);
    expect(await token.balanceOf(await recipient.getAddress())).to.eq(ethers.parseEther("19"));
    expect(await token.balanceOf(ethers.ZeroAddress)).to.eq(ethers.parseEther("1"));
  });

  it("MockFeeOnTransferERC20 rejects insufficient allowance and balance", async () => {
    const [holder, spender, recipient] = await ethers.getSigners();
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const token = await FeeToken.deploy(0);
    await token.waitForDeployment();

    await token.mint(await holder.getAddress(), 10n);
    await expect(token.connect(spender).transferFrom(await holder.getAddress(), await recipient.getAddress(), 1n)).to.be.revertedWith(
      "ALLOWANCE"
    );

    await token.connect(holder).approve(await spender.getAddress(), 100n);
    await expect(token.connect(spender).transferFrom(await holder.getAddress(), await recipient.getAddress(), 11n)).to.be.revertedWith(
      "BAL"
    );
  });
});
