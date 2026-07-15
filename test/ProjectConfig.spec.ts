import { expect } from "chai";
import config from "../hardhat.config";

describe("project hardhat config", function () {
  it("keeps the expected compiler and size-oriented optimizer settings", async () => {
    const solidity = config.solidity as any;

    expect(solidity.version).to.eq("0.8.24");
    expect(solidity.settings.optimizer.enabled).to.eq(true);
    expect(solidity.settings.optimizer.runs).to.eq(1);
    expect(solidity.settings.viaIR).to.eq(true);
    expect(solidity.settings.metadata.bytecodeHash).to.eq("none");
  });

  it("keeps contract, test, cache, and artifact paths explicit", async () => {
    expect(config.paths?.sources).to.eq("./contracts");
    expect(config.paths?.tests).to.eq("./test");
    expect(config.paths?.cache).to.eq("./cache");
    expect(config.paths?.artifacts).to.eq("./artifacts");
  });

  it("defines hardhat and bscTestnet networks", async () => {
    const networks = config.networks as any;

    expect(networks.hardhat).to.deep.eq({});
    expect(networks.bscTestnet.chainId).to.eq(97);
    expect(networks.bscTestnet.url).to.be.a("string");
    expect(networks.bscTestnet.accounts).to.be.an("array");
  });

  it("keeps mocha timeout high enough for viaIR test runs", async () => {
    expect(config.mocha?.timeout).to.eq(120_000);
  });
});
