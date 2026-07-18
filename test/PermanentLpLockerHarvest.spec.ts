import { expect } from "chai";
import { ethers } from "hardhat";

async function deployLaunchToken(name: string, symbol: string, owner: any) {
  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy(name, symbol, ethers.parseEther("1000000"), await owner.getAddress());
  await token.waitForDeployment();
  await token.mint(await owner.getAddress(), ethers.parseEther("100000"));
  await token.enableTrading();
  return token;
}

describe("PermanentLpLocker Topaz fee harvest", function () {
  it("claims both Topaz fee assets, splits them 80/20, and preserves LP principal", async () => {
    const [owner, creator, creatorFeeRecipient, campaign, protocolRevenueVault] = await ethers.getSigners();

    const token = await deployLaunchToken("Launch Token", "LAUNCH", owner);
    const wbnb = await deployLaunchToken("Wrapped BNB", "WBNB", owner);

    const Factory = await ethers.getContractFactory("MockTopazFactory");
    const topazFactory = await Factory.deploy();
    await topazFactory.waitForDeployment();

    const Locker = await ethers.getContractFactory("PermanentLpLocker");
    const locker = await Locker.deploy(await owner.getAddress());
    await locker.waitForDeployment();

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const treasuryRouter = await TreasuryRouter.deploy(await owner.getAddress(), await owner.getAddress(), 3600);
    await treasuryRouter.waitForDeployment();
    await treasuryRouter.setProtocolRevenueVault(await protocolRevenueVault.getAddress());
    await treasuryRouter.setPermanentLpLocker(await locker.getAddress());

    await locker.configureRevenue(await treasuryRouter.getAddress(), await topazFactory.getAddress());

    const tokenAddress = await token.getAddress();
    const wbnbAddress = await wbnb.getAddress();
    const poolAddress = await topazFactory.createPool.staticCall(tokenAddress, wbnbAddress, false);
    await topazFactory.createPool(tokenAddress, wbnbAddress, false);
    const pool = await ethers.getContractAt("MockTopazPool", poolAddress);

    const lockedLp = ethers.parseEther("10");
    await pool.mint(await locker.getAddress(), lockedLp);

    await locker.registerGraduatedPool(
      await campaign.getAddress(),
      await creator.getAddress(),
      await creatorFeeRecipient.getAddress(),
      poolAddress,
      tokenAddress,
      wbnbAddress,
      lockedLp
    );

    const feeToken = ethers.parseEther("100");
    const feeWbnb = ethers.parseEther("5");
    await token.approve(poolAddress, feeToken);
    await wbnb.approve(poolAddress, feeWbnb);
    await pool.fundFees(await locker.getAddress(), feeToken, feeWbnb);

    const creatorTokenBefore = await token.balanceOf(await creatorFeeRecipient.getAddress());
    const creatorWbnbBefore = await wbnb.balanceOf(await creatorFeeRecipient.getAddress());
    const protocolTokenBefore = await token.balanceOf(await protocolRevenueVault.getAddress());
    const protocolWbnbBefore = await wbnb.balanceOf(await protocolRevenueVault.getAddress());
    const lpBefore = await pool.balanceOf(await locker.getAddress());

    await expect(locker.harvest(poolAddress)).to.emit(locker, "FeesHarvested");

    const expectedCreatorToken = (feeToken * 8000n) / 10000n;
    const expectedProtocolToken = feeToken - expectedCreatorToken;
    const expectedCreatorWbnb = (feeWbnb * 8000n) / 10000n;
    const expectedProtocolWbnb = feeWbnb - expectedCreatorWbnb;

    expect(await token.balanceOf(await creatorFeeRecipient.getAddress()) - creatorTokenBefore).to.equal(expectedCreatorToken);
    expect(await token.balanceOf(await protocolRevenueVault.getAddress()) - protocolTokenBefore).to.equal(expectedProtocolToken);
    expect(await wbnb.balanceOf(await creatorFeeRecipient.getAddress()) - creatorWbnbBefore).to.equal(expectedCreatorWbnb);
    expect(await wbnb.balanceOf(await protocolRevenueVault.getAddress()) - protocolWbnbBefore).to.equal(expectedProtocolWbnb);

    expect(await pool.balanceOf(await locker.getAddress())).to.equal(lpBefore);
    expect(await locker.lockedBalance(poolAddress)).to.equal(lockedLp);
    expect(await token.balanceOf(await locker.getAddress())).to.equal(0n);
    expect(await wbnb.balanceOf(await locker.getAddress())).to.equal(0n);
    expect(await locker.cumulativeCreatorPaid(poolAddress, tokenAddress)).to.equal(expectedCreatorToken);
    expect(await locker.cumulativeProtocolRouted(poolAddress, tokenAddress)).to.equal(expectedProtocolToken);
    expect(await locker.cumulativeCreatorPaid(poolAddress, wbnbAddress)).to.equal(expectedCreatorWbnb);
    expect(await locker.cumulativeProtocolRouted(poolAddress, wbnbAddress)).to.equal(expectedProtocolWbnb);
  });
});
