import path from "path";
import { spawnSync } from "child_process";
import { expect } from "chai";

const SCRIPT = path.join(__dirname, "..", "scripts", "check-deploy-env.cjs");

function runCheck(extraEnv: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  return spawnSync(process.execPath, [SCRIPT, "hardhat"], {
    cwd: path.join(__dirname, ".."),
    env,
    encoding: "utf8",
  });
}

describe("check-deploy-env TreasuryRouterV2 support", function () {
  it("accepts the V2 deploy flag and reports auto monthly treasury deployment for local rehearsal", async () => {
    const result = runCheck({
      DEPLOY_TREASURY_ROUTER_V2: "true",
      USE_TREASURY_ROUTER_V2: undefined,
      MONTHLY_LEAGUE_TREASURY: undefined,
      MONTHLY_LEAGUE_TREASURY_ADDRESS: undefined,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).to.equal(0, output);
    expect(output).to.include("[deploy-env] treasuryRouter=TreasuryRouterV2");
    expect(output).to.include("[deploy-env] monthlyLeagueTreasury=auto-deploy");
    expect(output).to.include("TreasuryRouterV2 enabled without MONTHLY_LEAGUE_TREASURY");
  });

  it("rejects conflicting V2 deploy aliases and malformed monthly treasury addresses", async () => {
    const result = runCheck({
      DEPLOY_TREASURY_ROUTER_V2: "true",
      USE_TREASURY_ROUTER_V2: "false",
      MONTHLY_LEAGUE_TREASURY: "0x1234",
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).to.equal(1, output);
    expect(output).to.include("DEPLOY_TREASURY_ROUTER_V2 and USE_TREASURY_ROUTER_V2 disagree");
    expect(output).to.include("MONTHLY_LEAGUE_TREASURY: expected 20-byte 0x address");
  });
});
