import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OWNER = "0x1111111111111111111111111111111111111111";

function jsString(value: string) {
  return JSON.stringify(value);
}

function runDeploy(overrides: Record<string, string | undefined> = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mwz-reward-deploy-"));
  const repoRoot = process.cwd();
  const configPath = path.join(tempRoot, "hardhat.config.js");
  writeFileSync(
    configPath,
    `require(${jsString(path.join(repoRoot, "node_modules", "@nomicfoundation", "hardhat-toolbox"))});\nmodule.exports = { solidity: { version: "0.8.24", settings: { viaIR: true, optimizer: { enabled: true, runs: 200 } } }, paths: { sources: ${jsString(path.join(repoRoot, "contracts"))}, artifacts: "./artifacts", cache: "./cache" } };\n`
  );

  const hardhatCli = path.join(repoRoot, "node_modules", "hardhat", "internal", "cli", "cli.js");
  const script = path.join(repoRoot, "scripts", "deploy-reward-distributor.cjs");
  const result = spawnSync(process.execPath, [hardhatCli, "--config", configPath, "run", script], {
    cwd: tempRoot,
    env: { ...process.env, ...overrides },
    encoding: "utf8",
    timeout: 120000,
  });

  rmSync(tempRoot, { recursive: true, force: true });
  return result;
}

function parseJsonFromStdout(stdout: string) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON object in stdout: ${stdout}`);
  return JSON.parse(stdout.slice(start, end + 1));
}

describe("deploy-reward-distributor script", function () {
  this.timeout(180000);

  it("deploys RewardDistributor with the deployer as default owner", async () => {
    const result = runDeploy({ REWARD_DISTRIBUTOR_OWNER: undefined });

    expect(result.status).to.eq(0);
    const output = parseJsonFromStdout(result.stdout);
    expect(output.contract).to.eq("RewardDistributor");
    expect(output.address).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(output.owner).to.match(/^0x[a-fA-F0-9]{40}$/);
    expect(output.deployer).to.eq(output.owner);
    expect(output.network).to.eq("hardhat");
    expect(output.chainId).to.eq(31337);
  });

  it("deploys RewardDistributor with an explicit owner", async () => {
    const result = runDeploy({ REWARD_DISTRIBUTOR_OWNER: OWNER });

    expect(result.status).to.eq(0);
    const output = parseJsonFromStdout(result.stdout);
    expect(output.contract).to.eq("RewardDistributor");
    expect(output.owner).to.eq(OWNER);
    expect(output.deployer).to.not.eq(output.owner);
  });

  it("rejects an invalid explicit owner before deployment", async () => {
    const result = runDeploy({ REWARD_DISTRIBUTOR_OWNER: "not-an-address" });

    expect(result.status).to.eq(1);
    expect(`${result.stdout}\n${result.stderr}`).to.include("REWARD_DISTRIBUTOR_OWNER must be a valid EVM address");
  });
});
