import { expect } from "chai";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import path from "node:path";

const { buildInterfaces, decodeLog, defaultConfirmations } = require("../scripts/indexer-runtime.cjs");

const ROUTE_EXECUTED = "RouteExecuted(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256)";

function topic(signature: string) {
  return ethers.id(signature);
}

function arg(args: Record<string, string>, index: number, name: string) {
  return args[name] ?? args[String(index)];
}

describe("indexer runtime", function () {
  it("decodes indexed event fields with compiled ABI metadata", async () => {
    const manifest = {
      chainId: 31337,
      network: "localhost",
      events: {
        TreasuryRouter: {
          [ROUTE_EXECUTED]: topic(ROUTE_EXECUTED),
        },
      },
    };
    const artifact = JSON.parse(
      readFileSync(path.join(process.cwd(), "artifacts", "contracts", "TreasuryRouter.sol", "TreasuryRouter.json"), "utf8")
    );
    const iface = new ethers.Interface(artifact.abi);
    const encoded = iface.encodeEventLog(iface.getEvent("RouteExecuted")!, [0, 1, 100n, 37n, 0n, 15n, 0n, 48n]);
    const topicMap = buildInterfaces(manifest);

    const decoded = decodeLog(
      {
        chainId: 31337,
        contractName: "TreasuryRouter",
        address: "0x0000000000000000000000000000000000000001",
        topics: encoded.topics,
        data: encoded.data,
        blockNumber: 12,
        blockHash: "0x" + "11".repeat(32),
        transactionHash: "0x" + "22".repeat(32),
        transactionIndex: 3,
        index: 4,
        removed: false,
      },
      topicMap
    );

    expect(decoded.eventName).to.eq("RouteExecuted");
    expect(decoded.eventSignature).to.eq(ROUTE_EXECUTED);
    expect(arg(decoded.args, 0, "kind")).to.eq("0");
    expect(arg(decoded.args, 1, "profile")).to.eq("1");
    expect(arg(decoded.args, 2, "amountIn")).to.eq("100");
    expect(arg(decoded.args, 3, "leagueAmount")).to.eq("37");
    expect(arg(decoded.args, 5, "airdropAmount")).to.eq("15");
    expect(arg(decoded.args, 7, "protocolAmount")).to.eq("48");
  });

  it("uses zero confirmations for local networks and six for real networks", async () => {
    expect(defaultConfirmations({ chainId: 31337, network: "localhost" })).to.eq(0);
    expect(defaultConfirmations({ chainId: 31337, network: "hardhat" })).to.eq(0);
    expect(defaultConfirmations({ chainId: 97, network: "bscTestnet" })).to.eq(6);
  });
});
