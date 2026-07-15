import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function writeArtifact(root: string, relativeDir: string, contractName: string, artifact: Record<string, unknown>) {
  const dir = path.join(root, "artifacts", "contracts", relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${contractName}.json`), `${JSON.stringify({ contractName, abi: [], bytecode: "0x", ...artifact })}\n`);
}

function runSync(root: string) {
  const script = path.join(process.cwd(), "scripts", "sync-frontend-abis.cjs");
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("sync-frontend-abis script", function () {
  it("copies preferred artifacts into slim frontend ABI files", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-"));
    try {
      writeArtifact(root, "LaunchFactory.sol", "LaunchFactory", {
        abi: [{ type: "function", name: "createCampaign", inputs: [], outputs: [] }],
        bytecode: "0x1234",
        deployedBytecode: "0xabcd",
      });
      writeArtifact(root, "token/LaunchToken.sol", "LaunchToken", {
        abi: [{ type: "function", name: "enableTrading", inputs: [], outputs: [] }],
        bytecode: "0x5678",
      });

      const result = runSync(root);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("[abi-sync] wrote frontend");
      expect(result.stdout).to.include("[abi-sync] copied 2 ABI file(s)");

      const factoryOut = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "LaunchFactory.json"), "utf8"));
      expect(factoryOut.contractName).to.eq("LaunchFactory");
      expect(factoryOut.abi[0].name).to.eq("createCampaign");
      expect(factoryOut.bytecode).to.eq("0x1234");
      expect(factoryOut.deployedBytecode).to.eq(undefined);

      const tokenOut = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "LaunchToken.json"), "utf8"));
      expect(tokenOut.contractName).to.eq("LaunchToken");
      expect(tokenOut.abi[0].name).to.eq("enableTrading");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds nested artifacts by contractName when the preferred path is absent", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-"));
    try {
      writeArtifact(root, "nested/output/RewardDistributor.sol", "NotTheFileName", {
        contractName: "RewardDistributor",
        abi: [{ type: "event", name: "RewardClaimed", inputs: [] }],
        bytecode: "0xbeef",
      });

      const result = runSync(root);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("RewardDistributor.json");
      const out = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "RewardDistributor.json"), "utf8"));
      expect(out.contractName).to.eq("RewardDistributor");
      expect(out.abi[0].name).to.eq("RewardClaimed");
      expect(out.bytecode).to.eq("0xbeef");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips debug artifacts and malformed JSON while continuing with valid artifacts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-"));
    try {
      const malformedDir = path.join(root, "artifacts", "contracts", "bad");
      mkdirSync(malformedDir, { recursive: true });
      writeFileSync(path.join(malformedDir, "Broken.json"), "{ nope");
      writeFileSync(path.join(malformedDir, "LaunchCampaign.dbg.json"), JSON.stringify({ contractName: "LaunchCampaign" }));
      writeArtifact(root, "somewhere/LaunchCampaign.sol", "LaunchCampaignArtifact", {
        contractName: "LaunchCampaign",
        abi: [{ type: "function", name: "buyExactTokens", inputs: [], outputs: [] }],
        bytecode: "0xcafe",
      });

      const result = runSync(root);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("LaunchCampaign.json");
      const out = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "LaunchCampaign.json"), "utf8"));
      expect(out.abi[0].name).to.eq("buyExactTokens");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits non-zero when no artifacts can be copied", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-"));
    try {
      const result = runSync(root);

      expect(result.status).to.eq(1);
      expect(result.stderr).to.include("no ABI files copied");
      expect(existsSync(path.join(root, "frontend", "src", "abi"))).to.eq(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
