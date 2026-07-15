import { expect } from "chai";
import { ethers } from "hardhat";

describe("ReenteringFeeRecipient edge cases", function () {
  async function deployFixture() {
    const [sender, target] = await ethers.getSigners();
    const Recipient = await ethers.getContractFactory("ReenteringFeeRecipient");
    const recipient = await Recipient.deploy();
    await recipient.waitForDeployment();
    return { sender, target, recipient };
  }

  it("stores target and mode configuration", async () => {
    const { target, recipient } = await deployFixture();

    await recipient.setTarget(await target.getAddress());
    await recipient.setMode(1);

    expect(await recipient.target()).to.eq(await target.getAddress());
    expect(await recipient.mode()).to.eq(1n);
  });

  it("mode zero rejects native receives", async () => {
    const { sender, recipient } = await deployFixture();

    await recipient.setMode(0);
    await expect(sender.sendTransaction({ to: await recipient.getAddress(), value: 1n })).to.be.revertedWith("nope");
    expect(await ethers.provider.getBalance(await recipient.getAddress())).to.eq(0n);
  });

  it("mode one accepts funds without reentering when target is unset", async () => {
    const { sender, recipient } = await deployFixture();

    await recipient.setMode(1);
    await sender.sendTransaction({ to: await recipient.getAddress(), value: 5n });

    expect(await recipient.lastReenterOk()).to.eq(false);
    expect(await ethers.provider.getBalance(await recipient.getAddress())).to.eq(5n);
  });

  it("mode one records a successful low-level call against an EOA target", async () => {
    const { sender, target, recipient } = await deployFixture();

    await recipient.setTarget(await target.getAddress());
    await recipient.setMode(1);
    await sender.sendTransaction({ to: await recipient.getAddress(), value: 7n });

    expect(await recipient.lastReenterOk()).to.eq(true);
    expect(await ethers.provider.getBalance(await recipient.getAddress())).to.eq(7n);
  });

  it("mode one records a failed reenter attempt without reverting the receive", async () => {
    const { sender, recipient } = await deployFixture();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const target = await RevertingReceiver.deploy();
    await target.waitForDeployment();

    await recipient.setTarget(await target.getAddress());
    await recipient.setMode(1);
    await sender.sendTransaction({ to: await recipient.getAddress(), value: 9n });

    expect(await recipient.lastReenterOk()).to.eq(false);
    expect(await ethers.provider.getBalance(await recipient.getAddress())).to.eq(9n);
  });
});
