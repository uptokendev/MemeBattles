import { expect } from "chai";
import { ethers } from "hardhat";

describe("mock receiver contracts", function () {
  it("AcceptingReceiver accepts native value and emits sender plus amount", async () => {
    const [sender] = await ethers.getSigners();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const receiver = await AcceptingReceiver.deploy();
    await receiver.waitForDeployment();

    const amount = ethers.parseEther("0.123");
    await expect(sender.sendTransaction({ to: await receiver.getAddress(), value: amount }))
      .to.emit(receiver, "Received")
      .withArgs(await sender.getAddress(), amount);
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(amount);
  });

  it("AcceptingReceiver rejects unknown calldata while still accepting plain receive transfers", async () => {
    const [sender] = await ethers.getSigners();
    const AcceptingReceiver = await ethers.getContractFactory("AcceptingReceiver");
    const receiver = await AcceptingReceiver.deploy();
    await receiver.waitForDeployment();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), data: "0x12345678", value: 1n })).to.be.reverted;
    await sender.sendTransaction({ to: await receiver.getAddress(), value: 1n });
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(1n);
  });

  it("RevertingReceiver rejects plain native receives", async () => {
    const [sender] = await ethers.getSigners();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const receiver = await RevertingReceiver.deploy();
    await receiver.waitForDeployment();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), value: 1n })).to.be.revertedWith("NO_RECEIVE");
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(0n);
  });

  it("RevertingReceiver rejects payable fallback calls", async () => {
    const [sender] = await ethers.getSigners();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const receiver = await RevertingReceiver.deploy();
    await receiver.waitForDeployment();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), data: "0x12345678", value: 1n })).to.be.revertedWith(
      "NO_FALLBACK"
    );
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(0n);
  });
});
