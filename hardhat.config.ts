import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

function pk(): string[] {
  const key = process.env.DEPLOYER_PK;
  if (!key) return [];
  return [key.startsWith("0x") ? key : `0x${key}`];
}

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      // Your LaunchFactory bytecode exceeds the 24KB Spurious Dragon limit.
      // Hardhat defaults to enforcing the limit; for unit tests we disable it.
      allowUnlimitedContractSize: true,
    },

    // --- Added for deployments ---
    bscTestnet: {
  url: process.env.BSC_TESTNET_RPC || "",
  accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK.startsWith("0x") ? process.env.DEPLOYER_PK : `0x${process.env.DEPLOYER_PK}`] : [],
  chainId: 97
}
  },

  // --- Added for contract verification ---
  etherscan: {
    apiKey: {
      // hardhat-toolbox uses this key name for BNB Chain testnet verification
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
    },
  },

  solidity: {
  version: "0.8.24",
  settings: {
    optimizer: { enabled: true, runs: 1 }, // low runs shrinks code size
    viaIR: true,
    metadata: { bytecodeHash: "none" } // removes metadata hash bytes
  },
},

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 120_000,
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
