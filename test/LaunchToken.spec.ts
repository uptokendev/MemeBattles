import { expect } from "chai";
import { ethers } from "hardhat";

describe("LaunchToken", function () {
  async function deploy() {
    const [owner, alice, bob, spender] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("LaunchToken");
    const token = await Token.deploy("T", "T", ethers.parseEther("100"), await owner.getAddress());
    return { owner, alice, bob, spender, token };
  }

  it("constructor sets cap and owner; rejects zero cap/owner", async () => {
    const [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("LaunchToken");
    await expect(Token.deploy("T", "T", 0n, await owner.getAddress())).to.be.revertedWith("cap is zero");
    // OZ Ownable(owner_) reverts with a custom error before our own require() runs.
    await expect(Token.deploy("T", "T", 1n, ethers.ZeroAddress)).to.be.reverted;

    const token = await Token.deploy("T", "T", 123n, await owner.getAddress());
    expect(await token.cap()).to.eq(123n);
    expect(await token.owner()).to.eq(await owner.getAddress());
    expect(await token.tradingEnabled()).to.eq(false);
  });

  it("mint: onlyOwner, nonzero to, respects cap", async () => {
    const { owner, alice, token } = await deploy();
    await expect(token.connect(alice).mint(await alice.getAddress(), 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

    await expect(token.connect(owner).mint(ethers.ZeroAddress, 1n)).to.be.revertedWith("to zero");

    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("10"));
    expect(await token.totalSupply()).to.eq(ethers.parseEther("10"));

    await expect(token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("100")))
      .to.be.revertedWith("cap exceeded");
  });

  it("burn: onlyOwner and respects ERC20 burn balance checks", async () => {
    const { owner, alice, token } = await deploy();
    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("10"));
    await expect(token.connect(alice).burn(await alice.getAddress(), 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

    await expect(token.connect(owner).burn(await alice.getAddress(), ethers.parseEther("11"))).to.be.revertedWithCustomError(
      token,
      "ERC20InsufficientBalance"
    );

    await token.connect(owner).burn(await alice.getAddress(), ethers.parseEther("2"));
    expect(await token.balanceOf(await alice.getAddress())).to.eq(ethers.parseEther("8"));
    expect(await token.totalSupply()).to.eq(ethers.parseEther("8"));
  });

  it("trading restriction: before enableTrading, user->user transfers revert; campaign(owner) can move funds and pull via transferFrom", async () => {
    const { owner, alice, bob, token } = await deploy();

    // owner mints to alice (allowed: from==0)
    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("10"));

    // alice -> bob transfer blocked
    await expect(token.connect(alice).transfer(await bob.getAddress(), 1n))
      .to.be.revertedWithCustomError(token, "TradingNotEnabled");

    // alice approves owner (campaign), owner can move tokens even when 'from' is alice
    await token.connect(alice).approve(await owner.getAddress(), ethers.parseEther("2"));

    // owner pulls 1 token to itself (msg.sender==owner) allowed
    await token.connect(owner).transferFrom(await alice.getAddress(), await owner.getAddress(), ethers.parseEther("1"));
    expect(await token.balanceOf(await owner.getAddress())).to.eq(ethers.parseEther("1"));

    // owner transfers from its own balance to bob (from==owner) allowed
    await token.connect(owner).transfer(await bob.getAddress(), ethers.parseEther("1"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(ethers.parseEther("1"));
  });

  it("pre-trading allowance does not let a non-owner spender bypass transfer restrictions", async () => {
    const { owner, alice, bob, spender, token } = await deploy();

    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("5"));
    await token.connect(alice).approve(await spender.getAddress(), ethers.parseEther("2"));

    await expect(
      token.connect(spender).transferFrom(await alice.getAddress(), await bob.getAddress(), ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(token, "TradingNotEnabled");

    expect(await token.allowance(await alice.getAddress(), await spender.getAddress())).to.eq(ethers.parseEther("2"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(0n);
  });

  it("enableTrading is onlyOwner and idempotent", async () => {
    const { owner, alice, token } = await deploy();

    await expect(token.connect(alice).enableTrading()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await token.connect(owner).enableTrading();
    expect(await token.tradingEnabled()).to.eq(true);

    await token.connect(owner).enableTrading();
    expect(await token.tradingEnabled()).to.eq(true);
  });

  it("after enableTrading, normal transfers and transferFrom work", async () => {
    const { owner, alice, bob, spender, token } = await deploy();
    await token.connect(owner).mint(await alice.getAddress(), ethers.parseEther("3"));
    await token.connect(owner).enableTrading();

    await token.connect(alice).transfer(await bob.getAddress(), ethers.parseEther("1"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(ethers.parseEther("1"));

    await token.connect(alice).approve(await spender.getAddress(), ethers.parseEther("1"));
    await token.connect(spender).transferFrom(await alice.getAddress(), await bob.getAddress(), ethers.parseEther("1"));
    expect(await token.balanceOf(await bob.getAddress())).to.eq(ethers.parseEther("2"));
    expect(await token.allowance(await alice.getAddress(), await spender.getAddress())).to.eq(0n);
  });
});
