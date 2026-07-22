import path from "path";
import { spawnSync } from "child_process";
import { expect } from "chai";

const SCRIPT = path.join(__dirname, "..", "scripts", "check-deploy-env.cjs");
const SCRUBBED_ENV_KEYS = [
  "DEPLOY_TREASURY_ROUTER_V2",
  "USE_TREASURY_ROUTER_V2",
  "MONTHLY_LEAGUE_TREASURY",
  "MONTHLY_LEAGUE_TREASURY_ADDRESS",
  "MONTHLY_LEAGUE_CAP_USD",
  "CHARITY_TREASURY",
  "CHARITY_TREASURY_ADDRESS",
  "TOPAZ_MANIFEST",
];

function runCheck(extraEnv: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of SCRUBBED_ENV_KEYS) delete env[key];
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  return spawnSync(process.execPath, [SCRIPT, "hardhat"], {
    cwd: path.join(__dirname, ".."),
    env,
    encoding: "utf8",
  });
}

describe("check-deploy-env TreasuryRouterV2 support", function () {
  it("accepts the V2 deploy flag and reports auto monthly and charity treasury deployment for local rehearsal", async () => {
    const result = runCheck({
      DEPLOY_TREASURY_ROUTER_V2: "true",
      USE_TREASURY_ROUTER_V2: undefined,
      MONTHLY_LEAGUE_TREASURY: undefined,
      MONTHLY_LEAGUE_TREASURY_ADDRESS: undefined,
      CHARITY_TREASURY: undefined,
      CHARITY_TREASURY_ADDRESS: undefined,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).to.equal(0, output);
    expect(output).to.include("[deploy-env] treasuryRouter=TreasuryRouterV2");
    expect(output).to.include("[deploy-env] monthlyLeagueTreasury=auto-deploy");
    expect(output).to.include("[deploy-env] charityTreasury=auto-deploy");
    expect(output).to.include("TreasuryRouterV2 enabled without MONTHLY_LEAGUE_TREASURY");
    expect(output).to.include("TreasuryRouterV2 enabled without CHARITY_TREASURY");
  });

  it("rejects conflicting V2 deploy aliases and malformed Phase 5 treasury envs", async () => {
    const result = runCheck({
      DEPLOY_TREASURY_ROUTER_V2: "true",
      USE_TREASURY_ROUTER_V2: "false",
      MONTHLY_LEAGUE_TREASURY: "0x1234",
      MONTHLY_LEAGUE_CAP_USD: "not-a-number",
      CHARITY_TREASURY: "0x5678",
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).to.equal(1, output);
    expect(output).to.include("DEPLOY_TREASURY_ROUTER_V2 and USE_TREASURY_ROUTER_V2 disagree");
    expect(output).to.include("MONTHLY_LEAGUE_TREASURY: expected 20-byte 0x address");
    expect(output).to.include("CHARITY_TREASURY: expected 20-byte 0x address");
    expect(output).to.include("MONTHLY_LEAGUE_CAP_USD: expected integer");
  });
});
