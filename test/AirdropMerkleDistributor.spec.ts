import { expect } from "chai";
import { ethers, network } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

function buildTree(entries: Array<[number, string, bigint]>) {
  return StandardMerkleTree.of(
    entries.map(([index, account, amount]) => [index, account, amount.toString()]),
    ["uint256", "address", "uint256"],
  );
}

describe("AirdropMerkleDistributor", function () {
  async function fixture() {
    const [owner, alice, bob, recovery] = await ethers.getSigners();
    const Distributor = await ethers.getContractFactory("AirdropMerkleDistributor");
    const distributor = await Distributor.deploy(owner.address);
    await distributor.waitForDeployment();

    const entries: Array<[number, string, bigint]> = [
      [0, alice.address, ethers.parseEther("1")],
      [1, bob.address, ethers.parseEther("2")],
    ];
    const tree = buildTree(entries);
    const totalAmount = entries.reduce((sum, [, , amount]) => sum + amount, 0n);

    return { owner, alice, bob, recovery, distributor, entries, tree, totalAmount };
  }

  it("allows a valid claim once", async function () {
    const { distributor, alice, entries, tree, totalAmount } = await fixture();
    await distributor.createEpoch(1, tree.root, totalAmount, 0, { value: totalAmount });

    const proof = tree.getProof([entries[0][0], entries[0][1], entries[0][2].toString()]);
    await expect(distributor.connect(alice).claim(1, 0, alice.address, entries[0][2], proof))
      .to.emit(distributor, "Claimed")
      .withArgs(1, 0, alice.address, entries[0][2]);

    expect(await distributor.hasClaimed(1, 0)).to.equal(true);
    await expect(distributor.connect(alice).claim(1, 0, alice.address, entries[0][2], proof))
      .to.be.revertedWithCustomError(distributor, "AlreadyClaimed");
  });

  it("rejects invalid proofs", async function () {
    const { distributor, alice, bob, entries, tree, totalAmount } = await fixture();
    await distributor.createEpoch(2, tree.root, totalAmount, 0, { value: totalAmount });

    const proof = tree.getProof([entries[0][0], entries[0][1], entries[0][2].toString()]);
    await expect(distributor.connect(bob).claim(2, 0, bob.address, entries[0][2], proof))
      .to.be.revertedWithCustomError(distributor, "InvalidProof");
  });

  it("blocks claims while paused", async function () {
    const { distributor, alice, entries, tree, totalAmount } = await fixture();
    await distributor.createEpoch(3, tree.root, totalAmount, 0, { value: totalAmount });
    await distributor.pause();

    const proof = tree.getProof([entries[0][0], entries[0][1], entries[0][2].toString()]);
    await expect(distributor.connect(alice).claim(3, 0, alice.address, entries[0][2], proof))
      .to.be.revertedWithCustomError(distributor, "EnforcedPause");
  });

  it("recovers unclaimed BNB after expiry", async function () {
    const { distributor, recovery, tree, totalAmount } = await fixture();
    const latest = await ethers.provider.getBlock("latest");
    const expiresAt = Number(latest?.timestamp || 0) + 10;
    await distributor.createEpoch(4, tree.root, totalAmount, expiresAt, { value: totalAmount });

    await network.provider.send("evm_setNextBlockTimestamp", [expiresAt + 1]);
    await network.provider.send("evm_mine");

    await expect(distributor.recoverUnclaimed(4, recovery.address))
      .to.emit(distributor, "UnclaimedRecovered")
      .withArgs(4, recovery.address, totalAmount);
  });
});
