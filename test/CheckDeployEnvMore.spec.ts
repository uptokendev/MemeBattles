import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const VALID_ADDRESS = "0x1111111111111111111111111111111111111111";
const VALID_ADDRESS_2 = "0x2222222222222222222222222222222222222222";
const VALID_ADDRESS_3 = "0x3333333333333333333333333333333333333333";
const VALID_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";

const CLEAN_KEYS = [
  "HARDHAT_NETWORK",
  "BSC_TESTNET_RPC",
  "BSC_TESTNET_RPC_URL",
  "DEPLOYER_PK",
  "PRIVATE_KEY_DEPLOY",
  "TREASURY_SAFE",
  "ROUTE_AUTHORITY_ADDRESS",
  "ROUTE_AUTHORITY_PRIVATE_KEY",
  "TOPAZ_MANIFEST",
  "TOPAZ_ROUTER",
  "TOPAZ_V2_ROUTER",
  "ROUTER_ADDRESS",
  "PANCAKE_ROUTER",
  "PANCAKE_V2_ROUTER",
  "GRADUATION_ORACLE_ADDRESS",
  "BNB_USD_PRICE_FEED",
  "NATIVE_USD_PRICE_FEED",
  "GRADUATION_PRICE_FEED",
  "BSCSCAN_API_KEY",
  "ETHERSCAN_API_KEY",
  "DEPLOY_MOCK_TOPAZ_ROUTER",
  "DEPLOY_MOCK_ROUTER",
  "DEPLOY_MOCK_PRICE_FEED",
];

function cleanEnv(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env };
  for (const key of CLEAN_KEYS) delete env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runCheck(target: string | undefined, overrides: Record<string, string | undefined> = {}) {
  const script = path.join(process.cwd(), "scripts", "check-deploy-env.cjs");
  const isolatedCwd = mkdtempSync(path.join(tmpdir(), "mwz-check-env-more-"));
  try {
    return spawnSync(process.execPath, target ? [script, target] : [script], {
      cwd: isolatedCwd,
      env: cleanEnv(overrides),
      encoding: "utf8",
    });
  } finally {
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
}

function validBscEnv(extra: Record<string, string | undefined> = {}) {
  return {
    BSC_TESTNET_RPC: "https://example.invalid/rpc",
    DEPLOYER_PK: VALID_PRIVATE_KEY,
    TREASURY_SAFE: VALID_ADDRESS,
    TOPAZ_ROUTER: VALID_ADDRESS_2,
    BNB_USD_PRICE_FEED: VALID_ADDRESS_3,
    ROUTE_AUTHORITY_ADDRESS: VALID_ADDRESS_3,
    ...extra,
  };
}

describe("check-deploy-env additional validation", function () {
  it("accepts bscTestnet route authority configured by address only", async () => {
    const result = runCheck("bscTestnet", validBscEnv());

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include(`routeAuthority=${VALID_ADDRESS_3}`);
    expect(result.stdout).to.include("[deploy-env] OK");
  });

  it("validates real-network router and price feed addresses when present", async () => {
    const result = runCheck(
      "bscTestnet",
      validBscEnv({
        TOPAZ_ROUTER: "not-an-address",
        BNB_USD_PRICE_FEED: "0x123",
      })
    );

    expect(result.status).to.eq(1);
    expect(result.stderr).to.include("TOPAZ_ROUTER: expected 20-byte 0x address");
    expect(result.stderr).to.include("BNB_USD_PRICE_FEED: expected 20-byte 0x address");
  });

  it("validates local mock flags as booleans", async () => {
    const result = runCheck("hardhat", {
      DEPLOY_MOCK_TOPAZ_ROUTER: "maybe",
      DEPLOY_MOCK_ROUTER: "sometimes",
      DEPLOY_MOCK_PRICE_FEED: "later",
    });

    expect(result.status).to.eq(1);
    expect(result.stderr).to.include("DEPLOY_MOCK_TOPAZ_ROUTER: expected boolean value");
    expect(result.stderr).to.include("DEPLOY_MOCK_ROUTER: expected boolean value");
    expect(result.stderr).to.include("DEPLOY_MOCK_PRICE_FEED: expected boolean value");
  });

  it("uses HARDHAT_NETWORK when no target argument is passed", async () => {
    const result = runCheck(undefined, { HARDHAT_NETWORK: "bscTestnet", ...validBscEnv() });

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[deploy-env] target=bscTestnet");
  });
});
