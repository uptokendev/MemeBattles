import { expect } from "chai";

const { checks, defaultNpmCmd, runPretestnetChecks } = require("../scripts/pretestnet-check.cjs");

describe("pretestnet-check script", function () {
  it("runs the readiness checks in order with the default npm command", async () => {
    const calls: Array<{ command: string; args: string[]; options: { stdio: string } }> = [];
    const result = runPretestnetChecks({
      stdio: "pipe",
      spawn: (command: string, args: string[], options: { stdio: string }) => {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });

    expect(result).to.deep.eq({ ok: true, status: 0, label: "complete", message: "All readiness checks passed" });
    expect(calls).to.have.length(checks.length);
    expect(calls.map((call) => call.command)).to.deep.eq(checks.map(() => defaultNpmCmd));
    expect(calls.map((call) => call.args)).to.deep.eq(checks.map(([, args]: [string, string[]]) => args));
    expect(calls.map((call) => call.options.stdio)).to.deep.eq(checks.map(() => "pipe"));
  });

  it("supports a custom npm command", async () => {
    const commands: string[] = [];
    const result = runPretestnetChecks({
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
    const result = runPretestnetChecks({
      npmCmd: "npm-test",
      stdio: "pipe",
      spawn: (_command: string, args: string[]) => {
        calls.push(args.join(" "));
        return { status: calls.length === 2 ? 7 : 0 };
      },
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(7);
    expect(result.label).to.eq("size");
    expect(result.message).to.include("size failed");
    expect(calls).to.deep.eq(["run test", "run size"]);
  });

  it("returns status 1 when a failed process has no numeric status", async () => {
    const result = runPretestnetChecks({
      stdio: "pipe",
      spawn: () => ({ status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("test");
    expect(result.message).to.include("test failed");
  });

  it("reports command startup errors", async () => {
    const result = runPretestnetChecks({
      stdio: "pipe",
      spawn: () => ({ error: new Error("boom"), status: null }),
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("test");
    expect(result.message).to.include("could not start: boom");
  });
});
