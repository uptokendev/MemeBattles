import { expect } from "chai";
import { ethers } from "hardhat";

async function deployFixture() {
  const [owner, newOwner, alice, bob, spender] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("LaunchToken");
  const cap = ethers.parseEther("100");
  const token = await Token.deploy("Launch Edge", "LEDGE", cap, await owner.getAddress());
  await token.waitForDeployment();
  return { token, cap, owner, newOwner, alice, bob, spender };
}

describe("LaunchToken edge cases", function () {
  it("exposes standard metadata and 18 decimals", async () => {
    const { token } = await deployFixture();

    expect(await token.name()).to.eq("Launch Edge");
    expect(await token.symbol()).to.eq("LEDGE");
    expect(await token.decimals()).to.eq(18n);
  });

  it("allows minting exactly to the immutable cap and rejects any additional supply", async () => {
    const { token, cap, owner, alice } = await deployFixture();

    await expect(token.connect(owner).mint(await alice.getAddress(), cap))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, await alice.getAddress(), cap);
    expect(await token.totalSupply()).to.eq(cap);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(cap);

    await expect(token.connect(owner).mint(await owner.getAddress(), 1n)).to.be.revertedWith("cap exceeded");
  });

  it("blocks user transfers to the owner before trading is enabled", async () => {
    const { token, owner, alice } = await deployFixture();
    const amount = ethers.parseEther("1");

    await token.connect(owner).mint(await alice.getAddress(), amount);
    await expect(token.connect(alice).transfer(await owner.getAddress(), amount)).to.be.revertedWithCustomError(
      token,
      "TradingNotEnabled"
    );
  });

  it("lets the current owner burn user balances before trading is enabled", async () => {
    const { token, owner, alice } = await deployFixture();
    const amount = ethers.parseEther("5");
    const burnAmount = ethers.parseEther("2");

    await token.connect(owner).mint(await alice.getAddress(), amount);
    await expect(token.connect(owner).burn(await alice.getAddress(), burnAmount))
      .to.emit(token, "Transfer")
      .withArgs(await alice.getAddress(), ethers.ZeroAddress, burnAmount);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(amount - burnAmount);
    expect(await token.totalSupply()).to.eq(amount - burnAmount);
  });

  it("moves the pre-trading privileged controller when ownership transfers", async () => {
    const { token, owner, newOwner, alice, bob } = await deployFixture();
    const amount = ethers.parseEther("4");
    const transferAmount = ethers.parseEther("1");

    await token.connect(owner).mint(await alice.getAddress(), amount);
    await token.connect(owner).transferOwnership(await newOwner.getAddress());
    expect(await token.owner()).to.eq(await newOwner.getAddress());

    await expect(token.connect(owner).enableTrading()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(token.connect(owner).mint(await owner.getAddress(), 1n)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount"
    );

    await token.connect(alice).approve(await newOwner.getAddress(), transferAmount);
    await token.connect(newOwner).transferFrom(await alice.getAddress(), await bob.getAddress(), transferAmount);
    expect(await token.balanceOf(await bob.getAddress())).to.eq(transferAmount);

    await expect(token.connect(owner).transferFrom(await alice.getAddress(), await bob.getAddress(), 1n)).to.be.revertedWithCustomError(
      token,
      "TradingNotEnabled"
    );
  });

  it("preserves approvals when blocked pre-trading transfers revert", async () => {
    const { token, owner, alice, bob, spender } = await deployFixture();
    const allowance = ethers.parseEther("2");

    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("3"));
    await token.connect(alice).approve(await spender.getAddress(), allowance);

    await expect(token.connect(spender).transferFrom(await alice.getAddress(), await bob.getAddress(), 1n)).to.be.revertedWithCustomError(
      token,
      "TradingNotEnabled"
    );
    expect(await token.allowance(await alice.getAddress(), await spender.getAddress())).to.eq(allowance);
    expect(await token.balanceOf(await alice.getAddress())).to.eq(ethers.parseEther("3"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(0n);
  });
});
