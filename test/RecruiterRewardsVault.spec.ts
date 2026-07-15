import { expect } from "chai";
import { ethers } from "hardhat";

async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

describe("Native treasury vaults", function () {
  async function deployRecruiterVault() {
    const [admin, operator, recipient, other] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("RecruiterRewardsVault");
    const vault = await Vault.deploy(await admin.getAddress());
    await vault.waitForDeployment();
    return { vault, admin, operator, recipient, other };
  }

  async function deployProtocolVault() {
    const [admin, recipient, other] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("ProtocolRevenueVault");
    const vault = await Vault.deploy(await admin.getAddress());
    await vault.waitForDeployment();
    return { vault, admin, recipient, other };
  }

  async function configureRecruiterPayoutLane(vault: any, admin: any, operatorAddress: string) {
    await vault.connect(admin).setOperator(operatorAddress);
    await vault.connect(admin).setPayoutCaps(ethers.parseEther("1.0"), ethers.parseEther("1.5"));
    await vault.connect(admin).setPayoutsPaused(false);
  }

  it("validates zero admin for protocol and recruiter vaults", async () => {
    const RecruiterRewardsVault = await ethers.getContractFactory("RecruiterRewardsVault");
    const ProtocolRevenueVault = await ethers.getContractFactory("ProtocolRevenueVault");

    await expect(RecruiterRewardsVault.deploy(ethers.ZeroAddress)).to.be.revertedWith("admin=0");
    await expect(ProtocolRevenueVault.deploy(ethers.ZeroAddress)).to.be.revertedWith("admin=0");
  });

  it("protocol vault accepts native deposits and emits tracked balances", async () => {
    const { vault, admin, other } = await deployProtocolVault();
    const vaultAddress = await vault.getAddress();
    const amount = ethers.parseEther("0.75");

    await expect(admin.sendTransaction({ to: vaultAddress, value: 0n })).to.be.revertedWith("amount=0");
    await expect(other.sendTransaction({ to: vaultAddress, value: amount }))
      .to.emit(vault, "Deposit")
      .withArgs(await other.getAddress(), amount, amount);
    expect(await ethers.provider.getBalance(vaultAddress)).to.eq(amount);
  });

  it("protocol vault restricts withdrawals to admin and validates withdrawal inputs", async () => {
    const { vault, admin, recipient, other } = await deployProtocolVault();
    const vaultAddress = await vault.getAddress();
    const recipientAddress = await recipient.getAddress();
    const amount = ethers.parseEther("1");
    const withdrawal = ethers.parseEther("0.4");

    await admin.sendTransaction({ to: vaultAddress, value: amount });

    await expect(vault.connect(other).withdraw(recipientAddress, withdrawal)).to.be.revertedWith("not admin");
    await expect(vault.connect(admin).withdraw(ethers.ZeroAddress, withdrawal)).to.be.revertedWith("to=0");
    await expect(vault.connect(admin).withdraw(recipientAddress, amount + 1n)).to.be.revertedWith("insufficient");

    await expect(() => vault.connect(admin).withdraw(recipientAddress, withdrawal)).to.changeEtherBalances(
      [vault, recipient],
      [-withdrawal, withdrawal]
    );
    expect(await ethers.provider.getBalance(vaultAddress)).to.eq(amount - withdrawal);
  });

  it("protocol vault preserves balance when withdrawal transfer fails", async () => {
    const { vault, admin } = await deployProtocolVault();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingReceiver = await RevertingReceiver.deploy();
    await rejectingReceiver.waitForDeployment();

    const amount = 100n;
    await admin.sendTransaction({ to: await vault.getAddress(), value: amount });

    await expect(vault.connect(admin).withdraw(await rejectingReceiver.getAddress(), 1n)).to.be.revertedWith(
      "transfer failed"
    );
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(amount);
  });

  it("recruiter vault starts paused and cannot unpause before the payout lane is configured", async () => {
    const { vault, admin, operator } = await deployRecruiterVault();

    expect(await vault.payoutsPaused()).to.eq(true);
    expect(await vault.operator()).to.eq(ethers.ZeroAddress);

    await expect(vault.connect(admin).setPayoutsPaused(false)).to.be.revertedWith("operator=0");

    await vault.connect(admin).setOperator(await operator.getAddress());
    await expect(vault.connect(admin).setPayoutsPaused(false)).to.be.revertedWith("maxPayoutPerTx=0");

    await vault.connect(admin).setPayoutCaps(1n, 0n);
    await expect(vault.connect(admin).setPayoutsPaused(false)).to.be.revertedWith("dailyPayoutCap=0");

    await vault.connect(admin).setPayoutCaps(1n, 1n);
    await expect(vault.connect(admin).setPayoutsPaused(false)).to.emit(vault, "PayoutsPaused").withArgs(false);
  });

  it("only the admin can configure payout roles, caps, pause state, and inherited withdrawals", async () => {
    const { vault, admin, operator, recipient, other } = await deployRecruiterVault();
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();

    await expect(vault.connect(other).setOperator(operatorAddress)).to.be.revertedWith("not admin");
    await expect(vault.connect(other).setPayoutCaps(1n, 2n)).to.be.revertedWith("not admin");
    await expect(vault.connect(other).setPayoutsPaused(false)).to.be.revertedWith("not admin");
    await expect(vault.connect(other).withdraw(recipientAddress, 1n)).to.be.revertedWith("not admin");

    await expect(vault.connect(admin).setOperator(operatorAddress))
      .to.emit(vault, "OperatorUpdated")
      .withArgs(operatorAddress);
    await expect(vault.connect(admin).setPayoutCaps(10n, 20n)).to.emit(vault, "PayoutCapsUpdated").withArgs(10n, 20n);

    expect(await vault.operator()).to.eq(operatorAddress);
    expect(await vault.maxPayoutPerTx()).to.eq(10n);
    expect(await vault.dailyPayoutCap()).to.eq(20n);
  });

  it("allows capped operator payouts and enforces per-tx plus daily limits", async () => {
    const { vault, admin, operator, recipient, other } = await deployRecruiterVault();
    const vaultAddress = await vault.getAddress();
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();

    await configureRecruiterPayoutLane(vault, admin, operatorAddress);
    await admin.sendTransaction({ to: vaultAddress, value: ethers.parseEther("2.0") });

    await expect(vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.1"))).to.be.revertedWith(
      "maxPayoutPerTx"
    );
    await expect(vault.connect(other).payout(recipientAddress, ethers.parseEther("0.1"))).to.be.revertedWith(
      "not operator"
    );

    await expect(vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.0")))
      .to.emit(vault, "Payout")
      .withArgs(recipientAddress, ethers.parseEther("1.0"));
    expect(await vault.dailySpent()).to.eq(ethers.parseEther("1.0"));

    await expect(vault.connect(operator).payout(recipientAddress, ethers.parseEther("0.6"))).to.be.revertedWith(
      "dailyPayoutCap"
    );
  });

  it("rejects invalid payout requests before spending daily allowance", async () => {
    const { vault, admin, operator, recipient } = await deployRecruiterVault();
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();

    await configureRecruiterPayoutLane(vault, admin, operatorAddress);

    await expect(vault.connect(operator).payout(recipientAddress, 1n)).to.be.revertedWith("insufficient");
    expect(await vault.dailySpent()).to.eq(0n);

    await admin.sendTransaction({ to: await vault.getAddress(), value: 100n });
    await expect(vault.connect(operator).payout(ethers.ZeroAddress, 1n)).to.be.revertedWith("to=0");
    await expect(vault.connect(operator).payout(recipientAddress, 0n)).to.be.revertedWith("amount=0");
    expect(await vault.dailySpent()).to.eq(0n);
  });

  it("resets recruiter daily payout accounting on a new day", async () => {
    const { vault, admin, operator, recipient } = await deployRecruiterVault();
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();

    await configureRecruiterPayoutLane(vault, admin, operatorAddress);
    await admin.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("3") });

    await vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.0"));
    await vault.connect(operator).payout(recipientAddress, ethers.parseEther("0.5"));
    expect(await vault.dailySpent()).to.eq(ethers.parseEther("1.5"));

    await increaseTime(24 * 60 * 60 + 1);

    await expect(vault.connect(operator).payout(recipientAddress, ethers.parseEther("1.0"))).to.emit(vault, "Payout");
    expect(await vault.dailySpent()).to.eq(ethers.parseEther("1.0"));
  });

  it("respects payout pause without blocking admin custody withdrawals", async () => {
    const { vault, admin, operator, recipient } = await deployRecruiterVault();
    const operatorAddress = await operator.getAddress();
    const recipientAddress = await recipient.getAddress();
    const withdrawal = ethers.parseEther("0.5");

    await configureRecruiterPayoutLane(vault, admin, operatorAddress);
    await admin.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("2") });

    await expect(vault.connect(admin).setPayoutsPaused(true)).to.emit(vault, "PayoutsPaused").withArgs(true);
    await expect(vault.connect(operator).payout(recipientAddress, 1n)).to.be.revertedWith("payouts paused");

    await expect(() => vault.connect(admin).withdraw(recipientAddress, withdrawal)).to.changeEtherBalances(
      [vault, recipient],
      [-withdrawal, withdrawal]
    );
  });

  it("rolls back recruiter payout accounting when recipient transfer fails", async () => {
    const { vault, admin, operator } = await deployRecruiterVault();
    const operatorAddress = await operator.getAddress();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingReceiver = await RevertingReceiver.deploy();
    await rejectingReceiver.waitForDeployment();

    await configureRecruiterPayoutLane(vault, admin, operatorAddress);
    await admin.sendTransaction({ to: await vault.getAddress(), value: 100n });

    await expect(vault.connect(operator).payout(await rejectingReceiver.getAddress(), 25n)).to.be.revertedWith(
      "transfer failed"
    );
    expect(await vault.dailySpent()).to.eq(0n);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(100n);
  });
});
