import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

const bscTestnetRpcUrl = process.env.BSC_TESTNET_RPC || process.env.BSC_TESTNET_RPC_URL || "";
const bscMainnetRpcUrl = process.env.BSC_MAINNET_RPC || process.env.BSC_MAINNET_RPC_URL || "";
const deployerPrivateKey = process.env.DEPLOYER_PK || process.env.PRIVATE_KEY_DEPLOY || "";
const explorerApiKey = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  networks: {
    hardhat: {},

    // --- Added for deployments ---
    bscTestnet: {
      url: bscTestnetRpcUrl,
      accounts: deployerPrivateKey ? [deployerPrivateKey.startsWith("0x") ? deployerPrivateKey : `0x${deployerPrivateKey}`] : [],
      chainId: 97,
    },
    bscMainnet: {
      url: bscMainnetRpcUrl,
      accounts: deployerPrivateKey ? [deployerPrivateKey.startsWith("0x") ? deployerPrivateKey : `0x${deployerPrivateKey}`] : [],
      chainId: 56,
    },
  },

  // --- Added for contract verification ---
  etherscan: {
    // A single string opts @nomicfoundation/hardhat-verify into Etherscan API V2.
    // The old per-network object selects the retired BscScan V1 endpoint.
    apiKey: explorerApiKey,
  },

  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 1 }, // low runs shrinks code size
      viaIR: true,
      metadata: { bytecodeHash: "none" }, // removes metadata hash bytes
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
