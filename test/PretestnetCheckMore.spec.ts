import { expect } from "chai";

const { checks, defaultNpmCmd, runPretestnetChecks } = require("../scripts/pretestnet-check.cjs");

describe("pretestnet-check additional orchestration", function () {
  it("exports the expected readiness check labels and npm args", async () => {
    expect(checks).to.deep.eq([
      ["test", ["run", "test"]],
      ["size", ["run", "size"]],
      ["local deploy env", ["run", "deploy:check-env"]],
      ["bscTestnet deploy env", ["run", "deploy:check-env:bsc-testnet"]],
    ]);
  });

  it("uses inherited stdio by default", async () => {
    const stdioValues: string[] = [];
    const result = runPretestnetChecks({
      spawn: (_command: string, _args: string[], options: { stdio: string }) => {
        stdioValues.push(options.stdio);
        return { status: 0 };
      },
    });

    expect(result.ok).to.eq(true);
    expect(stdioValues).to.deep.eq(checks.map(() => "inherit"));
  });

  it("falls back to status 1 when a failed check returns undefined status", async () => {
    const result = runPretestnetChecks({
      stdio: "pipe",
      spawn: () => ({}),
    });

    expect(result).to.deep.include({ ok: false, status: 1, label: "test" });
    expect(result.message).to.include("test failed");
  });

  it("stops on a later command startup error", async () => {
    const labels: string[] = [];
    const result = runPretestnetChecks({
      npmCmd: "npm-probe",
      stdio: "pipe",
      spawn: (_command: string, args: string[]) => {
        labels.push(args.join(" "));
        if (labels.length === 3) return { error: new Error("spawn denied"), status: null };
        return { status: 0 };
      },
    });

    expect(result.ok).to.eq(false);
    expect(result.status).to.eq(1);
    expect(result.label).to.eq("local deploy env");
    expect(result.message).to.include("could not start: spawn denied");
    expect(labels).to.deep.eq(["run test", "run size", "run deploy:check-env"]);
  });

  it("uses the platform default npm command when no command override is provided", async () => {
    const commands: string[] = [];
    runPretestnetChecks({
      stdio: "pipe",
      spawn: (command: string) => {
        commands.push(command);
        return { status: 0 };
      },
    });

    expect(commands).to.deep.eq(checks.map(() => defaultNpmCmd));
  });
});
