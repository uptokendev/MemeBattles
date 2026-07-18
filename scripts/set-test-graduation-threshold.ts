import { ethers, network } from "hardhat";

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId === 56n) {
    throw new Error("Refusing to lower the