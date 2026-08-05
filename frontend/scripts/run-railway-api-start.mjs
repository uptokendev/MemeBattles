#!/usr/bin/env node
/**
 * Railway frontend API start:
 * - Best-effort closeout patches (must NEVER block listen / healthcheck)
 * - Then boot the Express gateway
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function runCloseoutBestEffort() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, "run-devpostgrad-closeout-fixes.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      console.warn("[railway-api-start] closeout still running after 45s; continuing to listen");
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve();
    }, 45_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code && code !== 0) {
        console.warn(`[railway-api-start] closeout exited ${code}; continuing boot (non-fatal)`);
      }
      resolve();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.warn("[railway-api-start] closeout spawn failed; continuing boot", err?.message || err);
      resolve();
    });
  });
}

await runCloseoutBestEffort();

const server = spawn(
  process.execPath,
  ["--import", "./api/load-local-env.mjs", "api/server.mjs"],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  },
);

server.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[railway-api-start] server killed by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try {
      server.kill(sig);
    } catch {
      // ignore
    }
  });
}
