import { expect } from "chai";

const { checks, defaultNpmCmd, defaultNpxCmd, focusedSpecs, runRehearsalChecks, spawnOptions } = require("../scripts/rehearsal-check.cjs");

describe("rehearsal-check script", function () {
  it("runs focused specs and the protocol rehearsal in order with platform-safe commands", async () => {
    const calls: Array<{ command: string; args: string[]; options: { stdio: string; shell: boolean } }> = [];
    const result = runRehearsalChecks({
      stdio: "pipe",
      spawn: (command: string, args: string[], options: { stdio: string; shell: boolean }) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(result).to.deep.eq({ ok: true, status: 0, label: "complete", message: "Focused hardening checks passed" });
    expect(calls).to.have.length(checks.length);
    expect(calls.map((call) => call.command)).to.deep.eq([defaultNpxCmd, defaultNpmCmd]);
    expect(calls.map((call) => call.args)).to.deep.eq(checks.map(([, , args]: [string, string, string[]]) => args));
    expect(calls.map((call) => call.options)).to.deep.eq(checks.map(() => spawnOptions("pipe")));
  });

  it("keeps the focused spec list on the expected hardening surface", async () => {
    expect(focusedSpecs).to.deep.eq([
      "test/CheckDeployEnv.spec.ts",
      "test/VerifyDeploymentHelpers.spec.ts",
      "test/LaunchFactory.spec.ts",
      "test/LaunchFactoryDefaultEconomics.spec.ts",
      "test/LaunchCampaignQuoteEdges.spec.ts",
      "test/LaunchCampaignCloseout.spec.ts",
      "test/EconomicSimulations.spec.ts",
      "test/PackageScripts.spec.ts",
    ]);
  });

  it("supports custom npm and npx commands", async () => {
    const commands: string[] = [];
    const result = runRehearsalChecks({
      npmCmd: "pnpm",
      npxCmd: "pnpx",
      stdio: "pipe",
      spawn: (command: string) => {
        commands.push(command);
        return { status: 0 };
      },
    });

    expect(result.ok).to.eq(true);
    expect(commands).to.deep.eq(["pnpx", "pnpm"]);
  });

  it("stops at the first failing check", async () => {
    const calls: string[] = [];
    const result = runRehearsalChecks({
      npxCmd: "npx-test",
      stdio: "pipe",
      spawn: (_command: string, args: string[]) => {
        calls.push(args.join(" "));
        return { status: calls.length === 1 ? 7 : 0 };
      },
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(7);
    expect(result.label).to.eq("focused hardening specs");
    expect(result.message).to.include("focused hardening specs failed");
    expect(calls).to.deep.eq([`hardhat test ${focusedSpecs.join(" ")}`]);
  });

  it("returns status 1 when a failed process has no numeric status", async () => {
    const result = runRehearsalChecks({
      stdio: "pipe",
      spawn: () => ({ status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("focused hardening specs");
    expect(result.message).to.include("focused hardening specs failed");
  });

  it("reports command startup errors", async () => {
    const result = runRehearsalChecks({
      stdio: "pipe",
      spawn: () => ({ error: new Error("boom"), status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("focused hardening specs");
    expect(result.message).to.include("could not start: boom");
  });
});
