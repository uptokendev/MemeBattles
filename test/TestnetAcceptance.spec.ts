import { expect } from "chai";

const { checks, defaultNpmCmd, runTestnetAcceptance, spawnOptions } = require("../scripts/testnet-acceptance.cjs");

describe("testnet-acceptance script", function () {
  it("runs post-deploy acceptance checks in order", async () => {
    const calls: Array<{ command: string; args: string[]; options: { stdio: string; shell: boolean } }> = [];
    const result = runTestnetAcceptance({
      stdio: "pipe",
      spawn: (command: string, args: string[], options: { stdio: string; shell: boolean }) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(result).to.deep.eq({
      ok: true,
      status: 0,
      label: "complete",
      message: "All BSC testnet acceptance checks passed",
    });
    expect(calls).to.have.length(checks.length);
    expect(calls.map((call) => call.command)).to.deep.eq(checks.map(() => defaultNpmCmd));
    expect(calls.map((call) => call.args)).to.deep.eq(checks.map(([, args]: [string, string[]]) => args));
    expect(calls.map((call) => call.options)).to.deep.eq(checks.map(() => spawnOptions("pipe")));
  });

  it("keeps the acceptance surface on deploy, verification, route authority, indexer, and monitoring", async () => {
    expect(checks).to.deep.eq([
      ["bscTestnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
      ["deployment wiring", ["run", "verify:deployment:bsc-testnet"]],
      ["route authority", ["run", "verify:route-authority:bsc-testnet"]],
      ["indexer manifest", ["run", "indexer:manifest:bsc-testnet"]],
      ["monitoring readiness", ["run", "monitor:readiness:bsc-testnet"]],
      ["monitoring snapshot", ["run", "monitor:snapshot:bsc-testnet"]],
    ]);
  });

  it("supports custom npm commands", async () => {
    const commands: string[] = [];
    const result = runTestnetAcceptance({
      npmCmd: "pnpm",
      stdio: "pipe",
      spawn: (command: string) => {
        commands.push(command);
        return { status: 0 };
      },
    });

    expect(result.ok).to.eq(true);
    expect(commands).to.deep.eq(checks.map(() => "pnpm"));
  });

  it("stops at the first failing check", async () => {
    const calls: string[] = [];
    const result = runTestnetAcceptance({
      npmCmd: "npm-test",
      stdio: "pipe",
      spawn: (_command: string, args: string[]) => {
        calls.push(args.join(" "));
        return { status: calls.length === 2 ? 9 : 0 };
      },
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(9);
    expect(result.label).to.eq("deployment wiring");
    expect(result.message).to.include("deployment wiring failed");
    expect(calls).to.deep.eq(["run deploy:check-env:bsc-testnet", "run verify:deployment:bsc-testnet"]);
  });

  it("returns status 1 when a failed process has no numeric status", async () => {
    const result = runTestnetAcceptance({
      stdio: "pipe",
      spawn: () => ({ status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("bscTestnet deploy env");
    expect(result.message).to.include("bscTestnet deploy env failed");
  });

  it("reports command startup errors", async () => {
    const result = runTestnetAcceptance({
      stdio: "pipe",
      spawn: () => ({ error: new Error("boom"), status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("bscTestnet deploy env");
    expect(result.message).to.include("could not start: boom");
  });
});
