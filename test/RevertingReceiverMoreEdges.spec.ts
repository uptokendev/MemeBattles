import { expect } from "chai";
import { ethers } from "hardhat";

describe("RevertingReceiver additional edge cases", function () {
  async function deployReceiver() {
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const receiver = await RevertingReceiver.deploy();
    await receiver.waitForDeployment();
    return receiver;
  }

  it("keeps balance at zero after repeated rejected receives", async () => {
    const [sender] = await ethers.getSigners();
    const receiver = await deployReceiver();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), value: 1n })).to.be.revertedWith("NO_RECEIVE");
    await expect(sender.sendTransaction({ to: await receiver.getAddress(), value: 2n })).to.be.revertedWith("NO_RECEIVE");

    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(0n);
  });

  it("keeps balance at zero after rejected fallback calls without value", async () => {
    const [sender] = await ethers.getSigners();
    const receiver = await deployReceiver();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), data: "0xabcdef01" })).to.be.revertedWith("NO_FALLBACK");
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.eq(0n);
  });

  it("uses receive for empty calldata and fallback for non-empty calldata", async () => {
    const [sender] = await ethers.getSigners();
    const receiver = await deployReceiver();

    await expect(sender.sendTransaction({ to: await receiver.getAddress(), data: "0x", value: 1n })).to.be.revertedWith("NO_RECEIVE");
    await expect(sender.sendTransaction({ to: await receiver.getAddress(), data: "0x12", value: 1n })).to.be.revertedWith(
      "NO_FALLBACK"
    );
  });
});
