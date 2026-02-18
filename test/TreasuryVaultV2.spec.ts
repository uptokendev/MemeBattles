import { expect } from "chai";
import { ethers } from "hardhat";

function hexToBigInt(h: string) {
  return BigInt(h);
}

function hashPair(a: string, b: string) {
  // OZ MerkleProof uses commutativeKeccak256 (sorted pair)
  const [x, y] = hexToBigInt(a) < hexToBigInt(b) ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([x, y]));
}

function buildMerkleRootAndProof(leaves: string[], index: number) {
  if (leaves.length < 2) throw new Error("need >=2 leaves");
  // Only used in tests with small N (2..5). Simple iterative build.
  let level = leaves.slice();
  const proof: string[] = [];
  let idx = index;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));

      if (i === idx || i + 1 === idx) {
        const sib = i === idx ? right : left;
        if (sib !== level[idx]) proof.push(sib);
        idx = Math.floor(i / 2);
      }
    }
    level = next;
  }
  return { root: level[0], proof };
}

describe("TreasuryVaultV2", function () {
  async function deploy() {
    const [multisig, operator, rootPoster, alice, bob] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("TreasuryVaultV2");
    const vault = await Vault.deploy(
      await multisig.getAddress(),
      await operator.getAddress(),
      await rootPoster.getAddress()
    );
    return { vault, multisig, operator, rootPoster, alice, bob };
  }

  it("constructor sets multisig/operator and accepts deposits", async () => {
    const { vault, multisig, operator, rootPoster } = await deploy();
    expect(await vault.multisig()).to.eq(await multisig.getAddress());
    expect(await vault.operator()).to.eq(await operator.getAddress());
    expect(await vault.rootPoster()).to.eq(await rootPoster.getAddress());

    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(ethers.parseEther("1"));
  });

  it("only multisig can admin: setOperator/setCaps/pause and withdraw", async () => {
    const { vault, multisig, operator, alice } = await deploy();

    await expect(vault.connect(alice).setOperator(await alice.getAddress())).to.be.revertedWith("not multisig");
    await expect(vault.connect(operator).setCaps(1n, 2n)).to.be.revertedWith("not multisig");
    await expect(vault.connect(alice).setPayoutsPaused(true)).to.be.revertedWith("not multisig");

    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await expect(vault.connect(alice).withdraw(await alice.getAddress(), 1n)).to.be.revertedWith("not multisig");

    await expect(vault.connect(multisig).setCaps(123n, 456n)).to.emit(vault, "CapsUpdated");
    expect(await vault.maxPayoutPerTx()).to.eq(123n);
    expect(await vault.dailyPayoutCap()).to.eq(456n);

    await expect(vault.connect(multisig).setPayoutsPaused(true)).to.emit(vault, "PayoutsPaused");
    expect(await vault.payoutsPaused()).to.eq(true);

    await expect(vault.connect(multisig).withdraw(await alice.getAddress(), ethers.parseEther("0.25"))).to.emit(
      vault,
      "Withdraw"
    );
  });

  it("only operator can payout", async () => {
    const { vault, operator, alice, bob } = await deploy();
    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await expect(vault.connect(alice).payout(await bob.getAddress(), 1n)).to.be.revertedWith("not operator");
  });

  it("payout respects pause", async () => {
    const { vault, multisig, operator, bob } = await deploy();
    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await vault.connect(multisig).setPayoutsPaused(true);
    await expect(vault.connect(operator).payout(await bob.getAddress(), 1n)).to.be.revertedWith("payouts paused");
  });

  it("payout respects maxPayoutPerTx", async () => {
    const { vault, multisig, operator, bob } = await deploy();
    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("2") });
    await vault.connect(multisig).setCaps(ethers.parseEther("0.5"), 0);
    await expect(vault.connect(operator).payout(await bob.getAddress(), ethers.parseEther("0.6"))).to.be.revertedWith(
      "maxPayoutPerTx"
    );
    await expect(vault.connect(operator).payout(await bob.getAddress(), ethers.parseEther("0.5"))).to.emit(
      vault,
      "Payout"
    );
  });

  it("payout respects dailyPayoutCap and resets on new day", async () => {
    const { vault, multisig, operator, alice } = await deploy();
    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });
    await vault.connect(multisig).setCaps(0, ethers.parseEther("1"));

    await vault.connect(operator).payout(await alice.getAddress(), ethers.parseEther("0.6"));
    await expect(vault.connect(operator).payout(await alice.getAddress(), ethers.parseEther("0.5"))).to.be.revertedWith(
      "dailyPayoutCap"
    );

    // Move time forward by > 1 day to reset the cap
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 5]);
    await ethers.provider.send("evm_mine", []);

    await expect(vault.connect(operator).payout(await alice.getAddress(), ethers.parseEther("1"))).to.emit(
      vault,
      "Payout"
    );
  });

  it("rootPoster can set epoch root once; others cannot", async () => {
    const { vault, multisig, rootPoster, alice } = await deploy();
    const epochId = 123n;
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));

    await expect(vault.connect(alice).setEpochRoot(epochId, root, 100n)).to.be.revertedWith("not rootPoster");
    await expect(vault.connect(rootPoster).setEpochRoot(epochId, root, 100n)).to.emit(vault, "EpochRootSet");
    // immutable once set
    await expect(vault.connect(rootPoster).setEpochRoot(epochId, root, 100n)).to.be.revertedWith("root already set");
    // multisig can also set (but only if not set yet)
    const epochId2 = 124n;
    await expect(vault.connect(multisig).setEpochRoot(epochId2, root, 100n)).to.emit(vault, "EpochRootSet");
  });

  it("claim verifies Merkle proof, enforces epochTotal and marks claimed", async () => {
    const { vault, multisig, operator, rootPoster, alice, bob } = await deploy();

    // fund vault
    await operator.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });

    const epochId = 999n;
    const category = ethers.keccak256(ethers.toUtf8Bytes("biggest_hit"));
    const rankAlice = 1;
    const rankBob = 2;
    const amountAlice = ethers.parseEther("0.2");
    const amountBob = ethers.parseEther("0.1");
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();

    const leafAlice = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "uint8", "address", "uint256"],
        [epochId, category, rankAlice, aliceAddr, amountAlice]
      )
    );
    const leafBob = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "uint8", "address", "uint256"],
        [epochId, category, rankBob, bobAddr, amountBob]
      )
    );

    const leaves = [leafAlice, leafBob];
    const { root, proof: proofAlice } = buildMerkleRootAndProof(leaves, 0);
    const { proof: proofBob } = buildMerkleRootAndProof(leaves, 1);

    // cap epoch total to 0.3 and set root
    await vault.connect(multisig).setClaimCaps(0, ethers.parseEther("0.5"));
    await vault.connect(rootPoster).setEpochRoot(epochId, root, ethers.parseEther("0.3"));

    // alice claims
    await expect(
      vault.connect(alice).claim(epochId, category, rankAlice, aliceAddr, amountAlice, proofAlice)
    ).to.emit(vault, "Claimed");

    // double-claim blocked
    await expect(
      vault.connect(alice).claim(epochId, category, rankAlice, aliceAddr, amountAlice, proofAlice)
    ).to.be.revertedWith("already claimed");

    // bob claims
    await expect(vault.connect(bob).claim(epochId, category, rankBob, bobAddr, amountBob, proofBob)).to.emit(
      vault,
      "Claimed"
    );

    // epochTotal enforced
    const amountTooMuch = ethers.parseEther("0.05");
    const leafTooMuch = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "uint8", "address", "uint256"],
        [epochId, category, 3, bobAddr, amountTooMuch]
      )
    );
    const { root: root2, proof: proofTooMuch } = buildMerkleRootAndProof([leafTooMuch, leafTooMuch], 0);
    const epochId2 = 1000n;
    await vault.connect(rootPoster).setEpochRoot(epochId2, root2, ethers.parseEther("0.01"));
    await expect(
      vault.connect(bob).claim(epochId2, category, 3, bobAddr, amountTooMuch, proofTooMuch)
    ).to.be.revertedWith("exceeds epochTotal");
  });
});
