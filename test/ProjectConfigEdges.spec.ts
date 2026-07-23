import { expect } from "chai";

const ORIGINAL_ENV = { ...process.env };

function reloadConfig() {
  delete require.cache[require.resolve("../hardhat.config")];
  return require("../hardhat.config").default;
}

function resolveBscScanApiKey(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object