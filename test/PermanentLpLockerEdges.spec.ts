import { expect } from "chai";
import { ethers } from "hardhat";

async function deployToken(name: string, symbol: string, owner: any, to: string, amount: bigint) {
  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy(name, symbol, ethers.parseEther("1000"), await owner.getAddress());
  await token.waitForDeployment();
  await token.connect(owner).mint(to, amount);
  await token.connect(owner).enableTrading();
  return token;
}

async function deployFixture() {
  const [owner, alice, bob] = await ethers.getSigners();
  const Locker = await ethers.getContractFactory("PermanentLpLocker");
  const locker = await Locker.deploy(await owner.getAddress());
  await locker.waitForDeployment();

  const lpToken = await deployToken("LP Token", "LPT", owner, await alice.getAddress(), ethers.parseEther("100"));
  const rescueToken = await deployToken("Rescue Token", "RST", owner, await locker.getAddress(), ethers.parseEther("20"));

  return { owner, alice, bob, locker, lpToken, rescueToken };
}

describe("PermanentLpLocker edge cases", function () {
  it("does not count direct post-registration LP transfers as depositor-locked accounting", async () => {
    const { owner, alice, locker, lpToken } = await deployFixture();
    const lpTokenAddress = await lpToken.getAddress();
    const lockerAddress = await locker.getAddress();
    const lockedAmount = ethers.parseEther("10");
    const directAmount = ethers.parseEther("4");

    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await lpToken.connect(alice).approve(lockerAddress, lockedAmount);
    await locker.connect(alice).lock(lpTokenAddress, lockedAmount);
    await lpToken.connect(alice).transfer(lockerAddress, directAmount);

    expect(await lpToken.balanceOf(lockerAddress)).to.eq(lockedAmount + directAmount);
    expect(await locker.lockedBalance(lpTokenAddress)).to.eq(lockedAmount);
    expect(await locker.lockedByDepositor(lpTokenAddress, await alice.getAddress())).to.eq(lockedAmount);
  });

  it("keeps pre-registration LP balance attributed to the locker depositor when later users lock", async () => {
    const { owner, alice, locker, lpToken } = await deployFixture();
    const lpTokenAddress = await lpToken.getAddress();
    const lockerAddress = await locker.getAddress();
    const preRegistrationAmount = ethers.parseEther("6");
    const aliceAmount = ethers.parseEther("2");

    await lpToken.connect(owner).mint(lockerAddress, preRegistrationAmount);
    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await lpToken.connect(alice).approve(lockerAddress, aliceAmount);

    await expect(locker.connect(alice).lock(lpTokenAddress, aliceAmount))
      .to.emit(locker, "LpPermanentlyLocked")
      .withArgs(lpTokenAddress, await alice.getAddress(), aliceAmount, preRegistrationAmount + aliceAmount);
    expect(await locker.lockedByDepositor(lpTokenAddress, lockerAddress)).to.eq(preRegistrationAmount);
    expect(await locker.lockedByDepositor(lpTokenAddress, await alice.getAddress())).to.eq(aliceAmount);
  });

  it("allows partial recovery of unrelated tokens and leaves the remainder in custody", async () => {
    const { owner, bob, locker, rescueToken } = await deployFixture();
    const rescueTokenAddress = await rescueToken.getAddress();
    const lockerAddress = await locker.getAddress();
    const recovery = ethers.parseEther("7");
    const startingBalance = await rescueToken.balanceOf(lockerAddress);

    await expect(locker.connect(owner).recoverUnregisteredToken(rescueTokenAddress, await bob.getAddress(), recovery))
      .to.emit(locker, "UnregisteredTokenRecovered")
      .withArgs(rescueTokenAddress, await bob.getAddress(), recovery);
    expect(await rescueToken.balanceOf(await bob.getAddress())).to.eq(recovery);
    expect(await rescueToken.balanceOf(lockerAddress)).to.eq(startingBalance - recovery);
  });

  it("rolls back recovery when the locker lacks enough unrelated token balance", async () => {
    const { owner, bob, locker, rescueToken } = await deployFixture();
    const rescueTokenAddress = await rescueToken.getAddress();
    const lockerAddress = await locker.getAddress();
    const startingBalance = await rescueToken.balanceOf(lockerAddress);

    await expect(
      locker.connect(owner).recoverUnregisteredToken(rescueTokenAddress, await bob.getAddress(), startingBalance + 1n)
    ).to.be.reverted;
    expect(await rescueToken.balanceOf(lockerAddress)).to.eq(startingBalance);
    expect(await rescueToken.balanceOf(await bob.getAddress())).to.eq(0n);
  });
});
