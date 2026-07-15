import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ADDR = {
  a: "0x0000000000000000000000000000000000000201",
  b: "0x0000000000000000000000000000000000000202",
  c: "0x0000000000000000000000000000000000000203",
  d: "0x0000000000000000000000000000000000000204",
  e: "0x0000000000000000000000000000000000000205",
  f: "0x0000000000000000000000000000000000000206",
  g: "0x0000000000000000000000000000000000000207",
  h: "0x0000000000000000000000000000000000000208",
  i: "0x0000000000000000000000000000000000000209",
  j: "0x000000000000000000000000000000000000020a",
  k: "0x000000000000000000000000000000000000020b",
  l: "0x000000000000000000000000000000000000020c",
  m: "0x000000000000000000000000000000000000020d",
  n: "0x000000000000000000000000000000000000020e",
  o: "0x000000000000000000000000000000000000020f",
};

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 31337,
    deployer: ADDR.a,
    treasurySafe: ADDR.b,
    protocolFeeBps: 200,
    topazRouter: ADDR.c,
    graduationPriceFeed: ADDR.d,
    graduationMaxPriceAge: 3600,
    contracts: {
      LaunchFactory: ADDR.e,
      LaunchCampaignImplementation: ADDR.f,
      TreasuryRouter: ADDR.g,
      TreasuryVaultV2: ADDR.h,
      RecruiterRewardsVault: ADDR.i,
      CommunityRewardsVault: ADDR.j,
      ProtocolRevenueVault: ADDR.k,
      CreatorRegistry: ADDR.l,
      RiskRegistry: ADDR.m,
      GraduationOracle: ADDR.n,
      PermanentLpLocker: ADDR.o,
      UPVoteTreasury: ADDR.a,
    },
    routing: {},
    postDeployActions: [],
    ...overrides,
  };
}

function runSummary(input: unknown, args: string[] = ["hardhat"]) {
  const dir = mkdtempSync(path.join(tmpdir(), "mwz-summary-more-"));
  const deploymentFile = path.join(dir, "deployment.json");
  writeFileSync(deploymentFile, JSON.stringify(input, null, 2));
  const script = path.join(process.cwd(), "scripts", "deployment-summary.cjs");
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOYMENT_FILE: deploymentFile },
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe("deployment-summary additional edges", function () {
  it("falls back to the CLI target when deployment.network is absent", async () => {
    const input = deployment();
    delete (input as any).network;

    const result = runSummary(input, ["customNet"]);

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("network                            customNet");
  });

  it("prints unset for missing optional routing values", async () => {
    const result = runSummary(deployment({ routing: {} }));

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("factoryTradeRouteProfile           unset");
    expect(result.stdout).to.include("factoryFinalizeRouteProfile        unset");
    expect(result.stdout).to.include("factoryRouteAuthority              unset");
    expect(result.stdout).to.include("unifiedRouterModeActive            unset");
  });

  it("prints top-level router fallback when topazRouter is absent", async () => {
    const input = deployment({ router: ADDR.o });
    delete (input as any).topazRouter;

    const result = runSummary(input);

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include(`topazRouter                        ${ADDR.o}`);
  });

  it("reports invalid frontend env state while still printing core deployment fields", async () => {
    const badContracts = { ...(deployment().contracts as Record<string, string>), TreasuryRouter: "bad" };
    const result = runSummary(deployment({ contracts: badContracts }));

    expect(result.status).to.eq(1);
    expect(result.stdout).to.include(`LaunchFactory                      ${ADDR.e}`);
    expect(result.stdout).to.include("status                             invalid:");
    expect(result.stdout).to.include("TreasuryRouter: missing or invalid address");
  });
});
