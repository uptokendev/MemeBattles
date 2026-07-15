import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

describe("package agent script wiring", function () {
  it("keeps agent workflow scripts wired to the scripts/agents entrypoints", async () => {
    expect(pkg.scripts["agents:plan"]).to.eq("node scripts/agents/plan.mjs");
    expect(pkg.scripts["agents:implement"]).to.eq("node scripts/agents/implement.mjs");
    expect(pkg.scripts["agents:check"]).to.eq("node scripts/agents/check.mjs");
    expect(pkg.scripts["agents:run"]).to.eq("node scripts/agents/run.mjs");
    expect(pkg.scripts["agents:test"]).to.eq("node scripts/agents/test/smoke.mjs");
  });

  it("keeps every package script command non-empty", async () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      expect(command, name).to.be.a("string").and.not.eq("");
    }
  });

  it("keeps all agent workflow scripts under scripts/agents", async () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      if (!name.startsWith("agents:")) continue;
      expect(command, name).to.match(/^node scripts\/agents\//);
    }
  });
});
