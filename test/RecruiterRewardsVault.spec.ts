import { expect } from "chai";
import { ethers } from "hardhat";

describe("RecruiterRewardsVault", function () {
  it("starts paused and cannot unpause before the payout lane is configured", async () => {
    const [admin] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("RecruiterRewardsVault");
    const vault = await Vault.deploy(await admin.getAddress());

    expect(await vault.payoutsPaused()).to.eq(true);
    expect(await vault.operator()).to.eq(ethers.ZeroAddress);

    await expect(vault.connect(admin).setPayoutsPaused(false)).to.be.revertedWith("operator=0");
  });

  it("only the admin can configure payout roles and caps", async () => {
    const [admin, operator] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("RecruiterRewardsVault");
    const vault = await Vault.deploy(await admin.getAddress());

    await expect(vault.connect(operator).setOperator(await operator.getAddress())).to.be.revertedWith("not admin");
    await expect(vault.connect(operator).setPayoutCaps(1n, 2n)).to.be.revertedWith("not admin");
    await expect(vault.connect(operator).setPayoutsPaused(false)).to.be.revertedWith("not admin");
  });

  it("allows capped operator payouts and enforces the per-tx and daily limits", async () => {
    const [admin, operator, recipient] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("RecruiterRewardsVault");
    const vault = await Vault.deploy(await admin.getAddress());
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();

    await vault.connect(admin).setOperator(operatorAddress);
    await vault.connect(admin).setPayoutCaps(ethers.parseEther("1.0"), ethers.parseEther("1.5"));
    await vault.connect(admin).setPayoutsPaused(false);

    await admin.sendTransaction({
      to: await vault.getAddress(),
      value: ethers.parseEther("2.0"),
    });

    await expect(
      vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.1")),
    ).to.be.revertedWith("maxPayoutPerTx");

    await expect(
      vault.connect(recipient).payout(recipientAddress, ethers.parseEther("0.1")),
    ).to.be.revertedWith("not operator");

    await expect(
      vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.0")),
    ).to.emit(vault, "Payout").withArgs(recipientAddress, ethers.parseEther("1.0"));

    await expect(
      vault.connect(operator).payout(recipientAddress, ethers.parseEther("0.6")),
    ).to.be.revertedWith("dailyPayoutCap");
  });
});
