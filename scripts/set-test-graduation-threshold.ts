import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}

function parseUsdThreshold(): bigint {
  const raw = (process.env.TEST_GRADUATION_USD ??