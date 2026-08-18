import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const pk = process.env.DEPLOYER_PK
  ? [process.env.DEPLOYER_PK.startsWith("0x") ? process.env.DEPLOYER_PK : `0x${process.env.DEPLOYER_PK}`]
  : [];
const explorerApiKey = process.env.ETHERSCAN_API_KEY || "";
const bscMainnetRpcUrl = process.env.BSC_MAINNET_RPC || process.env.BSC_MAINNET_RPC_URL || "";

const config: HardhatUserConfig = {
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "",
      accounts: pk,
      chainId: 97,
    },
    bscMainnet: {
      url: bscMainnetRpcUrl,
      accounts: pk,
      chainId: 56,
    },
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
  etherscan: {
    // A single string uses Etherscan API V2 with chainId=97.
    apiKey: explorerApiKey,
  },
};

export default config;
