import { expect } from "chai";
import { ethers } from "hardhat";

describe("Phase1 native vault buckets", function () {
  it("RecruiterRewardsVault accepts native deposits and allows admin withdrawal", async function () {
    const [admin, depositor, recipient, stranger] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("RecruiterRewardsVault");
    const vault = await Vault.deploy(await admin.getAddress());
    await vault.waitForDeployment();

    await depositor.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(ethers.parseEther("1"));

    await expect(
      vault.connect(stranger).withdraw(await recipient.getAddress(), ethers.parseEther("0.1"))
    ).to.be.revertedWith("not admin");

    const before = await ethers.provider.getBalance(await recipient.getAddress());
    const tx = await vault.withdraw(await recipient.getAddress(), ethers.parseEther("0.4"));
    await tx.wait();
    const after = await ethers.provider.getBalance(await recipient.getAddress());

    expect(after - before).to.equal(ethers.parseEther("0.4"));
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(ethers.parseEther("0.6"));
  });

  it("ProtocolRevenueVault accepts native deposits and allows admin withdrawal", async function () {
    const [admin, depositor, recipient] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("ProtocolRevenueVault");
    const vault = await Vault.deploy(await admin.getAddress());
    await vault.waitForDeployment();

    await depositor.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("0.5") });
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(ethers.parseEther("0.5"));

    await expect(vault.withdraw(ethers.ZeroAddress, 1n)).to.be.revertedWith("to=0");

    const tx = await vault.withdraw(await recipient.getAddress(), ethers.parseEther("0.2"));
    await tx.wait();

    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(ethers.parseEther("0.3"));
  });
});
