import { expect } from "chai";
import { ethers } from "hardhat";

function leafFor(account: string, amount: bigint) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, amount]);
  return ethers.keccak256(ethers.concat([ethers.keccak256(encoded)]));
}

describe("RewardDistributor", function () {
  async function deployFixture() {
    const [owner, user, other, recovery] = await ethers.getSigners();
    const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
    const distributor = await RewardDistributor.deploy(await owner.getAddress());
    return { distributor, owner, user, other, recovery };
  }

  it("lets a wallet claim its BNB reward once", async () => {
    const { distributor, owner, user } = await deployFixture();
    const amount = ethers.parseEther("0.25");
    const batchId = ethers.id("airdrop-week-1");
    const root = leafFor(await user.getAddress(), amount);

    await distributor.connect(owner).createBatch(batchId, root, 0, { value: amount });

    await expect(() => distributor.connect(user).claim(batchId, amount, [])).to.changeEtherBalances(
      [distributor, user],
      [-amount, amount],
    );
    expect(await distributor.hasClaimed(batchId, await user.getAddress())).to.eq(true);

    await expect(distributor.connect(user).claim(batchId, amount, [])).to.be.revertedWithCustomError(
      distributor,
      "AlreadyClaimed",
    );
  });

  it("rejects invalid proofs", async () => {
    const { distributor, owner, user, other } = await deployFixture();
    const amount = ethers.parseEther("0.1");
    const batchId = ethers.id("airdrop-week-2");
    const root = leafFor(await user.getAddress(), amount);

    await distributor.connect(owner).createBatch(batchId, root, 0, { value: amount });

    await expect(distributor.connect(other).claim(batchId, amount, [])).to.be.revertedWithCustomError(
      distributor,
      "InvalidProof",
    );
  });

  it("blocks claims when paused", async () => {
    const { distributor, owner, user } = await deployFixture();
    const amount = ethers.parseEther("0.1");
    const batchId = ethers.id("airdrop-week-3");
    const root = leafFor(await user.getAddress(), amount);

    await distributor.connect(owner).createBatch(batchId, root, 0, { value: amount });
    await distributor.connect(owner).setBatchPaused(batchId, true);

    await expect(distributor.connect(user).claim(batchId, amount, [])).to.be.revertedWithCustomError(
      distributor,
      "BatchPaused",
    );
  });

  it("recovers unclaimed BNB after the deadline", async () => {
    const { distributor, owner, user, recovery } = await deployFixture();
    const amount = ethers.parseEther("0.5");
    const batchId = ethers.id("airdrop-week-4");
    const root = leafFor(await user.getAddress(), amount);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    await distributor.connect(owner).createBatch(batchId, root, now + 60, { value: amount });

    await expect(distributor.connect(owner).recoverUnclaimed(batchId, await recovery.getAddress())).to.be.revertedWithCustomError(
      distributor,
      "BatchStillOpen",
    );

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(() => distributor.connect(owner).recoverUnclaimed(batchId, await recovery.getAddress())).to.changeEtherBalances(
      [distributor, recovery],
      [-amount, amount],
    );
    expect(await distributor.unclaimed(batchId)).to.eq(0n);
  });
});
