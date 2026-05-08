import { expect } from "chai";
import { ethers } from "hardhat";

function hexToBigInt(h: string) {
  return BigInt(h);
}

function hashPair(a: string, b: string) {
  const [x, y] = hexToBigInt(a) < hexToBigInt(b) ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([x, y]));
}

function buildMerkleRootAndProof(leaves: string[], index: number) {
  if (leaves.length < 2) throw new Error("need >=2 leaves");
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
  async function deploy(opts?: { operator?: string; rootPoster?: string }) {
    const [multisig, operatorSigner, rootPosterSigner, alice, bob] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("TreasuryVaultV2");
    const vault = await Vault.deploy(
      await multisig.getAddress(),
      opts?.operator ?? (await operatorSigner.getAddress()),
      opts?.rootPoster ?? (await rootPosterSigner.getAddress())
    );
    return { vault, multisig, operatorSigner, rootPosterSigner, alice, bob };
  }

  async function configurePayoutLane(vault: any, multisig: any) {
    await vault.connect(multisig).setCaps(ethers.parseEther("0.5"), ethers.parseEther("1"));
    await vault.connect(multisig).setPayoutsPaused(false);
  }

  async function configureClaimLane(vault: any, multisig: any) {
    await vault.connect(multisig).setClaimCaps(ethers.parseEther("0.25"), ethers.parseEther("1"));
    await vault.connect(multisig).setClaimsPaused(false);
  }

  it("constructor sets multisig/operator/rootPoster, starts paused, and accepts deposits", async () => {
    const { vault, multisig, operatorSigner, rootPosterSigner } = await deploy();
    expect(await vault.multisig()).to.eq(await multisig.getAddress());
    expect(await vault.operator()).to.eq(await operatorSigner.getAddress());
    expect(await vault.rootPoster()).to.eq(await rootPosterSigner.getAddress());
    expect(await vault.payoutsPaused()).to.eq(true);
    expect(await vault.claimsPaused()).to.eq(true);

    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(ethers.parseEther("1"));
  });

  it("only multisig can admin payout + claim controls and withdraw", async () => {
    const { vault, multisig, operatorSigner, rootPosterSigner, alice } = await deploy();

    await expect(vault.connect(alice).setOperator(await alice.getAddress())).to.be.revertedWith("not multisig");
    await expect(vault.connect(operatorSigner).setCaps(1n, 2n)).to.be.revertedWith("not multisig");
    await expect(vault.connect(alice).setPayoutsPaused(true)).to.be.revertedWith("not multisig");
    await expect(vault.connect(alice).setRootPoster(await alice.getAddress())).to.be.revertedWith("not multisig");
    await expect(vault.connect(rootPosterSigner).setClaimCaps(1n, 2n)).to.be.revertedWith("not multisig");
    await expect(vault.connect(alice).setClaimsPaused(true)).to.be.revertedWith("not multisig");

    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await expect(vault.connect(alice).withdraw(await alice.getAddress(), 1n)).to.be.revertedWith("not multisig");

    await expect(vault.connect(multisig).setCaps(123n, 456n)).to.emit(vault, "CapsUpdated");
    await expect(vault.connect(multisig).setRootPoster(await alice.getAddress())).to.emit(vault, "RootPosterUpdated");
    await expect(vault.connect(multisig).setClaimCaps(789n, 999n)).to.emit(vault, "ClaimCapsUpdated");

    expect(await vault.maxPayoutPerTx()).to.eq(123n);
    expect(await vault.dailyPayoutCap()).to.eq(456n);
    expect(await vault.rootPoster()).to.eq(await alice.getAddress());
    expect(await vault.maxClaimPerTx()).to.eq(789n);
    expect(await vault.maxEpochTotal()).to.eq(999n);

    await expect(vault.connect(multisig).setPayoutsPaused(true)).to.emit(vault, "PayoutsPaused");
    await expect(vault.connect(multisig).setClaimsPaused(true)).to.emit(vault, "ClaimsPaused");

    await expect(vault.connect(multisig).withdraw(await alice.getAddress(), ethers.parseEther("0.25"))).to.emit(
      vault,
      "Withdraw"
    );
  });

  it("cannot unpause payouts until operator and non-zero caps are configured", async () => {
    const { vault, multisig } = await deploy();
    await expect(vault.connect(multisig).setPayoutsPaused(false)).to.be.revertedWith("maxPayoutPerTx=0");

    await vault.connect(multisig).setCaps(ethers.parseEther("0.5"), ethers.parseEther("1"));
    await expect(vault.connect(multisig).setPayoutsPaused(false)).to.emit(vault, "PayoutsPaused");
    expect(await vault.payoutsPaused()).to.eq(false);

    const { vault: zeroOperatorVault, multisig: zeroOperatorMultisig } = await deploy({ operator: ethers.ZeroAddress });
    await zeroOperatorVault.connect(zeroOperatorMultisig).setCaps(ethers.parseEther("0.5"), ethers.parseEther("1"));
    await expect(zeroOperatorVault.connect(zeroOperatorMultisig).setPayoutsPaused(false)).to.be.revertedWith(
      "operator=0"
    );
  });

  it("cannot unpause claims until rootPoster and non-zero caps are configured", async () => {
    const { vault, multisig } = await deploy();
    await expect(vault.connect(multisig).setClaimsPaused(false)).to.be.revertedWith("maxClaimPerTx=0");

    await vault.connect(multisig).setClaimCaps(ethers.parseEther("0.25"), ethers.parseEther("1"));
    await expect(vault.connect(multisig).setClaimsPaused(false)).to.emit(vault, "ClaimsPaused");
    expect(await vault.claimsPaused()).to.eq(false);

    const { vault: zeroRootVault, multisig: zeroRootMultisig } = await deploy({ rootPoster: ethers.ZeroAddress });
    await zeroRootVault.connect(zeroRootMultisig).setClaimCaps(ethers.parseEther("0.25"), ethers.parseEther("1"));
    await expect(zeroRootVault.connect(zeroRootMultisig).setClaimsPaused(false)).to.be.revertedWith(
      "rootPoster=0"
    );
  });

  it("only operator can payout", async () => {
    const { vault, multisig, operatorSigner, alice, bob } = await deploy();
    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await configurePayoutLane(vault, multisig);
    await expect(vault.connect(alice).payout(await bob.getAddress(), 1n)).to.be.revertedWith("not operator");
  });

  it("payout respects pause", async () => {
    const { vault, multisig, operatorSigner, bob } = await deploy();
    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });
    await vault.connect(multisig).setCaps(ethers.parseEther("0.5"), ethers.parseEther("1"));
    await expect(vault.connect(operatorSigner).payout(await bob.getAddress(), 1n)).to.be.revertedWith("payouts paused");
  });

  it("payout respects maxPayoutPerTx", async () => {
    const { vault, multisig, operatorSigner, bob } = await deploy();
    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("2") });
    await vault.connect(multisig).setCaps(ethers.parseEther("0.5"), ethers.parseEther("1"));
    await vault.connect(multisig).setPayoutsPaused(false);
    await expect(vault.connect(operatorSigner).payout(await bob.getAddress(), ethers.parseEther("0.6"))).to.be.revertedWith(
      "maxPayoutPerTx"
    );
    await expect(vault.connect(operatorSigner).payout(await bob.getAddress(), ethers.parseEther("0.5"))).to.emit(
      vault,
      "Payout"
    );
  });

  it("payout respects dailyPayoutCap and resets on new day", async () => {
    const { vault, multisig, operatorSigner, alice } = await deploy();
    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });
    await vault.connect(multisig).setCaps(ethers.parseEther("1"), ethers.parseEther("1"));
    await vault.connect(multisig).setPayoutsPaused(false);

    await vault.connect(operatorSigner).payout(await alice.getAddress(), ethers.parseEther("0.6"));
    await expect(vault.connect(operatorSigner).payout(await alice.getAddress(), ethers.parseEther("0.5"))).to.be.revertedWith(
      "dailyPayoutCap"
    );

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 5]);
    await ethers.provider.send("evm_mine", []);

    await expect(vault.connect(operatorSigner).payout(await alice.getAddress(), ethers.parseEther("1"))).to.emit(
      vault,
      "Payout"
    );
  });

  it("rootPoster can set epoch root once; others cannot", async () => {
    const { vault, multisig, rootPosterSigner, alice } = await deploy();
    const epochId = 123n;
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));

    await expect(vault.connect(alice).setEpochRoot(epochId, root, 100n)).to.be.revertedWith("not rootPoster");
    await expect(vault.connect(rootPosterSigner).setEpochRoot(epochId, root, 100n)).to.emit(vault, "EpochRootSet");
    await expect(vault.connect(rootPosterSigner).setEpochRoot(epochId, root, 100n)).to.be.revertedWith("root already set");

    const epochId2 = 124n;
    await expect(vault.connect(multisig).setEpochRoot(epochId2, root, 100n)).to.emit(vault, "EpochRootSet");
  });

  it("claim stays paused until configured, then verifies Merkle proof, enforces epochTotal and marks claimed", async () => {
    const { vault, multisig, operatorSigner, rootPosterSigner, alice, bob } = await deploy();

    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });

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

    await vault.connect(multisig).setClaimCaps(ethers.parseEther("0.25"), ethers.parseEther("0.5"));
    await vault.connect(rootPosterSigner).setEpochRoot(epochId, root, ethers.parseEther("0.3"));

    await expect(
      vault.connect(alice).claim(epochId, category, rankAlice, aliceAddr, amountAlice, proofAlice)
    ).to.be.revertedWith("claims paused");

    await vault.connect(multisig).setClaimsPaused(false);

    await expect(
      vault.connect(alice).claim(epochId, category, rankAlice, aliceAddr, amountAlice, proofAlice)
    ).to.emit(vault, "Claimed");

    await expect(
      vault.connect(alice).claim(epochId, category, rankAlice, aliceAddr, amountAlice, proofAlice)
    ).to.be.revertedWith("already claimed");

    await expect(vault.connect(bob).claim(epochId, category, rankBob, bobAddr, amountBob, proofBob)).to.emit(
      vault,
      "Claimed"
    );

    const amountTooMuch = ethers.parseEther("0.05");
    const epochId2 = 1000n;
    const leafTooMuch = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "uint8", "address", "uint256"],
        [epochId2, category, 3, bobAddr, amountTooMuch]
      )
    );
    const { root: root2, proof: proofTooMuch } = buildMerkleRootAndProof([leafTooMuch, leafAlice], 0);
    await vault.connect(rootPosterSigner).setEpochRoot(epochId2, root2, ethers.parseEther("0.01"));
    await expect(
      vault.connect(bob).claim(epochId2, category, 3, bobAddr, amountTooMuch, proofTooMuch)
    ).to.be.revertedWith("exceeds epochTotal");
  });

  it("claim enforces maxClaimPerTx", async () => {
    const { vault, multisig, operatorSigner, rootPosterSigner, alice } = await deploy();
    await operatorSigner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });

    const epochId = 2000n;
    const category = ethers.keccak256(ethers.toUtf8Bytes("crowd_favorite"));
    const rank = 1;
    const amount = ethers.parseEther("0.3");
    const aliceAddr = await alice.getAddress();

    const leaf = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32", "uint8", "address", "uint256"],
        [epochId, category, rank, aliceAddr, amount]
      )
    );

    const { root, proof } = buildMerkleRootAndProof([leaf, leaf], 0);
    await vault.connect(multisig).setClaimCaps(ethers.parseEther("0.25"), ethers.parseEther("1"));
    await vault.connect(rootPosterSigner).setEpochRoot(epochId, root, ethers.parseEther("0.3"));
    await vault.connect(multisig).setClaimsPaused(false);

    await expect(vault.connect(alice).claim(epochId, category, rank, aliceAddr, amount, proof)).to.be.revertedWith(
      "maxClaimPerTx"
    );
  });
});
