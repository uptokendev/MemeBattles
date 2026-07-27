import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

function readScript(name: string) {
  return readFileSync(path.join(process.cwd(), "scripts", name), "utf8");
}

describe("scheduled testnet deployment scripts", function () {
  const treasuryMigration = readScript("deploy-minimal-treasury-router-v2.ts");
  const stagedFactory = readScript("deploy-scheduled-test-factory.ts");
  const activation = readScript("activate-scheduled-test-factory.ts");

  it("uses the real CreatorRegistry getter and never the obsolete plural getter", async () => {
    expect(stagedFactory).to.include("function launchRecorder(address) view returns (bool)");
    expect(stagedFactory).to.not.include("function launchRecorders(address) view returns (bool)");
    expect(activation).to.include("function launchRecorder(address) view returns (bool)");
  });

  it("requires TreasuryRouterV2 and preserves the legacy routing generation", async () => {
    expect(treasuryMigration).to.include('treasuryRouterVersion: "v2"');
    expect(treasuryMigration).to.include("LegacyTreasuryRouter");
    expect(treasuryMigration).to.include("LegacyCommunityRewardsVault");
    expect(treasuryMigration).to.include("CommunityRewardsVaultV2");
    expect(treasuryMigration).to.include("setAuthorizedLpLocker(oldPermanentLpLocker, true)");
    expect(stagedFactory).to.include('requireAddress("TreasuryRouterV2", contracts.TreasuryRouterV2)');
    expect(stagedFactory).to.not.include("contracts.TreasuryRouterV2 || contracts.TreasuryRouter");
  });

  it("stages the new factory disabled and activates only through the verification gate", async () => {
    expect(stagedFactory).to.include("await (await factory.lockSecurityDefaults()).wait()");
    expect(stagedFactory).to.not.include("await (await factory.enableLive()).wait()");
    expect(stagedFactory).to.include("creationEnabled: false");
    expect(stagedFactory).to.include("activationRequired: true");

    expect(activation).to.include("TEST_GRADUATION_TARGET_USD");
    expect(activation).to.include("authorizedLpLocker(oldLocker)");
    expect(activation).to.include("authorizedLpLocker(newLocker)");
    expect(activation).to.include("CreatorRegistry.launchRecorder(newFactory)");
    expect(activation).to.include("await (await factory.enableLive()).wait()");
    expect(activation).to.include("writeIndexerManifest(nextDeployment");
    expect(activation).to.include("writeFrontendEnv(nextDeployment");
  });

  it("refuses all staged test-threshold operations on BSC mainnet", async () => {
    for (const source of [treasuryMigration, stagedFactory, activation]) {
      expect(source).to.include("MAINNET_CHAIN_ID = 56n");
      expect(source).to.include("net.chainId === MAINNET_CHAIN_ID");
      expect(source).to.include("TESTNET_CHAIN_ID = 97n");
    }
  });
});
