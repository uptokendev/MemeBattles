import { expect } from "chai";
import { ethers } from "hardhat";

const NATIVE = ethers.ZeroAddress;
const META = ethers.id("rank-week-1");

async function deployFixture() {
  const [owner, feeReceiver, campaign, voter, other] = await ethers.getSigners();
  const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
  const treasury = await UPVoteTreasury.deploy(await owner.getAddress(), await feeReceiver.getAddress());
  await treasury.waitForDeployment();
  return { treasury, owner, feeReceiver, campaign, voter, other };
}

async function deployMockToken(holder: string, supply = ethers.parseEther("1000")) {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("Mock Vote", "MVOTE", supply, holder);
  await token.waitForDeployment();
  return token;
}

describe("UPVoteTreasury", function () {
  it("initializes owner, fee receiver, and native voting asset", async () => {
    const { treasury, owner, feeReceiver } = await deployFixture();
    const nativeConfig = await treasury.assetConfig(NATIVE);

    expect(await treasury.owner()).to.eq(await owner.getAddress());
    expect(await treasury.feeReceiver()).to.eq(await feeReceiver.getAddress());
    expect(nativeConfig.enabled).to.eq(true);
    expect(nativeConfig.minAmount).to.eq(0n);
  });

  it("validates constructor and owner-only configuration", async () => {
    const { treasury, owner, other } = await deployFixture();
    const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
    const otherAddress = await other.getAddress();

    await expect(UPVoteTreasury.deploy(ethers.ZeroAddress, otherAddress)).to.be.revertedWith("OWNER_ZERO");
    await expect(UPVoteTreasury.deploy(await owner.getAddress(), ethers.ZeroAddress)).to.be.revertedWith(
      "FEE_RECEIVER_ZERO"
    );

    await expect(treasury.connect(other).setAsset(NATIVE, false, 1n)).to.be.revertedWith("NOT_OWNER");
    await expect(treasury.connect(other).setFeeReceiver(otherAddress)).to.be.revertedWith("NOT_OWNER");
    await expect(treasury.connect(owner).setFeeReceiver(ethers.ZeroAddress)).to.be.revertedWith("FEE_RECEIVER_ZERO");

    await expect(treasury.connect(owner).setFeeReceiver(otherAddress))
      .to.emit(treasury, "FeeReceiverUpdated")
      .withArgs(await treasury.feeReceiver(), otherAddress);
    expect(await treasury.feeReceiver()).to.eq(otherAddress);
  });

  it("casts a native BNB vote and forwards payment immediately", async () => {
    const { treasury, feeReceiver, campaign, voter } = await deployFixture();
    const campaignAddress = await campaign.getAddress();
    const amount = ethers.parseEther("0.02");

    await expect(() => treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: amount })).to.changeEtherBalances(
      [treasury, feeReceiver, voter],
      [0n, amount, -amount]
    );
    await expect(treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: amount }))
      .to.emit(treasury, "VoteCast")
      .withArgs(campaignAddress, await voter.getAddress(), NATIVE, amount, META);
  });

  it("enforces native asset configuration and campaign validation", async () => {
    const { treasury, owner, campaign, voter } = await deployFixture();
    const campaignAddress = await campaign.getAddress();
    const minAmount = ethers.parseEther("0.05");

    await expect(treasury.connect(voter).voteWithBNB(ethers.ZeroAddress, META, { value: minAmount })).to.be.revertedWith(
      "CAMPAIGN_ZERO"
    );

    await treasury.connect(owner).setAsset(NATIVE, true, minAmount);
    await expect(treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: minAmount - 1n })).to.be.revertedWith(
      "AMOUNT_TOO_LOW"
    );

    await treasury.connect(owner).setAsset(NATIVE, false, minAmount);
    await expect(treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: minAmount })).to.be.revertedWith(
      "ASSET_DISABLED"
    );
  });

  it("enforces the optional campaign allowlist", async () => {
    const { treasury, owner, campaign, voter, other } = await deployFixture();
    const campaignAddress = await campaign.getAddress();
    const otherCampaignAddress = await other.getAddress();

    await expect(treasury.connect(owner).setCampaignAllowlistEnabled(true))
      .to.emit(treasury, "CampaignAllowlistToggled")
      .withArgs(true);
    await expect(treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: 1n })).to.be.revertedWith(
      "CAMPAIGN_NOT_ALLOWED"
    );

    await expect(treasury.connect(owner).setCampaignAllowed(campaignAddress, true))
      .to.emit(treasury, "CampaignAllowed")
      .withArgs(campaignAddress, true);
    await treasury.connect(voter).voteWithBNB(campaignAddress, META, { value: 1n });
    await expect(treasury.connect(voter).voteWithBNB(otherCampaignAddress, META, { value: 1n })).to.be.revertedWith(
      "CAMPAIGN_NOT_ALLOWED"
    );
  });

  it("reverts native votes when the fee receiver rejects BNB", async () => {
    const [owner, campaign, voter] = await ethers.getSigners();
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const rejectingReceiver = await RevertingReceiver.deploy();
    await rejectingReceiver.waitForDeployment();

    const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
    const treasury = await UPVoteTreasury.deploy(await owner.getAddress(), await rejectingReceiver.getAddress());
    await treasury.waitForDeployment();

    await expect(treasury.connect(voter).voteWithBNB(await campaign.getAddress(), META, { value: 1n })).to.be.revertedWith(
      "FEE_FORWARD_BNB_FAILED"
    );
    expect(await ethers.provider.getBalance(await treasury.getAddress())).to.eq(0n);
  });

  it("casts an ERC20 vote and forwards tokens immediately", async () => {
    const { treasury, owner, feeReceiver, campaign, voter } = await deployFixture();
    const amount = ethers.parseEther("25");
    const token = await deployMockToken(await voter.getAddress());
    const tokenAddress = await token.getAddress();
    const treasuryAddress = await treasury.getAddress();

    await treasury.connect(owner).setAsset(tokenAddress, true, amount);
    await token.connect(voter).approve(treasuryAddress, amount);

    await expect(treasury.connect(voter).voteWithToken(await campaign.getAddress(), tokenAddress, amount, META))
      .to.emit(treasury, "VoteCast")
      .withArgs(await campaign.getAddress(), await voter.getAddress(), tokenAddress, amount, META);
    expect(await token.balanceOf(await feeReceiver.getAddress())).to.eq(amount);
    expect(await token.balanceOf(treasuryAddress)).to.eq(0n);
  });

  it("measures fee-on-transfer token receipts before enforcing the minimum", async () => {
    const { treasury, owner, feeReceiver, campaign, voter } = await deployFixture();
    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    const token = await FeeToken.deploy(1000);
    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const treasuryAddress = await treasury.getAddress();
    const amount = ethers.parseEther("100");
    const receivedByTreasury = ethers.parseEther("90");
    const receivedByFeeReceiver = ethers.parseEther("81");

    await token.mint(await voter.getAddress(), amount);
    await treasury.connect(owner).setAsset(tokenAddress, true, receivedByTreasury);
    await token.connect(voter).approve(treasuryAddress, amount);

    await expect(treasury.connect(voter).voteWithToken(await campaign.getAddress(), tokenAddress, amount, META))
      .to.emit(treasury, "VoteCast")
      .withArgs(await campaign.getAddress(), await voter.getAddress(), tokenAddress, receivedByTreasury, META);
    expect(await token.balanceOf(await feeReceiver.getAddress())).to.eq(receivedByFeeReceiver);
    expect(await token.balanceOf(treasuryAddress)).to.eq(0n);
  });

  it("rejects malformed or disabled token votes", async () => {
    const { treasury, owner, campaign, voter } = await deployFixture();
    const amount = ethers.parseEther("10");
    const token = await deployMockToken(await voter.getAddress());
    const tokenAddress = await token.getAddress();

    await expect(treasury.connect(voter).voteWithToken(await campaign.getAddress(), ethers.ZeroAddress, amount, META)).to.be.revertedWith(
      "TOKEN_ZERO"
    );
    await expect(treasury.connect(voter).voteWithToken(await campaign.getAddress(), tokenAddress, 0n, META)).to.be.revertedWith(
      "ASSET_DISABLED"
    );

    await treasury.connect(owner).setAsset(tokenAddress, true, amount + 1n);
    await token.connect(voter).approve(await treasury.getAddress(), amount);
    await expect(treasury.connect(voter).voteWithToken(await campaign.getAddress(), tokenAddress, amount, META)).to.be.revertedWith(
      "AMOUNT_TOO_LOW"
    );
  });

  it("rescues accidentally sent native funds and tokens", async () => {
    const { treasury, owner, voter, other } = await deployFixture();
    const token = await deployMockToken(await voter.getAddress());
    const treasuryAddress = await treasury.getAddress();
    const nativeAmount = ethers.parseEther("0.1");
    const tokenAmount = ethers.parseEther("3");
    const otherAddress = await other.getAddress();

    await voter.sendTransaction({ to: treasuryAddress, value: nativeAmount });
    await token.connect(voter).transfer(treasuryAddress, tokenAmount);

    await expect(() => treasury.connect(owner).rescueBNB(otherAddress, nativeAmount)).to.changeEtherBalances(
      [treasury, other],
      [-nativeAmount, nativeAmount]
    );
    await expect(treasury.connect(owner).rescueToken(await token.getAddress(), otherAddress, tokenAmount))
      .to.emit(treasury, "Rescue")
      .withArgs(await token.getAddress(), otherAddress, tokenAmount);
    expect(await token.balanceOf(otherAddress)).to.eq(tokenAmount);
  });

  it("validates rescue permissions and parameters", async () => {
    const { treasury, owner, voter, other } = await deployFixture();
    const token = await deployMockToken(await voter.getAddress());
    const treasuryAddress = await treasury.getAddress();
    const tokenAddress = await token.getAddress();

    await expect(treasury.connect(other).rescueBNB(await other.getAddress(), 1n)).to.be.revertedWith("NOT_OWNER");
    await expect(treasury.connect(owner).rescueBNB(ethers.ZeroAddress, 1n)).to.be.revertedWith("TO_ZERO");
    await expect(treasury.connect(owner).rescueBNB(await other.getAddress(), 1n)).to.be.revertedWith("INSUFFICIENT_BNB");

    await token.connect(voter).transfer(treasuryAddress, 1n);
    await expect(treasury.connect(other).rescueToken(tokenAddress, await other.getAddress(), 1n)).to.be.revertedWith("NOT_OWNER");
    await expect(treasury.connect(owner).rescueToken(ethers.ZeroAddress, await other.getAddress(), 1n)).to.be.revertedWith(
      "TOKEN_ZERO"
    );
    await expect(treasury.connect(owner).rescueToken(tokenAddress, ethers.ZeroAddress, 1n)).to.be.revertedWith("TO_ZERO");
  });
});
