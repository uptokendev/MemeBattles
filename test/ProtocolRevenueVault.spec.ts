import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProtocolRevenueVault", function () {
  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();
    const ProtocolRevenueVault = await ethers.getContractFactory("ProtocolRevenueVault");
    const vault = await ProtocolRevenueVault.deploy(await admin.getAddress());
    await vault.waitForDeployment();
    return { vault, admin, alice, bob };
  }

  it("rejects a zero admin constructor argument", async () => {
    const ProtocolRevenueVault = await ethers.getContractFactory("ProtocolRevenueVault");

    await expect(ProtocolRevenueVault.deploy(ethers.ZeroAddress)).to.be.revertedWith("admin=0");
  });

  it("accepts native deposits and emits the updated balance", async () => {
    const { vault, alice } = await deployFixture();
    const amount = ethers.parseEther("0.75");

    await expect(alice.sendTransaction({ to: await vault.getAddress(), value: amount }))
      .to.emit(vault, "Deposit")
      .withArgs(await alice.getAddress(), amount, amount);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(amount);
  });

  it("rejects zero-value deposits", async () => {
    const { vault, alice } = await deployFixture();

    await expect(alice.sendTransaction({ to: await vault.getAddress(), value: 0n })).to.be.revertedWith("amount=0");
  });

  it("allows only the admin to withdraw native funds", async () => {
    const { vault, admin, alice, bob } = await deployFixture();
    const deposit = ethers.parseEther("1");
    const withdrawal = ethers.parseEther("0.4");
    const bobAddress = await bob.getAddress();

    await alice.sendTransaction({ to: await vault.getAddress(), value: deposit });
    await expect(vault.connect(alice).withdraw(bobAddress, withdrawal)).to.be.revertedWith("not admin");

    await expect(() => vault.connect(admin).withdraw(bobAddress, withdrawal)).to.changeEtherBalances(
      [vault, bob],
      [-withdrawal, withdrawal]
    );
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(deposit - withdrawal);
  });

  it("validates withdraw recipient and balance", async () => {
    const { vault, admin, alice, bob } = await deployFixture();
    const deposit = ethers.parseEther("0.2");

    await alice.sendTransaction({ to: await vault.getAddress(), value: deposit });
    await expect(vault.connect(admin).withdraw(ethers.ZeroAddress, 1n)).to.be.revertedWith("to=0");
    await expect(vault.connect(admin).withdraw(await bob.getAddress(), deposit + 1n)).to.be.revertedWith("insufficient");
  });

  it("rolls back when the withdrawal recipient rejects native funds", async () => {
    const { vault, admin, alice } = await deployFixture();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingReceiver = await RevertingReceiver.deploy();
    await rejectingReceiver.waitForDeployment();

    const deposit = ethers.parseEther("0.3");
    await alice.sendTransaction({ to: await vault.getAddress(), value: deposit });

    await expect(vault.connect(admin).withdraw(await rejectingReceiver.getAddress(), deposit)).to.be.revertedWith(
      "transfer failed"
    );
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(deposit);
  });
});
