import { expect } from "chai";
import { ethers } from "hardhat";

describe("LpTimelock", function () {
  it("constructor validations", async () => {
    const [deployer, beneficiary] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("LP", "LP", ethers.parseEther("100"), await deployer.getAddress());

    const Timelock = await ethers.getContractFactory("LpTimelock");
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await expect(Timelock.deploy(ethers.ZeroAddress, await beneficiary.getAddress(), now + 3600))
      .to.be.revertedWith("token=0");
    await expect(Timelock.deploy(await token.getAddress(), ethers.ZeroAddress, now + 3600))
      .to.be.revertedWith("beneficiary=0");
    await expect(Timelock.deploy(await token.getAddress(), await beneficiary.getAddress(), now))
      .to.be.revertedWith("releaseTime");
  });

  it("release: reverts before time; after time transfers all balance to beneficiary", async () => {
    const [deployer, beneficiary] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("LP", "LP", ethers.parseEther("100"), await deployer.getAddress());

    const Timelock = await ethers.getContractFactory("LpTimelock");
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const timelock = await Timelock.deploy(await token.getAddress(), await beneficiary.getAddress(), now + 3600);

    await expect(timelock.release()).to.be.revertedWith("not released");
    await expect(timelock.connect(beneficiary).release()).to.be.revertedWith("not released");

    // fund timelock
    await token.transfer(await timelock.getAddress(), ethers.parseEther("10"));

    // advance time
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);

    await expect(timelock.release()).to.not.be.reverted; // any caller can trigger, but beneficiary receives

    expect(await token.balanceOf(await beneficiary.getAddress())).to.eq(ethers.parseEther("10"));
    expect(await token.balanceOf(await timelock.getAddress())).to.eq(0n);

    // second release: no tokens
    await expect(timelock.release()).to.be.revertedWith("no tokens");
  });
});
