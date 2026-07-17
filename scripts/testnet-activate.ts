import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

const EXPECTED_CHAIN_ID = 97n;
const PRODUCTION_DEFAULT_USD_TARGET = ethers.parseEther("30000");

function deploymentPath() {
  return path.join(__dirname, "..", "deployments", "bscTestnet.json");
}

function loadDeployment(): any {
  const file = deploymentPath();
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Deploy first with npm run deploy:verify:bsc-testnet.`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

