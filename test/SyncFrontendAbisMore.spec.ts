import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function writeJson(file: string, data: Record<string, unknown>) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data)}\n`);
}

function artifactPath(root: string, relativeDir: string, fileName: string) {
  return path.join(root, "artifacts", "contracts", relativeDir, fileName);
}

function runSync(root: string) {
  const script = path.join(process.cwd(), "scripts", "sync-frontend-abis.cjs");
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
}

describe("sync-frontend-abis additional edges", function () {
  it("prefers the canonical artifact path over nested artifacts with the same contractName", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-more-"));
    try {
      writeJson(artifactPath(root, "LaunchFactory.sol", "LaunchFactory.json"), {
        contractName: "LaunchFactory",
        abi: [{ type: "function", name: "canonical", inputs: [], outputs: [] }],
        bytecode: "0x1111",
      });
      writeJson(artifactPath(root, "nested", "Other.json"), {
        contractName: "LaunchFactory",
        abi: [{ type: "function", name: "nested", inputs: [], outputs: [] }],
        bytecode: "0x2222",
      });

      const result = runSync(root);
      const out = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "LaunchFactory.json"), "utf8"));

      expect(result.status).to.eq(0);
      expect(out.abi[0].name).to.eq("canonical");
      expect(out.bytecode).to.eq("0x1111");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses default abi and bytecode fields when artifact values are omitted", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-defaults-"));
    try {
      writeJson(artifactPath(root, "LaunchToken.sol", "LaunchToken.json"), { contractName: "LaunchToken" });

      const result = runSync(root);
      const out = JSON.parse(readFileSync(path.join(root, "frontend", "src", "abi", "LaunchToken.json"), "utf8"));

      expect(result.status).to.eq(0);
      expect(out).to.deep.eq({ contractName: "LaunchToken", abi: [], bytecode: "0x" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("continues after missing artifacts and reports warnings for them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-warn-"));
    try {
      writeJson(artifactPath(root, "TreasuryRouter.sol", "TreasuryRouter.json"), {
        contractName: "TreasuryRouter",
        abi: [{ type: "event", name: "Routed", inputs: [] }],
        bytecode: "0xabcd",
      });

      const result = runSync(root);

      expect(result.status).to.eq(0);
      expect(result.stdout).to.include("copied 1 ABI file(s)");
      expect(result.stderr).to.include("missing artifact for LaunchFactory");
      expect(existsSync(path.join(root, "frontend", "src", "abi", "TreasuryRouter.json"))).to.eq(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes slim ABI JSON files with a trailing newline", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "mwz-abi-sync-newline-"));
    try {
      writeJson(artifactPath(root, "RiskRegistry.sol", "RiskRegistry.json"), {
        contractName: "RiskRegistry",
        abi: [{ type: "function", name: "riskTier", inputs: [], outputs: [] }],
        bytecode: "0x9999",
      });

      const result = runSync(root);
      const raw = readFileSync(path.join(root, "frontend", "src", "abi", "RiskRegistry.json"), "utf8");

      expect(result.status).to.eq(0);
      expect(raw.endsWith("\n")).to.eq(true);
      expect(JSON.parse(raw).contractName).to.eq("RiskRegistry");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
