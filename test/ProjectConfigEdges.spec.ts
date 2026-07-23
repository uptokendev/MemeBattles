import { expect } from "chai";

const ORIGINAL_ENV = { ...process.env };

function reloadConfig() {
  delete require.cache[require.resolve("../hardhat.config")];
  return require("../hardhat.config").default;
}

function resolveBscScanApiKey(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const keyed = value as Record<string, unknown>;
    return keyed.bscTestnet ?? keyed.bsc;
  }
  return undefined;
}

describe("project hardhat config edges", function () {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete require.cache[require.resolve("../hardhat.config")];
  });

  it("normalizes DEPLOYER_PK with or without a 0x prefix", async () => {
    process.env.BSC_TESTNET_RPC = "https://example.invalid/rpc";
    process.env.DEPLOYER_PK = "1".repeat(64);
    let config = reloadConfig();

    expect((config.networks as any).bscTestnet.accounts).to.deep.eq([`0x${"1".repeat(64)}`]);

    process.env.DEPLOYER_PK = `0x${"2".repeat(64)}`;
    config = reloadConfig();

    expect((config.networks as any).bscTestnet.accounts).to.deep.eq([`0x${"2".repeat(64)}`]);
  });

  it("wires bscTestnet RPC and BscScan API key from environment variables", async () => {
    process.env.BSC_TESTNET_RPC = "https://rpc.example.invalid";
    process.env.BSCSCAN_API_KEY = "scan-key";

    const config = reloadConfig();

    expect((config.networks as any).bscTestnet.url).to.eq("https://rpc.example.invalid");
    expect(resolveBscScanApiKey((config.etherscan as any).apiKey)).to.eq("scan-key");
  });

  it("enables the gas reporter only when REPORT_GAS is exactly true", async () => {
    process.env.REPORT_GAS = "true";
    let config = reloadConfig();
    expect((config.gasReporter as any).enabled).to.eq(true);
    expect((config.gasReporter as any).currency).to.eq("USD");

    process.env.REPORT_GAS = "1";
    config = reloadConfig();
    expect((config.gasReporter as any).enabled).to.eq(false);
  });
});
