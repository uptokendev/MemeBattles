import { expect } from "chai";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { buildFrontendEnv, writeFrontendEnv } = require("../scripts/lib/frontendEnv.cjs");

const ADDRESSES = {
  factory: "0x0000000000000000000000000000000000000001",
  implementation: "0x0000000000000000000000000000000000000002",
  treasuryRouter: "0x0000000000000000000000000000000000000003",
  communityVault: "0x0000000000000000000000000000000000000004",
  recruiterVault: "0x0000000000000000000000000000000000000005",
  protocolVault: "0x0000000000000000000000000000000000000006",
  creatorRegistry: "0x0000000000000000000000000000000000000007",
  riskRegistry: "0x0000000000000000000000000000000000000008",
  graduationOracle: "0x0000000000000000000000000000000000000009",
  topazRouter: "0x000000000000000000000000000000000000000a",
  permanentLpLocker: "0x000000000000000000000000000000000000000b",
  upVoteTreasury: "0x000000000000000000000000000000000000000c",
  alternate: "0x000000000000000000000000000000000000000d",
  fallback: "0x000000000000000000000000000000000000000e",
};

function contracts() {
  return {
    LaunchFactory: ADDRESSES.factory,
    LaunchCampaignImplementation: ADDRESSES.implementation,
    TreasuryRouter: ADDRESSES.treasuryRouter,
    CommunityRewardsVault: ADDRESSES.communityVault,
    RecruiterRewardsVault: ADDRESSES.recruiterVault,
    ProtocolRevenueVault: ADDRESSES.protocolVault,
    CreatorRegistry: ADDRESSES.creatorRegistry,
    RiskRegistry: ADDRESSES.riskRegistry,
    GraduationOracle: ADDRESSES.graduationOracle,
    PermanentLpLocker: ADDRESSES.permanentLpLocker,
    UPVoteTreasury: ADDRESSES.upVoteTreasury,
  };
}

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 31337,
    topazRouter: ADDRESSES.topazRouter,
    contracts: contracts(),
    ...overrides,
  };
}

describe("frontend env writer edge cases", function () {
  it("creates nested output directories and returns the exact written env", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-frontend-env-"));
    const outFile = path.join(dir, "nested", "hardhat.frontend.env");

    try {
      const output = writeFrontendEnv(deployment(), outFile, "unit-deployment.json");

      expect(readFileSync(outFile, "utf8")).to.eq(output);
      expect(output.endsWith("\n")).to.eq(true);
      expect(output.trim().split("\n")).to.have.length(12);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses string chain ids as frontend variable suffixes", async () => {
    const output = buildFrontendEnv(deployment({ chainId: "97" }), "bsc-testnet.json");

    expect(output).to.include(`VITE_FACTORY_ADDRESS_97=${ADDRESSES.factory}`);
    expect(output).to.include(`VITE_TOPAZ_ROUTER_ADDRESS_97=${ADDRESSES.topazRouter}`);
    expect(output).to.not.include("_31337=");
  });

  it("prefers top-level canonical names before legacy fallback aliases", async () => {
    const canonical = contracts();
    delete (canonical as any).LaunchFactory;
    const output = buildFrontendEnv(
      deployment({
        contracts: canonical,
        LaunchFactory: ADDRESSES.alternate,
        factoryAddress: ADDRESSES.fallback,
      }),
      "fallback-order.json"
    );

    expect(output).to.include(`VITE_FACTORY_ADDRESS_31337=${ADDRESSES.alternate}`);
    expect(output).to.not.include(`VITE_FACTORY_ADDRESS_31337=${ADDRESSES.fallback}`);
  });

  it("accepts router as a legacy top-level alias for TopazRouter", async () => {
    const output = buildFrontendEnv(deployment({ topazRouter: undefined, router: ADDRESSES.alternate }), "router-alias.json");

    expect(output).to.include(`VITE_TOPAZ_ROUTER_ADDRESS_31337=${ADDRESSES.alternate}`);
  });

  it("names the missing contract and source when validation fails", async () => {
    const invalidContracts = contracts();
    invalidContracts.PermanentLpLocker = "0x123";

    expect(() => buildFrontendEnv(deployment({ contracts: invalidContracts }), "broken.json")).to.throw(
      "PermanentLpLocker: missing or invalid address in broken.json"
    );
  });
});
