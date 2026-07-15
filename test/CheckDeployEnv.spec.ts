import { expect } from "chai";
import { spawnSync } from "node:child_process";
import path from "node:path";

const VALID_ADDRESS = "0x1111111111111111111111111111111111111111";
const VALID_ADDRESS_2 = "0x2222222222222222222222222222222222222222";
const VALID_ADDRESS_3 = "0x3333333333333333333333333333333333333333";
const VALID_PRIVATE_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";
const HARDHAT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const CLEAN_KEYS = [
  "HARDHAT_NETWORK",
  "BSC_TESTNET_RPC",
  "DEPLOYER_PK",
  "TREASURY_SAFE",
  "ROUTE_AUTHORITY_ADDRESS",
  "ROUTE_AUTHORITY_PRIVATE_KEY",
  "TOPAZ_ROUTER",
  "TOPAZ_V2_ROUTER",
  "ROUTER_ADDRESS",
  "PANCAKE_ROUTER",
  "PANCAKE_V2_ROUTER",
  "GRADUATION_ORACLE_ADDRESS",
  "BNB_USD_PRICE_FEED",
  "NATIVE_USD_PRICE_FEED",
  "GRADUATION_PRICE_FEED",
  "LEAGUE_PAYOUT_OPERATOR",
  "LEAGUE_ROOT_POSTER",
  "RECRUITER_PAYOUT_OPERATOR",
  "GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS",
  "LEAGUE_PAYOUT_MAX_PER_TX",
  "LEAGUE_PAYOUT_DAILY_CAP",
  "LEAGUE_CLAIM_MAX_PER_TX",
  "LEAGUE_CLAIM_MAX_EPOCH_TOTAL",
  "RECRUITER_PAYOUT_MAX_PER_TX",
  "RECRUITER_PAYOUT_DAILY_CAP",
  "ENABLE_LEAGUE_PAYOUTS",
  "ENABLE_LEAGUE_CLAIMS",
  "ENABLE_RECRUITER_PAYOUTS",
  "DEPLOY_MOCK_TOPAZ_ROUTER",
  "DEPLOY_MOCK_ROUTER",
  "DEPLOY_MOCK_PRICE_FEED",
  "PHASE1_TRADE_ROUTE_PROFILE",
  "PHASE1_FINALIZE_ROUTE_PROFILE",
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

function runCheck(target?: string, overrides: Record<string, string | undefined> = {}) {
  const script = path.join(process.cwd(), "scripts", "check-deploy-env.cjs");
  return spawnSync(process.execPath, target ? [script, target] : [script], {
    cwd: process.cwd(),
    env: cleanEnv(overrides),
    encoding: "utf8",
  });
}

describe("check-deploy-env script", function () {
  it("allows local hardhat rehearsal without external router or price feed", async () => {
    const result = runCheck("hardhat");

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[deploy-env] target=hardhat");
    expect(result.stdout).to.include("router=unset");
    expect(result.stdout).to.include("graduation=unset");
    expect(result.stdout).to.include("treasurySafe=fallback/deployer");
    expect(result.stdout).to.include("[deploy-env] OK");
    expect(result.stderr).to.include("TREASURY_SAFE is unset");
    expect(result.stderr).to.include("local deploy will use a mock router");
    expect(result.stderr).to.include("local deploy will use a mock price feed");
  });

  it("validates common optional local settings", async () => {
    const result = runCheck("hardhat", {
      TREASURY_SAFE: "not-an-address",
      ROUTE_AUTHORITY_PRIVATE_KEY: "1234",
      PHASE1_TRADE_ROUTE_PROFILE: "9",
      PHASE1_FINALIZE_ROUTE_PROFILE: "x",
      ENABLE_LEAGUE_PAYOUTS: "maybe",
      GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS: "-1",
      LEAGUE_PAYOUT_MAX_PER_TX: "NaN",
    });

    expect(result.status).to.eq(1);
    expect(result.stderr).to.include("TREASURY_SAFE: expected 20-byte 0x address");
    expect(result.stderr).to.include("ROUTE_AUTHORITY_PRIVATE_KEY: expected 32-byte hex private key");
    expect(result.stderr).to.include("PHASE1_TRADE_ROUTE_PROFILE: expected 0, 1, or 2");
    expect(result.stderr).to.include("PHASE1_FINALIZE_ROUTE_PROFILE: expected 0, 1, or 2");
    expect(result.stderr).to.include("ENABLE_LEAGUE_PAYOUTS: expected boolean value");
    expect(result.stderr).to.include("GRADUATION_ORACLE_MAX_PRICE_AGE_SECONDS: expected non-negative integer");
    expect(result.stderr).to.include("LEAGUE_PAYOUT_MAX_PER_TX: expected integer");
  });

  it("requires real-network essentials for bscTestnet", async () => {
    const result = runCheck("bscTestnet");

    expect(result.status).to.eq(1);
    expect(result.stderr).to.include("BSC_TESTNET_RPC: required for --network bscTestnet");
    expect(result.stderr).to.include("DEPLOYER_PK: missing private key");
    expect(result.stderr).to.include("TREASURY_SAFE: missing address");
    expect(result.stderr).to.include("Topaz router missing");
    expect(result.stderr).to.include("Graduation oracle/price feed missing");
    expect(result.stderr).to.include("ROUTE_AUTHORITY_ADDRESS or ROUTE_AUTHORITY_PRIVATE_KEY is required");
  });

  it("rejects default Hardhat credentials and mock flags on bscTestnet", async () => {
    const result = runCheck("bscTestnet", {
      BSC_TESTNET_RPC: "https://example.invalid/rpc",
      DEPLOYER_PK: HARDHAT_PRIVATE_KEY,
      TREASURY_SAFE: HARDHAT_ADDRESS,
      TOPAZ_ROUTER: VALID_ADDRESS,
      BNB_USD_PRICE_FEED: VALID_ADDRESS_2,
      ROUTE_AUTHORITY_PRIVATE_KEY: HARDHAT_PRIVATE_KEY,
      ROUTE_AUTHORITY_ADDRESS: HARDHAT_ADDRESS,
      DEPLOY_MOCK_TOPAZ_ROUTER: "true",
      DEPLOY_MOCK_ROUTER: "1",
      DEPLOY_MOCK_PRICE_FEED: "yes",
    });

    expect(result.status).to.eq(1);
    expect(result.stderr).to.include("DEPLOYER_PK: uses a default Hardhat local private key");
    expect(result.stderr).to.include("ROUTE_AUTHORITY_PRIVATE_KEY: uses a default Hardhat local private key");
    expect(result.stderr).to.include("TREASURY_SAFE: uses a default Hardhat local account");
    expect(result.stderr).to.include("ROUTE_AUTHORITY_ADDRESS: uses a default Hardhat local account");
    expect(result.stderr).to.include("DEPLOY_MOCK_TOPAZ_ROUTER: mocks are only allowed");
    expect(result.stderr).to.include("DEPLOY_MOCK_ROUTER: mocks are only allowed");
    expect(result.stderr).to.include("DEPLOY_MOCK_PRICE_FEED: mocks are only allowed");
  });

  it("accepts a fully configured bscTestnet environment", async () => {
    const result = runCheck("bscTestnet", {
      BSC_TESTNET_RPC: "https://example.invalid/rpc",
      DEPLOYER_PK: VALID_PRIVATE_KEY,
      TREASURY_SAFE: VALID_ADDRESS,
      TOPAZ_ROUTER: VALID_ADDRESS_2,
      BNB_USD_PRICE_FEED: VALID_ADDRESS_3,
      ROUTE_AUTHORITY_PRIVATE_KEY: VALID_PRIVATE_KEY,
      PHASE1_TRADE_ROUTE_PROFILE: "2",
      PHASE1_FINALIZE_ROUTE_PROFILE: "1",
      ENABLE_LEAGUE_PAYOUTS: "false",
      ENABLE_LEAGUE_CLAIMS: "0",
      ENABLE_RECRUITER_PAYOUTS: "off",
    });

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[deploy-env] target=bscTestnet");
    expect(result.stdout).to.include("router=TOPAZ_ROUTER");
    expect(result.stdout).to.include("graduation=BNB_USD_PRICE_FEED");
    expect(result.stdout).to.include("routeAuthority=private-key-derived");
    expect(result.stdout).to.include("[deploy-env] OK");
  });
});
