import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { EVENT_SIGNATURES, buildIndexerManifest, eventTopic } = require("../scripts/lib/indexerManifest.cjs");

const ADDRESSES = {
  deployer: "0x0000000000000000000000000000000000000001",
  treasurySafe: "0x0000000000000000000000000000000000000002",
  topazRouter: "0x0000000000000000000000000000000000000003",
  factory: "0x0000000000000000000000000000000000000004",
  implementation: "0x0000000000000000000000000000000000000005",
  treasuryRouter: "0x0000000000000000000000000000000000000006",
  treasuryVault: "0x0000000000000000000000000000000000000007",
  recruiterVault: "0x0000000000000000000000000000000000000008",
  communityVault: "0x0000000000000000000000000000000000000009",
  protocolVault: "0x000000000000000000000000000000000000000a",
  creatorRegistry: "0x000000000000000000000000000000000000000b",
  riskRegistry: "0x000000000000000000000000000000000000000c",
  graduationOracle: "0x000000000000000000000000000000000000000d",
  permanentLpLocker: "0x000000000000000000000000000000000000000e",
  upVoteTreasury: "0x000000000000000000000000000000000000000f",
  priceFeed: "0x0000000000000000000000000000000000000010",
};

function expectSameAddress(actual: string, expected: string) {
  expect(actual.toLowerCase()).to.eq(expected.toLowerCase());
}

function baseDeployment(overrides: Record<string, unknown> = {}) {
  return {
    network: "unitnet",
    chainId: 31337,
    deploymentBlock: 1234,
    deployer: ADDRESSES.deployer,
    treasurySafe: ADDRESSES.treasurySafe,
    topazRouter: ADDRESSES.topazRouter,
    graduationPriceFeed: ADDRESSES.priceFeed,
    contracts: {
      LaunchFactory: ADDRESSES.factory,
      LaunchCampaignImplementation: ADDRESSES.implementation,
      TreasuryRouter: ADDRESSES.treasuryRouter,
      TreasuryVaultV2: ADDRESSES.treasuryVault,
      RecruiterRewardsVault: ADDRESSES.recruiterVault,
      CommunityRewardsVault: ADDRESSES.communityVault,
      ProtocolRevenueVault: ADDRESSES.protocolVault,
      CreatorRegistry: ADDRESSES.creatorRegistry,
      RiskRegistry: ADDRESSES.riskRegistry,
      GraduationOracle: ADDRESSES.graduationOracle,
      PermanentLpLocker: ADDRESSES.permanentLpLocker,
      UPVoteTreasury: ADDRESSES.upVoteTreasury,
    },
    routing: {
      factoryTradeRouteProfile: 1,
      factoryFinalizeRouteProfile: 1,
      factoryRouteAuthority: ADDRESSES.deployer,
    },
    ...overrides,
  };
}

function runExporter(deployment: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "mwz-indexer-manifest-"));
  const deploymentFile = path.join(dir, "deployment.json");
  const outFile = path.join(dir, "manifest.json");
  writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "export-indexer-manifest.cjs"), "unitnet"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEPLOYMENT_FILE: deploymentFile,
      INDEXER_MANIFEST_FILE: outFile,
    },
    encoding: "utf8",
  });

  const written = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
  rmSync(dir, { recursive: true, force: true });
  return { ...result, written };
}

describe("indexer manifest export", function () {
  it("builds an indexer manifest from canonical deployment keys", async () => {
    const manifest = buildIndexerManifest(baseDeployment(), "unit-test");

    expect(manifest.schemaVersion).to.eq(1);
    expect(manifest.network).to.eq("unitnet");
    expect(manifest.chainId).to.eq(31337);
    expect(manifest.deploymentBlock).to.eq(1234);
    expectSameAddress(manifest.contracts.LaunchFactory, ADDRESSES.factory);
    expectSameAddress(manifest.contracts.LaunchCampaignImplementation, ADDRESSES.implementation);
    expectSameAddress(manifest.topazRouter, ADDRESSES.topazRouter);
    expectSameAddress(manifest.graduationPriceFeed, ADDRESSES.priceFeed);
    expectSameAddress(manifest.routing.factoryRouteAuthority, ADDRESSES.deployer);
    expect(manifest.events.LaunchFactory["CampaignCreated(uint256,address,address,address,string,string,string,string)"]).to.eq(
      eventTopic("CampaignCreated(uint256,address,address,address,string,string,string,string)")
    );
    expect(
      manifest.events.LaunchFactory[
        "ScheduledCampaignCreated(uint256,address,address,address,uint64,bytes32,bytes32,bytes32,uint64,uint256,uint32,uint32)"
      ],
    ).to.eq(
      eventTopic(
        "ScheduledCampaignCreated(uint256,address,address,address,uint64,bytes32,bytes32,bytes32,uint64,uint256,uint32,uint32)",
      ),
    );
    expect(manifest.events.LaunchCampaign["CampaignFinalized(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"]).to.eq(
      eventTopic("CampaignFinalized(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)")
    );
  });

  it("exports exact event topics for the indexer-critical contract surfaces", async () => {
    const manifest = buildIndexerManifest(baseDeployment(), "unit-test");

    for (const [contractName, signatures] of Object.entries(EVENT_SIGNATURES) as [string, string[]][]) {
      expect(Object.keys(manifest.events[contractName])).to.deep.eq(signatures);
      for (const signature of signatures) {
        expect(manifest.events[contractName][signature]).to.eq(eventTopic(signature));
      }
    }

    expect(manifest.events.LaunchFactory).to.have.property(
      "ScheduledCampaignCreated(uint256,address,address,address,uint64,bytes32,bytes32,bytes32,uint64,uint256,uint32,uint32)",
    );
    expect(manifest.events.LaunchFactory).to.have.property("RequireRouteAuthorizationUpdated(bool)");
    expect(manifest.events.LaunchFactory).to.have.property("SecurityDefaultsLockedEnabled()");
    expect(manifest.events.TreasuryRouter).to.have.property(
      "RouteExecuted(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256)"
    );
    expect(manifest.events.CreatorRegistry).to.have.property("CreatorLaunchRecorded(address,uint256,uint256)");
    expect(manifest.events.RiskRegistry).to.have.property("WalletRiskUpdated(address,uint8,bool)");
    expect(manifest.events.PermanentLpLocker).to.have.property("LpPermanentlyLocked(address,address,uint256,uint256)");
    expect(manifest.events.TreasuryRouter).not.to.have.property("Routed(uint8,uint8,address,uint256)");
    expect(manifest.events.CreatorRegistry).not.to.have.property(
      "CreatorRulesUpdated(address,uint8,bool,bool,uint256,uint256,uint256,uint256)"
    );
  });

  it("supports legacy top-level deployment aliases", async () => {
    const manifest = buildIndexerManifest(
      baseDeployment({
        contracts: {},
        router: ADDRESSES.topazRouter,
        factoryAddress: ADDRESSES.factory,
        campaignImplementation: ADDRESSES.implementation,
        treasuryRouter: ADDRESSES.treasuryRouter,
        vault: ADDRESSES.treasuryVault,
        recruiterVault: ADDRESSES.recruiterVault,
        communityVault: ADDRESSES.communityVault,
        protocolVault: ADDRESSES.protocolVault,
        creatorRegistry: ADDRESSES.creatorRegistry,
        riskRegistry: ADDRESSES.riskRegistry,
        graduationOracle: ADDRESSES.graduationOracle,
        permanentLpLocker: ADDRESSES.permanentLpLocker,
        voteTreasuryAddress: ADDRESSES.upVoteTreasury,
      }),
      "legacy"
    );

    expectSameAddress(manifest.contracts.LaunchFactory, ADDRESSES.factory);
    expectSameAddress(manifest.contracts.UPVoteTreasury, ADDRESSES.upVoteTreasury);
    expectSameAddress(manifest.topazRouter, ADDRESSES.topazRouter);
  });

  it("rejects missing chain id or invalid required addresses", async () => {
    expect(() => buildIndexerManifest(baseDeployment({ chainId: undefined }), "missing-chain")).to.throw("chainId missing");
    expect(() =>
      buildIndexerManifest(
        baseDeployment({ contracts: { ...baseDeployment().contracts, LaunchFactory: "not-an-address" } }),
        "bad-address"
      )
    ).to.throw("LaunchFactory: missing or invalid address");
  });

  it("writes a manifest file from the CLI", async () => {
    const result = runExporter(baseDeployment());

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[indexer-manifest] Wrote:");
    expect(result.written.schemaVersion).to.eq(1);
    expectSameAddress(result.written.contracts.LaunchFactory, ADDRESSES.factory);
    expect(result.written.events.PermanentLpLocker["LpTokenRegistered(address)"]).to.eq(eventTopic("LpTokenRegistered(address)"));
    expect(result.written.events.TreasuryRouter["RouteExecuted(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256)"]).to.eq(
      eventTopic("RouteExecuted(uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256)")
    );
  });
});
