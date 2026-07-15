import { expect } from "chai";

const { buildFrontendEnv } = require("../scripts/lib/frontendEnv.cjs");

const ADDRESSES = {
  factory: "0x0000000000000000000000000000000000000101",
  implementation: "0x0000000000000000000000000000000000000102",
  treasuryRouter: "0x0000000000000000000000000000000000000103",
  communityVault: "0x0000000000000000000000000000000000000104",
  recruiterVault: "0x0000000000000000000000000000000000000105",
  protocolVault: "0x0000000000000000000000000000000000000106",
  creatorRegistry: "0x0000000000000000000000000000000000000107",
  riskRegistry: "0x0000000000000000000000000000000000000108",
  graduationOracle: "0x0000000000000000000000000000000000000109",
  topazRouter: "0x000000000000000000000000000000000000010a",
  permanentLpLocker: "0x000000000000000000000000000000000000010b",
  upVoteTreasury: "0x000000000000000000000000000000000000010c",
  fallback: "0x000000000000000000000000000000000000010d",
};

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 31337,
    topazRouter: ADDRESSES.topazRouter,
    contracts: {
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
    },
    ...overrides,
  };
}

describe("frontend env ordering and fallback edges", function () {
  it("emits variables in the frontend contract loading order", async () => {
    const names = buildFrontendEnv(deployment(), "ordered.json")
      .trim()
      .split("\n")
      .map((line: string) => line.split("=")[0]);

    expect(names).to.deep.eq([
      "VITE_FACTORY_ADDRESS_31337",
      "VITE_VOTE_TREASURY_ADDRESS_31337",
      "VITE_TREASURY_ROUTER_ADDRESS_31337",
      "VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_31337",
      "VITE_RECRUITER_REWARDS_VAULT_ADDRESS_31337",
      "VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_31337",
      "VITE_CREATOR_REGISTRY_ADDRESS_31337",
      "VITE_RISK_REGISTRY_ADDRESS_31337",
      "VITE_GRADUATION_ORACLE_ADDRESS_31337",
      "VITE_TOPAZ_ROUTER_ADDRESS_31337",
      "VITE_PERMANENT_LP_LOCKER_ADDRESS_31337",
      "VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_31337",
    ]);
  });

  it("prefers contract-scoped legacy fallbacks before top-level legacy fallbacks", async () => {
    const base = deployment();
    const contracts = { ...(base.contracts as Record<string, string>) };
    delete contracts.LaunchFactory;
    contracts.factoryAddress = ADDRESSES.factory;

    const output = buildFrontendEnv(
      deployment({ contracts, factoryAddress: ADDRESSES.fallback }),
      "contract-fallback.json"
    );

    expect(output).to.include(`VITE_FACTORY_ADDRESS_31337=${ADDRESSES.factory}`);
    expect(output).to.not.include(`VITE_FACTORY_ADDRESS_31337=${ADDRESSES.fallback}`);
  });

  it("treats chain id zero as missing", async () => {
    expect(() => buildFrontendEnv(deployment({ chainId: 0 }), "zero-chain.json")).to.throw("chainId missing in zero-chain.json");
  });

  it("rejects an empty router alias when no topaz router is configured", async () => {
    expect(() => buildFrontendEnv(deployment({ topazRouter: "", router: "" }), "missing-router.json")).to.throw(
      "TopazRouter: missing or invalid address in missing-router.json"
    );
  });

  it("keeps every generated value as a 20-byte address", async () => {
    for (const line of buildFrontendEnv(deployment(), "addresses.json").trim().split("\n")) {
      const [, value] = line.split("=");
      expect(value).to.match(/^0x[a-fA-F0-9]{40}$/);
    }
  });
});
