import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

function optionalEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function loadFactoryAddress(): string {
  const configured = optionalEnv("LAUNCH_FACTORY_ADDRESS", "FACTORY_ADDRESS");
  if (configured) return configured;

  const deploymentFile = path.join(__dirname, "..