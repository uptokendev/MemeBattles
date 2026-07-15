import { expect } from "chai";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

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

function deployment(overrides: Record<string, unknown> = {}) {
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

function runExport(args: string[], env: Record<string, string | undefined>) {
  const script = path.join(process.cwd(), "scripts", "export-frontend-env.cjs");
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("export-frontend-env CLI", function () {
  it("writes a frontend env file from an explicit deployment file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-frontend-env-cli-"));
    try {
      const deploymentFile = path.join(dir, "deployment.json");
      const outFile = path.join(dir, "frontend.env");
      writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

      const result = runExport(["unitnet"], {
        DEPLOYMENT_FILE: deploymentFile,
        FRONTEND_ENV_FILE: outFile,
      });

      expect(result.status).to.eq(0, `${result.stdout}\n${result.stderr}`);
      expect(result.stdout).to.include(`[frontend-env] Loaded deployment: ${deploymentFile}`);
      expect(result.stdout).to.include(`[frontend-env] Wrote: ${outFile}`);
      expect(existsSync(outFile)).to.eq(true);

      const output = readFileSync(outFile, "utf8");
      expect(output).to.include(`VITE_FACTORY_ADDRESS_31337=${ADDR.factory}`);
      expect(output).to.include(`VITE_TOPAZ_ROUTER_ADDRESS_31337=${ADDR.topazRouter}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults the output file beside the deployment file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-frontend-env-cli-"));
    try {
      const deploymentFile = path.join(dir, "deployment.json");
      const expectedOutFile = path.join(dir, "bscTestnet.frontend.env");
      writeFileSync(deploymentFile, JSON.stringify(deployment(), null, 2));

      const result = runExport(["bscTestnet"], {
        DEPLOYMENT_FILE: deploymentFile,
        FRONTEND_ENV_FILE: undefined,
      });

      expect(result.status).to.eq(0, `${result.stdout}\n${result.stderr}`);
      expect(result.stdout).to.include(`[frontend-env] Wrote: ${expectedOutFile}`);
      expect(existsSync(expectedOutFile)).to.eq(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails clearly when the deployment file is missing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-frontend-env-cli-"));
    try {
      const deploymentFile = path.join(dir, "missing.json");
      const result = runExport(["hardhat"], {
        DEPLOYMENT_FILE: deploymentFile,
        FRONTEND_ENV_FILE: path.join(dir, "frontend.env"),
      });

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include(`Deployment file not found: ${deploymentFile}`);
      expect(result.stderr).to.include("Run deploy first or set DEPLOYMENT_FILE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when the deployment cannot build the required frontend addresses", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-frontend-env-cli-"));
    try {
      const deploymentFile = path.join(dir, "deployment.json");
      writeFileSync(
        deploymentFile,
        JSON.stringify(
          deployment({
            contracts: {
              ...deployment().contracts,
              LaunchFactory: "not-an-address",
            },
          }),
          null,
          2
        )
      );

      const result = runExport(["hardhat"], {
        DEPLOYMENT_FILE: deploymentFile,
        FRONTEND_ENV_FILE: path.join(dir, "frontend.env"),
      });

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include(`LaunchFactory: missing or invalid address in ${deploymentFile}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
