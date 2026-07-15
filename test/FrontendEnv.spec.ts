import { expect } from "chai";

const { buildFrontendEnv } = require("../scripts/lib/frontendEnv.cjs");

const ADDR = {
  factory: "0x0000000000000000000000000000000000000001",
  vote: "0x0000000000000000000000000000000000000002",
  treasuryRouter: "0x0000000000000000000000000000000000000003",
  community: "0x0000000000000000000000000000000000000004",
  recruiter: "0x0000000000000000000000000000000000000005",
  protocol: "0x0000000000000000000000000000000000000006",
  creatorRegistry: "0x0000000000000000000000000000000000000007",
  riskRegistry: "0x0000000000000000000000000000000000000008",
  oracle: "0x0000000000000000000000000000000000000009",
  topazRouter: "0x000000000000000000000000000000000000000a",
  locker: "0x000000000000000000000000000000000000000b",
  implementation: "0x000000000000000000000000000000000000000c",
};

function canonicalDeployment(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 31337,
    topazRouter: ADDR.topazRouter,
    contracts: {
      LaunchFactory: ADDR.factory,
      UPVoteTreasury: ADDR.vote,
      TreasuryRouter: ADDR.treasuryRouter,
      CommunityRewardsVault: ADDR.community,
      RecruiterRewardsVault: ADDR.recruiter,
      ProtocolRevenueVault: ADDR.protocol,
      CreatorRegistry: ADDR.creatorRegistry,
      RiskRegistry: ADDR.riskRegistry,
      GraduationOracle: ADDR.oracle,
      PermanentLpLocker: ADDR.locker,
      LaunchCampaignImplementation: ADDR.implementation,
    },
    ...overrides,
  };
}

function parseEnv(output: string) {
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => line.split("="))
  );
}

describe("frontend env helper", function () {
  it("builds the 12 required Vite addresses using the chain-id suffix", async () => {
    const output = buildFrontendEnv(canonicalDeployment(), "unit-test");
    const env = parseEnv(output);

    expect(output.endsWith("\n")).to.eq(true);
    expect(Object.keys(env)).to.have.length(12);
    expect(env.VITE_FACTORY_ADDRESS_31337).to.eq(ADDR.factory);
    expect(env.VITE_VOTE_TREASURY_ADDRESS_31337).to.eq(ADDR.vote);
    expect(env.VITE_TREASURY_ROUTER_ADDRESS_31337).to.eq(ADDR.treasuryRouter);
    expect(env.VITE_COMMUNITY_REWARDS_VAULT_ADDRESS_31337).to.eq(ADDR.community);
    expect(env.VITE_RECRUITER_REWARDS_VAULT_ADDRESS_31337).to.eq(ADDR.recruiter);
    expect(env.VITE_PROTOCOL_REVENUE_VAULT_ADDRESS_31337).to.eq(ADDR.protocol);
    expect(env.VITE_CREATOR_REGISTRY_ADDRESS_31337).to.eq(ADDR.creatorRegistry);
    expect(env.VITE_RISK_REGISTRY_ADDRESS_31337).to.eq(ADDR.riskRegistry);
    expect(env.VITE_GRADUATION_ORACLE_ADDRESS_31337).to.eq(ADDR.oracle);
    expect(env.VITE_TOPAZ_ROUTER_ADDRESS_31337).to.eq(ADDR.topazRouter);
    expect(env.VITE_PERMANENT_LP_LOCKER_ADDRESS_31337).to.eq(ADDR.locker);
    expect(env.VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_31337).to.eq(ADDR.implementation);
  });

  it("supports legacy deployment fallback keys", async () => {
    const output = buildFrontendEnv(
      canonicalDeployment({
        contracts: {},
        router: ADDR.topazRouter,
        factoryAddress: ADDR.factory,
        voteTreasuryAddress: ADDR.vote,
        leagueRouter: ADDR.treasuryRouter,
        communityVault: ADDR.community,
        recruiterVault: ADDR.recruiter,
        protocolVault: ADDR.protocol,
        creatorRegistry: ADDR.creatorRegistry,
        riskRegistry: ADDR.riskRegistry,
        graduationOracle: ADDR.oracle,
        permanentLpLocker: ADDR.locker,
        campaignImplementation: ADDR.implementation,
      }),
      "legacy-test"
    );
    const env = parseEnv(output);

    expect(env.VITE_FACTORY_ADDRESS_31337).to.eq(ADDR.factory);
    expect(env.VITE_TOPAZ_ROUTER_ADDRESS_31337).to.eq(ADDR.topazRouter);
    expect(env.VITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_31337).to.eq(ADDR.implementation);
    expect(env.VITE_TREASURY_ROUTER_ADDRESS_31337).to.eq(ADDR.treasuryRouter);
  });

  it("prefers canonical contract names over legacy aliases", async () => {
    const legacyFactory = "0x00000000000000000000000000000000000000f1";
    const output = buildFrontendEnv(
      canonicalDeployment({
        factoryAddress: legacyFactory,
      }),
      "priority-test"
    );
    const env = parseEnv(output);

    expect(env.VITE_FACTORY_ADDRESS_31337).to.eq(ADDR.factory);
    expect(env.VITE_FACTORY_ADDRESS_31337).to.not.eq(legacyFactory);
  });

  it("rejects missing chainId", async () => {
    expect(() => buildFrontendEnv(canonicalDeployment({ chainId: undefined }), "missing-chain")).to.throw(
      "chainId missing in missing-chain"
    );
  });

  it("rejects missing or invalid required addresses with the source label", async () => {
    expect(() =>
      buildFrontendEnv(
        canonicalDeployment({
          contracts: {
            ...canonicalDeployment().contracts,
            LaunchFactory: "",
          },
        }),
        "bad-deployment.json"
      )
    ).to.throw("LaunchFactory: missing or invalid address in bad-deployment.json");

    expect(() =>
      buildFrontendEnv(
        canonicalDeployment({
          topazRouter: "not-an-address",
        }),
        "bad-router.json"
      )
    ).to.throw("TopazRouter: missing or invalid address in bad-router.json");
  });
});
