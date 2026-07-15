import { expect } from "chai";
import { ethers } from "hardhat";

const verifier = require("../scripts/verify-route-authority.cjs");

describe("route authority verifier helper edges", function () {
  it("exports the ABI type layouts used by create, trade, and request hashes", async () => {
    expect(verifier.CREATE_AUTH_TYPES).to.deep.eq([
      "string",
      "uint256",
      "address",
      "address",
      "bytes32",
      "uint8",
      "uint8",
      "uint64",
    ]);
    expect(verifier.TRADE_AUTH_TYPES).to.deep.eq([
      "string",
      "uint256",
      "address",
      "address",
      "uint8",
      "uint8",
      "uint256",
      "uint256",
      "uint64",
    ]);
    expect(verifier.REQUEST_HASH_TYPES).to.deep.eq([
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "address",
    ]);
  });

  it("hashes empty, ascii, and utf8 strings exactly like ethers", async () => {
    for (const value of ["", "RouteAuthProbe", "meme-Δ-route"]) {
      expect(verifier.hashString(value)).to.eq(ethers.keccak256(ethers.toUtf8Bytes(value)));
    }
  });

  it("adds a hardhat ephemeral-network hint only on the local hardhat network", async () => {
    const hint = verifier.hardhatEphemeralHint("0x0000000000000000000000000000000000000001");

    expect(hint).to.include("hardhat network is ephemeral per command");
    expect(hint).to.include("0x0000000000000000000000000000000000000001");
  });

  it("rejects addresses without contract code with the checked label", async () => {
    await expect(verifier.requireContractCode(ethers.ZeroAddress, "ZeroProbe")).to.be.rejectedWith(
      "ZeroProbe 0x0000000000000000000000000000000000000000 has no code"
    );
  });

  it("accepts deployed contracts when bytecode is present", async () => {
    const receiver = await ethers.deployContract("AcceptingReceiver");
    await receiver.waitForDeployment();

    await verifier.requireContractCode(await receiver.getAddress(), "AcceptingReceiver");
  });
});
