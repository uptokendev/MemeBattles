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

async function deployLockerFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  const Locker = await ethers.getContractFactory("PermanentLpLocker");
  const locker = await Locker.deploy(await owner.getAddress());
  await locker.waitForDeployment();

  const lpToken = await deployToken("Topaz LP", "TLP", owner, await alice.getAddress(), ethers.parseEther("100"));
  const unrelatedToken = await deployToken(
    "Unrelated",
    "UNT",
    owner,
    await locker.getAddress(),
    ethers.parseEther("10")
  );

  return { owner, alice, bob, locker, lpToken, unrelatedToken };
}

describe("PermanentLpLocker", function () {
  it("constructor and admin methods reject zero addresses and zero recovery amounts", async () => {
    const Locker = await ethers.getContractFactory("PermanentLpLocker");
    await expect(Locker.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Locker, "ZeroAddress");

    const { owner, bob, locker, lpToken, unrelatedToken } = await deployLockerFixture();
    await expect(locker.connect(owner).registerLpToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(locker, "ZeroAddress");
    await expect(
      locker.connect(owner).recoverUnregisteredToken(ethers.ZeroAddress, await bob.getAddress(), 1n)
    ).to.be.revertedWithCustomError(locker, "ZeroAddress");
    await expect(
      locker.connect(owner).recoverUnregisteredToken(await unrelatedToken.getAddress(), ethers.ZeroAddress, 1n)
    ).to.be.revertedWithCustomError(locker, "ZeroAddress");
    await expect(
      locker.connect(owner).recoverUnregisteredToken(await unrelatedToken.getAddress(), await bob.getAddress(), 0n)
    ).to.be.revertedWithCustomError(locker, "ZeroAmount");

    await locker.connect(owner).registerLpToken(await lpToken.getAddress());
    await expect(locker.connect(owner).lock(await lpToken.getAddress(), 0n)).to.be.revertedWithCustomError(locker, "ZeroAmount");
  });

  it("registers LP tokens by immutable admin only", async () => {
    const { owner, bob, locker, lpToken } = await deployLockerFixture();

    await expect(locker.connect(bob).registerLpToken(await lpToken.getAddress())).to.be.revertedWithCustomError(
      locker,
      "OnlyAdmin"
    );

    await expect(locker.connect(owner).registerLpToken(await lpToken.getAddress()))
      .to.emit(locker, "LpTokenRegistered")
      .withArgs(await lpToken.getAddress());
    expect(await locker.registeredLpToken(await lpToken.getAddress())).to.equal(true);

    await expect(locker.connect(owner).registerLpToken(await lpToken.getAddress())).to.be.revertedWithCustomError(
      locker,
      "AlreadyRegistered"
    );
  });

  it("locks registered LP and records global and depositor balances", async () => {
    const { owner, alice, locker, lpToken } = await deployLockerFixture();
    const amount = ethers.parseEther("12.5");

    await locker.connect(owner).registerLpToken(await lpToken.getAddress());
    await lpToken.connect(alice).approve(await locker.getAddress(), amount);

    await expect(locker.connect(alice).lock(await lpToken.getAddress(), amount))
      .to.emit(locker, "LpPermanentlyLocked")
      .withArgs(await lpToken.getAddress(), await alice.getAddress(), amount, amount);

    expect(await lpToken.balanceOf(await locker.getAddress())).to.equal(amount);
    expect(await locker.lockedBalance(await lpToken.getAddress())).to.equal(amount);
    expect(await locker.lockedByDepositor(await lpToken.getAddress(), await alice.getAddress())).to.equal(amount);
  });

  it("accumulates multiple depositor locks without mixing depositor accounting", async () => {
    const { owner, alice, bob, locker, lpToken } = await deployLockerFixture();
    const aliceAmount = ethers.parseEther("5");
    const bobAmount = ethers.parseEther("7");
    const lpTokenAddress = await lpToken.getAddress();
    const lockerAddress = await locker.getAddress();

    await lpToken.connect(owner).mint(await bob.getAddress(), bobAmount);
    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await lpToken.connect(alice).approve(lockerAddress, aliceAmount);
    await lpToken.connect(bob).approve(lockerAddress, bobAmount);

    await locker.connect(alice).lock(lpTokenAddress, aliceAmount);
    await expect(locker.connect(bob).lock(lpTokenAddress, bobAmount))
      .to.emit(locker, "LpPermanentlyLocked")
      .withArgs(lpTokenAddress, await bob.getAddress(), bobAmount, aliceAmount + bobAmount);

    expect(await locker.lockedBalance(lpTokenAddress)).to.equal(aliceAmount + bobAmount);
    expect(await locker.lockedByDepositor(lpTokenAddress, await alice.getAddress())).to.equal(aliceAmount);
    expect(await locker.lockedByDepositor(lpTokenAddress, await bob.getAddress())).to.equal(bobAmount);
    expect(await lpToken.balanceOf(lockerAddress)).to.equal(aliceAmount + bobAmount);
  });

  it("failed token transfers cannot create phantom locked balances", async () => {
    const { owner, alice, locker, lpToken } = await deployLockerFixture();
    const amount = ethers.parseEther("1");
    const lpTokenAddress = await lpToken.getAddress();

    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await expect(locker.connect(alice).lock(lpTokenAddress, amount)).to.be.reverted;

    expect(await locker.lockedBalance(lpTokenAddress)).to.equal(0n);
    expect(await locker.lockedByDepositor(lpTokenAddress, await alice.getAddress())).to.equal(0n);
    expect(await lpToken.balanceOf(await locker.getAddress())).to.equal(0n);
  });

  it("marks LP already held by the locker as permanently locked on registration", async () => {
    const { owner, locker, lpToken } = await deployLockerFixture();
    const amount = ethers.parseEther("8");
    const lockerAddress = await locker.getAddress();
    const lpTokenAddress = await lpToken.getAddress();

    await lpToken.connect(owner).mint(lockerAddress, amount);

    await expect(locker.connect(owner).registerLpToken(lpTokenAddress))
      .to.emit(locker, "LpPermanentlyLocked")
      .withArgs(lpTokenAddress, lockerAddress, amount, amount);

    expect(await locker.lockedBalance(lpTokenAddress)).to.equal(amount);
    expect(await locker.lockedByDepositor(lpTokenAddress, lockerAddress)).to.equal(amount);
    expect(await lpToken.balanceOf(lockerAddress)).to.equal(amount);
  });

  it("keeps registered LP unrecoverable even when LP is sent directly to the locker", async () => {
    const { owner, bob, locker, lpToken } = await deployLockerFixture();
    const lockerAddress = await locker.getAddress();
    const lpTokenAddress = await lpToken.getAddress();
    const beforeRegistrationAmount = ethers.parseEther("3");
    const afterRegistrationAmount = ethers.parseEther("2");

    await lpToken.connect(owner).mint(lockerAddress, beforeRegistrationAmount);
    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await lpToken.connect(owner).mint(lockerAddress, afterRegistrationAmount);

    await expect(
      locker.connect(owner).recoverUnregisteredToken(lpTokenAddress, await bob.getAddress(), beforeRegistrationAmount + afterRegistrationAmount)
    ).to.be.revertedWithCustomError(locker, "RegisteredLpRecoveryBlocked");
    expect(await lpToken.balanceOf(lockerAddress)).to.equal(beforeRegistrationAmount + afterRegistrationAmount);
    expect(await lpToken.balanceOf(await bob.getAddress())).to.equal(0n);
  });

  it("rejects unregistered LP locks and zero amount locks", async () => {
    const { owner, alice, locker, lpToken } = await deployLockerFixture();
    const lpTokenAddress = await lpToken.getAddress();

    await expect(locker.connect(alice).lock(lpTokenAddress, 1n)).to.be.revertedWithCustomError(
      locker,
      "LpTokenNotRegistered"
    );

    await locker.connect(owner).registerLpToken(lpTokenAddress);
    await expect(locker.connect(alice).lock(lpTokenAddress, 0n)).to.be.revertedWithCustomError(locker, "ZeroAmount");
  });

  it("does not expose withdrawal or arbitrary approval escape functions", async () => {
    const { locker } = await deployLockerFixture();

    expect((locker as any).withdraw).to.equal(undefined);
    expect((locker as any).withdrawLp).to.equal(undefined);
    expect((locker as any).approve).to.equal(undefined);
    expect((locker as any).approveSpender).to.equal(undefined);
    expect((locker as any).transferOwnership).to.equal(undefined);
  });

  it("blocks admin recovery of registered LP but allows unrelated token recovery", async () => {
    const { owner, bob, locker, lpToken, unrelatedToken } = await deployLockerFixture();
    const lpAmount = ethers.parseEther("1");
    const unrelatedAmount = ethers.parseEther("2");

    await locker.connect(owner).registerLpToken(await lpToken.getAddress());

    await expect(
      locker.connect(owner).recoverUnregisteredToken(await lpToken.getAddress(), await owner.getAddress(), lpAmount)
    ).to.be.revertedWithCustomError(locker, "RegisteredLpRecoveryBlocked");

    await expect(
      locker.connect(bob).recoverUnregisteredToken(await unrelatedToken.getAddress(), await bob.getAddress(), unrelatedAmount)
    ).to.be.revertedWithCustomError(locker, "OnlyAdmin");

    await expect(locker.connect(owner).recoverUnregisteredToken(await unrelatedToken.getAddress(), await bob.getAddress(), unrelatedAmount))
      .to.emit(locker, "UnregisteredTokenRecovered")
      .withArgs(await unrelatedToken.getAddress(), await bob.getAddress(), unrelatedAmount);
    expect(await unrelatedToken.balanceOf(await bob.getAddress())).to.equal(unrelatedAmount);
  });
});
