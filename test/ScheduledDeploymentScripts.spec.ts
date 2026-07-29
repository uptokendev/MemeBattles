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
  const correctedFactory = readScript("deploy-creator-arm-cooldown-factory.ts");
  const correctedActivation = readScript("activate-creator-arm-cooldown-factory.ts");

  it("uses the real CreatorRegistry getter and never the obsolete plural getter", async () => {
    expect(stagedFactory).to.include("function launchRecorder(address) view returns (bool)");
    expect(stagedFactory).to.not.include("function launchRecorders(address) view returns (bool)");
    expect(activation).to.include("function launchRecorder(address) view returns (bool)");
    expect(correctedFactory).to.include("function launchRecorder(address) view returns (bool)");
    expect(correctedActivation).to.include("function launchRecorder(address) view returns (bool)");
  });

  it("requires TreasuryRouterV2 and preserves supported routing generations", async () => {
    expect(treasuryMigration).to.include('treasuryRouterVersion: "v2"');
    expect(treasuryMigration).to.include("LegacyTreasuryRouter");
    expect(treasuryMigration).to.include("LegacyCommunityRewardsVault");
    expect(treasuryMigration).to.include("CommunityRewardsVaultV2");
    expect(treasuryMigration).to.include("setAuthorizedLpLocker(oldPermanentLpLocker, true)");
    expect(stagedFactory).to.include('requireAddress("TreasuryRouterV2", contracts.TreasuryRouterV2)');
    expect(stagedFactory).to.not.include("contracts.TreasuryRouterV2 || contracts.TreasuryRouter");
    expect(correctedFactory).to.include("authorizedLpLocker(obsoleteLocker)");
    expect(correctedFactory).to.include("authorizedLpLocker(previousLocker)");
    expect(correctedActivation).to.include("authorizedLpLocker(replacementLocker)");
  });

  it("stages the old scheduled generation disabled and activates only through its verification gate", async () => {
    expect(stagedFactory).to.include("await (await factory.lockSecurityDefaults()).wait()");
    expect(stagedFactory).to.not.include("await (await factory.enableLive()).wait()");
    expect(stagedFactory).to.include("creationEnabled: false");
    expect(stagedFactory).to.include("activationRequired: true");

    expect(activation).to.include("TEST_GRADUATION_TARGET_USD");
    expect(activation).to.include("authorizedLpLocker(oldLocker)");
    expect(activation).to.include("authorizedLpLocker(newLocker)");
    expect(activation).to.include("CreatorRegistry.launchRecorder(newFactory)");
    expect(activation).to.include("const tx = await factory.enableLive()");
    expect(activation).to.include("writeIndexerManifest(nextDeployment");
    expect(activation).to.include("writeFrontendEnv(nextDeployment");
  });

  it("stages the corrected generation 3 factory disabled and preserves old support", async () => {
    expect(correctedFactory).to.include("campaignImplementation");
    expect(correctedFactory).to.include("factory remains disabled");
    expect(correctedFactory).to.include("factoryGeneration: Number(await replacement.FACTORY_GENERATION())");
    expect(correctedFactory).to.include("campaignGeneration: Number(await replacement.CAMPAIGN_GENERATION())");
    expect(correctedFactory).to.include("creationEnabled: false");
    expect(correctedFactory).to.include("supportEnabled: true");
    expect(correctedFactory).to.not.include("replacement.enableLive()");
  });

  it("activates only the corrected factory and pauses creation only on the obsolete factory", async () => {
    expect(correctedActivation).to.include("replacement.enableLive()");
    expect(correctedActivation).to.include("obsolete.setCreatePaused(true)");
    expect(correctedActivation).to.not.include("obsolete.setGlobalPaused(true)");
    expect(correctedActivation).to.include("old factories and lockers remain supported");
    expect(correctedActivation).to.include("FACTORY_GENERATION()) !== 3");
    expect(correctedActivation).to.include("CAMPAIGN_GENERATION()) !== 2");
  });

  it("refuses all staged test-threshold operations on BSC mainnet", async () => {
    for (const source of [treasuryMigration, stagedFactory, activation]) {
      expect(source).to.include("MAINNET_CHAIN_ID = 56n");
      expect(source).to.include("net.chainId === MAINNET_CHAIN_ID");
      expect(source).to.include("TESTNET_CHAIN_ID = 97n");
    }
    expect(correctedFactory).to.include("TESTNET_CHAIN_ID = 97n");
    expect(correctedFactory).to.include("net.chainId !== TESTNET_CHAIN_ID");
    expect(correctedActivation).to.include("Number(network.chainId) !== 97");
  });
});
